//! WebRTC signaling handlers
//!
//! Handles SDP offer/answer exchange and ICE candidate trickle
//! for establishing WebRTC connections between participants and the SFU.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info, warn};

use allstrm_protocol::{ParticipantRole, RoomMode};
use crate::{
    room::ParticipantState,
    track_router::{TrackId, TrackKind},
    AppState,
};

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

#[derive(Debug, Deserialize)]
pub struct JoinRoomRequest {
    pub participant_id: String,
    pub display_name: String,
    pub role: String,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JoinRoomResponse {
    pub success: bool,
    pub participant_id: String,
    pub is_in_waiting_room: bool,
    pub ice_servers: Vec<allstrm_protocol::IceServer>,
    pub existing_participants: Vec<allstrm_protocol::Participant>,
    pub available_tracks: Vec<TrackInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackInfo {
    pub track_id: String,
    pub participant_id: String,
    pub kind: String,
    pub codec: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OfferRequest {
    pub participant_id: String,
    pub sdp: String,
    #[serde(default)]
    pub track_types: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AnswerResponse {
    pub success: bool,
    pub sdp: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnswerRequest {
    pub participant_id: String,
    pub sdp: String,
}

#[derive(Debug, Deserialize)]
pub struct IceCandidateRequest {
    pub participant_id: String,
    pub candidate: String,
    pub sdp_m_line_index: Option<u16>,
    pub sdp_mid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LeaveRoomRequest {
    pub participant_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub participant_id: String,
    pub target_participant_id: String,
    pub track_kind: String,
    pub track_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest {
    pub participant_id: String,
    pub target_participant_id: String,
    pub track_kind: String,
    pub track_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AdmitParticipantRequest {
    pub participant_id: String,
}

#[derive(Debug, Serialize)]
pub struct GenericResponse {
    pub success: bool,
    pub error: Option<String>,
}

impl GenericResponse {
    pub fn ok() -> Self {
        Self {
            success: true,
            error: None,
        }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(msg.into()),
        }
    }
}

// ============================================
// HANDLERS
// ============================================

/// POST /api/v1/rooms/:room_id/join - Join a room
pub async fn join_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<JoinRoomRequest>,
) -> impl IntoResponse {
    info!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        display_name = %body.display_name,
        "Participant joining room"
    );

    // Parse role
    let role = match body.role.as_str() {
        "host" => ParticipantRole::Host,
        "co_host" => ParticipantRole::CoHost,
        "guest" => ParticipantRole::Guest,
        "viewer" => ParticipantRole::Viewer,
        _ => ParticipantRole::Guest,
    };

    // Parse mode
    let mode = match body.mode.as_deref() {
        Some("studio") => RoomMode::Studio,
        _ => RoomMode::Meeting,
    };

    // Get or create room
    let room = state.room_manager.get_or_create(&room_id, mode, &body.participant_id);

    // Check max participants
    if room.participant_count() >= state.config.max_participants_per_room as usize {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "success": false,
                "error": "Room is full"
            })),
        )
            .into_response();
    }

    // Get existing participants before adding new one
    let existing_participants = room.get_all_participants();

    // Get available tracks in the room
    let available_tracks: Vec<TrackInfo> = state
        .track_router
        .get_room_tracks(&room_id)
        .into_iter()
        .map(|t| TrackInfo {
            track_id: t.track_id.track_id.clone(),
            participant_id: t.track_id.participant_id.clone(),
            kind: t.track_id.track_kind.as_str().to_string(),
            codec: t.codec,
        })
        .collect();

    // Create participant state
    let mut participant = ParticipantState::new(
        body.participant_id.clone(),
        body.display_name,
        role,
    );

    // Set waiting room status: Guests enter waiting room by default in both meeting and studio modes
    // This allows hosts to control who joins the session
    if role == ParticipantRole::Guest {
        participant.info.is_in_waiting_room = true;
    }
    
    let is_in_waiting_room = participant.info.is_in_waiting_room;
    
    info!(
        "Participant {} joining as {:?} (waiting room: {})", 
        body.participant_id, 
        role, 
        is_in_waiting_room
    );

    // Add to room
    room.add_participant(participant);

    // Return response with ICE servers and available tracks
    let response = JoinRoomResponse {
        success: true,
        participant_id: body.participant_id,
        is_in_waiting_room,
        ice_servers: state.config.ice_servers(),
        existing_participants,
        available_tracks,
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// POST /api/v1/rooms/:room_id/offer - Handle SDP offer
pub async fn handle_offer(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<OfferRequest>,
) -> impl IntoResponse {
    debug!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        "Handling SDP offer"
    );

    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(AnswerResponse {
                    success: false,
                    sdp: None,
                    error: Some("Room not found".to_string()),
                }),
            )
                .into_response();
        }
    };

    // Verify participant is in room
    if room.get_participant(&body.participant_id).is_none() {
        return (
            StatusCode::FORBIDDEN,
            Json(AnswerResponse {
                success: false,
                sdp: None,
                error: Some("Participant not in room".to_string()),
            }),
        )
            .into_response();
    }

    // Handle the offer using the peer connection manager
    match state
        .peer_manager
        .handle_offer(
            &body.participant_id,
            &room_id,
            &body.sdp,
            state.track_router.clone(),
        )
        .await
    {
        Ok(answer_sdp) => {
            info!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                "SDP offer handled successfully"
            );

            (
                StatusCode::OK,
                Json(AnswerResponse {
                    success: true,
                    sdp: Some(answer_sdp),
                    error: None,
                }),
            )
                .into_response()
        }
        Err(e) => {
            error!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                error = %e,
                "Failed to handle SDP offer"
            );

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AnswerResponse {
                    success: false,
                    sdp: None,
                    error: Some(format!("Failed to create answer: {}", e)),
                }),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/rooms/:room_id/answer - Handle SDP answer
