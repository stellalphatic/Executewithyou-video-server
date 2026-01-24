//! Database operations for Core service

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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub mode: String, // 'meeting' or 'studio'
    pub status: String,
    pub settings: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub owner_id: Uuid,
    pub name: String,
    pub mode: String,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoomRequest {
    pub name: Option<String>,
    pub mode: Option<String>,
    pub status: Option<String>,
    pub settings: Option<serde_json::Value>,
}

impl Database {
    /// Create a new room
    pub async fn create_room(&self, req: &CreateRoomRequest) -> Result<Room> {
        let room = sqlx::query_as::<_, Room>(
            r#"
            INSERT INTO core.rooms (id, owner_id, name, mode, status, settings)
            VALUES ($1, $2, $3, $4, 'idle', $5)
            RETURNING id, owner_id, name, mode, status, settings, created_at, updated_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(req.owner_id)
        .bind(&req.name)
        .bind(&req.mode)
        .bind(req.settings.clone().unwrap_or(serde_json::json!({})))
        .fetch_one(&self.pool)
        .await?;

        Ok(room)
    }

    /// Get room by ID
    pub async fn get_room(&self, room_id: Uuid) -> Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            r#"
            SELECT id, owner_id, name, mode, status, settings, created_at, updated_at
            FROM core.rooms
            WHERE id = $1
            "#,
        )
        .bind(room_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(room)
    }

    /// List rooms for a user
    pub async fn list_rooms(&self, owner_id: Uuid, limit: i32, offset: i32) -> Result<Vec<Room>> {
        let rooms = sqlx::query_as::<_, Room>(
            r#"
            SELECT id, owner_id, name, mode, status, settings, created_at, updated_at
            FROM core.rooms
            WHERE owner_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(owner_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok(rooms)
    }

    /// Update room
    pub async fn update_room(&self, room_id: Uuid, req: &UpdateRoomRequest) -> Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            r#"
            UPDATE core.rooms
            SET 
                name = COALESCE($2, name),
                mode = COALESCE($3, mode),
                status = COALESCE($4, status),
                settings = COALESCE($5, settings),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, owner_id, name, mode, status, settings, created_at, updated_at
            "#,
        )
        .bind(room_id)
        .bind(&req.name)
        .bind(&req.mode)
        .bind(&req.status)
        .bind(&req.settings)
        .fetch_optional(&self.pool)
        .await?;

        Ok(room)
    }

