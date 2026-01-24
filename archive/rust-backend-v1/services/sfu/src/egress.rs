//! Egress control handlers
//!
//! Handles requests to start/stop RTP forwarding.

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tracing::{info, warn};

use crate::{
    rtp_forwarder::RtpForwarder,
    track_router::{TrackId, TrackKind},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct StartEgressRequest {
    pub room_id: String,
    pub participant_id: String,
    pub track_id: String,
    pub track_kind: String,
    pub destination: String, // "ip:port"
}

#[derive(Debug, Serialize)]
pub struct EgressResponse {
    pub success: bool,
    pub error: Option<String>,
}

pub async fn start_egress(
    State(state): State<AppState>,
    Json(body): Json<StartEgressRequest>,
) -> impl IntoResponse {
    info!(
        room_id = %body.room_id,
        participant_id = %body.participant_id,
        destination = %body.destination,
        "Start egress request"
    );

    // Parse track kind
    let kind = match body.track_kind.as_str() {
        "audio" => TrackKind::Audio,
        "video" => TrackKind::Video,
        "screen" => TrackKind::Screen,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(EgressResponse {
                    success: false,
                    error: Some("Invalid track kind".to_string()),
                }),
            )
                .into_response();
        }
    };

    let track_id = TrackId::new(&body.room_id, &body.participant_id, kind, &body.track_id);
    
    // Parse destination
    let destination: SocketAddr = match body.destination.parse() {
        Ok(addr) => addr,
        Err(e) => {
             return (
                StatusCode::BAD_REQUEST,
                Json(EgressResponse {
                    success: false,
                    error: Some(format!("Invalid destination address: {}", e)),
                }),
            )
                .into_response();
        }
    };

    // Start forwarding
    match state.rtp_forwarder.start_forwarding(track_id, destination).await {
        Ok(_) => (
            StatusCode::OK,
            Json(EgressResponse {
                success: true,
                error: None,
            }),
        )
            .into_response(),
        Err(e) => {
            warn!("Failed to start egress: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(EgressResponse {
                    success: false,
                    error: Some(format!("Failed to start egress: {}", e)),
                }),
            )
                .into_response()
        }
    }
}
