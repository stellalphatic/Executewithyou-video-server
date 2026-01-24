//! User and API key management endpoints

use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHasher,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use serde::Serialize;
use uuid::Uuid;

use crate::db::{ApiKeyResponse, CreateApiKeyRequest, User};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct ApiKeyCreatedResponse {
    pub id: Uuid,
    pub name: String,
    /// The plaintext API key - only returned once at creation time
    pub api_key: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiKeyListResponse {
    pub api_keys: Vec<ApiKeyResponse>,
}

/// Get user by ID
pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<User>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.get_user(user_id).await {
        Ok(Some(user)) => Ok(Json(user)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to get user: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get user".to_string(),
                }),
            ))
        }
    }
}

/// Create a new API key for a user
pub async fn create_api_key(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<CreateApiKeyRequest>,
) -> Result<(StatusCode, Json<ApiKeyCreatedResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Verify user exists
    if state.db.get_user(user_id).await.map_err(|e| {
        tracing::error!("Failed to get user: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to verify user".to_string(),
            }),
        )
    })?.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ));
    }

    // Generate a secure random API key
    let api_key = generate_api_key();

    // Hash the API key for storage
    let key_hash = hash_api_key(&api_key).map_err(|e| {
        tracing::error!("Failed to hash API key: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to create API key".to_string(),
            }),
        )
    })?;

    // Store in database
    match state.db.create_api_key(user_id, &req, &key_hash).await {
        Ok(created) => {
            let scopes: Vec<String> = serde_json::from_value(created.scopes).unwrap_or_default();
            Ok((
                StatusCode::CREATED,
                Json(ApiKeyCreatedResponse {
                    id: created.id,
                    name: created.name,
                    api_key, // Return plaintext key only at creation
                    scopes,
                }),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to create API key: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create API key".to_string(),
                }),
            ))
        }
    }
}

/// List API keys for a user
pub async fn list_api_keys(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ApiKeyListResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify user exists
    if state.db.get_user(user_id).await.map_err(|e| {
        tracing::error!("Failed to get user: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to verify user".to_string(),
            }),
        )
    })?.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ));
    }

    match state.db.list_api_keys(user_id).await {
        Ok(keys) => Ok(Json(ApiKeyListResponse {
            api_keys: keys.into_iter().map(|k| k.into()).collect(),
        })),
        Err(e) => {
            tracing::error!("Failed to list API keys: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to list API keys".to_string(),
                }),
            ))
        }
    }
}

/// Revoke an API key
pub async fn revoke_api_key(
    State(state): State<AppState>,
    Path((user_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state.db.revoke_api_key(key_id, user_id).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "API key not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to revoke API key: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to revoke API key".to_string(),
                }),
            ))
        }
    }
}

/// Generate a secure random API key
fn generate_api_key() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    format!("allstrm_{}", hex::encode(bytes))
}

/// Hash an API key for secure storage
fn hash_api_key(api_key: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(api_key.as_bytes(), &salt)?;
    Ok(hash.to_string())
}
