//! Amazon Live OAuth provider
//! Used for Amazon Live Creator/Influencer streaming

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const AMAZON_AUTH_URL: &str = "https://www.amazon.com/ap/oa";
const AMAZON_TOKEN_URL: &str = "https://api.amazon.com/auth/o2/token";
const AMAZON_PROFILE_URL: &str = "https://api.amazon.com/user/profile";

pub struct AmazonProvider {
    config: OAuthConfig,
}

impl AmazonProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for AmazonProvider {
    fn name(&self) -> &'static str {
        "amazon"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
            AMAZON_AUTH_URL,
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
            .post(AMAZON_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Amazon token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: AmazonTokenResponse = response.json().await?;
        debug!("Amazon token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: Some(token_response.refresh_token),
            expires_in: Some(token_response.expires_in),
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
            .post(AMAZON_TOKEN_URL)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: AmazonTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: Some(token_response.refresh_token),
            expires_in: Some(token_response.expires_in),
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let response = http_client
            .get(AMAZON_PROFILE_URL)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: AmazonProfile = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: profile.user_id,
            username: None,
            display_name: profile.name,
            email: profile.email,
            avatar_url: None,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // Amazon Live streaming requires Influencer/Creator program access
        // Stream key must be obtained from Amazon Live Creator dashboard
        Ok(StreamDestinationInfo {
            provider: "amazon".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "Amazon Live".to_string()),
            rtmp_url: "rtmps://live.amazon.com:443/app".to_string(),
            stream_key: "".to_string(), // Must be obtained from Amazon Live Creator dashboard
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}

#[derive(Debug, Deserialize)]
struct AmazonTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct AmazonProfile {
    user_id: String,
    name: Option<String>,
    email: Option<String>,
}
