//! Health check endpoint

use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "storage".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
