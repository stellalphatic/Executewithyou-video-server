//! Asset management endpoints

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{Asset, CreateAssetRequest};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct ListAssetsQuery {
    pub asset_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AssetListResponse {
    pub assets: Vec<Asset>,
}

/// Create a new asset record
pub async fn create_asset(
    State(state): State<AppState>,
    Json(req): Json<CreateAssetRequest>,
) -> Result<(StatusCode, Json<Asset>), (StatusCode, Json<ErrorResponse>)> {
    match state.db.create_asset(&req).await {
        Ok(asset) => {
            tracing::info!(
                "Created asset {} ({}) for room {}",
                asset.id,
                asset.asset_type,
                asset.room_id
            );
            Ok((StatusCode::CREATED, Json(asset)))
        }
        Err(e) => {
            tracing::error!("Failed to create asset: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create asset".to_string(),
                }),
            ))
        }
    }
}

/// Get asset by ID
pub async fn get_asset(
    State(state): State<AppState>,
    Path(asset_id): Path<Uuid>,
) -> Result<Json<Asset>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.get_asset(asset_id).await {
        Ok(Some(asset)) => Ok(Json(asset)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Asset not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to get asset: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get asset".to_string(),
                }),
            ))
        }
    }
}

/// List assets for a room
pub async fn list_assets(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Query(query): Query<ListAssetsQuery>,
) -> Result<Json<AssetListResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state
        .db
        .list_assets(room_id, query.asset_type.as_deref())
        .await
    {
        Ok(assets) => Ok(Json(AssetListResponse { assets })),
        Err(e) => {
            tracing::error!("Failed to list assets: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to list assets".to_string(),
                }),
            ))
        }
    }
}

/// Delete asset
pub async fn delete_asset(
    State(state): State<AppState>,
    Path(asset_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // Get asset first to get S3 key
    let asset = match state.db.get_asset(asset_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Asset not found".to_string(),
                }),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to get asset: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get asset".to_string(),
                }),
            ));
        }
    };

    // Delete from S3
    if let Err(e) = state
        .s3_client
        .delete_object()
        .bucket(&state.config.s3_bucket)
        .key(&asset.s3_key)
        .send()
        .await
    {
        tracing::warn!("Failed to delete S3 object {}: {}", asset.s3_key, e);
        // Continue anyway - we'll delete the DB record
    }

    // Delete from database
    match state.db.delete_asset(asset_id).await {
        Ok(Some(_)) => {
            tracing::info!("Deleted asset {}", asset_id);
            Ok(StatusCode::NO_CONTENT)
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Asset not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to delete asset: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to delete asset".to_string(),
                }),
            ))
        }
    }
}
