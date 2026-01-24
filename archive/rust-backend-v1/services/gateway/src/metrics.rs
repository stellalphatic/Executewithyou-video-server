//! Prometheus metrics for the gateway

use metrics::{counter, describe_counter, describe_gauge, describe_histogram, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use std::sync::OnceLock;

/// Global prometheus handle
static PROMETHEUS_HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();

/// Initialize the Prometheus metrics exporter
pub fn init_metrics() -> &'static PrometheusHandle {
    PROMETHEUS_HANDLE.get_or_init(|| {
        let handle = PrometheusBuilder::new()
            .install_recorder()
            .expect("Failed to install Prometheus recorder");

        // Describe all metrics
        describe_counter!(
            "gateway_requests_total",
            "Total number of HTTP requests processed"
        );
        describe_histogram!(
            "gateway_request_duration_seconds",
            "HTTP request duration in seconds"
        );
        describe_gauge!(
            "gateway_active_connections",
            "Number of active HTTP connections"
        );
        describe_gauge!(
            "gateway_websocket_connections",
            "Number of active WebSocket connections"
        );
        describe_counter!(
            "gateway_auth_success_total",
            "Total number of successful authentications"
        );
        describe_counter!(
            "gateway_auth_failure_total",
            "Total number of failed authentications"
        );
        describe_counter!(
            "gateway_rate_limited_total",
            "Total number of rate-limited requests"
        );

        handle
    })
}

/// Get the Prometheus handle
pub fn get_handle() -> Option<&'static PrometheusHandle> {
    PROMETHEUS_HANDLE.get()
}

/// Record a request
#[allow(dead_code)]
pub fn record_request(method: &str, path: &str, status: u16) {
    counter!(
        "gateway_requests_total",
        1,
        "method" => method.to_owned(),
        "path" => path.to_owned(),
        "status" => status.to_string()
    );
}

/// Record request duration
#[allow(dead_code)]
pub fn record_duration(method: &str, path: &str, duration_secs: f64) {
    histogram!(
        "gateway_request_duration_seconds",
        duration_secs,
        "method" => method.to_owned(),
        "path" => path.to_owned()
    );
}

/// Set active HTTP connections gauge
#[allow(dead_code)]
pub fn set_active_connections(count: f64) {
    gauge!("gateway_active_connections", count);
}

/// Increment WebSocket connections
#[allow(dead_code)]
pub fn increment_websocket_connections() {
    gauge!("gateway_websocket_connections", 1.0);
}

/// Decrement WebSocket connections
#[allow(dead_code)]
pub fn decrement_websocket_connections() {
    gauge!("gateway_websocket_connections", -1.0);
}

/// Record successful authentication
pub fn record_auth_success() {
    counter!("gateway_auth_success_total", 1);
}

/// Record failed authentication
pub fn record_auth_failure(reason: &str) {
    counter!("gateway_auth_failure_total", 1, "reason" => reason.to_owned());
}

/// Record rate limited request
pub fn record_rate_limited() {
    counter!("gateway_rate_limited_total", 1);
}
