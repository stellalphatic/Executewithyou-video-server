//! Gateway configuration

use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct GatewayConfig {
    pub port: u16,
    pub jwt_secret: String,
    pub jwt_audience: Option<String>,
    pub rate_limit_rps: u32,
    pub rate_limit_burst: u32,

    // Supabase configuration
    pub supabase_url: Option<String>,
    pub supabase_anon_key: Option<String>,

    // Service URLs
    pub core_service_url: String,
    pub sfu_service_url: String,
    pub stream_service_url: String,
    pub storage_service_url: String,
}

impl GatewayConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            port: std::env::var("GATEWAY_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            jwt_secret: std::env::var("GATEWAY_JWT_SECRET")
                .unwrap_or_else(|_| "development-secret".to_string()),
            jwt_audience: std::env::var("GATEWAY_JWT_AUDIENCE").ok(),
            rate_limit_rps: std::env::var("GATEWAY_RATE_LIMIT_RPS")
                .unwrap_or_else(|_| "100".to_string())
                .parse()?,
            rate_limit_burst: std::env::var("GATEWAY_RATE_LIMIT_BURST")
                .unwrap_or_else(|_| "200".to_string())
                .parse()?,

            supabase_url: std::env::var("SUPABASE_URL").ok(),
            supabase_anon_key: std::env::var("SUPABASE_ANON_KEY").ok(),

            core_service_url: std::env::var("CORE_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8081".to_string()),
            sfu_service_url: std::env::var("SFU_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8082".to_string()),
            stream_service_url: std::env::var("STREAM_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8083".to_string()),
            storage_service_url: std::env::var("STORAGE_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8084".to_string()),
        })
    }

    /// Check if Supabase is configured
    pub fn has_supabase(&self) -> bool {
        self.supabase_url.is_some() && self.supabase_anon_key.is_some()
    }
}
