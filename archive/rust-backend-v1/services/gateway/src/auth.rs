//! JWT authentication and token validation

use anyhow::Result;
use axum::{
    body::Body,
    extract::{Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::Next,
    response::IntoResponse,
    Json,
};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

use crate::AppState;

/// JWT claims structure (Supabase format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Audience
    pub aud: Option<String>,
    /// Expiration time
    pub exp: usize,
    /// Issued at
    pub iat: usize,
    /// Email (if available)
    pub email: Option<String>,
    /// Role
    pub role: Option<String>,
    /// App metadata from Supabase
    pub app_metadata: Option<serde_json::Value>,
    /// User metadata from Supabase
    pub user_metadata: Option<serde_json::Value>,
}

/// Validate a JWT token
pub fn validate_token(token: &str, config: &crate::config::GatewayConfig) -> Result<Claims> {
    let mut validation = Validation::new(Algorithm::HS256);

    if let Some(ref audience) = config.jwt_audience {
        validation.set_audience(&[audience]);
    } else {
        validation.validate_aud = false;
    }

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &validation,
    )?;

    Ok(token_data.claims)
}

/// Extract user ID from authorization header
#[allow(dead_code)]
pub fn extract_user_id(auth_header: Option<&str>, config: &crate::config::GatewayConfig) -> Result<String> {
    let token = auth_header
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(|| anyhow::anyhow!("Missing or invalid Authorization header"))?;

    let claims = validate_token(token, config)?;
    Ok(claims.sub)
}

/// Auth middleware for protecting routes
///
/// Validates JWT token from Authorization header and adds user claims to request extensions
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<impl IntoResponse, (StatusCode, Json<AuthErrorResponse>)> {
    // Extract Authorization header
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let token = auth_header
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(|| {
            debug!("Missing or invalid Authorization header");
            crate::metrics::record_auth_failure("missing_header");
            (
                StatusCode::UNAUTHORIZED,
                Json(AuthErrorResponse {
                    error: "unauthorized".to_string(),
                    message: "Missing or invalid Authorization header".to_string(),
                }),
            )
        })?;

    // Validate token
    let claims = validate_token(token, &state.config).map_err(|e| {
        debug!("Token validation failed: {}", e);
        crate::metrics::record_auth_failure("invalid_token");
        (
            StatusCode::UNAUTHORIZED,
            Json(AuthErrorResponse {
                error: "invalid_token".to_string(),
                message: "Invalid or expired token".to_string(),
            }),
        )
    })?;

    crate::metrics::record_auth_success();
    debug!(user_id = %claims.sub, "Request authenticated");

    // Add claims to request extensions for use in handlers
    request.extensions_mut().insert(claims);

    Ok(next.run(request).await)
}

/// Token refresh request
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Token refresh response
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub refresh_token: String,
    pub user: Option<serde_json::Value>,
}

/// Error response for auth endpoints
#[derive(Debug, Serialize)]
pub struct AuthErrorResponse {
    pub error: String,
    pub message: String,
}

/// Supabase token refresh response
#[derive(Debug, Deserialize)]
struct SupabaseRefreshResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
    refresh_token: String,
    user: Option<serde_json::Value>,
}

/// Supabase error response
#[derive(Debug, Deserialize)]
struct SupabaseErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
    message: Option<String>,
}

/// Handle token refresh
///
/// If Supabase is configured, proxies the request to Supabase GoTrue.
/// Otherwise, generates a new token locally (for development).
pub async fn refresh_token(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> axum::response::Response {
    // Check if Supabase is configured
    if state.config.has_supabase() {
        refresh_via_supabase(&state, &body.refresh_token).await
    } else {
        // Development mode: generate a new token locally
        refresh_locally(&state, &body.refresh_token).await
    }
}

/// Refresh token via Supabase GoTrue API
async fn refresh_via_supabase(
    state: &AppState,
    refresh_token: &str,
) -> axum::response::Response {
    let supabase_url = state.config.supabase_url.as_ref().unwrap();
    let anon_key = state.config.supabase_anon_key.as_ref().unwrap();

    let url = format!("{}/auth/v1/token?grant_type=refresh_token", supabase_url);

    debug!(url = %url, "Refreshing token via Supabase");

    let response = state
        .http_client
        .post(&url)
        .header("apikey", anon_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "refresh_token": refresh_token
        }))
        .send()
        .await;

    match response {
        Ok(resp) => {
            let status = resp.status();

            if status.is_success() {
                match resp.json::<SupabaseRefreshResponse>().await {
                    Ok(data) => {
                        info!("Token refreshed successfully via Supabase");
                        (
                            StatusCode::OK,
                            Json(RefreshResponse {
                                access_token: data.access_token,
                                token_type: data.token_type,
                                expires_in: data.expires_in,
                                refresh_token: data.refresh_token,
                                user: data.user,
                            }),
                        )
                            .into_response()
                    }
                    Err(e) => {
                        error!("Failed to parse Supabase response: {}", e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(AuthErrorResponse {
                                error: "parse_error".to_string(),
                                message: "Failed to parse authentication response".to_string(),
                            }),
                        )
                            .into_response()
                    }
                }
            } else {
                // Try to parse error response
                let error_msg = match resp.json::<SupabaseErrorResponse>().await {
                    Ok(err) => {
                        err.error_description
                            .or(err.message)
                            .or(err.error)
                            .unwrap_or_else(|| "Unknown error".to_string())
                    }
                    Err(_) => "Token refresh failed".to_string(),
                };

                warn!(status = %status, error = %error_msg, "Supabase token refresh failed");

                let status_code = match status.as_u16() {
                    400 => StatusCode::BAD_REQUEST,
                    401 => StatusCode::UNAUTHORIZED,
                    403 => StatusCode::FORBIDDEN,
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                };

                (
                    status_code,
                    Json(AuthErrorResponse {
                        error: "refresh_failed".to_string(),
                        message: error_msg,
                    }),
                )
                    .into_response()
            }
        }
        Err(e) => {
            error!("Failed to contact Supabase: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(AuthErrorResponse {
                    error: "service_unavailable".to_string(),
                    message: "Authentication service is unavailable".to_string(),
                }),
            )
                .into_response()
        }
    }
}

