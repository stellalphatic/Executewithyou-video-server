//! Configuration for the Storage service

use anyhow::Result;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub database_pool_size: u32,
    // S3/R2 configuration
    pub s3_endpoint: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    // Presigned URL settings
    pub presigned_url_expiry_secs: u64,
    pub max_upload_size_mb: u64,
    /// Run database migrations on startup
    pub run_migrations: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("STORAGE_PORT")
                .unwrap_or_else(|_| "8084".to_string())
                .parse()?,
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://allstrm:allstrm@localhost:5432/allstrm".to_string()
            }),
            database_pool_size: std::env::var("DATABASE_POOL_SIZE")
                .unwrap_or_else(|_| "10".to_string())
                .parse()?,
            // S3/R2 configuration
            s3_endpoint: std::env::var("S3_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:9000".to_string()),
            s3_bucket: std::env::var("S3_BUCKET")
                .unwrap_or_else(|_| "allstrm".to_string()),
            s3_region: std::env::var("S3_REGION")
                .unwrap_or_else(|_| "auto".to_string()),
            s3_access_key: std::env::var("S3_ACCESS_KEY")
                .unwrap_or_else(|_| "minioadmin".to_string()),
            s3_secret_key: std::env::var("S3_SECRET_KEY")
                .unwrap_or_else(|_| "minioadmin".to_string()),
            // Presigned URL settings
            presigned_url_expiry_secs: std::env::var("PRESIGNED_URL_EXPIRY_SECS")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()?,
            max_upload_size_mb: std::env::var("MAX_UPLOAD_SIZE_MB")
                .unwrap_or_else(|_| "500".to_string())
                .parse()?,
            run_migrations: std::env::var("RUN_MIGRATIONS")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(true),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_storage_config() {
        std::env::remove_var("STORAGE_PORT");
        std::env::remove_var("S3_BUCKET");
        std::env::remove_var("PRESIGNED_URL_EXPIRY_SECS");
        std::env::remove_var("MAX_UPLOAD_SIZE_MB");

        let config = Config::from_env().unwrap();
        assert_eq!(config.port, 8084);
        assert_eq!(config.s3_bucket, "allstrm");
        assert_eq!(config.presigned_url_expiry_secs, 3600);
        assert_eq!(config.max_upload_size_mb, 500);
    }

    #[test]
    fn test_storage_config_from_env() {
        std::env::set_var("STORAGE_PORT", "9084");
        std::env::set_var("S3_BUCKET", "test-bucket");
        std::env::set_var("PRESIGNED_URL_EXPIRY_SECS", "7200");

        let config = Config::from_env().unwrap();
        assert_eq!(config.port, 9084);
        assert_eq!(config.s3_bucket, "test-bucket");
        assert_eq!(config.presigned_url_expiry_secs, 7200);

        std::env::remove_var("STORAGE_PORT");
        std::env::remove_var("S3_BUCKET");
        std::env::remove_var("PRESIGNED_URL_EXPIRY_SECS");
    }
}
