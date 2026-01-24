//! OAuth routes for platform connections
//!
//! Handles OAuth flows for YouTube, Twitch, and Facebook.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::AppState;

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

#[derive(Debug, Deserialize)]
pub struct InitiateOAuthQuery {
    pub user_id: Uuid,
    pub room_id: Option<Uuid>,
    pub redirect_uri: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: String,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OAuthConnectionResponse {
    pub id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub provider_username: Option<String>,
    pub provider_display_name: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct OAuthConnectionsListResponse {
    pub connections: Vec<OAuthConnectionResponse>,
}

#[derive(Debug, Serialize)]
pub struct StreamDestinationResponse {
    pub provider: String,
    pub channel_id: String,
    pub channel_name: String,
    pub rtmp_url: String,
    pub stream_key: String,
    pub backup_rtmp_url: Option<String>,
    pub title: Option<String>,
    pub is_live: bool,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct AvailableProvidersResponse {
    pub providers: Vec<ProviderInfo>,
}

#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub display_name: String,
    pub icon: String,
    pub is_configured: bool,
}

// ============================================
// HANDLERS
// ============================================

/// GET /api/v1/oauth/providers - List available OAuth providers
pub async fn list_providers(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let available = state.oauth_manager.available_providers();

    let providers = vec![
        ProviderInfo {
            name: "youtube".to_string(),
            display_name: "YouTube".to_string(),
            icon: "youtube".to_string(),
            is_configured: available.contains(&"youtube".to_string()),
        },
        ProviderInfo {
            name: "facebook".to_string(),
            display_name: "Facebook Live".to_string(),
            icon: "facebook".to_string(),
            is_configured: available.contains(&"facebook".to_string()),
        },
        ProviderInfo {
            name: "linkedin".to_string(),
            display_name: "LinkedIn Live".to_string(),
            icon: "linkedin".to_string(),
            is_configured: available.contains(&"linkedin".to_string()),
        },
        ProviderInfo {
            name: "x".to_string(),
            display_name: "X (Twitter)".to_string(),
            icon: "twitter".to_string(),
            is_configured: available.contains(&"x".to_string()),
        },
        ProviderInfo {
            name: "twitch".to_string(),
            display_name: "Twitch".to_string(),
            icon: "twitch".to_string(),
            is_configured: available.contains(&"twitch".to_string()),
        },
        ProviderInfo {
            name: "instagram".to_string(),
            display_name: "Instagram Live".to_string(),
            icon: "instagram".to_string(),
            is_configured: available.contains(&"instagram".to_string()),
        },
        ProviderInfo {
            name: "tiktok".to_string(),
            display_name: "TikTok Live".to_string(),
            icon: "tiktok".to_string(),
            is_configured: available.contains(&"tiktok".to_string()),
        },
        ProviderInfo {
            name: "kick".to_string(),
            display_name: "Kick".to_string(),
            icon: "kick".to_string(),
            is_configured: true, // Always available (manual RTMP)
        },
        ProviderInfo {
            name: "vimeo".to_string(),
            display_name: "Vimeo".to_string(),
            icon: "vimeo".to_string(),
            is_configured: available.contains(&"vimeo".to_string()),
        },
        ProviderInfo {
            name: "amazon".to_string(),
            display_name: "Amazon Live".to_string(),
            icon: "amazon".to_string(),
            is_configured: available.contains(&"amazon".to_string()),
        },
        ProviderInfo {
            name: "brightcove".to_string(),
            display_name: "Brightcove".to_string(),
            icon: "brightcove".to_string(),
            is_configured: available.contains(&"brightcove".to_string()),
        },
        ProviderInfo {
            name: "hopin".to_string(),
            display_name: "Hopin".to_string(),
            icon: "hopin".to_string(),
            is_configured: available.contains(&"hopin".to_string()),
        },
        ProviderInfo {
            name: "custom_rtmp".to_string(),
            display_name: "Custom RTMP".to_string(),
            icon: "broadcast".to_string(),
            is_configured: true, // Always available
        },
    ];

    Json(AvailableProvidersResponse { providers })
}

/// GET /api/v1/oauth/:provider/authorize - Initiate OAuth flow
pub async fn initiate_oauth(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<InitiateOAuthQuery>,
) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
    info!(provider = %provider, user_id = %query.user_id, "Initiating OAuth flow");

    // Get the provider
    let oauth_provider = state.oauth_manager.get_provider(&provider).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "provider_not_found".to_string(),
                message: format!("OAuth provider '{}' is not configured", provider),
            }),
        )
    })?;

    // Generate state for CSRF protection
    let state_token = generate_state_token();

    // Store state in database
    let redirect_uri = query.redirect_uri.unwrap_or_else(|| "/oauth/complete".to_string());

    if let Err(e) = state
        .db
        .store_oauth_state(&state_token, query.user_id, &provider, &redirect_uri, query.room_id)
        .await
    {
        error!("Failed to store OAuth state: {}", e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "state_error".to_string(),
                message: "Failed to initiate OAuth flow".to_string(),
            }),
        ));
    }

    // Get authorization URL
    let auth_url = oauth_provider.get_authorization_url(&state_token);

    info!(provider = %provider, "Redirecting to OAuth provider");
    Ok(Redirect::temporary(&auth_url))
}

