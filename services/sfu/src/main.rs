//! ALLSTRM SFU Service (S1)
//!
//! Selective Forwarding Unit for real-time media communication.
//!
//! ## Features
//! - WebRTC signaling (SDP, ICE)
//! - Track forwarding between participants
//! - Simulcast support
//! - Active speaker detection

use anyhow::Result;
use axum::{
    extract::State,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::{net::SocketAddr, sync::Arc};
use tower_http::trace::TraceLayer;
use tracing::info;

mod config;
mod peer;
mod room;
mod signaling;
mod track_router;

use crate::config::SfuConfig;
use crate::peer::{PeerConnectionManager, TurnCredentials};
use crate::room::RoomManager;
use crate::track_router::TrackRouter;

/// Application state
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<SfuConfig>,
    pub room_manager: Arc<RoomManager>,
    pub peer_manager: Arc<PeerConnectionManager>,
    pub track_router: Arc<TrackRouter>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("allstrm_sfu=debug".parse().unwrap())
                .add_directive("webrtc=warn".parse().unwrap()),
        )
        .init();

    info!("Starting ALLSTRM SFU Service (S1)");

    // Load configuration
    let config = SfuConfig::from_env()?;
    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse()?;

    info!(
        port = %config.port,
        stun_server = %config.stun_server,
        "SFU service configuration loaded"
    );

    // Initialize room manager
    let room_manager = Arc::new(RoomManager::new());

    // Initialize peer connection manager with ICE servers
    let turn_credentials = TurnCredentials {
        username: config.turn_username.clone(),
        credential: config.turn_credential.clone(),
    };
    let peer_manager = Arc::new(
        PeerConnectionManager::new_with_credentials(
            &config.stun_server,
            config.turn_server.as_deref(),
            turn_credentials,
        )
        .await?,
    );
    info!(
        stun = %config.stun_server,
        turn = config.turn_server.as_deref().unwrap_or("none"),
        "WebRTC peer connection manager initialized"
    );

    // Initialize track router for forwarding media between participants
    let track_router = Arc::new(TrackRouter::new());

    // Build application state
    let state = AppState {
        config: Arc::new(config),
        room_manager,
        peer_manager,
        track_router,
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/api/v1/rooms/:room_id/join", post(signaling::join_room))
        .route("/api/v1/rooms/:room_id/offer", post(signaling::handle_offer))
        .route("/api/v1/rooms/:room_id/answer", post(signaling::handle_answer))
        .route("/api/v1/rooms/:room_id/ice", post(signaling::handle_ice_candidate))
        .route("/api/v1/rooms/:room_id/leave", post(signaling::leave_room))
        .route("/api/v1/rooms/:room_id/participants", get(signaling::get_participants))
        .route("/api/v1/rooms/:room_id/subscribe", post(signaling::subscribe_to_track))
        .route("/api/v1/rooms/:room_id/unsubscribe", post(signaling::unsubscribe_from_track))
        .route("/api/v1/rooms/:room_id/admit", post(signaling::admit_participant))
        .route("/api/v1/rooms/:room_id/waiting-participants", get(signaling::get_waiting_participants))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    info!("SFU service listening on {}", addr);

    // Start server
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "allstrm-sfu",
        "version": env!("CARGO_PKG_VERSION"),
        "active_connections": state.peer_manager.connection_count(),
        "active_rooms": state.room_manager.count()
    }))
}
