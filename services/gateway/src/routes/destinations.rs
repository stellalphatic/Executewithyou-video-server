//! Destination routes - proxy to core service

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, error};

use crate::{proxy, AppState};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDestinationRequest {
    pub platform: String,
    pub name: String,
    pub rtmp_url: String,
    pub stream_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDestinationRequest {
    pub name: Option<String>,
    pub rtmp_url: Option<String>,
    pub stream_key: Option<String>,
    pub is_enabled: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct TestDestinationResponse {
    pub success: bool,
    pub latency_ms: Option<u32>,
    pub error: Option<String>,
}

/// GET /api/v1/destinations - List destinations
pub async fn list_destinations(State(state): State<AppState>) -> impl IntoResponse {
    let url = format!("{}/api/v1/destinations", state.config.core_service_url);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to list destinations: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/destinations - Create destination
pub async fn create_destination(
    State(state): State<AppState>,
    Json(body): Json<CreateDestinationRequest>,
) -> impl IntoResponse {
    debug!("Creating destination: {} ({})", body.name, body.platform);

    let url = format!("{}/api/v1/destinations", state.config.core_service_url);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to create destination: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// PATCH /api/v1/destinations/:id - Update destination
pub async fn update_destination(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDestinationRequest>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/destinations/{}", state.config.core_service_url, id);
    match proxy::proxy_json(&state.http_client, &url, "PATCH", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to update destination: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// DELETE /api/v1/destinations/:id - Delete destination
pub async fn delete_destination(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/destinations/{}", state.config.core_service_url, id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "DELETE", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to delete destination: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/destinations/:id/test - Test destination connection
pub async fn test_destination(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    debug!("Testing destination: {}", id);

    let url = format!(
        "{}/api/v1/destinations/{}/test",
        state.config.core_service_url, id
    );
    match proxy::proxy_json::<()>(&state.http_client, &url, "POST", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to test destination: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}
