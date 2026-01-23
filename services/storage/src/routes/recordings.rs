//! Recording management endpoints

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{CreateRecordingRequest, Recording, UpdateRecordingStatusRequest};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct ListRecordingsQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct RecordingListResponse {
    pub recordings: Vec<Recording>,
}

/// Create a new recording
pub async fn create_recording(
    State(state): State<AppState>,
    Json(req): Json<CreateRecordingRequest>,
) -> Result<(StatusCode, Json<Recording>), (StatusCode, Json<ErrorResponse>)> {
    match state.db.create_recording(&req).await {
        Ok(recording) => {
            tracing::info!(
                "Created recording {} for room {}",
                recording.id,
                recording.room_id
            );
            Ok((StatusCode::CREATED, Json(recording)))
        }
        Err(e) => {
            tracing::error!("Failed to create recording: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create recording".to_string(),
                }),
            ))
        }
    }
}

/// Get recording by ID
pub async fn get_recording(
    State(state): State<AppState>,
    Path(recording_id): Path<Uuid>,
) -> Result<Json<Recording>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.get_recording(recording_id).await {
        Ok(Some(recording)) => Ok(Json(recording)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Recording not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to get recording: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get recording".to_string(),
                }),
            ))
        }
    }
}

/// List recordings for a room
pub async fn list_recordings(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Query(query): Query<ListRecordingsQuery>,
) -> Result<Json<RecordingListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);

    match state.db.list_recordings(room_id, limit, offset).await {
        Ok(recordings) => Ok(Json(RecordingListResponse { recordings })),
        Err(e) => {
            tracing::error!("Failed to list recordings: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to list recordings".to_string(),
                }),
            ))
        }
    }
}

/// Update recording status
pub async fn update_status(
    State(state): State<AppState>,
    Path(recording_id): Path<Uuid>,
    Json(req): Json<UpdateRecordingStatusRequest>,
) -> Result<Json<Recording>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.update_recording_status(recording_id, &req).await {
        Ok(Some(recording)) => {
            tracing::info!(
                "Updated recording {} status to {}",
                recording_id,
                req.status
            );
            Ok(Json(recording))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Recording not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to update recording status: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update recording status".to_string(),
                }),
            ))
        }
    }
}

/// Delete recording
pub async fn delete_recording(
    State(state): State<AppState>,
    Path(recording_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // Get recording first to get S3 key
    let recording = match state.db.get_recording(recording_id).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Recording not found".to_string(),
                }),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to get recording: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get recording".to_string(),
                }),
            ));
        }
    };

    // Delete from S3
    if let Err(e) = state
        .s3_client
        .delete_object()
        .bucket(&state.config.s3_bucket)
        .key(&recording.s3_key)
        .send()
        .await
    {
        tracing::warn!("Failed to delete S3 object {}: {}", recording.s3_key, e);
        // Continue anyway - we'll delete the DB record
    }

    // Delete from database
    match state.db.delete_recording(recording_id).await {
        Ok(Some(_)) => {
            tracing::info!("Deleted recording {}", recording_id);
            Ok(StatusCode::NO_CONTENT)
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Recording not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to delete recording: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to delete recording".to_string(),
                }),
            ))
        }
    }
}
