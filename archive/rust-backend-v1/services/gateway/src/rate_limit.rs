//! Rate limiting middleware

use axum::{
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter as GovRateLimiter,
};
use serde::Serialize;
use std::num::NonZeroU32;
use tracing::warn;

use crate::AppState;

/// Rate limiter wrapper
pub struct RateLimiter {
    limiter: GovRateLimiter<NotKeyed, InMemoryState, DefaultClock>,
}

impl RateLimiter {
    /// Create a new rate limiter
    pub fn new(rps: u32, burst: u32) -> Self {
        let quota = Quota::per_second(NonZeroU32::new(rps).unwrap_or(NonZeroU32::new(100).unwrap()))
            .allow_burst(NonZeroU32::new(burst).unwrap_or(NonZeroU32::new(200).unwrap()));

        Self {
            limiter: GovRateLimiter::direct(quota),
        }
    }

    /// Check if a request should be allowed
    pub fn check(&self) -> bool {
        match self.limiter.check() {
            Ok(_) => true,
            Err(_) => {
                warn!("Rate limit exceeded");
                false
            }
        }
    }
}

/// Error response for rate limiting
#[derive(Debug, Serialize)]
pub struct RateLimitError {
    pub error: String,
    pub message: String,
    pub retry_after_secs: u64,
}

/// Rate limiting middleware
///
/// Returns 429 Too Many Requests if rate limit is exceeded
pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if state.rate_limiter.check() {
        next.run(request).await
    } else {
        crate::metrics::record_rate_limited();
        (
            StatusCode::TOO_MANY_REQUESTS,
            Json(RateLimitError {
                error: "rate_limit_exceeded".to_string(),
                message: "Too many requests. Please slow down.".to_string(),
                retry_after_secs: 1,
            }),
        )
            .into_response()
    }
}
