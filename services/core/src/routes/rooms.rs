//! Room management endpoints

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{CreateRoomRequest, Participant, Room, UpdateRoomRequest};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListRoomsQuery {
    pub owner_id: Uuid,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct RoomListResponse {
    pub rooms: Vec<Room>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Create a new room
pub async fn create_room(
    State(state): State<AppState>,
    Json(req): Json<CreateRoomRequest>,
) -> Result<(StatusCode, Json<Room>), (StatusCode, Json<ErrorResponse>)> {
    match state.db.create_room(&req).await {
        Ok(room) => Ok((StatusCode::CREATED, Json(room))),
        Err(e) => {
            tracing::error!("Failed to create room: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create room".to_string(),
                }),
            ))
        }
    }
}

/// List rooms for a user
pub async fn list_rooms(
    State(state): State<AppState>,
    Query(query): Query<ListRoomsQuery>,
) -> Result<Json<RoomListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);

    match state.db.list_rooms(query.owner_id, limit, offset).await {
        Ok(rooms) => {
            let total = rooms.len();
            Ok(Json(RoomListResponse { rooms, total }))
        }
        Err(e) => {
            tracing::error!("Failed to list rooms: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to list rooms".to_string(),
                }),
            ))
        }
    }
}

/// Get a room by ID
pub async fn get_room(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<Room>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.get_room(room_id).await {
        Ok(Some(room)) => Ok(Json(room)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Room not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to get room: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get room".to_string(),
                }),
            ))
        }
    }
}

/// Update a room
pub async fn update_room(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<UpdateRoomRequest>,
) -> Result<Json<Room>, (StatusCode, Json<ErrorResponse>)> {
    match state.db.update_room(room_id, &req).await {
        Ok(Some(room)) => Ok(Json(room)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Room not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to update room: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update room".to_string(),
                }),
            ))
        }
    }
}

/// Delete a room
pub async fn delete_room(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    match state.db.delete_room(room_id).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Room not found".to_string(),
            }),
        )),
        Err(e) => {
            tracing::error!("Failed to delete room: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to delete room".to_string(),
                }),
            ))
        }
    }
}

/// Get participants in a room
pub async fn get_participants(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<Vec<Participant>>, (StatusCode, Json<ErrorResponse>)> {
    // First verify room exists
    match state.db.get_room(room_id).await {
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Room not found".to_string(),
                }),
            ))
        }
        Err(e) => {
            tracing::error!("Failed to get room: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get room".to_string(),
                }),
            ));
        }
        Ok(Some(_)) => {}
    }

    match state.db.get_participants(room_id).await {
        Ok(participants) => Ok(Json(participants)),
        Err(e) => {
            tracing::error!("Failed to get participants: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get participants".to_string(),
                }),
            ))
        }
    }
}
