//! ALLSTRM Gateway Service
//!
//! API Gateway handling:
//! - WebSocket connections and routing
//! - JWT validation
//! - Rate limiting
//! - Request proxying to internal services

use anyhow::Result;
use axum::{
    http::{header, Method},
    middleware,
    routing::{delete, get, patch, post},
    Router,
};
use std::{net::SocketAddr, sync::Arc};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;

mod auth;
mod config;
mod metrics;
mod proxy;
mod rate_limit;
mod routes;
mod websocket;

use crate::config::GatewayConfig;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<GatewayConfig>,
    pub http_client: reqwest::Client,
    pub rate_limiter: Arc<rate_limit::RateLimiter>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("allstrm_gateway=debug".parse().unwrap())
                .add_directive("tower_http=debug".parse().unwrap()),
        )
        .init();

    info!("Starting ALLSTRM Gateway");

    // Initialize Prometheus metrics
    metrics::init_metrics();
    info!("Prometheus metrics initialized");

    // Load configuration
    let config = config::GatewayConfig::from_env()?;
    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse()?;

    // Build HTTP client for service-to-service communication
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    // Initialize rate limiter
    let rate_limiter = Arc::new(rate_limit::RateLimiter::new(
        config.rate_limit_rps,
        config.rate_limit_burst,
    ));

    // Build application state
    let state = AppState {
        config: Arc::new(config),
        http_client,
        rate_limiter,
    };

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // Protected API routes (require authentication)
    let protected_routes = Router::new()
        // Room routes (proxy to core)
        .route("/rooms", post(routes::rooms::create_room))
        .route("/rooms", get(routes::rooms::list_rooms))
        .route("/rooms/:id", get(routes::rooms::get_room))
        .route("/rooms/:id", patch(routes::rooms::update_room))
        .route("/rooms/:id", delete(routes::rooms::delete_room))
        .route("/rooms/:id/join", post(routes::rooms::join_room))
        // Destination routes (proxy to core)
        .route("/destinations", get(routes::destinations::list_destinations))
        .route("/destinations", post(routes::destinations::create_destination))
        .route("/destinations/:id", patch(routes::destinations::update_destination))
        .route("/destinations/:id", delete(routes::destinations::delete_destination))
        .route("/destinations/:id/test", post(routes::destinations::test_destination))
        // Upload routes (proxy to storage)
        .route("/upload/sign", post(routes::upload::sign_upload))
        .route("/upload/complete", post(routes::upload::complete_upload))
        // Recording routes (proxy to storage)
        .route("/recordings", get(routes::recordings::list_recordings))
        .route("/recordings/:id", get(routes::recordings::get_recording))
        .route("/recordings/:id", delete(routes::recordings::delete_recording))
        // SFU Signaling routes (proxy to sfu)
        .route("/sfu/rooms/:room_id/join", post(routes::signaling::join_room))
        .route("/sfu/rooms/:room_id/offer", post(routes::signaling::handle_offer))
        .route("/sfu/rooms/:room_id/answer", post(routes::signaling::handle_answer))
        .route("/sfu/rooms/:room_id/ice", post(routes::signaling::handle_ice))
        .route("/sfu/rooms/:room_id/leave", post(routes::signaling::leave_room))
        .route("/sfu/rooms/:room_id/participants", get(routes::signaling::get_participants))
        .route("/sfu/rooms/:room_id/subscribe", post(routes::signaling::subscribe))
        .route("/sfu/rooms/:room_id/unsubscribe", post(routes::signaling::unsubscribe))
        .route("/sfu/rooms/:room_id/unsubscribe", post(routes::signaling::unsubscribe))
        .route("/sfu/rooms/:room_id/admit", post(routes::signaling::admit_participant))
        .route("/sfu/rooms/:room_id/waiting-participants", get(routes::signaling::get_waiting_participants))
        // Apply auth middleware to all these routes
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware))
        // Apply rate limiting to protected routes
        .layer(middleware::from_fn_with_state(state.clone(), rate_limit::rate_limit_middleware));

    // Build main router
    let app = Router::new()
        // Public routes (no auth required)
        .route("/ws", get(websocket::ws_handler))
        .route("/health", get(routes::health_handler))
        .route("/metrics", get(routes::metrics_handler))
        .route("/auth/refresh", post(auth::refresh_token))
        .route("/auth/logout", post(auth::logout))
        // Mount protected routes under /api/v1
        .nest("/api/v1", protected_routes)
        // Add global middleware
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state);

    info!("Gateway listening on {}", addr);

    // Start server
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
