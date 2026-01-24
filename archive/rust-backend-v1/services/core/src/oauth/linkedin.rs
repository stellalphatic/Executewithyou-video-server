//! LinkedIn Live OAuth provider

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const LINKEDIN_AUTH_URL: &str = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL: &str = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_API_URL: &str = "https://api.linkedin.com/v2";

pub struct LinkedInProvider {
    config: OAuthConfig,
}

impl LinkedInProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for LinkedInProvider {
    fn name(&self) -> &'static str {
        "linkedin"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
            LINKEDIN_AUTH_URL,
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

        let response = http_client.post(LINKEDIN_TOKEN_URL).form(&params).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("LinkedIn token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: LinkedInTokenResponse = response.json().await?;
        debug!("LinkedIn token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: Some(token_response.expires_in),
            token_type: "Bearer".to_string(),
            scope: token_response.scope,
        })
    }

    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", self.config.client_id.as_str()),
            ("client_secret", self.config.client_secret.as_str()),
        ];

        let response = http_client.post(LINKEDIN_TOKEN_URL).form(&params).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: LinkedInTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.to_string())),
            expires_in: Some(token_response.expires_in),
            token_type: "Bearer".to_string(),
            scope: token_response.scope,
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/me", LINKEDIN_API_URL);

        let response = http_client
            .get(&url)
            .bearer_auth(access_token)
            .header("X-Restli-Protocol-Version", "2.0.0")
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: LinkedInProfile = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: profile.id,
            username: None,
            display_name: Some(format!("{} {}",
                profile.first_name.unwrap_or_default(),
                profile.last_name.unwrap_or_default()
            ).trim().to_string()),
            email: None,
            avatar_url: profile.profile_picture,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // LinkedIn Live requires approved creator access
        // Return the standard endpoint - stream key must be obtained from LinkedIn Studio
        Ok(StreamDestinationInfo {
            provider: "linkedin".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "LinkedIn Live".to_string()),
            rtmp_url: "rtmps://live.linkedin.com:443/live".to_string(),
            stream_key: "".to_string(), // Must be obtained from LinkedIn Live Studio
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}

#[derive(Debug, Deserialize)]
struct LinkedInTokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedInProfile {
    id: String,
    first_name: Option<String>,
    last_name: Option<String>,
    profile_picture: Option<String>,
}
