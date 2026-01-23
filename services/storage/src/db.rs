//! Database operations for Storage service

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

/// Database wrapper with query methods
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

// ============================================================================
// Recording Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Recording {
    pub id: Uuid,
    pub room_id: Uuid,
    pub status: String,
    pub s3_key: String,
    pub size_bytes: Option<i64>,
    pub duration_seconds: Option<i32>,
    pub format: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRecordingRequest {
    pub room_id: Uuid,
    pub format: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecordingStatusRequest {
    pub status: String,
    pub size_bytes: Option<i64>,
    pub duration_seconds: Option<i32>,
}

impl Database {
    /// Create a new recording record
    pub async fn create_recording(&self, req: &CreateRecordingRequest) -> Result<Recording> {
        let id = Uuid::new_v4();
        let s3_key = format!("recordings/{}/{}.mp4", req.room_id, id);

        let recording = sqlx::query_as::<_, Recording>(
            r#"
            INSERT INTO assets.recordings (id, room_id, status, s3_key, format, started_at, metadata)
            VALUES ($1, $2, 'pending', $3, $4, NOW(), $5)
            RETURNING id, room_id, status, s3_key, size_bytes, duration_seconds, format, started_at, ended_at, metadata, created_at
            "#,
        )
        .bind(id)
        .bind(req.room_id)
        .bind(&s3_key)
        .bind(req.format.as_deref().unwrap_or("mp4"))
        .bind(req.metadata.clone().unwrap_or(serde_json::json!({})))
        .fetch_one(&self.pool)
        .await?;

        Ok(recording)
    }

    /// Get recording by ID
    pub async fn get_recording(&self, recording_id: Uuid) -> Result<Option<Recording>> {
        let recording = sqlx::query_as::<_, Recording>(
            r#"
            SELECT id, room_id, status, s3_key, size_bytes, duration_seconds, format, started_at, ended_at, metadata, created_at
            FROM assets.recordings
            WHERE id = $1
            "#,
        )
        .bind(recording_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(recording)
    }

    /// List recordings for a room
    pub async fn list_recordings(&self, room_id: Uuid, limit: i32, offset: i32) -> Result<Vec<Recording>> {
        let recordings = sqlx::query_as::<_, Recording>(
            r#"
            SELECT id, room_id, status, s3_key, size_bytes, duration_seconds, format, started_at, ended_at, metadata, created_at
            FROM assets.recordings
            WHERE room_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(room_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok(recordings)
    }

    /// Update recording status
    pub async fn update_recording_status(
        &self,
        recording_id: Uuid,
        req: &UpdateRecordingStatusRequest,
    ) -> Result<Option<Recording>> {
        let ended_at = if req.status == "completed" || req.status == "failed" {
            Some(Utc::now())
        } else {
            None
        };

        let recording = sqlx::query_as::<_, Recording>(
            r#"
            UPDATE assets.recordings
            SET 
                status = $2,
                size_bytes = COALESCE($3, size_bytes),
                duration_seconds = COALESCE($4, duration_seconds),
                ended_at = COALESCE($5, ended_at)
            WHERE id = $1
            RETURNING id, room_id, status, s3_key, size_bytes, duration_seconds, format, started_at, ended_at, metadata, created_at
            "#,
        )
        .bind(recording_id)
        .bind(&req.status)
        .bind(req.size_bytes)
        .bind(req.duration_seconds)
        .bind(ended_at)
        .fetch_optional(&self.pool)
        .await?;

        Ok(recording)
    }

    /// Delete recording record
    pub async fn delete_recording(&self, recording_id: Uuid) -> Result<Option<Recording>> {
        let recording = sqlx::query_as::<_, Recording>(
            r#"
            DELETE FROM assets.recordings
            WHERE id = $1
            RETURNING id, room_id, status, s3_key, size_bytes, duration_seconds, format, started_at, ended_at, metadata, created_at
            "#,
        )
        .bind(recording_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(recording)
    }
}

// ============================================================================
// Asset Models (for images, overlays, backgrounds, etc.)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Asset {
    pub id: Uuid,
    pub room_id: Uuid,
    pub asset_type: String,
    pub name: String,
    pub s3_key: String,
    pub size_bytes: i64,
    pub mime_type: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetRequest {
    pub room_id: Uuid,
    pub asset_type: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub metadata: Option<serde_json::Value>,
}

impl Database {
    /// Create a new asset record
    pub async fn create_asset(&self, req: &CreateAssetRequest) -> Result<Asset> {
        let id = Uuid::new_v4();
        let extension = mime_to_extension(&req.mime_type);
        let s3_key = format!("assets/{}/{}/{}.{}", req.room_id, req.asset_type, id, extension);

        let asset = sqlx::query_as::<_, Asset>(
            r#"
            INSERT INTO assets.uploads (id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata, created_at
            "#,
        )
        .bind(id)
        .bind(req.room_id)
        .bind(&req.asset_type)
        .bind(&req.name)
        .bind(&s3_key)
        .bind(req.size_bytes)
        .bind(&req.mime_type)
        .bind(req.metadata.clone().unwrap_or(serde_json::json!({})))
        .fetch_one(&self.pool)
        .await?;

        Ok(asset)
    }

    /// Get asset by ID
    pub async fn get_asset(&self, asset_id: Uuid) -> Result<Option<Asset>> {
        let asset = sqlx::query_as::<_, Asset>(
            r#"
            SELECT id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata, created_at
            FROM assets.uploads
            WHERE id = $1
            "#,
        )
        .bind(asset_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(asset)
    }

    /// List assets for a room
    pub async fn list_assets(&self, room_id: Uuid, asset_type: Option<&str>) -> Result<Vec<Asset>> {
        let assets = if let Some(at) = asset_type {
            sqlx::query_as::<_, Asset>(
                r#"
                SELECT id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata, created_at
                FROM assets.uploads
                WHERE room_id = $1 AND asset_type = $2
                ORDER BY created_at DESC
                "#,
            )
            .bind(room_id)
            .bind(at)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, Asset>(
                r#"
                SELECT id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata, created_at
                FROM assets.uploads
                WHERE room_id = $1
                ORDER BY created_at DESC
                "#,
            )
            .bind(room_id)
            .fetch_all(&self.pool)
            .await?
        };

        Ok(assets)
    }

    /// Delete asset
    pub async fn delete_asset(&self, asset_id: Uuid) -> Result<Option<Asset>> {
        let asset = sqlx::query_as::<_, Asset>(
            r#"
            DELETE FROM assets.uploads
            WHERE id = $1
            RETURNING id, room_id, asset_type, name, s3_key, size_bytes, mime_type, metadata, created_at
            "#,
        )
        .bind(asset_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(asset)
    }
}

/// Convert MIME type to file extension
fn mime_to_extension(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "audio/mpeg" => "mp3",
        "audio/ogg" => "ogg",
        "audio/wav" => "wav",
        "application/pdf" => "pdf",
        _ => "bin",
    }
}
