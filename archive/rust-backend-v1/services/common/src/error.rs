//! Common error types

use thiserror::Error;

/// Common error type for all services
#[derive(Debug, Error)]
pub enum Error {
    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Not authorized: {0}")]
    Forbidden(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Rate limited")]
    RateLimited,

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Redis error: {0}")]
    Redis(String),

    #[error("Signaling error: {0}")]
    Signaling(String),

    #[error("Media error: {0}")]
    Media(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Result type using common Error
pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    /// Get HTTP status code for this error
    pub fn status_code(&self) -> u16 {
        match self {
            Error::Auth(_) => 401,
            Error::Forbidden(_) => 403,
            Error::NotFound(_) => 404,
            Error::Validation(_) => 400,
            Error::RateLimited => 429,
            Error::Internal(_) => 500,
            Error::Database(_) => 500,
            Error::Redis(_) => 500,
            Error::Signaling(_) => 500,
            Error::Media(_) => 500,
            Error::Serialization(_) => 400,
            Error::Io(_) => 500,
        }
    }

    /// Get error code string
    pub fn code(&self) -> &'static str {
        match self {
            Error::Auth(_) => "UNAUTHORIZED",
            Error::Forbidden(_) => "FORBIDDEN",
            Error::NotFound(_) => "NOT_FOUND",
            Error::Validation(_) => "VALIDATION_ERROR",
            Error::RateLimited => "RATE_LIMITED",
            Error::Internal(_) => "INTERNAL_ERROR",
            Error::Database(_) => "DATABASE_ERROR",
            Error::Redis(_) => "REDIS_ERROR",
            Error::Signaling(_) => "SIGNALING_ERROR",
            Error::Media(_) => "MEDIA_ERROR",
            Error::Serialization(_) => "SERIALIZATION_ERROR",
            Error::Io(_) => "IO_ERROR",
        }
    }
}
