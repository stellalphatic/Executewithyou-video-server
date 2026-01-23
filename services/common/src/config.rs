//! Configuration utilities

use std::env;

/// Load a configuration value from environment
pub fn env_or<T: std::str::FromStr>(key: &str, default: T) -> T {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// Load a required configuration value from environment
pub fn env_required(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("Missing required environment variable: {}", key))
}

/// Common service configuration
#[derive(Debug, Clone)]
pub struct ServiceConfig {
    pub port: u16,
    pub log_level: String,
    pub metrics_enabled: bool,
}

impl ServiceConfig {
    pub fn from_env(service_name: &str) -> Self {
        let port_key = format!("{}_PORT", service_name.to_uppercase());
        Self {
            port: env_or(&port_key, 8080),
            log_level: env_or("LOG_LEVEL", "info".to_string()),
            metrics_enabled: env_or("METRICS_ENABLED", true),
        }
    }
}