/// Refresh token locally (development mode)
///
/// This is a simplified implementation for local development.
/// In production, always use Supabase or another auth provider.
async fn refresh_locally(
    state: &AppState,
    refresh_token: &str,
) -> axum::response::Response {
    warn!("Using local token refresh (development mode only)");

    // Validate the refresh token format (simple check)
    if refresh_token.len() < 10 {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthErrorResponse {
                error: "invalid_token".to_string(),
                message: "Invalid refresh token format".to_string(),
            }),
        )
            .into_response();
    }

    // Generate a new access token
    // In development, we create a simple token with extended expiry
    let now = chrono::Utc::now().timestamp() as usize;
    let expires_in: u64 = 3600; // 1 hour

    let claims = Claims {
        sub: format!("dev_user_{}", &refresh_token[..8]),
        aud: state.config.jwt_audience.clone(),
        exp: now + expires_in as usize,
        iat: now,
        email: Some("dev@localhost".to_string()),
        role: Some("authenticated".to_string()),
        app_metadata: None,
        user_metadata: None,
    };

    match encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    ) {
        Ok(access_token) => {
            info!(user_id = %claims.sub, "Generated new access token (dev mode)");
            (
                StatusCode::OK,
                Json(RefreshResponse {
                    access_token,
                    token_type: "bearer".to_string(),
                    expires_in,
                    refresh_token: refresh_token.to_string(),
                    user: Some(serde_json::json!({
                        "id": claims.sub,
                        "email": claims.email,
                        "role": claims.role
                    })),
                }),
            )
                .into_response()
        }
        Err(e) => {
            error!("Failed to generate token: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthErrorResponse {
                    error: "token_error".to_string(),
                    message: "Failed to generate access token".to_string(),
                }),
            )
                .into_response()
        }
    }
}

/// Logout endpoint - invalidate refresh token
#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    pub refresh_token: Option<String>,
}

/// Handle logout (invalidate tokens)
pub async fn logout(
    State(state): State<AppState>,
    Json(body): Json<LogoutRequest>,
) -> axum::response::Response {
    if state.config.has_supabase() {
        logout_via_supabase(&state, body.refresh_token.as_deref()).await
    } else {
        // Development mode: just acknowledge
        info!("Logout processed (dev mode)");
        StatusCode::NO_CONTENT.into_response()
    }
}

/// Logout via Supabase
async fn logout_via_supabase(
    state: &AppState,
    _refresh_token: Option<&str>,
) -> axum::response::Response {
    let supabase_url = state.config.supabase_url.as_ref().unwrap();
    let anon_key = state.config.supabase_anon_key.as_ref().unwrap();

    let url = format!("{}/auth/v1/logout", supabase_url);

    let response = state
        .http_client
        .post(&url)
        .header("apikey", anon_key)
        .header("Content-Type", "application/json")
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            info!("Logout successful via Supabase");
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(resp) => {
            warn!(status = %resp.status(), "Supabase logout returned non-success");
            // Still return success - client should clear tokens anyway
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => {
            error!("Failed to contact Supabase for logout: {}", e);
            // Return success anyway - client should clear tokens
            StatusCode::NO_CONTENT.into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_token() {
        let config = crate::config::GatewayConfig {
            port: 8080,
            jwt_secret: "test-secret".to_string(),
            jwt_audience: None,
            rate_limit_rps: 100,
            rate_limit_burst: 200,
            supabase_url: None,
            supabase_anon_key: None,
            core_service_url: "http://localhost:8081".to_string(),
            sfu_service_url: "http://localhost:8082".to_string(),
            stream_service_url: "http://localhost:8083".to_string(),
            storage_service_url: "http://localhost:8084".to_string(),
        };

        // Create a test token
        let claims = Claims {
            sub: "test-user".to_string(),
            aud: None,
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iat: chrono::Utc::now().timestamp() as usize,
            email: Some("test@example.com".to_string()),
            role: Some("authenticated".to_string()),
            app_metadata: None,
            user_metadata: None,
        };

        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
        )
        .unwrap();

        // Validate the token
        let validated = validate_token(&token, &config).unwrap();
        assert_eq!(validated.sub, "test-user");
        assert_eq!(validated.email, Some("test@example.com".to_string()));
    }
}