/// GET /api/v1/oauth/:provider/callback - OAuth callback handler
pub async fn oauth_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect, (StatusCode, Json<ErrorResponse>)> {
    info!(provider = %provider, "OAuth callback received");

    // Check for OAuth errors
    if let Some(error) = query.error {
        warn!(
            provider = %provider,
            error = %error,
            description = query.error_description.as_deref().unwrap_or(""),
            "OAuth error from provider"
        );
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "oauth_error".to_string(),
                message: query.error_description.unwrap_or_else(|| error),
            }),
        ));
    }

    let code = query.code.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "missing_code".to_string(),
                message: "Authorization code is required".to_string(),
            }),
        )
    })?;

    // Verify and retrieve state
    let oauth_state = state
        .db
        .get_and_delete_oauth_state(&query.state)
        .await
        .map_err(|e| {
            error!("Failed to retrieve OAuth state: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "state_error".to_string(),
                    message: "Failed to verify OAuth state".to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            warn!("Invalid or expired OAuth state");
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "invalid_state".to_string(),
                    message: "Invalid or expired OAuth state".to_string(),
                }),
            )
        })?;

    // Verify provider matches
    if oauth_state.provider != provider {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "provider_mismatch".to_string(),
                message: "OAuth provider mismatch".to_string(),
            }),
        ));
    }

    // Get the provider
    let oauth_provider = state.oauth_manager.get_provider(&provider).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "provider_not_found".to_string(),
                message: format!("OAuth provider '{}' is not configured", provider),
            }),
        )
    })?;

    // Exchange code for tokens
    let tokens = oauth_provider
        .exchange_code(&code, state.oauth_manager.http_client())
        .await
        .map_err(|e| {
            error!("Token exchange failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "token_exchange_failed".to_string(),
                    message: "Failed to exchange authorization code".to_string(),
                }),
            )
        })?;

    // Get user profile
    let profile = oauth_provider
        .get_user_profile(&tokens.access_token, state.oauth_manager.http_client())
        .await
        .map_err(|e| {
            error!("Failed to get user profile: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "profile_error".to_string(),
                    message: "Failed to get user profile from provider".to_string(),
                }),
            )
        })?;

    // Calculate token expiry
    let token_expires_at = tokens.expires_in.map(|secs| {
        chrono::Utc::now() + chrono::Duration::seconds(secs as i64)
    });

    // Store connection in database
    if let Err(e) = state
        .db
        .upsert_oauth_connection(
            oauth_state.user_id,
            &provider,
            &profile.provider_user_id,
            profile.username.as_deref(),
            profile.display_name.as_deref(),
            profile.avatar_url.as_deref(),
            &tokens.access_token,
            tokens.refresh_token.as_deref(),
            token_expires_at,
        )
        .await
    {
        error!("Failed to store OAuth connection: {}", e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "storage_error".to_string(),
                message: "Failed to store OAuth connection".to_string(),
            }),
        ));
    }

    info!(
        provider = %provider,
        user_id = %oauth_state.user_id,
        provider_user = %profile.provider_user_id,
        "OAuth connection established"
    );

    // Redirect to completion URL
    let redirect_url = format!(
        "{}?provider={}&success=true",
        oauth_state.redirect_uri,
        provider
    );

    Ok(Redirect::temporary(&redirect_url))
}