pub async fn handle_answer(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<AnswerRequest>,
) -> impl IntoResponse {
    debug!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        "Handling SDP answer"
    );

    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Room not found")),
            )
                .into_response();
        }
    };

    // Verify participant is in room
    if room.get_participant(&body.participant_id).is_none() {
        return (
            StatusCode::FORBIDDEN,
            Json(GenericResponse::err("Participant not in room")),
        )
            .into_response();
    }

    // Process the SDP answer
    match state
        .peer_manager
        .handle_answer(&body.participant_id, &body.sdp)
        .await
    {
        Ok(()) => {
            info!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                "SDP answer processed"
            );
            (StatusCode::OK, Json(GenericResponse::ok())).into_response()
        }
        Err(e) => {
            error!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                error = %e,
                "Failed to process SDP answer"
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(GenericResponse::err(format!("Failed to process answer: {}", e))),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/rooms/:room_id/ice - Handle ICE candidate
pub async fn handle_ice_candidate(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<IceCandidateRequest>,
) -> impl IntoResponse {
    debug!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        "Handling ICE candidate"
    );

    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Room not found")),
            )
                .into_response();
        }
    };

    // Verify participant is in room
    if room.get_participant(&body.participant_id).is_none() {
        return (
            StatusCode::FORBIDDEN,
            Json(GenericResponse::err("Participant not in room")),
        )
            .into_response();
    }

    // Add ICE candidate to peer connection
    match state
        .peer_manager
        .add_ice_candidate(
            &body.participant_id,
            &body.candidate,
            body.sdp_m_line_index,
            body.sdp_mid.as_deref(),
        )
        .await
    {
        Ok(()) => {
            debug!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                "ICE candidate added"
            );
            (StatusCode::OK, Json(GenericResponse::ok())).into_response()
        }
        Err(e) => {
            // ICE candidate errors are often not critical (e.g., candidate arrives before offer)
            warn!(
                room_id = %room_id,
                participant_id = %body.participant_id,
                error = %e,
                "Failed to add ICE candidate"
            );
            (
                StatusCode::OK, // Return OK anyway - ICE failures are handled by WebRTC
                Json(GenericResponse::ok()),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/rooms/:room_id/leave - Leave a room
pub async fn leave_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<LeaveRoomRequest>,
) -> impl IntoResponse {
    info!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        "Participant leaving room"
    );

    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Room not found")),
            )
                .into_response();
        }
    };

    // Remove participant
    room.remove_participant(&body.participant_id);

    // Close peer connection
    if let Err(e) = state.peer_manager.close_peer_connection(&body.participant_id).await {
        warn!(
            participant_id = %body.participant_id,
            error = %e,
            "Failed to close peer connection"
        );
    }

    // Unpublish all tracks from this participant
    state.track_router.unpublish_all(&room_id, &body.participant_id);

    // Unsubscribe from all tracks
    state.track_router.unsubscribe_all(&body.participant_id);

    // Clean up empty rooms
    if room.participant_count() == 0 {
        state.room_manager.remove(&room_id);
    }

    (StatusCode::OK, Json(GenericResponse::ok())).into_response()
}

/// GET /api/v1/rooms/:room_id/participants - Get room participants
pub async fn get_participants(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> impl IntoResponse {
    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "success": false,
                    "error": "Room not found"
                })),
            )
                .into_response();
        }
    };

    let participants = room.get_all_participants();

    // Also get track information for each participant
    let participant_tracks: Vec<_> = participants
        .iter()
        .map(|p| {
            let tracks = state.track_router.get_participant_tracks(&room_id, &p.id);
            serde_json::json!({
                "participant": p,
                "tracks": tracks.iter().map(|t| TrackInfo {
                    track_id: t.track_id.track_id.clone(),
                    participant_id: t.track_id.participant_id.clone(),
                    kind: t.track_id.track_kind.as_str().to_string(),
                    codec: t.codec.clone(),
                }).collect::<Vec<_>>()
            })
        })
        .collect();

    info!("Returning {} participants for room {}", participants.len(), room_id);
    for p in &participants {
        info!("Participant: {} (waiting: {})", p.display_name, p.is_in_waiting_room);
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "participants": participant_tracks
        })),
    )
        .into_response()
}

