//! Destination management endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::db::{CreateDestinationRequest, DestinationResponse, UpdateDestinationRequest};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct DestinationListResponse {
    pub destinations: Vec<DestinationResponse>,
}

/// Create a new destination for a room
pub async fn create_destination(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<CreateDestinationRequest>,
) -> Result<(StatusCode, Json<DestinationResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Verify room exists
    if state.db.get_room(room_id).await.map_err(|e| {
        tracing::error!("Failed to get room: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to verify room".to_string(),
            }),
        )
    })?.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Room not found".to_string(),
            }),
        ));
    }

    match state.db.create_destination(room_id, &req).await {
        Ok(destination) => Ok((StatusCode::CREATED, Json(destination.into()))),
        Err(e) => {
            tracing::error!("Failed to create destination: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create destination".to_string(),
                }),
            ))
        }
    }
}

/// List destinations for a room
pub async fn list_destinations(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<DestinationListResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Verify room exists
    if state.db.get_room(room_id).await.map_err(|e| {
        tracing::error!("Failed to get room: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to verify room".to_string(),
            }),
        )
    })?.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Room not found".to_string(),
            }),
        ));
    }

    match state.db.list_destinations(room_id).await {
        Ok(destinations) => Ok(Json(DestinationListResponse {
            destinations: destinations.into_iter().map(|d| d.into()).collect(),
        })),
        Err(e) => {
            tracing::error!("Failed to list destinations: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to list destinations".to_string(),
                }),
            ))
        }
    }
}

/// Get a destination by ID
pub async fn get_destination(
    State(state): State<AppState>,
    Path((_room_id, destination_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<DestinationResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.get_destination(destination_id).await {
        Ok(Some(destination)) => Ok(Json(destination.into())),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Destination not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to get destination: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get destination".to_string(),
                }),
            ))
        }
    }
}

/// Update a destination
pub async fn update_destination(
    State(state): State<AppState>,
    Path((_room_id, destination_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateDestinationRequest>,
) -> Result<Json<DestinationResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.update_destination(destination_id, &req).await {
        Ok(Some(destination)) => Ok(Json(destination.into())),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Destination not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to update destination: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update destination".to_string(),
                }),
            ))
        }
    }
}

/// Toggle destination enabled state
pub async fn toggle_destination(
    State(state): State<AppState>,
    Path((_room_id, destination_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<DestinationResponse>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.toggle_destination(destination_id).await {
        Ok(Some(destination)) => Ok(Json(destination.into())),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Destination not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to toggle destination: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to toggle destination".to_string(),
                }),
            ))
        }
    }
}

/// Delete a destination
pub async fn delete_destination(
    State(state): State<AppState>,
    Path((_room_id, destination_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state.db.delete_destination(destination_id).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Destination not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to delete destination: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to delete destination".to_string(),
                }),
            ))
        }
    }
}