/// GET /api/v1/oauth/connections - List user's OAuth connections
pub async fn list_connections(
    State(state): State<AppState>,
    Query(query): Query<UserIdQuery>,
) -> Result<Json<OAuthConnectionsListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let connections = state
        .db
        .list_oauth_connections(query.user_id)
        .await
        .map_err(|e| {
            error!("Failed to list OAuth connections: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".to_string(),
                    message: "Failed to list OAuth connections".to_string(),
                }),
            )
        })?;

    let response = OAuthConnectionsListResponse {
        connections: connections
            .into_iter()
            .map(|c| OAuthConnectionResponse {
                id: c.id,
                provider: c.provider,
                provider_user_id: c.provider_user_id,
                provider_username: c.provider_username,
                provider_display_name: c.provider_display_name,
                is_active: c.is_active,
                created_at: c.created_at,
            })
            .collect(),
    };

    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
pub struct UserIdQuery {
    pub user_id: Uuid,
}

/// DELETE /api/v1/oauth/connections/:connection_id - Disconnect an OAuth connection
pub async fn disconnect_connection(
    State(state): State<AppState>,
    Path(connection_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // Get the connection
    let connection = state
        .db
        .get_oauth_connection(connection_id)
        .await
        .map_err(|e| {
            error!("Failed to get OAuth connection: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".to_string(),
                    message: "Failed to get OAuth connection".to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "not_found".to_string(),
                    message: "OAuth connection not found".to_string(),
                }),
            )
        })?;

    // Try to revoke access with provider (optional - don't fail if it doesn't work)
    if let Some(provider) = state.oauth_manager.get_provider(&connection.provider) {
        let access_token = decrypt_token(&connection.access_token_encrypted);
        if let Err(e) = provider
            .revoke_access(&access_token, state.oauth_manager.http_client())
            .await
        {
            warn!(
                connection_id = %connection_id,
                error = %e,
                "Failed to revoke OAuth access (continuing with disconnect)"
            );
        }
    }

    // Delete from database
    state
        .db
        .delete_oauth_connection(connection_id)
        .await
        .map_err(|e| {
            error!("Failed to delete OAuth connection: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".to_string(),
                    message: "Failed to delete OAuth connection".to_string(),
                }),
            )
        })?;

    info!(connection_id = %connection_id, "OAuth connection disconnected");
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/oauth/connections/:connection_id/destination - Get stream destination for connection
pub async fn get_stream_destination(
    State(state): State<AppState>,
    Path(connection_id): Path<Uuid>,
) -> Result<Json<StreamDestinationResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Get the connection
    let connection = state
        .db
        .get_oauth_connection(connection_id)
        .await
        .map_err(|e| {
            error!("Failed to get OAuth connection: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".to_string(),
                    message: "Failed to get OAuth connection".to_string(),
                }),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "not_found".to_string(),
                    message: "OAuth connection not found".to_string(),
                }),
            )
        })?;

    // Get the provider
    let provider = state.oauth_manager.get_provider(&connection.provider).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "provider_not_found".to_string(),
                message: format!("OAuth provider '{}' is not configured", connection.provider),
            }),
        )
    })?;

    // Decrypt access token
    let access_token = decrypt_token(&connection.access_token_encrypted);

    // Get stream destination
    let destination = provider
        .get_stream_destination(&access_token, state.oauth_manager.http_client())
        .await
        .map_err(|e| {
            error!("Failed to get stream destination: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "api_error".to_string(),
                    message: format!("Failed to get stream destination: {}", e),
                }),
            )
        })?;

    Ok(Json(StreamDestinationResponse {
        provider: destination.provider,
        channel_id: destination.channel_id,
        channel_name: destination.channel_name,
        rtmp_url: destination.rtmp_url,
        stream_key: destination.stream_key,
        backup_rtmp_url: destination.backup_rtmp_url,
        title: destination.title,
        is_live: destination.is_live,
    }))
}

// ============================================
// HELPER FUNCTIONS
// ============================================

fn generate_state_token() -> String {
    use rand::Rng;
    let bytes: [u8; 32] = rand::thread_rng().gen();
    hex::encode(bytes)
}

fn decrypt_token(encrypted: &str) -> String {
    // In production, implement proper decryption
    // For now, just strip the "enc:" prefix
    encrypted.strip_prefix("enc:").unwrap_or(encrypted).to_string()
}
