//! Instagram Live OAuth provider
//! Uses Facebook Graph API (Instagram requires Facebook Business account)

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use tracing::{debug, error};

use super::provider::{OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserProfile, StreamDestinationInfo};

const FACEBOOK_AUTH_URL: &str = "https://www.facebook.com/v18.0/dialog/oauth";
const FACEBOOK_TOKEN_URL: &str = "https://graph.facebook.com/v18.0/oauth/access_token";
const FACEBOOK_GRAPH_URL: &str = "https://graph.facebook.com/v18.0";

pub struct InstagramProvider {
    config: OAuthConfig,
}

impl InstagramProvider {
    pub fn new(config: OAuthConfig) -> Self {
        Self { config }
    }
}

#[async_trait]
impl OAuthProvider for InstagramProvider {
    fn name(&self) -> &'static str {
        "instagram"
    }

    fn get_authorization_url(&self, state: &str) -> String {
        // Instagram Live uses Facebook OAuth with instagram_content_publish scope
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

        let response = http_client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            error!("Instagram token exchange failed: {}", error_text);
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: FacebookTokenResponse = response.json().await?;
        debug!("Instagram token exchange successful");

        Ok(OAuthTokens {
            access_token: token_response.access_token,
            refresh_token: None,
            expires_in: token_response.expires_in,
            token_type: token_response.token_type,
            scope: None,
        })
    }

    async fn refresh_token(&self, _refresh_token: &str, _http_client: &reqwest::Client) -> Result<OAuthTokens> {
        Err(anyhow!("Instagram requires re-authentication for token refresh"))
    }

    async fn get_user_profile(&self, access_token: &str, http_client: &reqwest::Client) -> Result<OAuthUserProfile> {
        // Get Facebook user's Instagram business account
        let url = format!(
            "{}/me?fields=id,name,instagram_business_account&access_token={}",
            FACEBOOK_GRAPH_URL,
            urlencoding::encode(access_token)
        );

        let response = http_client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to get user profile: {}", error_text));
        }

        let profile: InstagramProfileResponse = response.json().await?;

        let instagram_id = profile.instagram_business_account
            .map(|acc| acc.id)
            .unwrap_or_else(|| profile.id.clone());

        Ok(OAuthUserProfile {
            provider_user_id: instagram_id,
            username: None,
            display_name: profile.name,
            email: None,
            avatar_url: None,
        })
    }

    async fn get_stream_destination(&self, access_token: &str, http_client: &reqwest::Client) -> Result<StreamDestinationInfo> {
        let profile = self.get_user_profile(access_token, http_client).await?;

        // Instagram Live requires a business/creator account
        // RTMP streaming is initiated via the Instagram app or API
        Ok(StreamDestinationInfo {
            provider: "instagram".to_string(),
            channel_id: profile.provider_user_id.clone(),
            channel_name: profile.display_name.unwrap_or_else(|| "Instagram Live".to_string()),
            rtmp_url: "rtmps://live-upload.instagram.com:443/rtmp".to_string(),
            stream_key: "".to_string(), // Must be obtained from Instagram Live
            backup_rtmp_url: None,
            title: None,
            is_live: false,
        })
    }
}

#[derive(Debug, Deserialize)]
struct FacebookTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct InstagramProfileResponse {
    id: String,
    name: Option<String>,
    instagram_business_account: Option<InstagramBusinessAccount>,
}

#[derive(Debug, Deserialize)]
struct InstagramBusinessAccount {
    id: String,
}
