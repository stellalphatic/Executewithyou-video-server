//! OAuth integration for streaming platforms
//!
//! Supports 13 streaming destinations:
//! - YouTube (Google OAuth)
//! - Facebook Live (Facebook Login)
//! - LinkedIn Live (LinkedIn OAuth)
//! - X/Twitter (Twitter OAuth 2.0)
//! - Twitch (Twitch OAuth)
//! - Instagram Live (Facebook OAuth)
//! - TikTok Live (TikTok Login Kit)
//! - Kick (Manual RTMP)
//! - Vimeo (Vimeo OAuth)
//! - Amazon Live (Amazon OAuth)
//! - Brightcove (Client Credentials)
//! - Hopin (Hopin OAuth)
//! - Custom RTMP (Manual configuration)

pub mod provider;
pub mod youtube;
pub mod twitch;
pub mod facebook;
pub mod linkedin;
pub mod tiktok;
pub mod instagram;
pub mod twitter;
pub mod kick;
pub mod vimeo;
pub mod amazon;
pub mod brightcove;
pub mod hopin;
pub mod custom_rtmp;

pub use provider::{OAuthProvider, OAuthConfig, OAuthTokens, StreamDestinationInfo};
pub use youtube::YouTubeProvider;
pub use twitch::TwitchProvider;
pub use facebook::FacebookProvider;
pub use linkedin::LinkedInProvider;
pub use tiktok::TikTokProvider;
pub use instagram::InstagramProvider;
pub use twitter::TwitterProvider;
pub use kick::KickProvider;
pub use vimeo::VimeoProvider;
pub use amazon::AmazonProvider;
pub use brightcove::BrightcoveProvider;
pub use hopin::HopinProvider;
pub use custom_rtmp::CustomRtmpProvider;

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

/// OAuth manager that handles all provider integrations
pub struct OAuthManager {
    providers: HashMap<String, Arc<dyn OAuthProvider>>,
    http_client: reqwest::Client,
}

impl OAuthManager {
    /// Create a new OAuth manager with configured providers
    pub fn new(config: &OAuthManagerConfig) -> Result<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        let mut providers: HashMap<String, Arc<dyn OAuthProvider>> = HashMap::new();