    /// Delete room
    pub async fn delete_room(&self, room_id: Uuid) -> Result<bool> {
        let result = sqlx::query("DELETE FROM core.rooms WHERE id = $1")
            .bind(room_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

// Participant Models
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Participant {
    pub id: Uuid,
    pub room_id: Uuid,
    pub user_id: Option<Uuid>,
    pub display_name: String,
    pub role: String,
    pub status: String,
    pub tracks: serde_json::Value,
    pub joined_at: DateTime<Utc>,
    pub left_at: Option<DateTime<Utc>>,
}

impl Database {
    /// Get participants in a room
    pub async fn get_participants(&self, room_id: Uuid) -> Result<Vec<Participant>> {
        let participants = sqlx::query_as::<_, Participant>(
            r#"
            SELECT id, room_id, user_id, display_name, role, status, tracks, joined_at, left_at
            FROM core.room_participants
            WHERE room_id = $1 AND left_at IS NULL
            ORDER BY joined_at ASC
            "#,
        )
        .bind(room_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(participants)
    }

    /// Add participant to room
    pub async fn add_participant(
        &self,
        room_id: Uuid,
        user_id: Option<Uuid>,
        display_name: &str,
        role: &str,
    ) -> Result<Participant> {
        let participant = sqlx::query_as::<_, Participant>(
            r#"
            INSERT INTO core.room_participants (id, room_id, user_id, display_name, role, status, tracks)
            VALUES ($1, $2, $3, $4, $5, 'connected', '{}')
            RETURNING id, room_id, user_id, display_name, role, status, tracks, joined_at, left_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(room_id)
        .bind(user_id)
        .bind(display_name)
        .bind(role)
        .fetch_one(&self.pool)
        .await?;

        Ok(participant)
    }

    /// Remove participant from room
    pub async fn remove_participant(&self, participant_id: Uuid) -> Result<bool> {
        let result = sqlx::query(
            r#"
            UPDATE core.room_participants
            SET left_at = NOW(), status = 'disconnected'
            WHERE id = $1
            "#,
        )
        .bind(participant_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}

// Destination Models

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Destination {
    pub id: Uuid,
    pub room_id: Uuid,
    pub platform: String,
    pub name: String,
    pub rtmp_url: String,
    pub stream_key_encrypted: String,
    pub enabled: bool,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct DestinationResponse {
    pub id: Uuid,
    pub room_id: Uuid,
    pub platform: String,
    pub name: String,
    pub rtmp_url: String,
    pub enabled: bool,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Destination> for DestinationResponse {
    fn from(d: Destination) -> Self {
        Self {
            id: d.id,
            room_id: d.room_id,
            platform: d.platform,
            name: d.name,
            rtmp_url: d.rtmp_url,
            enabled: d.enabled,
            status: d.status,
            created_at: d.created_at,
            updated_at: d.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateDestinationRequest {
    pub platform: String,
    pub name: String,
    pub rtmp_url: String,
    pub stream_key: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDestinationRequest {
    pub name: Option<String>,
    pub rtmp_url: Option<String>,
    pub stream_key: Option<String>,
    pub enabled: Option<bool>,
}

impl Database {
    /// Create a destination
    pub async fn create_destination(
        &self,
        room_id: Uuid,
        req: &CreateDestinationRequest,
    ) -> Result<Destination> {
        // In production, encrypt stream_key before storing
        let encrypted_key = format!("enc:{}", req.stream_key);

        let destination = sqlx::query_as::<_, Destination>(
            r#"
            INSERT INTO stream.destinations (id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status)
            VALUES ($1, $2, $3, $4, $5, $6, false, 'idle')
            RETURNING id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status, created_at, updated_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(room_id)
        .bind(&req.platform)
        .bind(&req.name)
        .bind(&req.rtmp_url)
        .bind(&encrypted_key)
        .fetch_one(&self.pool)
        .await?;

        Ok(destination)
    }

    /// Get destinations for a room
    pub async fn list_destinations(&self, room_id: Uuid) -> Result<Vec<Destination>> {
        let destinations = sqlx::query_as::<_, Destination>(
            r#"
            SELECT id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status, created_at, updated_at
            FROM stream.destinations
            WHERE room_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(room_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(destinations)
    }

    /// Get a destination by ID
    pub async fn get_destination(&self, destination_id: Uuid) -> Result<Option<Destination>> {
        let destination = sqlx::query_as::<_, Destination>(
            r#"
            SELECT id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status, created_at, updated_at
            FROM stream.destinations
            WHERE id = $1
            "#,
        )
        .bind(destination_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(destination)
    }

    /// Update a destination
    pub async fn update_destination(
        &self,
        destination_id: Uuid,
        req: &UpdateDestinationRequest,
    ) -> Result<Option<Destination>> {
        // Handle stream key encryption if provided
        let encrypted_key = req.stream_key.as_ref().map(|k| format!("enc:{}", k));

        let destination = sqlx::query_as::<_, Destination>(
            r#"
            UPDATE stream.destinations
            SET 
                name = COALESCE($2, name),
                rtmp_url = COALESCE($3, rtmp_url),
                stream_key_encrypted = COALESCE($4, stream_key_encrypted),
                enabled = COALESCE($5, enabled),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status, created_at, updated_at
            "#,
        )
        .bind(destination_id)
        .bind(&req.name)
        .bind(&req.rtmp_url)
        .bind(&encrypted_key)
        .bind(req.enabled)
        .fetch_optional(&self.pool)
        .await?;

        Ok(destination)
    }

    /// Toggle destination enabled state
    pub async fn toggle_destination(&self, destination_id: Uuid) -> Result<Option<Destination>> {
        let destination = sqlx::query_as::<_, Destination>(
            r#"
            UPDATE stream.destinations
            SET enabled = NOT enabled, updated_at = NOW()
            WHERE id = $1
            RETURNING id, room_id, platform, name, rtmp_url, stream_key_encrypted, enabled, status, created_at, updated_at
            "#,
        )
        .bind(destination_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(destination)
    }

    /// Delete a destination
    pub async fn delete_destination(&self, destination_id: Uuid) -> Result<bool> {
        let result = sqlx::query("DELETE FROM stream.destinations WHERE id = $1")
            .bind(destination_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

// User & API Key Models

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub plan: String,
    pub settings: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub key_hash: String,
    pub scopes: serde_json::Value,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub scopes: serde_json::Value,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<ApiKey> for ApiKeyResponse {
    fn from(k: ApiKey) -> Self {
        Self {
            id: k.id,
            user_id: k.user_id,
            name: k.name,
            scopes: k.scopes,
            last_used_at: k.last_used_at,
            expires_at: k.expires_at,
            created_at: k.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub scopes: Vec<String>,
    pub expires_in_days: Option<i32>,
}

impl Database {
    /// Get user by ID
    pub async fn get_user(&self, user_id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT id, email, display_name, avatar_url, plan, settings, created_at, updated_at
            FROM core.users
            WHERE id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    /// Create API key
    pub async fn create_api_key(
        &self,
        user_id: Uuid,
        req: &CreateApiKeyRequest,
        key_hash: &str,
    ) -> Result<ApiKey> {
        let expires_at = req
            .expires_in_days
            .map(|days| Utc::now() + chrono::Duration::days(days as i64));

        let api_key = sqlx::query_as::<_, ApiKey>(
            r#"
            INSERT INTO core.api_keys (id, user_id, name, key_hash, scopes, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, user_id, name, key_hash, scopes, last_used_at, expires_at, created_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&req.name)
        .bind(key_hash)
        .bind(serde_json::to_value(&req.scopes)?)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(api_key)
    }

    /// List API keys for user
    pub async fn list_api_keys(&self, user_id: Uuid) -> Result<Vec<ApiKey>> {
        let keys = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT id, user_id, name, key_hash, scopes, last_used_at, expires_at, created_at
            FROM core.api_keys
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(keys)
    }

    /// Revoke (delete) API key
    pub async fn revoke_api_key(&self, key_id: Uuid, user_id: Uuid) -> Result<bool> {
        let result = sqlx::query("DELETE FROM core.api_keys WHERE id = $1 AND user_id = $2")
            .bind(key_id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

// OAuth Models

#[derive(Debug, Clone, FromRow)]
pub struct OAuthState {
    pub state: String,
    pub user_id: Uuid,
    pub provider: String,
    pub redirect_uri: String,
    pub room_id: Option<Uuid>,
}

#[derive(Debug, Clone, FromRow)]
pub struct OAuthConnection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub provider_username: Option<String>,
    pub provider_display_name: Option<String>,
    pub provider_avatar_url: Option<String>,
    pub access_token_encrypted: String,
    pub refresh_token_encrypted: Option<String>,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl Database {
    /// Store OAuth state for CSRF protection
    pub async fn store_oauth_state(
        &self,
        state: &str,
        user_id: Uuid,
        provider: &str,
        redirect_uri: &str,
        room_id: Option<Uuid>,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO core.oauth_state (state, user_id, provider, redirect_uri, room_id)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(state)
        .bind(user_id)
        .bind(provider)
        .bind(redirect_uri)
        .bind(room_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get and delete OAuth state (atomic operation)
    pub async fn get_and_delete_oauth_state(&self, state: &str) -> Result<Option<OAuthState>> {
        let oauth_state = sqlx::query_as::<_, OAuthState>(
            r#"
            DELETE FROM core.oauth_state
            WHERE state = $1 AND expires_at > NOW()
            RETURNING state, user_id, provider, redirect_uri, room_id
            "#,
        )
        .bind(state)
        .fetch_optional(&self.pool)
        .await?;

        Ok(oauth_state)
    }

    /// Upsert OAuth connection
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_oauth_connection(
        &self,
        user_id: Uuid,
        provider: &str,
        provider_user_id: &str,
        provider_username: Option<&str>,
        provider_display_name: Option<&str>,
        provider_avatar_url: Option<&str>,
        access_token: &str,
        refresh_token: Option<&str>,
        token_expires_at: Option<DateTime<Utc>>,
    ) -> Result<OAuthConnection> {
        // Encrypt tokens before storing
        let access_token_encrypted = format!("enc:{}", access_token);
        let refresh_token_encrypted = refresh_token.map(|t| format!("enc:{}", t));

        let connection = sqlx::query_as::<_, OAuthConnection>(
            r#"
            INSERT INTO core.oauth_connections (
                id, user_id, provider, provider_user_id, provider_username,
                provider_display_name, provider_avatar_url, access_token_encrypted,
                refresh_token_encrypted, token_expires_at, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
            ON CONFLICT (user_id, provider) DO UPDATE SET
                provider_user_id = EXCLUDED.provider_user_id,
                provider_username = EXCLUDED.provider_username,
                provider_display_name = EXCLUDED.provider_display_name,
                provider_avatar_url = EXCLUDED.provider_avatar_url,
                access_token_encrypted = EXCLUDED.access_token_encrypted,
                refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, core.oauth_connections.refresh_token_encrypted),
                token_expires_at = EXCLUDED.token_expires_at,
                is_active = true,
                updated_at = NOW()
            RETURNING id, user_id, provider, provider_user_id, provider_username,
                provider_display_name, provider_avatar_url, access_token_encrypted,
                refresh_token_encrypted, token_expires_at, is_active, created_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(provider)
        .bind(provider_user_id)
        .bind(provider_username)
        .bind(provider_display_name)
        .bind(provider_avatar_url)
        .bind(&access_token_encrypted)
        .bind(&refresh_token_encrypted)
        .bind(token_expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(connection)
    }

    /// List OAuth connections for a user
    pub async fn list_oauth_connections(&self, user_id: Uuid) -> Result<Vec<OAuthConnection>> {
        let connections = sqlx::query_as::<_, OAuthConnection>(
            r#"
            SELECT id, user_id, provider, provider_user_id, provider_username,
                provider_display_name, provider_avatar_url, access_token_encrypted,
                refresh_token_encrypted, token_expires_at, is_active, created_at
            FROM core.oauth_connections
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(connections)
    }

    /// Get OAuth connection by ID
    pub async fn get_oauth_connection(&self, connection_id: Uuid) -> Result<Option<OAuthConnection>> {
        let connection = sqlx::query_as::<_, OAuthConnection>(
            r#"
            SELECT id, user_id, provider, provider_user_id, provider_username,
                provider_display_name, provider_avatar_url, access_token_encrypted,
                refresh_token_encrypted, token_expires_at, is_active, created_at
            FROM core.oauth_connections
            WHERE id = $
            "#,
        )
        .bind(connection_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(connection)
    }

    /// Delete OAuth connection
    pub async fn delete_oauth_connection(&self, connection_id: Uuid) -> Result<bool> {
        let result = sqlx::query("DELETE FROM core.oauth_connections WHERE id = $1")
            .bind(connection_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get user's tier level (1=Free, 2=Creator, 3=Pro, 4=Broadcast, 5=Enterprise)
    pub async fn get_user_tier(&self, user_id: &str) -> Result<Option<i32>> {
        // Try to parse user_id as UUID
        let parsed_id = match Uuid::parse_str(user_id) {
            Ok(id) => id,
            Err(_) => return Ok(None),
        };

        // Query user's plan from users table
        let result = sqlx::query_scalar::<_, String>(
            r#"
            SELECT plan FROM core.users WHERE id = $1
            "#,
        )
        .bind(parsed_id)
        .fetch_optional(&self.pool)
        .await?;

        // Convert plan string to tier level
        let tier = result.map(|plan| match plan.to_lowercase().as_str() {
            "free" => 1,
            "creator" => 2,
            "pro" => 3,
            "broadcast" => 4,
            "enterprise" => 5,
            _ => 1, // Default to free
        });

        Ok(tier)
    }

    /// Update OAuth tokens (for refresh)
    pub async fn update_oauth_tokens(
        &self,
        connection_id: Uuid,
        access_token: &str,
        refresh_token: Option<&str>,
        token_expires_at: Option<DateTime<Utc>>,
    ) -> Result<bool> {
        let access_token_encrypted = format!("enc:{}", access_token);
        let refresh_token_encrypted = refresh_token.map(|t| format!("enc:{}", t));

        let result = sqlx::query(
            r#"
            UPDATE core.oauth_connections
            SET access_token_encrypted = $2,
                refresh_token_encrypted = COALESCE($3, refresh_token_encrypted),
                token_expires_at = $4,
                last_used_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(connection_id)
        .bind(&access_token_encrypted)
        .bind(&refresh_token_encrypted)
        .bind(token_expires_at)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}

