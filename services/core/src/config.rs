//! Configuration for the Core service

use anyhow::Result;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub database_pool_size: u32,
    pub redis_url: String,
    pub jwt_secret: String,
    /// Run database migrations on startup (default: true in dev, false in prod)
    pub run_migrations: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("CORE_PORT")
                .unwrap_or_else(|_| "8081".to_string())
                .parse()?,
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://allstrm:allstrm@localhost:5432/allstrm".to_string()),
            database_pool_size: std::env::var("DATABASE_POOL_SIZE")
                .unwrap_or_else(|_| "10".to_string())
                .parse()?,
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "development-secret-change-in-production".to_string()),
            run_migrations: std::env::var("RUN_MIGRATIONS")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(true), // Default to true for easier development
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        // Clear any existing env vars that might interfere
        std::env::remove_var("CORE_PORT");
        std::env::remove_var("DATABASE_URL");
        std::env::remove_var("DATABASE_POOL_SIZE");
        std::env::remove_var("REDIS_URL");
        std::env::remove_var("JWT_SECRET");
        std::env::remove_var("RUN_MIGRATIONS");

        let config = Config::from_env().unwrap();
        assert_eq!(config.port, 8081);
        assert_eq!(config.database_pool_size, 10);
        assert!(config.run_migrations);
    }

    #[test]
    fn test_config_from_env() {
        // Clear first to ensure clean state
        std::env::remove_var("CORE_PORT");
        std::env::remove_var("DATABASE_POOL_SIZE");
        std::env::remove_var("RUN_MIGRATIONS");

        // Set test values
        std::env::set_var("CORE_PORT", "9000");
        std::env::set_var("DATABASE_POOL_SIZE", "25");
        std::env::set_var("RUN_MIGRATIONS", "false");

        let config = Config::from_env().unwrap();
        assert_eq!(config.port, 9000);
        assert_eq!(config.database_pool_size, 25);
        assert!(!config.run_migrations);

        // Cleanup
        std::env::remove_var("CORE_PORT");
        std::env::remove_var("DATABASE_POOL_SIZE");
        std::env::remove_var("RUN_MIGRATIONS");
    }
}
