//! Upload presigned URL endpoints

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
pub struct PresignUploadRequest {
    pub room_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub asset_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PresignUploadResponse {
    pub upload_id: Uuid,
    pub presigned_url: String,
    pub s3_key: String,
    pub expires_in_secs: u64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct CompleteUploadRequest {
    pub upload_id: Uuid,
    pub s3_key: String,
}

#[derive(Debug, Serialize)]
pub struct CompleteUploadResponse {
    pub success: bool,
    pub asset_id: Uuid,
}

/// Get a presigned URL for uploading a file
pub async fn get_upload_presigned_url(
    State(state): State<AppState>,
    Json(req): Json<PresignUploadRequest>,
) -> Result<Json<PresignUploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate file size
    let max_size = state.config.max_upload_size_mb * 1024 * 1024;
    if req.size_bytes as u64 > max_size {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!(
                    "File too large. Maximum size is {} MB",
                    state.config.max_upload_size_mb
                ),
            }),
        ));
    }

    // Generate upload ID and S3 key
    let upload_id = Uuid::new_v4();
    let asset_type = req.asset_type.as_deref().unwrap_or("upload");
    let extension = get_extension(&req.filename);
    let s3_key = format!(
        "uploads/{}/{}/{}.{}",
        req.room_id, asset_type, upload_id, extension
    );

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
        .put_object()
        .bucket(&state.config.s3_bucket)
        .key(&s3_key)
        .content_type(&req.content_type)
        .content_length(req.size_bytes)
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

    tracing::info!(
        "Generated upload presigned URL for room {} (key: {})",
        req.room_id,
        s3_key
    );

    Ok(Json(PresignUploadResponse {
        upload_id,
        presigned_url: presigned_req.uri().to_string(),
        s3_key,
        expires_in_secs: state.config.presigned_url_expiry_secs,
    }))
}

/// Complete an upload (create asset record)
pub async fn complete_upload(
    State(state): State<AppState>,
    Json(req): Json<CompleteUploadRequest>,
) -> Result<Json<CompleteUploadResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify the object exists in S3
    let head_result = state
        .s3_client
        .head_object()
        .bucket(&state.config.s3_bucket)
        .key(&req.s3_key)
        .send()
        .await;

    match head_result {
        Ok(head) => {
            // Object exists, create asset record
            let size_bytes = head.content_length().unwrap_or(0);
            let content_type = head
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            // Parse room_id from s3_key (uploads/{room_id}/{type}/{id}.ext)
            let parts: Vec<&str> = req.s3_key.split('/').collect();
            let room_id = if parts.len() >= 2 {
                Uuid::parse_str(parts[1]).unwrap_or(Uuid::nil())
            } else {
                Uuid::nil()
            };

            // Create asset record
            let asset = state
                .db
                .create_asset(&crate::db::CreateAssetRequest {
                    room_id,
                    asset_type: parts.get(2).unwrap_or(&"upload").to_string(),
                    name: parts.last().unwrap_or(&"unknown").to_string(),
                    mime_type: content_type,
                    size_bytes,
                    metadata: None,
                })
                .await
                .map_err(|e| {
                    tracing::error!("Failed to create asset record: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ErrorResponse {
                            error: "Failed to create asset record".to_string(),
                        }),
                    )
                })?;

            tracing::info!("Upload completed: {} (asset: {})", req.s3_key, asset.id);

            Ok(Json(CompleteUploadResponse {
                success: true,
                asset_id: asset.id,
            }))
        }
        Err(e) => {
            tracing::warn!("Upload verification failed for {}: {}", req.s3_key, e);
            Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Upload not found or not completed".to_string(),
                }),
            ))
        }
    }
}

/// Get file extension from filename
fn get_extension(filename: &str) -> &str {
    filename
        .rsplit('.')
        .next()
        .filter(|ext| ext.len() <= 10)
        .unwrap_or("bin")
}
