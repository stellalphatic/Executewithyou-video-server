//! OAuth provider trait and common types

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// OAuth provider configuration
#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

/// OAuth tokens returned from token exchange
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: String,
    pub scope: Option<String>,
}

/// User profile information from OAuth provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthUserProfile {
    pub provider_user_id: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

/// Stream destination information fetched from provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDestinationInfo {
    pub provider: String,
    pub channel_id: String,
    pub channel_name: String,
    pub rtmp_url: String,
    pub stream_key: String,
    pub backup_rtmp_url: Option<String>,
    pub title: Option<String>,
    pub is_live: bool,
}

/// YouTube-specific broadcast info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeBroadcastInfo {
    pub broadcast_id: String,
    pub stream_id: String,
    pub title: String,
    pub description: Option<String>,
    pub privacy_status: String,
    pub ingestion_address: String,
    pub stream_name: String,
    pub backup_ingestion_address: Option<String>,
    pub resolution: Option<String>,
    pub frame_rate: Option<String>,
    pub status: String,
}

/// Twitch channel info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchChannelInfo {
    pub channel_id: String,
    pub channel_name: String,
    pub display_name: String,
    pub stream_key: String,
    pub ingest_server: String,
    pub title: Option<String>,
    pub game_name: Option<String>,
    pub is_live: bool,
}

/// Facebook live video info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacebookLiveInfo {
    pub video_id: String,
    pub stream_url: String,
    pub secure_stream_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: String,
}

/// OAuth provider trait
#[async_trait]
pub trait OAuthProvider: Send + Sync {
    /// Get the provider name (e.g., "youtube", "twitch", "facebook")
    fn name(&self) -> &'static str;

    /// Get the authorization URL to redirect users to
    fn get_authorization_url(&self, state: &str) -> String;

    /// Exchange authorization code for tokens
    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens>;

    /// Refresh an expired access token
    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens>;

    /// Get user profile information
    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile>;

    /// Get stream destination info (RTMP URL and stream key)
    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo>;

    /// Revoke access (optional, not all providers support)
    async fn revoke_access(&self, access_token: &str, http_client: &reqwest::Client) -> Result<()> {
        let _ = access_token;
        let _ = http_client;
        Ok(())
    }
}
