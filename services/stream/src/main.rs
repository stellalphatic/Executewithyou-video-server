//! ALLSTRM Stream Service (S2)
//!
//! Handles RTMP ingest from Studio mode, HLS segmentation, and multi-destination relay.
//! This is the streaming engine for StreamYard-like functionality.

use anyhow::Result;
use axum::{
    routing::{delete, get, post},
    Router,
};
use dashmap::DashMap;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod config;
mod engine;
mod ffmpeg;
mod ingest;
mod relay;
mod routes;
mod session;

pub use config::Config;
pub use session::{StreamSession, StreamState};

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    /// Active streaming sessions (room_id -> session)
    pub sessions: Arc<DashMap<Uuid, StreamSession>>,
    /// FFmpeg process manager
    pub ffmpeg_manager: Arc<ffmpeg::FfmpegManager>,
    /// Configuration
    pub config: Config,
    /// HTTP client for callbacks to other services
    pub http_client: reqwest::Client,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            ffmpeg_manager: Arc::new(ffmpeg::FfmpegManager::new(config.clone())),
            config,
            http_client: reqwest::Client::new(),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;

    info!("Starting ALLSTRM Stream Service (S2) on port {}", config.port);
    info!("RTMP ingest will be on port {}", config.rtmp_port);

    // Build application state
    let state = AppState::new(config.clone());

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(routes::health::health_check))
        // Session management
        .route("/api/sessions", post(routes::sessions::create_session))
        .route("/api/sessions/:room_id", get(routes::sessions::get_session))
        .route(
            "/api/sessions/:room_id",
            delete(routes::sessions::delete_session),
        )
        // Stream control
        .route(
            "/api/sessions/:room_id/start",
            post(routes::control::start_stream),
        )
        .route(
            "/api/sessions/:room_id/stop",
            post(routes::control::stop_stream),
        )
        // Destination relay management
        .route(
            "/api/sessions/:room_id/destinations/:destination_id/start",
            post(routes::control::start_destination),
        )
        .route(
            "/api/sessions/:room_id/destinations/:destination_id/stop",
            post(routes::control::stop_destination),
        )
        // Layout control
        .route(
            "/api/sessions/:room_id/layout",
            post(routes::layout::set_layout),
        )
        .route(
            "/api/sessions/:room_id/layout",
            get(routes::layout::get_layout),
        )
        // HLS output
        .route(
            "/hls/:room_id/playlist.m3u8",
            get(routes::hls::get_playlist),
        )
        .route("/hls/:room_id/:segment", get(routes::hls::get_segment))
        // RTMP callback endpoints (called by nginx-rtmp or our ingest)
        .route("/rtmp/on_publish", post(routes::rtmp::on_publish))
        .route("/rtmp/on_publish_done", post(routes::rtmp::on_publish_done))
        // Stats
        .route(
            "/api/sessions/:room_id/stats",
            get(routes::stats::get_stats),
        )
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state.clone());

    // Start RTMP ingest server in background
    let ingest_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = ingest::start_rtmp_server(ingest_state).await {
            tracing::error!("RTMP ingest server error: {}", e);
        }
    });

    // Start HTTP server
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.port)).await?;
    info!("Stream service listening on {}", listener.local_addr()?);

    axum::serve(listener, app).await?;

    Ok(())
}
