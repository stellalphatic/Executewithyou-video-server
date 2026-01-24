//! Route handlers for the gateway

pub mod destinations;
pub mod recordings;
pub mod rooms;
pub mod signaling;
pub mod upload;

use axum::{
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};

/// Health check endpoint
pub async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "allstrm-gateway",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// Prometheus metrics endpoint
pub async fn metrics_handler() -> impl IntoResponse {
    match crate::metrics::get_handle() {
        Some(handle) => {
            let metrics = handle.render();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
                metrics,
            )
                .into_response()
        }
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Metrics not initialized",
        )
            .into_response(),
    }
}
