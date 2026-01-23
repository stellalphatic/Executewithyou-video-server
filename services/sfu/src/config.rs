//! SFU configuration

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct SfuConfig {
    pub port: u16,
    pub stun_server: String,
    pub turn_server: Option<String>,
    pub turn_username: Option<String>,
    pub turn_credential: Option<String>,
    pub redis_url: String,
    pub max_participants_per_room: u32,
}

impl SfuConfig {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            port: std::env::var("SFU_PORT")
                .unwrap_or_else(|_| "8082".to_string())
                .parse()?,
            stun_server: std::env::var("SFU_STUN_SERVER")
                .unwrap_or_else(|_| "stun:stun.l.google.com:19302".to_string()),
            turn_server: std::env::var("SFU_TURN_SERVER").ok(),
            turn_username: std::env::var("SFU_TURN_USERNAME").ok(),
            turn_credential: std::env::var("SFU_TURN_CREDENTIAL").ok(),
            redis_url: std::env::var("SFU_REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379/0".to_string()),
            max_participants_per_room: std::env::var("SFU_MAX_PARTICIPANTS_PER_ROOM")
                .unwrap_or_else(|_| "50".to_string())
                .parse()?,
        })
    }

    /// Get ICE servers configuration for clients
    pub fn ice_servers(&self) -> Vec<allstrm_protocol::IceServer> {
        let mut servers = vec![allstrm_protocol::IceServer {
            urls: vec![self.stun_server.clone()],
            username: None,
            credential: None,
        }];

        if let Some(ref turn) = self.turn_server {
            servers.push(allstrm_protocol::IceServer {
                urls: vec![turn.clone()],
                username: self.turn_username.clone(),
                credential: self.turn_credential.clone(),
            });
        }

        servers
    }
}
