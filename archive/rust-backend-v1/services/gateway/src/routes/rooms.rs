//! Room routes - proxy to core service

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
pub struct CreateRoomRequest {
    pub name: String,
    pub mode: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct CreateRoomResponse {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub join_code: String,
    pub stream_key: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateRoomRequest {
    pub name: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct JoinRoomRequest {
    pub join_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct JoinRoomResponse {
    pub ws_url: String,
    pub token: String,
    pub ice_servers: Vec<IceServer>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct IceServer {
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub credential: Option<String>,
}

/// POST /api/v1/rooms - Create a new room
pub async fn create_room(
    State(state): State<AppState>,
    Json(body): Json<CreateRoomRequest>,
) -> impl IntoResponse {
    debug!("Creating room: {}", body.name);

    let url = format!("{}/api/v1/rooms", state.config.core_service_url);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to create room: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/rooms - List rooms
pub async fn list_rooms(State(state): State<AppState>) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms", state.config.core_service_url);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to list rooms: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/rooms/:id - Get room by ID
pub async fn get_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}", state.config.core_service_url, id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to get room: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// PATCH /api/v1/rooms/:id - Update room
pub async fn update_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateRoomRequest>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}", state.config.core_service_url, id);
    match proxy::proxy_json(&state.http_client, &url, "PATCH", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to update room: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// DELETE /api/v1/rooms/:id - Delete room
pub async fn delete_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}", state.config.core_service_url, id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "DELETE", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to delete room: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/rooms/:id/join - Join a room
pub async fn join_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<JoinRoomRequest>,
) -> impl IntoResponse {
    debug!("Joining room: {}", id);

    let url = format!("{}/api/v1/rooms/{}/join", state.config.core_service_url, id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to join room: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}
