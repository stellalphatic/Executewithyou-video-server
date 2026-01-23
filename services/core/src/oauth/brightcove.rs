//! Brightcove Live OAuth provider
//! Enterprise video platform

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const BRIGHTCOVE_AUTH_URL: &str = "https://oauth.brightcove.com/v4/access_token";
const BRIGHTCOVE_API_URL: &str = "https://api.brightcove.com";

pub struct BrightcoveProvider {
    config: OAuthConfig,
}

impl BrightcoveProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for BrightcoveProvider {
    fn name(&self) -> &'static str {
        "brightcove"
    }

    fn get_authorization_url(&self, _state: &str) -> String {
        // Brightcove uses client credentials flow, not user OAuth
        // Direct users to Brightcove Studio for setup
        "https://studio.brightcove.com/products/videocloud/admin/ingestprofiles".to_string()
    }

    async fn exchange_code(&self, _code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        // Brightcove uses client credentials, not authorization code
        let response = http_client
            .post(BRIGHTCOVE_AUTH_URL)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body("grant_type=client_credentials")
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Brightcove token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: BrightcoveTokenResponse = response.json().await?;
        debug!("Brightcove token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: None,
            expires_in: Some(token_response.expires_in),
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn refresh_token(&self, _refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        // Brightcove uses client credentials - just get a new token
        self.exchange_code("", http_client).await
    }

    async fn get_user_profile(&self, _access_token: &str, _http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        // Brightcove is account-based, not user-based
        Ok(OAuthUserProfile {
            provider_user_id: self.config.client_id.clone(),
            username: None,
            display_name: Some("Brightcove Account".to_string()),
            email: None,
            avatar_url: None,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        // Get or create a live job
        let live_job = get_or_create_live_job(access_token, &self.config.client_id, http_client).await?;

        Ok(StreamDestinationInfo {
            provider: "brightcove".to_string(),
            channel_id: self.config.client_id.clone(),
            channel_name: "Brightcove Live".to_string(),
            rtmp_url: live_job.rtmp_url,
            stream_key: live_job.stream_name,
            backup_rtmp_url: live_job.backup_rtmp_url,
            title: live_job.title,
            is_live: live_job.is_live,
        })
    }
}

#[derive(Debug, Deserialize)]
struct BrightcoveTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
}

struct BrightcoveLiveJob {
    rtmp_url: String,
    stream_name: String,
    backup_rtmp_url: Option<String>,
    title: Option<String>,
    is_live: bool,
}

async fn get_or_create_live_job(
    access_token: &str,
    account_id: &str,
    http_client: &reqwest::Client,
) -> Result<BrightcoveLiveJob> {
    // List existing live jobs
    let url = format!("{}/v1/accounts/{}/live_jobs", BRIGHTCOVE_API_URL, account_id);

    let response = http_client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await?;

    if response.status().is_success() {
        let data: serde_json::Value = response.json().await?;
        if let Some(jobs) = data.as_array() {
            // Find an available job
            for job in jobs {
                if job["state"].as_str() == Some("standby") || job["state"].as_str() == Some("waiting") {
                    if let Some(outputs) = job["outputs"].as_array() {
                        if let Some(rtmp_output) = outputs.iter().find(|o| o["label"].as_str() == Some("rtmp")) {
                            return Ok(BrightcoveLiveJob {
                                rtmp_url: rtmp_output["url"].as_str().unwrap_or("").to_string(),
                                stream_name: rtmp_output["stream_name"].as_str().unwrap_or("").to_string(),
                                backup_rtmp_url: None,
                                title: job["name"].as_str().map(|s| s.to_string()),
                                is_live: job["state"].as_str() == Some("processing"),
                            });
                        }
                    }
                }
            }
        }
    }

    // Return placeholder - user needs to create live job in Brightcove Studio
    Ok(BrightcoveLiveJob {
        rtmp_url: "rtmp://live.brightcove.com/live".to_string(),
        stream_name: "".to_string(),
        backup_rtmp_url: None,
        title: Some("Create live job in Brightcove Studio".to_string()),
        is_live: false,
    })
}
