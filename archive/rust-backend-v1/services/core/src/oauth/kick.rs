//! Kick streaming provider
//! Note: Kick doesn't have a public OAuth API yet - manual RTMP configuration required

use anyhow::{anyhow, Result};
use async_trait::async_trait;

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

/// Kick provider (manual RTMP only - no OAuth API available yet)
pub struct KickProvider {
    #[allow(dead_code)]
    config: OAuthConfig,
}

impl KickProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for KickProvider {
    fn name(&self) -> &'static str {
        "kick"
    }

    fn get_authorization_url(&self, _state: &str) -> String {
        // Kick doesn't have OAuth - redirect to manual setup page
        "https://kick.com/dashboard/settings/stream".to_string()
    }

    async fn exchange_code(&self, _code: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        Err(anyhow!("Kick doesn't support OAuth. Please configure RTMP manually."))
    }

    async fn refresh_token(&self, _refresh_token: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        Err(anyhow!("Kick doesn't support OAuth. Please configure RTMP manually."))
    }

    async fn get_user_profile(&self, _access_token: &str, _http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        Err(anyhow!("Kick doesn't support OAuth. Please configure RTMP manually."))
    }

    async fn get_stream_destination(&self, _access_token: &str, _http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // Return default Kick RTMP endpoint
        Ok(StreamDestinationInfo {
            provider: "kick".to_string(),
            channel_id: "".to_string(),
            channel_name: "Kick".to_string(),
            rtmp_url: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app".to_string(),
            stream_key: "".to_string(), // Must be obtained from Kick dashboard
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}
