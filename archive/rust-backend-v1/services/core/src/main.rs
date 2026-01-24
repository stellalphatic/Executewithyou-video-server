//! ALLSTRM Core Service
//!
//! Handles room management, user data, and destination configuration.
//! This is the central service for persistent data operations.

use anyhow::Result;
use axum::{
    routing::{delete, get, post, put},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod oauth;
mod routes;

pub use config::Config;
pub use db::Database;
pub use oauth::{OAuthManager, OAuthManagerConfig};
use routes::sessions::SharedSessionStore;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub config: Config,
    pub oauth_manager: Arc<OAuthManager>,
    pub sessions: SharedSessionStore,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,sqlx=warn".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;

    info!("Starting ALLSTRM Core Service on port {}", config.port);

    // Connect to PostgreSQL
    let pool = PgPoolOptions::new()
        .max_connections(config.database_pool_size)
        .connect(&config.database_url)
        .await?;

    info!("Connected to PostgreSQL");

    // Run migrations if enabled
    if config.run_migrations {
        info!("Running database migrations...");
        sqlx::migrate!("../../migrations")
            .run(&pool)
            .await
            .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;
        info!("Migrations completed successfully");
    }

    // Create database wrapper
    let db = Arc::new(Database::new(pool));

    // Initialize OAuth manager
    let oauth_config = OAuthManagerConfig::from_env();
    let oauth_manager = Arc::new(OAuthManager::new(&oauth_config)?);
    info!(
        providers = ?oauth_manager.available_providers(),
        "OAuth manager initialized"
    );

    // Initialize session store
    let sessions = routes::sessions::new_session_store();

    // Build application state
    let state = AppState {
        db,
        config: config.clone(),
        oauth_manager,
        sessions,
    };

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(routes::health::health_check))
        // Room endpoints
        .route("/api/rooms", post(routes::rooms::create_room))
        .route("/api/rooms", get(routes::rooms::list_rooms))
        .route("/api/rooms/:room_id", get(routes::rooms::get_room))
        .route("/api/rooms/:room_id", put(routes::rooms::update_room))
        .route("/api/rooms/:room_id", delete(routes::rooms::delete_room))
        .route(
            "/api/rooms/:room_id/participants",
            get(routes::rooms::get_participants),
        )
        // Broadcast endpoints
        .route(
            "/api/rooms/:room_id/broadcast/start",
            post(routes::broadcast::start_broadcast),
        )
        // Destination endpoints
        .route(
            "/api/rooms/:room_id/destinations",
            post(routes::destinations::create_destination),
        )
        .route(
            "/api/rooms/:room_id/destinations",
            get(routes::destinations::list_destinations),
        )
        .route(
            "/api/rooms/:room_id/destinations/:destination_id",
            get(routes::destinations::get_destination),
        )
        .route(
            "/api/rooms/:room_id/destinations/:destination_id",
            put(routes::destinations::update_destination),
        )
        .route(
            "/api/rooms/:room_id/destinations/:destination_id",
            delete(routes::destinations::delete_destination),
        )
        .route(
            "/api/rooms/:room_id/destinations/:destination_id/toggle",
            post(routes::destinations::toggle_destination),
        )
        // User/API key endpoints
        .route("/api/users/:user_id", get(routes::users::get_user))
        .route(
            "/api/users/:user_id/api-keys",
            post(routes::users::create_api_key),
        )
        .route(
            "/api/users/:user_id/api-keys",
            get(routes::users::list_api_keys),
        )
        .route(
            "/api/users/:user_id/api-keys/:key_id",
            delete(routes::users::revoke_api_key),
        )
        // OAuth endpoints
        .route("/api/oauth/providers", get(routes::oauth::list_providers))
        .route(
            "/api/oauth/:provider/authorize",
            get(routes::oauth::initiate_oauth),
        )
        .route(
            "/api/oauth/:provider/callback",
            get(routes::oauth::oauth_callback),
        )
        .route(
            "/api/oauth/connections",
            get(routes::oauth::list_connections),
        )
        .route(
            "/api/oauth/connections/:connection_id",
            delete(routes::oauth::disconnect_connection),
        )
        .route(
            "/api/oauth/connections/:connection_id/destination",
            get(routes::oauth::get_stream_destination),
        )
        // Tier endpoints
        .route(
            "/api/users/:user_id/tier",
            get(routes::tiers::get_user_tier),
        )
        .route(
            "/api/users/:user_id/tier/validate",
            post(routes::tiers::validate_tier_action),
        )
        .route(
            "/api/users/:user_id/tier/upgrade-options",
            get(routes::tiers::get_upgrade_options),
        )
        // Session endpoints (single-session management)
        .route(
            "/api/sessions/register",
            post(routes::sessions::register_session),
        )
        .route(
            "/api/sessions/:session_id/release",
            post(routes::sessions::release_session),
        )
        .route(
            "/api/sessions/:session_id/heartbeat",
            post(routes::sessions::session_heartbeat),
        )
        .route(
            "/api/users/:user_id/session",
            get(routes::sessions::get_user_session),
        )
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    // Start server
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.port)).await?;
    info!("Core service listening on {}", listener.local_addr()?);

    axum::serve(listener, app).await?;

    Ok(())
}