        // YouTube (Google)
        if let (Some(client_id), Some(client_secret)) = (&config.youtube_client_id, &config.youtube_client_secret) {
            providers.insert("youtube".to_string(), Arc::new(YouTubeProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/youtube/callback", config.redirect_base_url),
                scopes: vec![
                    "https://www.googleapis.com/auth/youtube".to_string(),
                    "https://www.googleapis.com/auth/youtube.force-ssl".to_string(),
                ],
            })));
        }

        // Facebook Live
        if let (Some(client_id), Some(client_secret)) = (&config.facebook_app_id, &config.facebook_app_secret) {
            providers.insert("facebook".to_string(), Arc::new(FacebookProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/facebook/callback", config.redirect_base_url),
                scopes: vec![
                    "publish_video".to_string(),
                    "pages_manage_posts".to_string(),
                    "pages_read_engagement".to_string(),
                ],
            })));

            // Instagram (uses Facebook OAuth)
            providers.insert("instagram".to_string(), Arc::new(InstagramProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/instagram/callback", config.redirect_base_url),
                scopes: vec![
                    "instagram_basic".to_string(),
                    "instagram_content_publish".to_string(),
                    "pages_show_list".to_string(),
                ],
            })));
        }

        // LinkedIn Live
        if let (Some(client_id), Some(client_secret)) = (&config.linkedin_client_id, &config.linkedin_client_secret) {
            providers.insert("linkedin".to_string(), Arc::new(LinkedInProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/linkedin/callback", config.redirect_base_url),
                scopes: vec![
                    "r_liteprofile".to_string(),
                    "w_member_social".to_string(),
                ],
            })));
        }

        // X (Twitter)
        if let (Some(client_id), Some(client_secret)) = (&config.twitter_client_id, &config.twitter_client_secret) {
            providers.insert("x".to_string(), Arc::new(TwitterProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/x/callback", config.redirect_base_url),
                scopes: vec![
                    "tweet.read".to_string(),
                    "users.read".to_string(),
                    "offline.access".to_string(),
                ],
            })));
        }

        // Twitch
        if let (Some(client_id), Some(client_secret)) = (&config.twitch_client_id, &config.twitch_client_secret) {
            providers.insert("twitch".to_string(), Arc::new(TwitchProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/twitch/callback", config.redirect_base_url),
                scopes: vec![
                    "channel:manage:broadcast".to_string(),
                    "channel:read:stream_key".to_string(),
                    "user:read:email".to_string(),
                ],
            })));
        }

        // TikTok
        if let (Some(client_id), Some(client_secret)) = (&config.tiktok_client_key, &config.tiktok_client_secret) {
            providers.insert("tiktok".to_string(), Arc::new(TikTokProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/tiktok/callback", config.redirect_base_url),
                scopes: vec![
                    "user.info.basic".to_string(),
                    "video.publish".to_string(),
                ],
            })));
        }

        // Kick (no OAuth - manual RTMP only, but include for consistency)
        providers.insert("kick".to_string(), Arc::new(KickProvider::new(OAuthConfig {
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: String::new(),
            scopes: vec![],
        })));

        // Vimeo
        if let (Some(client_id), Some(client_secret)) = (&config.vimeo_client_id, &config.vimeo_client_secret) {
            providers.insert("vimeo".to_string(), Arc::new(VimeoProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/vimeo/callback", config.redirect_base_url),
                scopes: vec![
                    "public".to_string(),
                    "private".to_string(),
                    "video_files".to_string(),
                ],
            })));
        }

        // Amazon Live
        if let (Some(client_id), Some(client_secret)) = (&config.amazon_client_id, &config.amazon_client_secret) {
            providers.insert("amazon".to_string(), Arc::new(AmazonProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/amazon/callback", config.redirect_base_url),
                scopes: vec![
                    "profile".to_string(),
                ],
            })));
        }

        // Brightcove (client credentials)
        if let (Some(client_id), Some(client_secret)) = (&config.brightcove_client_id, &config.brightcove_client_secret) {
            providers.insert("brightcove".to_string(), Arc::new(BrightcoveProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: String::new(), // Not used for client credentials
                scopes: vec![],
            })));
        }

        // Hopin
        if let (Some(client_id), Some(client_secret)) = (&config.hopin_client_id, &config.hopin_client_secret) {
            providers.insert("hopin".to_string(), Arc::new(HopinProvider::new(OAuthConfig {
                client_id: client_id.clone(),
                client_secret: client_secret.clone(),
                redirect_uri: format!("{}/api/oauth/hopin/callback", config.redirect_base_url),
                scopes: vec![
                    "events.read".to_string(),
                    "events.write".to_string(),
                ],
            })));
        }

        // Custom RTMP (always available)
        providers.insert("custom_rtmp".to_string(), Arc::new(CustomRtmpProvider::new(OAuthConfig {
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: String::new(),
            scopes: vec![],
        })));

        Ok(Self {
            providers,
            http_client,
        })
    }

    /// Get a provider by name
    pub fn get_provider(&self, name: &str) -> Option<Arc<dyn OAuthProvider>> {
        self.providers.get(name).cloned()
    }

    /// Get list of available providers
    pub fn available_providers(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }

    /// Get HTTP client for making API requests
    pub fn http_client(&self) -> &reqwest::Client {
        &self.http_client
    }
}

/// Configuration for OAuth manager - loaded from environment variables
#[derive(Debug, Clone)]
pub struct OAuthManagerConfig {
    pub redirect_base_url: String,

    // YouTube (Google)
    pub youtube_client_id: Option<String>,
    pub youtube_client_secret: Option<String>,

    // Facebook (also used for Instagram)
    pub facebook_app_id: Option<String>,
    pub facebook_app_secret: Option<String>,

    // LinkedIn
    pub linkedin_client_id: Option<String>,
    pub linkedin_client_secret: Option<String>,

    // X (Twitter)
    pub twitter_client_id: Option<String>,
    pub twitter_client_secret: Option<String>,

    // Twitch
    pub twitch_client_id: Option<String>,
    pub twitch_client_secret: Option<String>,

    // TikTok
    pub tiktok_client_key: Option<String>,
    pub tiktok_client_secret: Option<String>,

    // Vimeo
    pub vimeo_client_id: Option<String>,
    pub vimeo_client_secret: Option<String>,

    // Amazon
    pub amazon_client_id: Option<String>,
    pub amazon_client_secret: Option<String>,

    // Brightcove
    pub brightcove_client_id: Option<String>,
    pub brightcove_client_secret: Option<String>,

    // Hopin
    pub hopin_client_id: Option<String>,
    pub hopin_client_secret: Option<String>,
}

