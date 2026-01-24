//! Twitch OAuth provider
//!
//! Uses Twitch OAuth 2.0 and Helix API to fetch stream keys.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const TWITCH_AUTH_URL: &str = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const TWITCH_REVOKE_URL: &str = "https://id.twitch.tv/oauth2/revoke";
const TWITCH_API_BASE: &str = "https://api.twitch.tv/helix";

/// Twitch OAuth provider
pub struct TwitchProvider {
    config: OAuthConfig,
}

impl TwitchProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for TwitchProvider {
    fn name(&self) -> &'static str {
        "twitch"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&force_verify=true",
            TWITCH_AUTH_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state)
        )
    }

    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", self.config.redirect_uri.as_str()),
        ];

        let response = http_client
            .post(TWITCH_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Twitch token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: TwitchTokenResponse = response.json().await?;
        debug!("Twitch token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: Some(token_response.scope.join(" ")),
        })
    }

    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        let response = http_client
            .post(TWITCH_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: TwitchTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.to_string())),
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: Some(token_response.scope.join(" ")),
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/users", TWITCH_API_BASE);

        let response = http_client
            .get(&url)
            .header("Client-Id", &self.config.client_id)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let data: TwitchUsersResponse = response.json().await?;
        let user = data.data.into_iter().next()
            .ok_or_else(|| anyhow!("No user data returned"))?;

        Ok(OAuthUserProfile {
            provider_user_id: user.id,
            username: Some(user.login),
            display_name: Some(user.display_name),
            email: user.email,
            avatar_url: Some(user.profile_image_url),
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // Get user info first
        let user = self.get_user_profile(access_token, http_client).await?;
        let broadcaster_id = &user.provider_user_id;

        // Get stream key
        let stream_key_url = format!("{}/streams/key?broadcaster_id={}", TWITCH_API_BASE, broadcaster_id);

        let response = http_client
            .get(&stream_key_url)
            .header("Client-Id", &self.config.client_id)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get stream key: {}", error_text));
        }

        let key_data: TwitchStreamKeyResponse = response.json().await?;
        let stream_key = key_data.data.into_iter().next()
            .ok_or_else(|| anyhow!("No stream key returned"))?
            .stream_key;

        // Get channel info for title
        let channel_url = format!("{}/channels?broadcaster_id={}", TWITCH_API_BASE, broadcaster_id);

        let response = http_client
            .get(&channel_url)
            .header("Client-Id", &self.config.client_id)
            .bearer_auth(access_token)
            .send()
            .await?;

        let title = if response.status().is_success() {
            let channel_data: TwitchChannelResponse = response.json().await?;
            channel_data.data.into_iter().next().map(|c| c.title)
        } else {
            None
        };

        // Check if currently live
        let streams_url = format!("{}/streams?user_id={}", TWITCH_API_BASE, broadcaster_id);

        let response = http_client
            .get(&streams_url)
            .header("Client-Id", &self.config.client_id)
            .bearer_auth(access_token)
            .send()
            .await?;

        let is_live = if response.status().is_success() {
            let streams_data: TwitchStreamsResponse = response.json().await?;
            !streams_data.data.is_empty()
        } else {
            false
        };

        // Get recommended ingest endpoint
        let ingest_url = get_recommended_ingest(http_client).await
            .unwrap_or_else(|_| "rtmp://live.twitch.tv/app".to_string());

        Ok(StreamDestinationInfo {
            provider: "twitch".to_string(),
            channel_id: broadcaster_id.clone(),
            channel_name: user.username.unwrap_or_default(),
            rtmp_url: ingest_url,
            stream_key,
            backup_rtmp_url: Some("rtmp://live.twitch.tv/app".to_string()),
            title,
            is_live,
        })
    }

    async fn revoke_access(&self, access_token: &str, http_client: &reqwest::Client) -> Result<()> {
        let params = [
            ("client_id", self.config.client_id.as_str()),
            ("token", access_token),
        ];

        let response = http_client
            .post(TWITCH_REVOKE_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to revoke access: {}", error_text));
        }

        Ok(())
    }
}

// ============================================
// Twitch API Response Types
// ============================================

#[derive(Debug, Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: String,
    scope: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct TwitchUsersResponse {
    data: Vec<TwitchUser>,
}

#[derive(Debug, Deserialize)]
struct TwitchUser {
    id: String,
    login: String,
    display_name: String,
    email: Option<String>,
    profile_image_url: String,
}

#[derive(Debug, Deserialize)]
struct TwitchStreamKeyResponse {
    data: Vec<TwitchStreamKey>,
}

#[derive(Debug, Deserialize)]
struct TwitchStreamKey {
    stream_key: String,
}

#[derive(Debug, Deserialize)]
struct TwitchChannelResponse {
    data: Vec<TwitchChannel>,
}

#[derive(Debug, Deserialize)]
struct TwitchChannel {
    title: String,
}

#[derive(Debug, Deserialize)]
struct TwitchStreamsResponse {
    data: Vec<TwitchStream>,
}

#[derive(Debug, Deserialize)]
struct TwitchStream {
    #[allow(dead_code)]
    id: String,
}

#[derive(Debug, Deserialize)]
struct TwitchIngestResponse {
    ingests: Vec<TwitchIngest>,
}

#[derive(Debug, Deserialize)]
struct TwitchIngest {
    url_template: String,
    priority: i32,
}

// ============================================
// Helper Functions
// ============================================

async fn get_recommended_ingest(http_client: &reqwest::Client) -> Result<String> {
    let url = "https://ingest.twitch.tv/ingests";

    let response = http_client
        .get(url)
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok("rtmp://live.twitch.tv/app".to_string());
    }

    let data: TwitchIngestResponse = response.json().await?;

    // Find the highest priority (lowest number) ingest
    let best_ingest = data.ingests
        .into_iter()
        .min_by_key(|i| i.priority)
        .map(|i| i.url_template.replace("/{stream_key}", ""))
        .unwrap_or_else(|| "rtmp://live.twitch.tv/app".to_string());

    Ok(best_ingest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authorization_url() {
        let config = OAuthConfig {
            client_id: "test-client-id".to_string(),
            client_secret: "test-secret".to_string(),
            redirect_uri: "http://localhost:8080/callback".to_string(),
            scopes: vec!["channel:read:stream_key".to_string()],
        };

        let provider = TwitchProvider::new(config);
        let url = provider.get_authorization_url("test-state");

        assert!(url.contains("id.twitch.tv"));
        assert!(url.contains("test-client-id"));
        assert!(url.contains("test-state"));
    }
}
