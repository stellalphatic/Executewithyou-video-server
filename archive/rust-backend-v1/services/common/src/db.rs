//! Database utilities and migration support
//!
//! This module provides common database functionality used across services.

#[cfg(feature = "database")]
use anyhow::Result;
#[cfg(feature = "database")]
use sqlx::PgPool;
#[cfg(feature = "database")]
use std::path::Path;
#[cfg(feature = "database")]
use tracing::{info, warn};

/// Run database migrations from a directory
///
/// This function runs SQL migrations in order based on filename.
/// Files should be named like: 001_initial.sql, 002_feature.sql, etc.
///
/// # Arguments
/// * `pool` - PostgreSQL connection pool
/// * `migrations_dir` - Path to migrations directory
///
/// # Returns
/// * `Ok(usize)` - Number of migrations applied
/// * `Err` - If a migration fails
#[cfg(feature = "database")]
pub async fn run_migrations(pool: &PgPool, migrations_dir: &Path) -> Result<usize> {
    use std::fs;

    // Create migrations tracking table if it doesn't exist
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;

    // Get list of applied migrations
    let applied: Vec<String> = sqlx::query_scalar("SELECT name FROM _migrations ORDER BY id")
        .fetch_all(pool)
        .await?;

    // Read migration files
    let mut migrations: Vec<_> = fs::read_dir(migrations_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map_or(false, |ext| ext == "sql")
        })
        .collect();

    // Sort by filename
    migrations.sort_by_key(|entry| entry.file_name());

    let mut applied_count = 0;

    for entry in migrations {
        let filename = entry.file_name().to_string_lossy().to_string();

        // Skip if already applied
        if applied.contains(&filename) {
            continue;
        }

        info!("Applying migration: {}", filename);

        // Read and execute migration
        let sql = fs::read_to_string(entry.path())?;

        // Execute in a transaction
        let mut tx = pool.begin().await?;

        match sqlx::query(&sql).execute(&mut *tx).await {
            Ok(_) => {
                // Record migration
                sqlx::query("INSERT INTO _migrations (name) VALUES ($1)")
                    .bind(&filename)
                    .execute(&mut *tx)
                    .await?;

                tx.commit().await?;
                applied_count += 1;
                info!("Migration {} applied successfully", filename);
            }
            Err(e) => {
                tx.rollback().await?;
                return Err(anyhow::anyhow!(
                    "Migration {} failed: {}",
                    filename,
                    e
                ));
            }
        }
    }

    if applied_count > 0 {
        info!("Applied {} migration(s)", applied_count);
    } else {
        info!("No new migrations to apply");
    }

    Ok(applied_count)
}

/// Run migrations using SQLx's built-in migrator
///
/// This uses SQLx's compile-time migration support.
/// The migrations should be embedded using `sqlx::migrate!()` macro.
#[cfg(feature = "database")]
pub async fn run_sqlx_migrations(pool: &PgPool) -> Result<()> {
    info!("Running SQLx migrations...");

    // Use SQLx's embedded migrator
    // Note: This requires migrations to be in the expected location
    // relative to the Cargo.toml of the service
    sqlx::migrate!("../../migrations")
        .run(pool)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;

    info!("Migrations completed successfully");
    Ok(())
}

/// Check database connectivity
#[cfg(feature = "database")]
pub async fn check_connection(pool: &PgPool) -> Result<()> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .map_err(|e| anyhow::anyhow!("Database connection check failed: {}", e))?;
    Ok(())
}

/// Get database version info
#[cfg(feature = "database")]
pub async fn get_db_version(pool: &PgPool) -> Result<String> {
    let version: String = sqlx::query_scalar("SELECT version()")
        .fetch_one(pool)
        .await?;
    Ok(version)
}

/// Initialize database schemas (for microservices architecture)
#[cfg(feature = "database")]
pub async fn ensure_schemas(pool: &PgPool) -> Result<()> {
    info!("Ensuring database schemas exist...");

    sqlx::query(
        r#"
        CREATE SCHEMA IF NOT EXISTS core;
        CREATE SCHEMA IF NOT EXISTS stream;
        CREATE SCHEMA IF NOT EXISTS assets;
        "#,
    )
    .execute(pool)
    .await?;

    info!("Database schemas ready");
    Ok(())
}
