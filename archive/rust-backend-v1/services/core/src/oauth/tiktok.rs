//! TikTok Live OAuth provider

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const TIKTOK_AUTH_URL: &str = "https://www.tiktok.com/v2/auth/authorize";
const TIKTOK_TOKEN_URL: &str = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API_URL: &str = "https://open.tiktokapis.com/v2";

pub struct TikTokProvider {
    config: OAuthConfig,
}

impl TikTokProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for TikTokProvider {
    fn name(&self) -> &'static str {
        "tiktok"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(",");
        format!(
            "{}?client_key={}&redirect_uri={}&response_type=code&scope={}&state={}",
            TIKTOK_AUTH_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state)
        )
    }

    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_key", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", self.config.redirect_uri.as_str()),
        ];

        let response = http_client
            .post(TIKTOK_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("TikTok token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: TikTokTokenResponse = response.json().await?;
        debug!("TikTok token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: Some(token_response.refresh_token),
            expires_in: Some(token_response.expires_in),
            token_type: "Bearer".to_string(),
            scope: Some(token_response.scope),
        })
    }

    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_key", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        let response = http_client
            .post(TIKTOK_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: TikTokTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: Some(token_response.refresh_token),
            expires_in: Some(token_response.expires_in),
            token_type: "Bearer".to_string(),
            scope: Some(token_response.scope),
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/user/info/?fields=open_id,display_name,avatar_url", TIKTOK_API_URL);

        let response = http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let data: TikTokUserResponse = response.json().await?;
        let user = data.data.user;

        Ok(OAuthUserProfile {
            provider_user_id: user.open_id,
            username: user.username,
            display_name: Some(user.display_name),
            email: None,
            avatar_url: Some(user.avatar_url),
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // TikTok Live streaming requires creator access
        // The RTMP URL and key must be obtained from TikTok Live Studio
        Ok(StreamDestinationInfo {
            provider: "tiktok".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "TikTok Live".to_string()),
            rtmp_url: "rtmps://live.tiktokcdn.com/live".to_string(),
            stream_key: "".to_string(), // Must be obtained from TikTok Live Studio
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}

#[derive(Debug, Deserialize)]
struct TikTokTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    scope: String,
}

#[derive(Debug, Deserialize)]
struct TikTokUserResponse {
    data: TikTokUserData,
}

#[derive(Debug, Deserialize)]
struct TikTokUserData {
    user: TikTokUser,
}

#[derive(Debug, Deserialize)]
struct TikTokUser {
    open_id: String,
    #[serde(default)]
    username: Option<String>,
    display_name: String,
    avatar_url: String,
}
