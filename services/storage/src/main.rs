//! ALLSTRM Storage Service
//!
//! Handles recording management, presigned URLs for uploads/downloads,
//! and integration with Cloudflare R2 (S3-compatible storage).

use anyhow::Result;
use aws_sdk_s3::Client as S3Client;
use axum::{
    routing::{delete, get, post},
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
mod routes;
mod s3;

pub use config::Config;
pub use db::Database;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub s3_client: S3Client,
    pub config: Config,
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

    info!("Starting ALLSTRM Storage Service on port {}", config.port);

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

    // Initialize S3/R2 client
    let s3_client = s3::create_s3_client(&config).await?;
    info!("Connected to S3/R2 storage");

    // Create database wrapper
    let db = Arc::new(Database::new(pool));

    // Build application state
    let state = AppState {
        db,
        s3_client,
        config: config.clone(),
    };

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(routes::health::health_check))
        // Presigned URL endpoints
        .route(
            "/api/upload/presign",
            post(routes::upload::get_upload_presigned_url),
        )
        .route(
            "/api/upload/complete",
            post(routes::upload::complete_upload),
        )
        .route(
            "/api/download/presign",
            post(routes::download::get_download_presigned_url),
        )
        // Recording management
        .route(
            "/api/recordings",
            post(routes::recordings::create_recording),
        )
        .route(
            "/api/recordings/:recording_id",
            get(routes::recordings::get_recording),
        )
        .route(
            "/api/recordings/:recording_id",
            delete(routes::recordings::delete_recording),
        )
        .route(
            "/api/rooms/:room_id/recordings",
            get(routes::recordings::list_recordings),
        )
        .route(
            "/api/recordings/:recording_id/status",
            post(routes::recordings::update_status),
        )
        // Asset management
        .route("/api/assets", post(routes::assets::create_asset))
        .route("/api/assets/:asset_id", get(routes::assets::get_asset))
        .route(
            "/api/assets/:asset_id",
            delete(routes::assets::delete_asset),
        )
        .route(
            "/api/rooms/:room_id/assets",
            get(routes::assets::list_assets),
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
    info!("Storage service listening on {}", listener.local_addr()?);

    axum::serve(listener, app).await?;

    Ok(())
}
