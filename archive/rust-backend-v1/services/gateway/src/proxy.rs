//! HTTP proxy for service-to-service communication

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use tracing::{debug, error};

/// Proxy a JSON request to an internal service
pub async fn proxy_json<T: Serialize>(
    client: &Client,
    target_url: &str,
    method: &str,
    body: Option<&T>,
) -> Result<Response, anyhow::Error> {
    debug!(url = %target_url, method = %method, "Proxying request");

    let request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(target_url),
        "POST" => client.post(target_url),
        "PUT" => client.put(target_url),
        "PATCH" => client.patch(target_url),
        "DELETE" => client.delete(target_url),
        _ => {
            return Ok((
                StatusCode::METHOD_NOT_ALLOWED,
                Json(serde_json::json!({ "error": "Method not allowed" })),
            )
                .into_response())
        }
    };

    let request_builder = request_builder.header("Content-Type", "application/json");

    let request_builder = if let Some(body) = body {
        request_builder.json(body)
    } else {
        request_builder
    };

    match request_builder.send().await {
        Ok(response) => {
            let status = StatusCode::from_u16(response.status().as_u16())
                .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

            match response.json::<Value>().await {
                Ok(json) => Ok((status, Json(json)).into_response()),
                Err(e) => {
                    error!("Failed to parse response: {}", e);
                    Ok((
                        StatusCode::BAD_GATEWAY,
                        Json(serde_json::json!({ "error": "Invalid response from service" })),
                    )
                        .into_response())
                }
            }
        }
        Err(e) => {
            error!("Proxy request failed: {}", e);
            Ok((
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("Service unavailable: {}", e) })),
            )
                .into_response())
        }
    }
}

/// Check if a service is healthy
#[allow(dead_code)]
pub async fn check_service_health(client: &Client, service_url: &str) -> bool {
    let health_url = format!("{}/health", service_url);

    match client.get(&health_url).send().await {
        Ok(response) => response.status().is_success(),
        Err(e) => {
            debug!("Health check failed for {}: {}", service_url, e);
            false
        }
    }
}
