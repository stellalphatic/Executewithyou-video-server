//! Hopin event streaming provider
//! Virtual events platform

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const HOPIN_AUTH_URL: &str = "https://api.hopin.com/oauth/authorize";
const HOPIN_TOKEN_URL: &str = "https://api.hopin.com/oauth/token";
const HOPIN_API_URL: &str = "https://api.hopin.com/v1";

pub struct HopinProvider {
    config: OAuthConfig,
}

impl HopinProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for HopinProvider {
    fn name(&self) -> &'static str {
        "hopin"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
            HOPIN_AUTH_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state)
        )
    }

    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
            ("redirect_uri", self.config.redirect_uri.as_str()),
        ];

        let response = http_client
            .post(HOPIN_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Hopin token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: HopinTokenResponse = response.json().await?;
        debug!("Hopin token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
        ];

        let response = http_client
            .post(HOPIN_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: HopinTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.to_string())),
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/me", HOPIN_API_URL);

        let response = http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: HopinProfile = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: profile.id,
            username: None,
            display_name: profile.name,
            email: profile.email,
            avatar_url: profile.avatar_url,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // Get RTMP settings for the user's event
        let rtmp_info = get_hopin_rtmp_settings(access_token, http_client).await?;

        Ok(StreamDestinationInfo {
            provider: "hopin".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "Hopin Event".to_string()),
            rtmp_url: rtmp_info.rtmp_url,
            stream_key: rtmp_info.stream_key,
            backup_rtmp_url: rtmp_info.backup_rtmp_url,
            title: rtmp_info.title,
            is_live: rtmp_info.is_live,
        })
    }
}

#[derive(Debug, Deserialize)]
struct HopinTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct HopinProfile {
    id: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

struct HopinRtmpInfo {
    rtmp_url: String,
    stream_key: String,
    backup_rtmp_url: Option<String>,
    title: Option<String>,
    is_live: bool,
}

async fn get_hopin_rtmp_settings(access_token: &str, http_client: &reqwest::Client) -> Result<HopinRtmpInfo> {
    // Get user's events
    let url = format!("{}/events", HOPIN_API_URL);

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await?;
        if let Some(events) = data["data"].as_array() {
            if let Some(event) = events.first() {
                // Get RTMP settings for this event
                if let Some(rtmp_settings) = event["rtmp_settings"].as_object() {
                    return Ok(HopinRtmpInfo {
                        rtmp_url: rtmp_settings.get("url")
                            .and_then(|v| v.as_str())
                            .unwrap_or("rtmp://live.hopin.com/live")
                            .to_string(),
                        stream_key: rtmp_settings.get("stream_key")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        backup_rtmp_url: None,
                        title: event["name"].as_str().map(|s| s.to_string()),
                        is_live: event["status"].as_str() == Some("live"),
                    });
                }
            }
        }
    }

    // Return placeholder - user needs to set up event in Hopin
    Ok(HopinRtmpInfo {
        rtmp_url: "rtmp://live.hopin.com/live".to_string(),
        stream_key: "".to_string(),
        backup_rtmp_url: None,
        title: Some("Set up event in Hopin".to_string()),
        is_live: false,
    })
}
