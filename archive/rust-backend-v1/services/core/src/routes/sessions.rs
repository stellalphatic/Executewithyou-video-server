//! Session management routes for single-session enforcement
//!
//! Implements WhatsApp Web-style session management where only one
//! active session per user is allowed at a time.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};
use uuid::Uuid;

use crate::AppState;

/// In-memory session store (for production, use Redis)
#[derive(Default)]
pub struct SessionStore {
    sessions: HashMap<String, ActiveSession>,
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

pub type SharedSessionStore = Arc<RwLock<SessionStore>>;

pub fn new_session_store() -> SharedSessionStore {
    Arc::new(RwLock::new(SessionStore::new()))
}

/// Active session record
#[derive(Debug, Clone, Serialize)]
pub struct ActiveSession {
    pub session_id: String,
    pub user_id: String,
    pub tab_id: String,
    pub user_agent: String,
    pub ip_address: String,
    pub created_at: DateTime<Utc>,
    pub last_heartbeat: DateTime<Utc>,
}

/// Request to register a new session
#[derive(Debug, Deserialize)]
pub struct RegisterSessionRequest {
    pub user_id: String,
    pub tab_id: String,
    #[serde(default)]
    pub force: bool,
}

/// Response from registering a session
#[derive(Debug, Serialize)]
pub struct RegisterSessionResponse {
    pub session_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_session: Option<ExistingSessionInfo>,
}

#[derive(Debug, Serialize)]
pub struct ExistingSessionInfo {
    pub session_id: String,
    pub created_at: String,
    pub user_agent: String,
}

/// Register a new session (invalidates existing sessions)
pub async fn register_session(
    State(state): State<AppState>,
    Json(req): Json<RegisterSessionRequest>,
) -> Result<Json<RegisterSessionResponse>, (StatusCode, String)> {
    info!(user_id = %req.user_id, tab_id = %req.tab_id, force = %req.force, "Registering session");

    let mut store = state.sessions.write().await;

    // Check for existing session
    if let Some(existing) = store.sessions.get(&req.user_id) {
        if !req.force {
            // Return info about existing session
            return Ok(Json(RegisterSessionResponse {
                session_id: String::new(),
                success: false,
                existing_session: Some(ExistingSessionInfo {
                    session_id: existing.session_id.clone(),
                    created_at: existing.created_at.to_rfc3339(),
                    user_agent: existing.user_agent.clone(),
                }),
            }));
        }
        
        info!(
            user_id = %req.user_id,
            old_session = %existing.session_id,
            "Force-replacing existing session"
        );
    }

    // Create new session
    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let session = ActiveSession {
        session_id: session_id.clone(),
        user_id: req.user_id.clone(),
        tab_id: req.tab_id,
        user_agent: String::new(), // TODO: Extract from headers
        ip_address: String::new(), // TODO: Extract from request
        created_at: now,
        last_heartbeat: now,
    };

    store.sessions.insert(req.user_id, session);

    Ok(Json(RegisterSessionResponse {
        session_id,
        success: true,
        existing_session: None,
    }))
}

/// Release a session
#[derive(Debug, Serialize)]
pub struct ReleaseSessionResponse {
    pub success: bool,
}

pub async fn release_session(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<ReleaseSessionResponse>, (StatusCode, String)> {
    info!(session_id = %session_id, "Releasing session");

    let mut store = state.sessions.write().await;

    // Find and remove the session
    let removed = store.sessions.retain(|_, session| session.session_id != session_id);
    let _ = removed; // silence unused warning

    Ok(Json(ReleaseSessionResponse { success: true }))
}

/// Session heartbeat request
#[derive(Debug, Deserialize)]
pub struct HeartbeatRequest {
    pub user_id: String,
}

/// Session heartbeat response
#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Process a session heartbeat
pub async fn session_heartbeat(
    Path(session_id): Path<String>,
    State(state): State<AppState>,
    Json(req): Json<HeartbeatRequest>,
) -> Result<Json<HeartbeatResponse>, (StatusCode, String)> {
    let mut store = state.sessions.write().await;

    // Find the session for this user
    if let Some(session) = store.sessions.get_mut(&req.user_id) {
        if session.session_id == session_id {
            // Update heartbeat
            session.last_heartbeat = Utc::now();
            return Ok(Json(HeartbeatResponse {
                valid: true,
                message: None,
            }));
        } else {
            // Different session is active - this session was taken over
            warn!(
                user_id = %req.user_id,
                expected_session = %session_id,
                active_session = %session.session_id,
                "Session takeover detected"
            );
            return Ok(Json(HeartbeatResponse {
                valid: false,
                message: Some("Session taken over by another tab".to_string()),
            }));
        }
    }

    // No session found - might have expired
    Ok(Json(HeartbeatResponse {
        valid: false,
        message: Some("Session not found or expired".to_string()),
    }))
}

/// Get active session info for a user (admin endpoint)
pub async fn get_user_session(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Option<ActiveSession>>, (StatusCode, String)> {
    let store = state.sessions.read().await;
    let session = store.sessions.get(&user_id).cloned();
    Ok(Json(session))
}

/// Clean up stale sessions (call periodically)
pub async fn cleanup_stale_sessions(store: SharedSessionStore, timeout_secs: i64) {
    let mut store = store.write().await;
    let now = Utc::now();
    let timeout = chrono::Duration::seconds(timeout_secs);

    let stale_users: Vec<String> = store
        .sessions
        .iter()
        .filter(|(_, session)| now - session.last_heartbeat > timeout)
        .map(|(user_id, _)| user_id.clone())
        .collect();

    for user_id in stale_users {
        info!(user_id = %user_id, "Removing stale session");
        store.sessions.remove(&user_id);
    }
}
