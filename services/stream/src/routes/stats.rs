//! Streaming statistics endpoint

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub room_id: Uuid,
    pub state: String,
    pub bitrate_kbps: u32,
    pub fps: f32,
    pub resolution: String,
    pub duration_seconds: u64,
    pub bytes_sent: u64,
    pub frames_dropped: u64,
    pub encoding_speed: f32,
    pub destinations: Vec<DestinationStats>,
}

#[derive(Debug, Serialize)]
pub struct DestinationStats {
    pub destination_id: Uuid,
    pub platform: String,
    pub state: String,
    pub bitrate_kbps: u32,
}

/// Get streaming statistics
pub async fn get_stats(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<StatsResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Get session and update stats from FFmpeg if available
    let mut session = state.sessions.get_mut(&room_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Session not found".to_string(),
            }),
        )
    })?;

    // Update stats from FFmpeg process if we have one running
    if let Some(pid) = session.ingest_process_id {
        if let Some(ffmpeg_stats) = state.ffmpeg_manager.get_stats(pid).await {
            session.update_stats_from_ffmpeg(&ffmpeg_stats);
        }
    }

    // Calculate duration if streaming
    let duration_seconds = session
        .started_at
        .map(|s| (chrono::Utc::now() - s).num_seconds() as u64)
        .unwrap_or(0);

    // Get destination stats, updating from FFmpeg if available
    let mut destinations: Vec<DestinationStats> = Vec::new();
    for dest in session.destinations.values() {
        let bitrate = if let Some(pid) = dest.process_id {
            if let Some(ffmpeg_stats) = state.ffmpeg_manager.get_stats(pid).await {
                // Parse bitrate from string
                ffmpeg_stats.bitrate
                    .strip_suffix("kbps")
                    .and_then(|s| s.parse::<f32>().ok())
                    .map(|b| b as u32)
                    .unwrap_or(session.stats.bitrate_kbps)
            } else {
                session.stats.bitrate_kbps
            }
        } else {
            session.stats.bitrate_kbps
        };

        destinations.push(DestinationStats {
            destination_id: dest.destination_id,
            platform: dest.platform.clone(),
            state: format!("{:?}", dest.state).to_lowercase(),
            bitrate_kbps: bitrate,
        });
    }

    Ok(Json(StatsResponse {
        room_id: session.room_id,
        state: format!("{:?}", session.state).to_lowercase(),
        bitrate_kbps: session.stats.bitrate_kbps,
        fps: session.stats.fps,
        resolution: session.stats.resolution.clone(),
        duration_seconds,
        bytes_sent: session.stats.bytes_sent,
        frames_dropped: session.stats.frames_dropped,
        encoding_speed: session.stats.encoding_speed,
        destinations,
    }))
}
