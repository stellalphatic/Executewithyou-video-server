//! YouTube (Google) OAuth provider
//!
//! Uses Google OAuth 2.0 to authenticate and YouTube Data API v3
//! to fetch live streaming credentials.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const YOUTUBE_API_BASE: &str = "https://www.googleapis.com/youtube/v3";

/// YouTube OAuth provider
pub struct YouTubeProvider {
    config: OAuthConfig,
}

impl YouTubeProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for YouTubeProvider {
    fn name(&self) -> &'static str {
        "youtube"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&access_type=offline&prompt=consent",
            GOOGLE_AUTH_URL,
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
            .post(GOOGLE_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("YouTube token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: GoogleTokenResponse = response.json().await?;
        debug!("YouTube token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: token_response.scope,
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
            .post(GOOGLE_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: GoogleTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.to_string())),
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: token_response.scope,
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let response = http_client
            .get(GOOGLE_USERINFO_URL)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: GoogleUserInfo = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: profile.id,
            username: None,
            display_name: profile.name,
            email: profile.email,
            avatar_url: profile.picture,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // First, get the user's channel
        let channel = get_user_channel(access_token, http_client).await?;

        // Get or create a live broadcast
        let broadcast = get_or_create_broadcast(access_token, http_client).await?;

        // Get the stream ingestion info
        let stream_info = get_stream_info(access_token, &broadcast.stream_id, http_client).await?;

        Ok(StreamDestinationInfo {
            provider: "youtube".to_string(),
            channel_id: channel.id,
            channel_name: channel.title,
            rtmp_url: stream_info.ingestion_address,
            stream_key: stream_info.stream_name,
            backup_rtmp_url: stream_info.backup_ingestion_address,
            title: Some(broadcast.title),
            is_live: broadcast.status == "live",
        })
    }

    async fn revoke_access(&self, access_token: &str, http_client: &reqwest::Client) -> Result<()> {
        let url = format!("https://oauth2.googleapis.com/revoke?token={}", access_token);
        let response = http_client.post(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to revoke access: {}", error_text));
        }

        Ok(())
    }
}

// ============================================
// Google/YouTube API Response Types
// ============================================

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: String,
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeChannelListResponse {
    items: Vec<YouTubeChannel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeChannel {
    id: String,
    snippet: YouTubeChannelSnippet,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeChannelSnippet {
    title: String,
}

#[derive(Debug, Clone)]
struct ChannelInfo {
    id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeLiveBroadcastListResponse {
    items: Option<Vec<YouTubeLiveBroadcast>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeLiveBroadcast {
    id: String,
    snippet: BroadcastSnippet,
    content_details: Option<BroadcastContentDetails>,
    status: BroadcastStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BroadcastSnippet {
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BroadcastContentDetails {
    bound_stream_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BroadcastStatus {
    life_cycle_status: String,
}

#[derive(Debug, Clone)]
struct BroadcastInfo {
    id: String,
    stream_id: String,
    title: String,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeLiveStreamListResponse {
    items: Option<Vec<YouTubeLiveStream>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeLiveStream {
    cdn: LiveStreamCdn,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveStreamCdn {
    ingestion_info: IngestionInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngestionInfo {
    ingestion_address: String,
    stream_name: String,
    backup_ingestion_address: Option<String>,
}

#[derive(Debug, Clone)]
struct StreamIngestionInfo {
    ingestion_address: String,
    stream_name: String,
    backup_ingestion_address: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateBroadcastRequest {
    snippet: CreateBroadcastSnippet,
    status: CreateBroadcastStatus,
    content_details: CreateBroadcastContentDetails,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateBroadcastSnippet {
    title: String,
    scheduled_start_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateBroadcastStatus {
    privacy_status: String,
    self_declared_made_for_kids: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateBroadcastContentDetails {
    enable_auto_start: bool,
    enable_auto_stop: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateStreamRequest {
    snippet: CreateStreamSnippet,
    cdn: CreateStreamCdn,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateStreamSnippet {
    title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateStreamCdn {
    frame_rate: String,
    resolution: String,
    ingestion_type: String,
}

// ============================================
// Helper Functions
// ============================================

async fn get_user_channel(access_token: &str, http_client: &reqwest::Client) -> Result<ChannelInfo> {
    let url = format!(
        "{}/channels?part=snippet&mine=true",
        YOUTUBE_API_BASE
    );

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to get YouTube channel: {}", error_text));
    }

    let data: YouTubeChannelListResponse = response.json().await?;
    let channel = data.items.into_iter().next()
        .ok_or_else(|| anyhow!("No YouTube channel found for user"))?;

    Ok(ChannelInfo {
        id: channel.id,
        title: channel.snippet.title,
    })
}

async fn get_or_create_broadcast(access_token: &str, http_client: &reqwest::Client) -> Result<BroadcastInfo> {
    // First, try to get an existing upcoming broadcast
    let url = format!(
        "{}/liveBroadcasts?part=snippet,contentDetails,status&broadcastStatus=upcoming&mine=true",
        YOUTUBE_API_BASE
    );

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if response.status().is_success() {
        let data: YouTubeLiveBroadcastListResponse = response.json().await?;
        if let Some(items) = data.items {
            if let Some(broadcast) = items.into_iter().next() {
                if let Some(content_details) = broadcast.content_details {
                    if let Some(stream_id) = content_details.bound_stream_id {
                        return Ok(BroadcastInfo {
                            id: broadcast.id,
                            stream_id,
                            title: broadcast.snippet.title,
                            status: broadcast.status.life_cycle_status,
                        });
                    }
                }
            }
        }
    }

    // No existing broadcast, create one
    create_broadcast_and_stream(access_token, http_client).await
}

async fn create_broadcast_and_stream(access_token: &str, http_client: &reqwest::Client) -> Result<BroadcastInfo> {
    // Create broadcast
    let now = chrono::Utc::now();
    let scheduled_time = (now + chrono::Duration::minutes(5)).to_rfc3339();

    let broadcast_request = CreateBroadcastRequest {
        snippet: CreateBroadcastSnippet {
            title: format!("ALLSTRM Stream - {}", now.format("%Y-%m-%d %H:%M")),
            scheduled_start_time: scheduled_time,
        },
        status: CreateBroadcastStatus {
            privacy_status: "unlisted".to_string(),
            self_declared_made_for_kids: false,
        },
        content_details: CreateBroadcastContentDetails {
            enable_auto_start: true,
            enable_auto_stop: true,
        },
    };

    let broadcast_url = format!(
        "{}/liveBroadcasts?part=snippet,status,contentDetails",
        YOUTUBE_API_BASE
    );

    let response = http_client
        .post(&broadcast_url)
        .bearer_auth(access_token)
        .json(&broadcast_request)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to create YouTube broadcast: {}", error_text));
    }

    let broadcast: YouTubeLiveBroadcast = response.json().await?;
    let broadcast_id = broadcast.id.clone();

    // Create stream
    let stream_request = CreateStreamRequest {
        snippet: CreateStreamSnippet {
            title: format!("ALLSTRM Stream - {}", now.format("%Y-%m-%d %H:%M")),
        },
        cdn: CreateStreamCdn {
            frame_rate: "30fps".to_string(),
            resolution: "1080p".to_string(),
            ingestion_type: "rtmp".to_string(),
        },
    };

    let stream_url = format!(
        "{}/liveStreams?part=snippet,cdn",
        YOUTUBE_API_BASE
    );

    let response = http_client
        .post(&stream_url)
        .bearer_auth(access_token)
        .json(&stream_request)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to create YouTube stream: {}", error_text));
    }

    let stream: serde_json::Value = response.json().await?;
    let stream_id = stream["id"].as_str()
        .ok_or_else(|| anyhow!("No stream ID in response"))?
        .to_string();

    // Bind stream to broadcast
    let bind_url = format!(
        "{}/liveBroadcasts/bind?id={}&part=id&streamId={}",
        YOUTUBE_API_BASE,
        broadcast_id,
        stream_id
    );

    let response = http_client
        .post(&bind_url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to bind stream to broadcast: {}", error_text));
    }

    Ok(BroadcastInfo {
        id: broadcast_id,
        stream_id,
        title: broadcast.snippet.title,
        status: broadcast.status.life_cycle_status,
    })
}

async fn get_stream_info(access_token: &str, stream_id: &str, http_client: &reqwest::Client) -> Result<StreamIngestionInfo> {
    let url = format!(
        "{}/liveStreams?part=cdn&id={}",
        YOUTUBE_API_BASE,
        stream_id
    );

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Failed to get stream info: {}", error_text));
    }

    let data: YouTubeLiveStreamListResponse = response.json().await?;
    let stream = data.items
        .and_then(|items| items.into_iter().next())
        .ok_or_else(|| anyhow!("Stream not found"))?;

    Ok(StreamIngestionInfo {
        ingestion_address: stream.cdn.ingestion_info.ingestion_address,
        stream_name: stream.cdn.ingestion_info.stream_name,
        backup_ingestion_address: stream.cdn.ingestion_info.backup_ingestion_address,
    })
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
            scopes: vec!["https://www.googleapis.com/auth/youtube".to_string()],
        };

        let provider = YouTubeProvider::new(config);
        let url = provider.get_authorization_url("test-state");

        assert!(url.contains("accounts.google.com"));
        assert!(url.contains("test-client-id"));
        assert!(url.contains("test-state"));
    }
}
