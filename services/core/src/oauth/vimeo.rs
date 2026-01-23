//! Vimeo Live OAuth provider

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const VIMEO_AUTH_URL: &str = "https://api.vimeo.com/oauth/authorize";
const VIMEO_TOKEN_URL: &str = "https://api.vimeo.com/oauth/access_token";
const VIMEO_API_URL: &str = "https://api.vimeo.com";

pub struct VimeoProvider {
    config: OAuthConfig,
}

impl VimeoProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for VimeoProvider {
    fn name(&self) -> &'static str {
        "vimeo"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
            VIMEO_AUTH_URL,
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
            ("redirect_uri", self.config.redirect_uri.as_str()),
        ];

        let response = http_client
            .post(VIMEO_TOKEN_URL)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .header("Accept", "application/vnd.vimeo.*+json;version=3.4")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Vimeo token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: VimeoTokenResponse = response.json().await?;
        debug!("Vimeo token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: None, // Vimeo tokens don't expire
            token_type: token_response.token_type,
            scope: Some(token_response.scope),
        })
    }

    async fn refresh_token(&self, _refresh_token: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        // Vimeo access tokens don't expire by default
        Err(anyhow!("Vimeo tokens don't expire - re-authorize if needed"))
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/me", VIMEO_API_URL);

        let response = http_client
            .get(&url)
            .bearer_auth(access_token)
            .header("Accept", "application/vnd.vimeo.*+json;version=3.4")
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: VimeoUser = response.json().await?;

        // Extract user ID from URI (format: /users/12345)
        let user_id = profile.uri.rsplit('/').next().unwrap_or(&profile.uri).to_string();

        Ok(OAuthUserProfile {
            provider_user_id: user_id,
            username: profile.link.map(|l| l.rsplit('/').next().unwrap_or("").to_string()),
            display_name: profile.name,
            email: None,
            avatar_url: profile.pictures.and_then(|p| p.sizes.into_iter().last().map(|s| s.link)),
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // Get or create a live event
        let live_event = get_or_create_live_event(access_token, http_client).await?;

        Ok(StreamDestinationInfo {
            provider: "vimeo".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "Vimeo Live".to_string()),
            rtmp_url: live_event.rtmp_url,
            stream_key: live_event.stream_key,
            backup_rtmp_url: None,
            title: live_event.title,
            is_live: live_event.is_live,
        })
    }
}

#[derive(Debug, Deserialize)]
struct VimeoTokenResponse {
    access_token: String,
    token_type: String,
    scope: String,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VimeoUser {
    uri: String,
    name: Option<String>,
    link: Option<String>,
    pictures: Option<VimeoPictures>,
}

#[derive(Debug, Deserialize)]
struct VimeoPictures {
    sizes: Vec<VimeoPictureSize>,
}

#[derive(Debug, Deserialize)]
struct VimeoPictureSize {
    link: String,
}

struct VimeoLiveEvent {
    rtmp_url: String,
    stream_key: String,
    title: Option<String>,
    is_live: bool,
}

async fn get_or_create_live_event(access_token: &str, http_client: &reqwest::Client) -> Result<VimeoLiveEvent> {
    // Check for existing live events
    let url = format!("{}/me/live_events", VIMEO_API_URL);

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.vimeo.*+json;version=3.4")
        .send()
        .await?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await?;
        if let Some(events) = data["data"].as_array() {
            if let Some(event) = events.first() {
                if let (Some(rtmp), Some(key)) = (
                    event["stream_link"].as_str(),
                    event["stream_key"].as_str(),
                ) {
                    return Ok(VimeoLiveEvent {
                        rtmp_url: rtmp.to_string(),
                        stream_key: key.to_string(),
                        title: event["title"].as_str().map(|s| s.to_string()),
                        is_live: event["status"].as_str() == Some("streaming"),
                    });
                }
            }
        }
    }

    // Return default Vimeo RTMP settings
    Ok(VimeoLiveEvent {
        rtmp_url: "rtmp://rtmp.cloud.vimeo.com/live".to_string(),
        stream_key: "".to_string(),
        title: None,
        is_live: false,
    })
}
