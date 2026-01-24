//! Recording routes - proxy to storage service

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use crate::{proxy, AppState};

#[derive(Debug, Deserialize, Serialize)]
pub struct ListRecordingsQuery {
    pub room_id: Option<String>,
    pub recording_type: Option<String>,
}

/// GET /api/v1/recordings - List recordings
pub async fn list_recordings(
    State(state): State<AppState>,
    Query(query): Query<ListRecordingsQuery>,
) -> impl IntoResponse {
    let mut url = format!("{}/api/v1/recordings", state.config.storage_service_url);
    
    let mut params = vec![];
    if let Some(room_id) = &query.room_id {
        params.push(format!("roomId={}", room_id));
    }
    if let Some(recording_type) = &query.recording_type {
        params.push(format!("type={}", recording_type));
    }
    if !params.is_empty() {
        url = format!("{}?{}", url, params.join("&"));
    }

    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to list recordings: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/recordings/:id - Get recording by ID
pub async fn get_recording(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/recordings/{}", state.config.storage_service_url, id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to get recording: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// DELETE /api/v1/recordings/:id - Delete recording
pub async fn delete_recording(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/recordings/{}", state.config.storage_service_url, id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "DELETE", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to delete recording: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}
