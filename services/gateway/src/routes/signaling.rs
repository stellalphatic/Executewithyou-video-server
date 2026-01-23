//! Signaling proxy routes - proxy to SFU service

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{debug, error};

use crate::{proxy, AppState};

/// POST /api/v1/sfu/rooms/:room_id/join - Join a room
pub async fn join_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    debug!("Proxying join request for room: {}", room_id);
    let url = format!("{}/api/v1/rooms/{}/join", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy join: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/offer - Handle offer
pub async fn handle_offer(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/offer", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy offer: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/answer - Handle answer
pub async fn handle_answer(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/answer", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy answer: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/ice - Handle ICE
pub async fn handle_ice(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/ice", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy ICE: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/leave - Leave room
pub async fn leave_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/leave", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy leave: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// GET /api/v1/sfu/rooms/:room_id/participants - Get participants
pub async fn get_participants(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/participants", state.config.sfu_service_url, room_id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy participants: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// GET /api/v1/sfu/rooms/:room_id/waiting-participants - Get waiting participants
pub async fn get_waiting_participants(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/waiting-participants", state.config.sfu_service_url, room_id);
    match proxy::proxy_json::<()>(&state.http_client, &url, "GET", None).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy waiting participants: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/subscribe - Subscribe
pub async fn subscribe(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/subscribe", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy subscribe: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/unsubscribe - Unsubscribe
pub async fn unsubscribe(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/unsubscribe", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy unsubscribe: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/sfu/rooms/:room_id/admit - Admit participant
pub async fn admit_participant(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/v1/rooms/{}/admit", state.config.sfu_service_url, room_id);
    match proxy::proxy_json(&state.http_client, &url, "POST", Some(&body)).await {
        Ok(response) => response,
        Err(e) => {
            error!("Failed to proxy admit: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response()
        }
    }
}