impl OAuthManagerConfig {
    pub fn from_env() -> Self {
        Self {
            redirect_base_url: std::env::var("OAUTH_REDIRECT_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),

            // YouTube (Google)
            youtube_client_id: std::env::var("GOOGLE_CLIENT_ID").ok(),
            youtube_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").ok(),

            // Facebook (also Instagram)
            facebook_app_id: std::env::var("FACEBOOK_APP_ID").ok(),
            facebook_app_secret: std::env::var("FACEBOOK_APP_SECRET").ok(),

            // LinkedIn
            linkedin_client_id: std::env::var("LINKEDIN_CLIENT_ID").ok(),
            linkedin_client_secret: std::env::var("LINKEDIN_CLIENT_SECRET").ok(),

            // X (Twitter)
            twitter_client_id: std::env::var("TWITTER_CLIENT_ID").ok(),
            twitter_client_secret: std::env::var("TWITTER_CLIENT_SECRET").ok(),

            // Twitch
            twitch_client_id: std::env::var("TWITCH_CLIENT_ID").ok(),
            twitch_client_secret: std::env::var("TWITCH_CLIENT_SECRET").ok(),

            // TikTok
            tiktok_client_key: std::env::var("TIKTOK_CLIENT_KEY").ok(),
            tiktok_client_secret: std::env::var("TIKTOK_CLIENT_SECRET").ok(),

            // Vimeo
            vimeo_client_id: std::env::var("VIMEO_CLIENT_ID").ok(),
            vimeo_client_secret: std::env::var("VIMEO_CLIENT_SECRET").ok(),

            // Amazon
            amazon_client_id: std::env::var("AMAZON_CLIENT_ID").ok(),
            amazon_client_secret: std::env::var("AMAZON_CLIENT_SECRET").ok(),

            // Brightcove
            brightcove_client_id: std::env::var("BRIGHTCOVE_ACCOUNT_ID").ok(),
            brightcove_client_secret: std::env::var("BRIGHTCOVE_CLIENT_SECRET").ok(),

            // Hopin
            hopin_client_id: std::env::var("HOPIN_CLIENT_ID").ok(),
            hopin_client_secret: std::env::var("HOPIN_CLIENT_SECRET").ok(),
        }
    }
}

/// Platform information for UI display
#[derive(Debug, Clone)]
pub struct PlatformInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub icon: &'static str,
    pub supports_oauth: bool,
    pub rtmp_url_template: &'static str,
}

/// Get information about all supported platforms
pub fn get_all_platforms() -> Vec<PlatformInfo> {
    vec![
        PlatformInfo {
            id: "youtube",
            name: "YouTube",
            icon: "youtube",
            supports_oauth: true,
            rtmp_url_template: "rtmp://a.rtmp.youtube.com/live2",
        },
        PlatformInfo {
            id: "facebook",
            name: "Facebook Live",
            icon: "facebook",
            supports_oauth: true,
            rtmp_url_template: "rtmps://live-api-s.facebook.com:443/rtmp",
        },
        PlatformInfo {
            id: "linkedin",
            name: "LinkedIn Live",
            icon: "linkedin",
            supports_oauth: true,
            rtmp_url_template: "rtmps://live.linkedin.com:443/live",
        },
        PlatformInfo {
            id: "x",
            name: "X (Twitter)",
            icon: "twitter",
            supports_oauth: true,
            rtmp_url_template: "rtmps://stream.pscp.tv:443/x",
        },
        PlatformInfo {
            id: "twitch",
            name: "Twitch",
            icon: "twitch",
            supports_oauth: true,
            rtmp_url_template: "rtmp://live.twitch.tv/app",
        },
        PlatformInfo {
            id: "instagram",
            name: "Instagram Live",
            icon: "instagram",
            supports_oauth: true,
            rtmp_url_template: "rtmps://live-upload.instagram.com:443/rtmp",
        },
        PlatformInfo {
            id: "tiktok",
            name: "TikTok Live",
            icon: "tiktok",
            supports_oauth: true,
            rtmp_url_template: "rtmps://live.tiktokcdn.com/live",
        },
        PlatformInfo {
            id: "kick",
            name: "Kick",
            icon: "kick",
            supports_oauth: false,
            rtmp_url_template: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app",
        },
        PlatformInfo {
            id: "vimeo",
            name: "Vimeo",
            icon: "vimeo",
            supports_oauth: true,
            rtmp_url_template: "rtmp://rtmp.cloud.vimeo.com/live",
        },
        PlatformInfo {
            id: "amazon",
            name: "Amazon Live",
            icon: "amazon",
            supports_oauth: true,
            rtmp_url_template: "rtmps://live.amazon.com:443/app",
        },
        PlatformInfo {
            id: "brightcove",
            name: "Brightcove",
            icon: "brightcove",
            supports_oauth: true,
            rtmp_url_template: "rtmp://live.brightcove.com/live",
        },
        PlatformInfo {
            id: "hopin",
            name: "Hopin",
            icon: "hopin",
            supports_oauth: true,
            rtmp_url_template: "rtmp://live.hopin.com/live",
        },
        PlatformInfo {
            id: "custom_rtmp",
            name: "Custom RTMP",
            icon: "broadcast",
            supports_oauth: false,
            rtmp_url_template: "",
        },
    ]
}
