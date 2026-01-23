//! HLS output endpoints

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::Response,
};
use serde::Serialize;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct ErrorResponse {
    pub error: String,
}

/// Get HLS playlist for a room
pub async fn get_playlist(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Response<Body>, (StatusCode, String)> {
    // Verify session exists
    if !state.sessions.contains_key(&room_id) {
        return Err((StatusCode::NOT_FOUND, "Session not found".to_string()));
    }

    let playlist_path = state
        .config
        .hls_output_dir
        .join(room_id.to_string())
        .join("playlist.m3u8");

    if !playlist_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            "Playlist not yet available".to_string(),
        ));
    }

    let file = File::open(&playlist_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(body)
        .unwrap())
}

/// Get HLS segment
pub async fn get_segment(
    State(state): State<AppState>,
    Path((room_id, segment)): Path<(Uuid, String)>,
) -> Result<Response<Body>, (StatusCode, String)> {
    // Basic security: only allow .ts files
    if !segment.ends_with(".ts") {
        return Err((StatusCode::BAD_REQUEST, "Invalid segment format".to_string()));
    }

    // Prevent path traversal
    if segment.contains("..") || segment.contains('/') {
        return Err((StatusCode::BAD_REQUEST, "Invalid segment name".to_string()));
    }

    let segment_path = state
        .config
        .hls_output_dir
        .join(room_id.to_string())
        .join(&segment);

    if !segment_path.exists() {
        return Err((StatusCode::NOT_FOUND, "Segment not found".to_string()));
    }

    let file = File::open(&segment_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/MP2T")
        .header(header::CACHE_CONTROL, "max-age=3600")
        .body(body)
        .unwrap())
}
