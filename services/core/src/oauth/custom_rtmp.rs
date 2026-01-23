//! Custom RTMP destination provider
//! For any RTMP-compatible streaming platform not explicitly supported

use anyhow::{anyhow, Result};
use async_trait::async_trait;

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

/// Custom RTMP provider for manual configuration
/// This doesn't use OAuth - it's for direct RTMP URL + stream key entry
pub struct CustomRtmpProvider {
    #[allow(dead_code)]
    config: OAuthConfig,
}

impl CustomRtmpProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for CustomRtmpProvider {
    fn name(&self) -> &'static str {
        "custom_rtmp"
    }

    fn get_authorization_url(&self, _state: &str) -> String {
        // Custom RTMP doesn't use OAuth - redirect to manual setup
        "/destinations/add?type=custom_rtmp".to_string()
    }

    async fn exchange_code(&self, _code: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        Err(anyhow!("Custom RTMP doesn't use OAuth. Configure RTMP URL and stream key manually."))
    }

    async fn refresh_token(&self, _refresh_token: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        Err(anyhow!("Custom RTMP doesn't use OAuth."))
    }

    async fn get_user_profile(&self, _access_token: &str, _http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        Err(anyhow!("Custom RTMP doesn't use OAuth."))
    }

    async fn get_stream_destination(&self, _access_token: &str, _http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // Custom RTMP requires manual configuration
        Ok(StreamDestinationInfo {
            provider: "custom_rtmp".to_string(),
            channel_id: "custom".to_string(),
            channel_name: "Custom RTMP".to_string(),
            rtmp_url: "".to_string(), // Must be provided by user
            stream_key: "".to_string(), // Must be provided by user
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}

/// Helper struct for storing custom RTMP configuration
#[derive(Debug, Clone)]
pub struct CustomRtmpConfig {
    pub name: String,
    pub rtmp_url: String,
    pub stream_key: String,
    pub backup_url: Option<String>,
}

impl CustomRtmpConfig {
    /// Validate the RTMP URL format
    pub fn validate(&self) -> Result<()> {
        if self.rtmp_url.is_empty() {
            return Err(anyhow!("RTMP URL is required"));
        }

        if !self.rtmp_url.starts_with("rtmp://") && !self.rtmp_url.starts_with("rtmps://") {
            return Err(anyhow!("Invalid RTMP URL format. Must start with rtmp:// or rtmps://"));
        }

        if self.stream_key.is_empty() {
            return Err(anyhow!("Stream key is required"));
        }

        Ok(())
    }

    /// Get full RTMP URL with stream key
    pub fn full_url(&self) -> String {
        if self.rtmp_url.ends_with('/') {
            format!("{}{}", self.rtmp_url, self.stream_key)
        } else {
            format!("{}/{}", self.rtmp_url, self.stream_key)
        }
    }
}

/// Common RTMP endpoints for popular platforms
pub mod common_endpoints {
    pub const RESTREAM: &str = "rtmp://live.restream.io/live";
    pub const CASTR: &str = "rtmp://live.castr.io/static";
    pub const STREAMYARD: &str = "rtmp://rtmp.streamyard.com/";
    pub const DACAST: &str = "rtmp://live.dacast.com/live";
    pub const WOWZA: &str = "rtmp://live.wowza.com:1935/live";
    pub const AKAMAI: &str = "rtmp://live.akamaihd.net/live";
    pub const CLOUDFLARE: &str = "rtmp://live.cloudflare.com:1935/live";
}
