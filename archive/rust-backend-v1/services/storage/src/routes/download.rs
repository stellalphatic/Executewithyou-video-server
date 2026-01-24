//! Download presigned URL endpoints

use aws_sdk_s3::presigning::PresigningConfig;
use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct PresignDownloadRequest {
    /// Either provide s3_key directly
    pub s3_key: Option<String>,
    /// Or provide asset_id to look up the key
    pub asset_id: Option<Uuid>,
    /// Or provide recording_id
    pub recording_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct PresignDownloadResponse {
    pub presigned_url: String,
    pub s3_key: String,
    pub expires_in_secs: u64,
}

/// Get a presigned URL for downloading a file
pub async fn get_download_presigned_url(
    State(state): State<AppState>,
    Json(req): Json<PresignDownloadRequest>,
) -> Result<Json<PresignDownloadResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Resolve the S3 key
    let s3_key = if let Some(key) = req.s3_key {
        key
    } else if let Some(asset_id) = req.asset_id {
        // Look up asset
        let asset = state
            .db
            .get_asset(asset_id)
            .await
            .map_err(|e| {
                tracing::error!("Failed to get asset: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to look up asset".to_string(),
                    }),
                )
            })?
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "Asset not found".to_string(),
                    }),
                )
            })?;
        asset.s3_key
    } else if let Some(recording_id) = req.recording_id {
        // Look up recording
        let recording = state
            .db
            .get_recording(recording_id)
            .await
            .map_err(|e| {
                tracing::error!("Failed to get recording: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to look up recording".to_string(),
                    }),
                )
            })?
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "Recording not found".to_string(),
                    }),
                )
            })?;
        recording.s3_key
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Must provide s3_key, asset_id, or recording_id".to_string(),
            }),
        ));
    };

    // Generate presigned URL
    let presigning_config = PresigningConfig::expires_in(Duration::from_secs(
        state.config.presigned_url_expiry_secs,
    ))
    .map_err(|e| {
        tracing::error!("Failed to create presigning config: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to generate presigned URL".to_string(),
            }),
        )
    })?;

    let presigned_req = state
        .s3_client
        .get_object()
        .bucket(&state.config.s3_bucket)
        .key(&s3_key)
        .presigned(presigning_config)
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to generate presigned URL".to_string(),
                }),
            )
        })?;

    tracing::info!("Generated download presigned URL for key: {}", s3_key);

    Ok(Json(PresignDownloadResponse {
        presigned_url: presigned_req.uri().to_string(),
        s3_key,
        expires_in_secs: state.config.presigned_url_expiry_secs,
    }))
}
