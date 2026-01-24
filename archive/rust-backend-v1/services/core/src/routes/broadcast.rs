//! Broadcast control endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct StartBroadcastRequest {
    pub _host_id: Uuid, // Reserved for auth/verification
    pub track_id: String, // The track ID of the host's program feed
}

#[derive(Debug, Serialize)]
pub struct StartBroadcastResponse {
    pub success: bool,
    pub message: String,
    pub stream_port: u16,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
struct StreamIngestResponse {
    port: u16,
}

#[derive(Debug, Serialize)]
struct SfuEgressRequest {
    track_id: String,
    dest_addr: String,
}

pub async fn start_broadcast(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(body): Json<StartBroadcastRequest>,
) -> Result<Json<StartBroadcastResponse>, (StatusCode, Json<ErrorResponse>)> {
    // 1. (Optional) Verify room ownership or host permission here
    // For now assuming the caller is authorized or Gateway handles auth.

    tracing::info!(%room_id, track_id = %body.track_id, "Starting broadcast orchestration");

    // 2. Call Stream Service to prepare RTP ingest
    let client = reqwest::Client::new();
    let stream_url = format!("{}/api/sessions/{}/ingest/rtp", state.config.stream_service_url, room_id);

    tracing::debug!("Calling Stream service at {}", stream_url);
    let ingest_res = client.post(&stream_url)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Failed to contact Stream service: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "Failed to contact Stream service".to_string() }))
        })?;

    if !ingest_res.status().is_success() {
        tracing::error!("Stream service returned error: {}", ingest_res.status());
        return Err((StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: "Stream service validation failed".to_string() })));
    }

    let ingest_data: StreamIngestResponse = ingest_res.json().await.map_err(|e| {
        tracing::error!("Failed to parse Stream service response: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "Invalid response from Stream service".to_string() }))
    })?;

    let stream_port = ingest_data.port;
    tracing::info!("Stream service allocated port {}", stream_port);

    // 3. Call SFU Service to start forwarding
    // Extract hostname from stream_service_url or default to "stream" (docker-compose service name)
    let stream_host = state.config.stream_service_url
        .split("://")
        .nth(1)
        .and_then(|s| s.split(':').next())
        .unwrap_or("stream");

    let dest_addr = format!("{}:{}", stream_host, stream_port);
    tracing::info!("Instructing SFU to forward track {} to {}", body.track_id, dest_addr);

    let sfu_url = format!("{}/api/v1/egress/start", state.config.sfu_service_url);
    let sfu_req = SfuEgressRequest {
        track_id: body.track_id.clone(),
        dest_addr,
    };

    let sfu_res = client.post(&sfu_url)
        .json(&sfu_req)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Failed to contact SFU service: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: "Failed to contact SFU service".to_string() }))
        })?;

     if !sfu_res.status().is_success() {
        let status = sfu_res.status();
        let text = sfu_res.text().await.unwrap_or_default();
        tracing::error!("SFU service returned error {}: {}", status, text);
        return Err((StatusCode::BAD_GATEWAY, Json(ErrorResponse { error: format!("SFU service rejection: {}", text) })));
    }

    Ok(Json(StartBroadcastResponse {
        success: true,
        message: "Broadcast started successfully".to_string(),
        stream_port,
    }))
}
