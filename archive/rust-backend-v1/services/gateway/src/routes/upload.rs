//! Upload routes - proxy to storage service

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, error};

use crate::{proxy, AppState};

#[derive(Debug, Deserialize, Serialize)]
pub struct SignUploadRequest {
    pub room_id: String,
    pub recording_type: String,  // "program" | "iso"
    pub participant_id: Option<String>,
    pub chunk_index: u32,
    pub content_type: String,
    pub content_length: u64,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct SignUploadResponse {
    pub upload_url: String,
    pub expires_at: i64,
    pub recording_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CompleteUploadRequest {
    pub recording_id: String,
    pub chunks: Vec<ChunkInfo>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChunkInfo {
    pub index: u32,
    pub etag: String,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct CompleteUploadResponse {
    pub recording_id: String,
    pub playback_url: String,
    pub duration: f64,
}

/// POST /api/v1/upload/sign - Get presigned upload URL
pub async fn sign_upload(
    State(state): State<AppState>,
    Json(body): Json<SignUploadRequest>,
) -> impl IntoResponse {
    debug!(
        "Signing upload for room {} chunk {}",
        body.room_id, body.chunk_index
    );

    let url = format!("{}/api/v1/upload/sign", state.config.storage_service_url);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to sign upload: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/upload/complete - Complete multipart upload
pub async fn complete_upload(
    State(state): State<AppState>,
    Json(body): Json<CompleteUploadRequest>,
) -> impl IntoResponse {
    debug!(
        "Completing upload for recording {} with {} chunks",
        body.recording_id,
        body.chunks.len()
    );

    let url = format!("{}/api/v1/upload/complete", state.config.storage_service_url);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to complete upload: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}