/// GET /api/v1/rooms/:room_id/waiting-participants - Get waiting room participants
pub async fn get_waiting_participants(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> impl IntoResponse {
    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
             return (
                 StatusCode::NOT_FOUND,
                 Json(serde_json::json!({
                     "success": false,
                     "error": "Room not found"
                 })),
             )
                 .into_response();
        }
    };

    // Filter only participants in waiting room
    let waiting_participants: Vec<_> = room.get_all_participants()
        .into_iter()
        .filter(|p| p.is_in_waiting_room)
        .collect();
    
    info!("Returning {} waiting participants for room {}", waiting_participants.len(), room_id);

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "participants": waiting_participants
        })),
    )
        .into_response()
}

/// POST /api/v1/rooms/:room_id/subscribe - Subscribe to a track
pub async fn subscribe_to_track(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<SubscribeRequest>,
) -> impl IntoResponse {
    debug!(
        room_id = %room_id,
        subscriber = %body.participant_id,
        target = %body.target_participant_id,
        track_kind = %body.track_kind,
        "Subscribe to track request"
    );

    // Verify subscriber is in room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Room not found")),
            )
                .into_response();
        }
    };

    if room.get_participant(&body.participant_id).is_none() {
        return (
            StatusCode::FORBIDDEN,
            Json(GenericResponse::err("Subscriber not in room")),
        )
            .into_response();
    }

    // Parse track kind
    let kind = match body.track_kind.as_str() {
        "audio" => TrackKind::Audio,
        "video" => TrackKind::Video,
        "screen" => TrackKind::Screen,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(GenericResponse::err("Invalid track kind")),
            )
                .into_response();
        }
    };

    // Create track ID
    let track_id = TrackId::new(&room_id, &body.target_participant_id, kind, &body.track_id);

    // Subscribe to the track
    match state.track_router.subscribe(&body.participant_id, &track_id) {
        Some(_receiver) => {
            info!(
                subscriber = %body.participant_id,
                track = %track_id.key(),
                "Subscribed to track"
            );
            (StatusCode::OK, Json(GenericResponse::ok())).into_response()
        }
        None => {
            warn!(
                subscriber = %body.participant_id,
                track = %track_id.key(),
                "Track not found for subscription"
            );
            (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Track not found")),
            )
                .into_response()
        }
    }
}

/// POST /api/v1/rooms/:room_id/unsubscribe - Unsubscribe from a track
pub async fn unsubscribe_from_track(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<UnsubscribeRequest>,
) -> impl IntoResponse {
    debug!(
        room_id = %room_id,
        subscriber = %body.participant_id,
        target = %body.target_participant_id,
        track_kind = %body.track_kind,
        "Unsubscribe from track request"
    );

    // Parse track kind
    let kind = match body.track_kind.as_str() {
        "audio" => TrackKind::Audio,
        "video" => TrackKind::Video,
        "screen" => TrackKind::Screen,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(GenericResponse::err("Invalid track kind")),
            )
                .into_response();
        }
    };

    // Create track ID
    let track_id = TrackId::new(&room_id, &body.target_participant_id, kind, &body.track_id);

    // Unsubscribe from the track
    state.track_router.unsubscribe(&body.participant_id, &track_id);

    info!(
        subscriber = %body.participant_id,
        track = %track_id.key(),
        "Unsubscribed from track"
    );

    (StatusCode::OK, Json(GenericResponse::ok())).into_response()
}

/// POST /api/v1/rooms/:room_id/admit - Admit a participant from waiting room
pub async fn admit_participant(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Json(body): Json<AdmitParticipantRequest>,
) -> impl IntoResponse {
    info!(
        room_id = %room_id,
        participant_id = %body.participant_id,
        "Admitting participant from waiting room"
    );

    // Get the room
    let room = match state.room_manager.get(&room_id) {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(GenericResponse::err("Room not found")),
            )
                .into_response();
        }
    };

    // Update participant state
    // Update participant state
    let result = if let Some(mut p) = room.participants.get_mut(&body.participant_id) {
        p.info.is_in_waiting_room = false;
        true
    } else {
        false
    };

    if result {
        info!(
            room_id = %room_id,
            participant_id = %body.participant_id,
            "Participant admitted successfully"
        );
        (StatusCode::OK, Json(GenericResponse::ok())).into_response()
    } else {
        warn!(
            room_id = %room_id,
            participant_id = %body.participant_id,
            "Failed to admit participant: not found"
        );
        (
            StatusCode::NOT_FOUND,
            Json(GenericResponse::err("Participant not found")),
        )
            .into_response()
    }
}
