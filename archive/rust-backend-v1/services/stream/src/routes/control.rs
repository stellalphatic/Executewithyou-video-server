//! Stream control endpoints (start/stop)

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// Start streaming for a session (typically triggered by RTMP publish)
pub async fn start_stream(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.start_streaming(room_id).await.map_err(|e| {
        tracing::error!("Failed to start stream: {}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Stream started for room {}", room_id),
    }))
}

/// Stop streaming for a session
pub async fn stop_stream(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state.stop_streaming(room_id).await.map_err(|e| {
        tracing::error!("Failed to stop stream: {}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Stream stopped for room {}", room_id),
    }))
}

#[derive(Debug, Serialize)]
pub struct RtpIngestResponse {
    pub port: u16,
}

/// Start RTP ingest for a session
pub async fn start_rtp_ingest(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<RtpIngestResponse>, (StatusCode, Json<ErrorResponse>)> {
    let port = state.start_rtp_ingest(room_id).await.map_err(|e| {
        tracing::error!("Failed to start RTP ingest: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
    })?;

    Ok(Json(RtpIngestResponse { port }))
}

#[derive(Debug, Deserialize)]
pub struct StartDestinationRequest {
    pub rtmp_url: String,
    pub stream_key: String,
    pub platform: String,
}

/// Start streaming to a specific destination
pub async fn start_destination(
    State(state): State<AppState>,
    Path((room_id, destination_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<StartDestinationRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify session exists and is live
    {
        let session = state.sessions.get(&room_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Session not found".to_string(),
                }),
            )
        })?;

        if !session.is_live() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Stream must be live to start destination relay".to_string(),
                }),
            ));
        }
    }

    state
        .start_destination_relay(
            room_id,
            destination_id,
            &req.rtmp_url,
            &req.stream_key,
            &req.platform,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to start destination relay: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!(
            "Started relay to {} for room {}",
            req.platform, room_id
        ),
    }))
}

/// Stop streaming to a specific destination
pub async fn stop_destination(
    State(state): State<AppState>,
    Path((room_id, destination_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .stop_destination_relay(room_id, destination_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to stop destination relay: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
        })?;

    Ok(Json(SuccessResponse {
        success: true,
        message: format!("Stopped relay for destination {}", destination_id),
    }))
}
