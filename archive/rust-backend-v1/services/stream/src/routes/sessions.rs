//! Session management endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::session::StreamSession;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub room_id: Uuid,
    pub hls_enabled: Option<bool>,
    pub recording_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateSessionResponse {
    pub room_id: Uuid,
    pub stream_key: String,
    pub rtmp_url: String,
    pub hls_enabled: bool,
    pub recording_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub room_id: Uuid,
    pub state: String,
    pub stream_key: String,
    pub hls_enabled: bool,
    pub recording_enabled: bool,
    pub destinations: Vec<DestinationInfo>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct DestinationInfo {
    pub destination_id: Uuid,
    pub platform: String,
    pub state: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Create a new streaming session
pub async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<CreateSessionResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Check if session already exists
    if state.sessions.contains_key(&req.room_id) {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "Session already exists for this room".to_string(),
            }),
        ));
    }

    // Create new session
    let mut session = StreamSession::new(req.room_id);
    session.hls_enabled = req.hls_enabled.unwrap_or(true);
    session.recording_enabled = req.recording_enabled.unwrap_or(false);

    let response = CreateSessionResponse {
        room_id: session.room_id,
        stream_key: session.stream_key.clone(),
        rtmp_url: format!("rtmp://{}:{}/live", "localhost", state.config.rtmp_port),
        hls_enabled: session.hls_enabled,
        recording_enabled: session.recording_enabled,
    };

    state.sessions.insert(req.room_id, session);

    tracing::info!("Created streaming session for room {}", req.room_id);

    Ok((StatusCode::CREATED, Json(response)))
}

/// Get session information
pub async fn get_session(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<SessionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let session = state.sessions.get(&room_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Session not found".to_string(),
            }),
        )
    })?;

    let destinations: Vec<DestinationInfo> = session
        .destinations
        .values()
        .map(|d| DestinationInfo {
            destination_id: d.destination_id,
            platform: d.platform.clone(),
            state: format!("{:?}", d.state).to_lowercase(),
            started_at: d.started_at,
        })
        .collect();

    Ok(Json(SessionResponse {
        room_id: session.room_id,
        state: format!("{:?}", session.state).to_lowercase(),
        stream_key: session.stream_key.clone(),
        hls_enabled: session.hls_enabled,
        recording_enabled: session.recording_enabled,
        destinations,
        started_at: session.started_at,
        created_at: session.created_at,
    }))
}

/// Delete a session
pub async fn delete_session(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // Stop streaming if active
    if let Some(session) = state.sessions.get(&room_id) {
        if session.is_live() {
            drop(session); // Release lock
            if let Err(e) = state.stop_streaming(room_id).await {
                tracing::warn!("Failed to stop streaming during session delete: {}", e);
            }
        }
    }

    // Remove session
    if state.sessions.remove(&room_id).is_some() {
        tracing::info!("Deleted streaming session for room {}", room_id);
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Session not found".to_string(),
            }),
        ))
    }
}
