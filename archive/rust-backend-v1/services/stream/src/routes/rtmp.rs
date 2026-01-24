//! RTMP callback endpoints (from nginx-rtmp or similar)

use axum::{
    extract::State,
    http::StatusCode,
    Form,
};
use serde::Deserialize;

use crate::AppState;

/// nginx-rtmp callback format
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct RtmpCallback {
    /// Application name (e.g., "live")
    pub app: Option<String>,
    /// Stream key
    pub name: String,
    /// Client IP
    pub addr: Option<String>,
    /// Connection ID
    pub clientid: Option<String>,
}

/// Called when a stream starts publishing (RTMP)
/// nginx-rtmp config: on_publish http://localhost:8083/rtmp/on_publish;
pub async fn on_publish(
    State(state): State<AppState>,
    Form(callback): Form<RtmpCallback>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!(
        "RTMP on_publish: app={:?}, name={}, addr={:?}",
        callback.app,
        callback.name,
        callback.addr
    );

    match state.handle_rtmp_publish(&callback.name).await {
        Ok(room_id) => {
            tracing::info!("RTMP publish accepted for room {}", room_id);
            Ok(StatusCode::OK) // Return 200 to accept the stream
        }
        Err(e) => {
            tracing::warn!("RTMP publish rejected: {}", e);
            // Return non-2xx to reject the stream
            Err((StatusCode::FORBIDDEN, e.to_string()))
        }
    }
}

/// Called when a stream stops publishing (RTMP)
/// nginx-rtmp config: on_publish_done http://localhost:8083/rtmp/on_publish_done;
pub async fn on_publish_done(
    State(state): State<AppState>,
    Form(callback): Form<RtmpCallback>,
) -> StatusCode {
    tracing::info!(
        "RTMP on_publish_done: app={:?}, name={}",
        callback.app,
        callback.name
    );

    match state.handle_rtmp_publish_done(&callback.name).await {
        Ok(room_id) => {
            tracing::info!("RTMP publish done handled for room {}", room_id);
        }
        Err(e) => {
            tracing::warn!("Error handling RTMP publish done: {}", e);
        }
    }

    // Always return OK - stream has already ended
    StatusCode::OK
}
