//! Layout management endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::session::{LayoutConfig, LayoutPreset, ParticipantPosition};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct SetLayoutRequest {
    pub preset: String,
    pub featured_participant_id: Option<Uuid>,
    pub positions: Option<std::collections::HashMap<Uuid, PositionRequest>>,
    pub background: Option<String>,
    pub show_names: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PositionRequest {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub z_index: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct LayoutResponse {
    pub preset: String,
    pub featured_participant_id: Option<Uuid>,
    pub show_names: bool,
    pub background: Option<String>,
}

/// Set the layout for a streaming session
pub async fn set_layout(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<SetLayoutRequest>,
) -> Result<Json<LayoutResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut session = state.sessions.get_mut(&room_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Session not found".to_string(),
            }),
        )
    })?;

    // Parse preset
    let preset = match req.preset.to_lowercase().as_str() {
        "single" => LayoutPreset::Single,
        "side_by_side" | "sidebyside" => LayoutPreset::SideBySide,
        "grid_2x2" | "grid2x2" => LayoutPreset::Grid2x2,
        "grid_3x3" | "grid3x3" => LayoutPreset::Grid3x3,
        "picture_in_picture" | "pip" => LayoutPreset::PictureInPicture,
        "spotlight" => LayoutPreset::Spotlight,
        "custom" => LayoutPreset::Custom,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Invalid layout preset: {}", req.preset),
                }),
            ))
        }
    };

    // Build positions map
    let positions = req
        .positions
        .map(|p| {
            p.into_iter()
                .map(|(id, pos)| {
                    (
                        id,
                        ParticipantPosition {
                            x: pos.x,
                            y: pos.y,
                            width: pos.width,
                            height: pos.height,
                            z_index: pos.z_index.unwrap_or(0),
                        },
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    // Update session layout
    session.layout = LayoutConfig {
        preset: preset.clone(),
        featured_participant_id: req.featured_participant_id,
        positions,
        background: req.background.clone(),
        show_names: req.show_names.unwrap_or(true),
    };

    tracing::info!("Updated layout for room {} to {:?}", room_id, preset);

    // In production, you'd trigger FFmpeg filter reconfiguration here
    // For now, return the new layout

    Ok(Json(LayoutResponse {
        preset: format!("{:?}", session.layout.preset).to_lowercase(),
        featured_participant_id: session.layout.featured_participant_id,
        show_names: session.layout.show_names,
        background: session.layout.background.clone(),
    }))
}

/// Get current layout for a streaming session
pub async fn get_layout(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<LayoutResponse>, (StatusCode, Json<ErrorResponse>)> {
    let session = state.sessions.get(&room_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Session not found".to_string(),
            }),
        )
    })?;

    Ok(Json(LayoutResponse {
        preset: format!("{:?}", session.layout.preset).to_lowercase(),
        featured_participant_id: session.layout.featured_participant_id,
        show_names: session.layout.show_names,
        background: session.layout.background.clone(),
    }))
}
