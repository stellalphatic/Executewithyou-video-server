//! X (Twitter) OAuth provider
//! Note: X doesn't have a public live streaming API yet, but OAuth enables future integration

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const TWITTER_AUTH_URL: &str = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL: &str = "https://api.twitter.com/2/oauth2/token";
const TWITTER_API_URL: &str = "https://api.twitter.com/2";

pub struct TwitterProvider {
    config: OAuthConfig,
}

impl TwitterProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for TwitterProvider {
    fn name(&self) -> &'static str {
        "x"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        let scopes = self.config.scopes.join(" ");
        // X/Twitter OAuth 2.0 with PKCE
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge=challenge&code_challenge_method=plain",
            TWITTER_AUTH_URL,
            urlencoding::encode(&self.config.client_id),
            urlencoding::encode(&self.config.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state)
        )
    }

    async fn exchange_code(&self, code: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_id", self.config.client_id.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", self.config.redirect_uri.as_str()),
            ("code_verifier", "challenge"),
        ];

        let response = http_client
            .post(TWITTER_TOKEN_URL)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("X token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: TwitterTokenResponse = response.json().await?;
        debug!("X token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: Some(token_response.expires_in),
            token_type: token_response.token_type,
            scope: Some(token_response.scope),
        })
    }

    async fn refresh_token(&self, refresh_token: &str, http_client: &reqwest::Client) -> Result<OAuthTokens> {
        let params = [
            ("client_id", self.config.client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ];

        let response = http_client
            .post(TWITTER_TOKEN_URL)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: TwitterTokenResponse = response.json().await?;

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| Some(refresh_token.to_string())),
            expires_in: Some(token_response.expires_in),
            token_type: token_response.token_type,
            scope: Some(token_response.scope),
        })
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        let url = format!("{}/users/me?user.fields=profile_image_url,name,username", TWITTER_API_URL);

        let response = http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let data: TwitterUserResponse = response.json().await?;

        Ok(OAuthUserProfile {
            provider_user_id: data.data.id,
            username: Some(data.data.username),
            display_name: Some(data.data.name),
            email: None,
            avatar_url: data.data.profile_image_url,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // X doesn't have public live streaming API yet
        // Users need to use X Media Studio or X Amplify
        Ok(StreamDestinationInfo {
            provider: "x".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.username.clone().unwrap_or_else(|| "X Live".to_string()),
            rtmp_url: "rtmp://stream.pscp.tv:80/x".to_string(), // Periscope/X Live endpoint
            stream_key: "".to_string(), // Must be obtained from X Media Studio
            backup_rtmp_url: Some("rtmps://stream.pscp.tv:443/x".to_string()),
            title: None,
            is_live: false,
        })
    }
}

#[derive(Debug, Deserialize)]
struct TwitterTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    token_type: String,
    scope: String,
}

#[derive(Debug, Deserialize)]
struct TwitterUserResponse {
    data: TwitterUser,
}

#[derive(Debug, Deserialize)]
struct TwitterUser {
    id: String,
    name: String,
    username: String,
    profile_image_url: Option<String>,
}
