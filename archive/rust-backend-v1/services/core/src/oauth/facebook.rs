//! Facebook OAuth provider
//!
//! Uses Facebook Login and Graph API for live streaming.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const FACEBOOK_AUTH_URL: &str = "https://www.facebook.com/v18.0/dialog/oauth";
const FACEBOOK_TOKEN_URL: &str = "https://graph.facebook.com/v18.0/oauth/access_token";
const FACEBOOK_GRAPH_URL: &str = "https://graph.facebook.com/v18.0";

/// Facebook OAuth provider
pub struct FacebookProvider {
    config: OAuthConfig,
}

impl FacebookProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for FacebookProvider {
    fn name(&self) -> &'static str {
        "facebook"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(",");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
            FACEBOOK_AUTH_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state)
        )
    }

    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let url = format!(
            "{}?client_id={}&client_secret={}&code={}&redirect_uri={}",
            FACEBOOK_TOKEN_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.client_secret),
            urlencoding::encode(code),
            urlencoding::encode(&self.config.redirect_uri)
        );

        let response = http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Facebook token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: FacebookTokenResponse = response.json().await?;
        debug!("Facebook token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: None, // Facebook uses long-lived tokens instead
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn refresh_token(&self, _refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        // Facebook doesn't use refresh tokens; instead, exchange for long-lived token
        // For now, we'll require re-authentication
        let _ = http_client;
        Err(anyhow!("Facebook requires re-authentication for token refresh"))
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!(
            "{}/me?fields=id,name,email,picture&access_token={}",
            FACEBOOK_GRAPH_URL,
            urlencoding::encode(access_token)
        );

        let response = http_client
            .get(&url)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: FacebookUserProfile = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: profile.id,
            username: None,
            display_name: profile.name,
            email: profile.email,
            avatar_url: profile.picture.and_then(|p| p.data).map(|d| d.url),
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // Get user profile for ID
        let profile = self.get_user_profile(access_token, http_client).await?;

        // Create a live video to get stream URL
        let live_video = create_live_video(access_token, &profile.provider_user_id, http_client).await?;

        Ok(StreamDestinationInfo {
            provider: "facebook".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "Facebook Live".to_string()),
            rtmp_url: live_video.secure_stream_url.clone(),
            stream_key: extract_stream_key(&live_video.secure_stream_url),
            backup_rtmp_url: Some(live_video.stream_url),
            title: live_video.title,
            is_live: live_video.status == "LIVE",
        })
    }

    async fn revoke_access(&self, access_token: &str, http_client: &reqwest::Client) -> Result<()> {
        let url = format!(
            "{}/me/permissions?access_token={}",
            FACEBOOK_GRAPH_URL,
            urlencoding::encode(access_token)
        );

        let response = http_client
            .delete(&url)
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
// Facebook API Response Types
// ============================================

#[derive(Debug, Deserialize)]
struct FacebookTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct FacebookUserProfile {
    id: String,
    name: Option<String>,
    email: Option<String>,
    picture: Option<FacebookPicture>,
}

#[derive(Debug, Deserialize)]
struct FacebookPicture {
    data: Option<FacebookPictureData>,
}

#[derive(Debug, Deserialize)]
struct FacebookPictureData {
    url: String,
}

#[derive(Debug, Serialize)]
struct CreateLiveVideoRequest {
    title: String,
    description: String,
    status: String,
}

#[derive(Debug, Clone)]
struct LiveVideoInfo {
    #[allow(dead_code)]
    id: String,
    stream_url: String,
    secure_stream_url: String,
    title: Option<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct FacebookLiveVideoResponse {
    id: String,
    stream_url: String,
    secure_stream_url: String,
}

// ============================================
// Helper Functions
// ============================================

async fn create_live_video(access_token: &str, user_id: &str, http_client: &reqwest::Client) -> Result<LiveVideoInfo> {
    let url = format!(
        "{}/{}/live_videos",
        FACEBOOK_GRAPH_URL,
        user_id
    );

    let now = chrono::Utc::now();
    let params = [
        ("access_token", access_token),
        ("title", &format!("ALLSTRM Stream - {}", now.format("%Y-%m-%d %H:%M"))),
        ("description", "Streaming via ALLSTRM"),
        ("status", "UNPUBLISHED"),
    ];

    let response = http_client
        .post(&url)
        .form(&params)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to create live video: {}", error_text));
    }

    let data: FacebookLiveVideoResponse = response.json().await?;

    Ok(LiveVideoInfo {
        id: data.id,
        stream_url: data.stream_url,
        secure_stream_url: data.secure_stream_url,
        title: Some(format!("ALLSTRM Stream - {}", now.format("%Y-%m-%d %H:%M"))),
        status: "UNPUBLISHED".to_string(),
    })
}

fn extract_stream_key(rtmp_url: &str) -> String {
    // Facebook RTMP URLs are usually in format: rtmps://...?s=stream_key
    // or rtmps://.../<stream_key>
    if let Some(idx) = rtmp_url.rfind('/') {
        let key_part = &rtmp_url[idx + 1..];
        if let Some(query_idx) = key_part.find('?') {
            return key_part[..query_idx].to_string();
        }
        return key_part.to_string();
    }
    rtmp_url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authorization_url() {
        let config = OAuthConfig {
            client_id: "test-app-id".to_string(),
            client_secret: "test-secret".to_string(),
            redirect_uri: "http://localhost:8080/callback".to_string(),
            scopes: vec!["publish_video".to_string()],
        };

        let provider = FacebookProvider::new(config);
        let url = provider.get_authorization_url("test-state");

        assert!(url.contains("facebook.com"));
        assert!(url.contains("test-app-id"));
        assert!(url.contains("test-state"));
    }

    #[test]
    fn test_extract_stream_key() {
        let url = "rtmps://live-api-s.facebook.com:443/rtmp/FB-123456789";
        assert_eq!(extract_stream_key(url), "FB-123456789");

        let url2 = "rtmps://live-api.facebook.com/rtmp/stream_key?s=abc123";
        assert_eq!(extract_stream_key(url2), "stream_key");
    }
}
