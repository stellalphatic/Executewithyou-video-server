//! RTMP ingest server
//!
//! Note: For production, you might use nginx-rtmp-module or a dedicated RTMP server.
//! This is a simplified implementation for development/testing.

use crate::AppState;
use anyhow::Result;
use tracing::info;

/// Start the RTMP ingest server
/// 
/// In production, this would typically be:
/// 1. nginx-rtmp-module with callback to our HTTP endpoints
/// 2. A full RTMP server implementation (complex)
/// 3. Or we rely on OBS/broadcasters to push directly to nginx-rtmp
/// 
/// For this implementation, we assume nginx-rtmp is handling the actual RTMP
/// and callbacks to /rtmp/on_publish and /rtmp/on_publish_done
pub async fn start_rtmp_server(state: AppState) -> Result<()> {
    info!(
        "RTMP ingest configured on port {} (expects external RTMP server like nginx-rtmp)",
        state.config.rtmp_port
    );

    // In a real implementation, you could:
    // 1. Spawn nginx-rtmp as a subprocess
    // 2. Use a pure Rust RTMP library
    // 3. Or just document that nginx-rtmp needs to be running separately

    // For now, we'll just log that we expect an external RTMP server
    // and handle callbacks via the HTTP endpoints

    // Keep the task alive
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        
        // Could do health checks on nginx-rtmp here
        // Or monitor active streams
    }
}

/// Parse stream key to extract room ID
/// Stream key format: {room_id_no_dashes}_{random_suffix}
pub fn parse_stream_key(stream_key: &str) -> Option<uuid::Uuid> {
    let parts: Vec<&str> = stream_key.split('_').collect();
    if parts.is_empty() {
        return None;
    }

    // Try to parse the first part as UUID (without dashes)
    let uuid_str = parts[0];
    if uuid_str.len() != 32 {
        return None;
    }

    // Insert dashes to make it a valid UUID string
    let formatted = format!(
        "{}-{}-{}-{}-{}",
        &uuid_str[0..8],
        &uuid_str[8..12],
        &uuid_str[12..16],
        &uuid_str[16..20],
        &uuid_str[20..32]
    );

    uuid::Uuid::parse_str(&formatted).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_stream_key() {
        let room_id = uuid::Uuid::new_v4();
        let stream_key = format!("{}_{}", room_id.to_string().replace("-", ""), "abcd1234");
        
        let parsed = parse_stream_key(&stream_key);
        assert_eq!(parsed, Some(room_id));
    }

    #[test]
    fn test_parse_invalid_stream_key() {
        assert_eq!(parse_stream_key("invalid"), None);
        assert_eq!(parse_stream_key(""), None);
        assert_eq!(parse_stream_key("short_key"), None);
    }
}
