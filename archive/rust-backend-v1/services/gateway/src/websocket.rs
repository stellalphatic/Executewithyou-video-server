//! WebSocket connection handling and routing
//!
//! Handles WebSocket connections from clients and forwards signaling
//! messages to the SFU service for WebRTC negotiation.

use axum::extract::ws::{Message, WebSocket};
use axum::{
    extract::{Query, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::{auth, AppState};
use allstrm_protocol::{server::*, ClientMessage, ServerMessage};

/// WebSocket connection query parameters
#[derive(Debug, Deserialize)]
pub struct WsQuery {
    /// JWT token for authentication
    pub token: String,
    /// Room ID to join
    pub room_id: String,
    /// Mode: "meeting" or "studio"
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_mode() -> String {
    "meeting".to_string()
}

/// SFU API response types
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SfuJoinResponse {
    success: bool,
    participant_id: String,
    ice_servers: Vec<allstrm_protocol::IceServer>,
    existing_participants: Vec<allstrm_protocol::Participant>,
    #[serde(default)]
    available_tracks: Vec<SfuTrackInfo>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SfuTrackInfo {
    track_id: String,
    participant_id: String,
    kind: String,
    codec: String,
}

#[derive(Debug, Deserialize)]
struct SfuOfferResponse {
    success: bool,
    sdp: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SfuGenericResponse {
    success: bool,
    error: Option<String>,
}

/// Client for communicating with the SFU service
struct SfuClient {
    http_client: reqwest::Client,
    base_url: String,
}

impl SfuClient {
    fn new(http_client: reqwest::Client, base_url: String) -> Self {
        Self {
            http_client,
            base_url,
        }
    }

    async fn join_room(
        &self,
        room_id: &str,
        participant_id: &str,
        display_name: &str,
        role: &str,
        mode: &str,
    ) -> Result<SfuJoinResponse, reqwest::Error> {
        let url = format!("{}/api/v1/rooms/{}/join", self.base_url, room_id);

        self.http_client
            .post(&url)
            .json(&serde_json::json!({
                "participant_id": participant_id,
                "display_name": display_name,
                "role": role,
                "mode": mode
            }))
            .send()
            .await?
            .json()
            .await
    }

    async fn send_offer(
        &self,
        room_id: &str,
        participant_id: &str,
        sdp: &str,
    ) -> Result<SfuOfferResponse, reqwest::Error> {
        let url = format!("{}/api/v1/rooms/{}/offer", self.base_url, room_id);

        self.http_client
            .post(&url)
            .json(&serde_json::json!({
                "participant_id": participant_id,
                "sdp": sdp,
                "track_types": []
            }))
            .send()
            .await?
            .json()
            .await
    }

    async fn send_answer(
        &self,
        room_id: &str,
        participant_id: &str,
        sdp: &str,
    ) -> Result<SfuGenericResponse, reqwest::Error> {
        let url = format!("{}/api/v1/rooms/{}/answer", self.base_url, room_id);

        self.http_client
            .post(&url)
            .json(&serde_json::json!({
                "participant_id": participant_id,
                "sdp": sdp
            }))
            .send()
            .await?
            .json()
            .await
    }

    async fn send_ice_candidate(
        &self,
        room_id: &str,
        participant_id: &str,
        candidate: &str,
        sdp_m_line_index: Option<u32>,
        sdp_mid: Option<&str>,
    ) -> Result<SfuGenericResponse, reqwest::Error> {
        let url = format!("{}/api/v1/rooms/{}/ice", self.base_url, room_id);

        self.http_client
            .post(&url)
            .json(&serde_json::json!({
                "participant_id": participant_id,
                "candidate": candidate,
                "sdp_m_line_index": sdp_m_line_index,
                "sdp_mid": sdp_mid
            }))
            .send()
            .await?
            .json()
            .await
    }

    async fn leave_room(
        &self,
        room_id: &str,
        participant_id: &str,
    ) -> Result<SfuGenericResponse, reqwest::Error> {
        let url = format!("{}/api/v1/rooms/{}/leave", self.base_url, room_id);

        self.http_client
            .post(&url)
            .json(&serde_json::json!({
                "participant_id": participant_id
            }))
            .send()
            .await?
            .json()
            .await
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Validate JWT token
    let claims = match auth::validate_token(&query.token, &state.config) {
        Ok(claims) => claims,
        Err(e) => {
            warn!("Invalid JWT token: {}", e);
            return axum::http::StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let user_id = claims.sub.clone();
    let room_id = query.room_id.clone();
    let mode = query.mode.clone();

    info!(
        user_id = %user_id,
        room_id = %room_id,
        mode = %mode,
        "WebSocket connection accepted"
    );

    // Upgrade to WebSocket
    ws.on_upgrade(move |socket| handle_socket(socket, state, user_id, room_id, mode))
}

/// Handle the WebSocket connection
async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    user_id: String,
    room_id: String,
    mode: String,
) {
    let (mut sender, mut receiver) = socket.split();

    // Create channels for bidirectional communication
    let (tx, mut rx) = mpsc::channel::<ServerMessage>(100);

    // Create SFU client
    let sfu_client = SfuClient::new(
        state.http_client.clone(),
        state.config.sfu_service_url.clone(),
    );

    // Generate participant ID
    let participant_id = format!(
        "part_{}",
        uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string()
    );

    debug!(
        sfu_url = %state.config.sfu_service_url,
        participant_id = %participant_id,
        "Routing WebSocket to SFU service"
    );

    // Task to send messages to client
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match serde_json::to_string(&msg) {
                Ok(json) => {
                    if sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Failed to serialize message: {}", e);
                }
            }
        }
    });

    // Join the room via SFU
    let join_response = sfu_client
        .join_room(&room_id, &participant_id, &user_id, "guest", &mode)
        .await;

    match join_response {
        Ok(response) if response.success => {
            info!(
                participant_id = %participant_id,
                existing_participants = response.existing_participants.len(),
                "Joined SFU room successfully"
            );

            // Send JOIN_ACCEPTED to client
            let connected_msg = ServerMessage::JoinAccepted(JoinAcceptedPayload {
                participant_id: participant_id.clone(),
                room: allstrm_protocol::RoomInfo {
                    id: room_id.clone(),
                    name: format!("Room {}", &room_id[..8.min(room_id.len())]),
                    mode: if mode == "studio" {
                        allstrm_protocol::RoomMode::Studio
                    } else {
                        allstrm_protocol::RoomMode::Meeting
                    },
                    host_id: user_id.clone(),
                    settings: allstrm_protocol::RoomSettings::default(),
                },
                participants: response.existing_participants,
                ice_servers: response.ice_servers,
            });

            if tx.send(connected_msg).await.is_err() {
                error!("Failed to send connection acknowledgment");
                return;
            }
        }
        Ok(_response) => {
            error!("Failed to join SFU room: room may be full");
            let error_msg = ServerMessage::JoinRejected(JoinRejectedPayload {
                reason: allstrm_protocol::JoinRejectedReason::RoomFull,
                message: "Room is full or join failed".to_string(),
            });
            let _ = tx.send(error_msg).await;
            return;
        }
        Err(e) => {
            error!("Failed to connect to SFU service: {}", e);
            let error_msg = ServerMessage::Error(ErrorPayload {
                code: "SFU_ERROR".to_string(),
                message: format!("Failed to connect to signaling server: {}", e),
                details: None,
            });
            let _ = tx.send(error_msg).await;
            return;
        }
    }

    // Message handling loop
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Skip empty messages and pings
                let trimmed = text.trim();
                if trimmed.is_empty() || trimmed == "ping" || trimmed == "pong" {
                    debug!("Received heartbeat: {}", trimmed);
                    continue;
                }

                debug!("Received message: {}", text);

                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        // Handle the message
                        if let Some(response) = handle_client_message(
                            &client_msg,
                            &user_id,
                            &participant_id,
                            &room_id,
                            &mode,
                            &state,
                            &sfu_client,
                        )
                        .await
                        {
                            if tx.send(response).await.is_err() {
                                error!("Failed to send response");
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Invalid message format: {}", e);
                        let error_msg = ServerMessage::Error(ErrorPayload {
                            code: "INVALID_MESSAGE".to_string(),
                            message: format!("Invalid message format: {}", e),
                            details: None,
                        });
                        let _ = tx.send(error_msg).await;
                    }
                }
            }
            Ok(Message::Binary(_)) => {
                debug!("Received binary message (ignoring)");
            }
            Ok(Message::Ping(_)) => {
                debug!("Received ping");
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => {
                info!("WebSocket connection closed by client");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
        }
    }

    // Leave the room via SFU
    if let Err(e) = sfu_client.leave_room(&room_id, &participant_id).await {
        warn!("Failed to leave SFU room: {}", e);
    }

    // Cleanup
    drop(tx);
    send_task.abort();

    info!(
        user_id = %user_id,
        room_id = %room_id,
        participant_id = %participant_id,
        "WebSocket connection ended"
    );
}

/// Handle a client message and return an optional response
async fn handle_client_message(
    msg: &ClientMessage,
    user_id: &str,
    participant_id: &str,
    room_id: &str,
    _mode: &str,
    state: &AppState,
    sfu_client: &SfuClient,
) -> Option<ServerMessage> {
    match msg {
        ClientMessage::JoinRequest(payload) => {
            info!(
                display_name = %payload.display_name,
                role = ?payload.role,
                "Processing join request (already joined)"
            );
            // Already joined on connect, just acknowledge
            None
        }

        ClientMessage::LeaveRequest(_) => {
            info!(participant_id = %participant_id, "User leaving room");
            // Leave handled on disconnect
            None
        }

        ClientMessage::Offer(payload) => {
            debug!(
                participant_id = %participant_id,
                "Forwarding SDP offer to SFU"
            );

            match sfu_client
                .send_offer(room_id, participant_id, &payload.sdp)
                .await
            {
                Ok(response) if response.success => {
                    if let Some(sdp) = response.sdp {
                        Some(ServerMessage::AnswerReceived(AnswerReceivedPayload {
                            from_participant_id: "sfu".to_string(),
                            sdp,
                        }))
                    } else {
                        Some(ServerMessage::Error(ErrorPayload {
                            code: "SFU_ERROR".to_string(),
                            message: "SFU returned no SDP answer".to_string(),
                            details: None,
                        }))
                    }
                }
                Ok(response) => Some(ServerMessage::Error(ErrorPayload {
                    code: "SFU_ERROR".to_string(),
                    message: response
                        .error
                        .unwrap_or_else(|| "Unknown SFU error".to_string()),
                    details: None,
                })),
                Err(e) => Some(ServerMessage::Error(ErrorPayload {
                    code: "SFU_ERROR".to_string(),
                    message: format!("Failed to contact SFU: {}", e),
                    details: None,
                })),
            }
        }

        ClientMessage::Answer(payload) => {
            debug!(
                participant_id = %participant_id,
                "Forwarding SDP answer to SFU"
            );

            match sfu_client
                .send_answer(room_id, participant_id, &payload.sdp)
                .await
            {
                Ok(response) if response.success => None,
                Ok(response) => Some(ServerMessage::Error(ErrorPayload {
                    code: "SFU_ERROR".to_string(),
                    message: response
                        .error
                        .unwrap_or_else(|| "Unknown SFU error".to_string()),
                    details: None,
                })),
                Err(e) => {
                    warn!("Failed to forward answer to SFU: {}", e);
                    None // Non-critical error
                }
            }
        }

        ClientMessage::IceCandidate(payload) => {
            debug!(
                participant_id = %participant_id,
                "Forwarding ICE candidate to SFU"
            );

            match sfu_client
                .send_ice_candidate(
                    room_id,
                    participant_id,
                    &payload.candidate,
                    Some(payload.sdp_m_line_index),
                    Some(&payload.sdp_mid),
                )
                .await
            {
                Ok(_) => None, // ICE candidates don't need acknowledgment
                Err(e) => {
                    warn!("Failed to forward ICE candidate to SFU: {}", e);
                    None // Non-critical error
                }
            }
        }

        ClientMessage::ParticipantUpdate(payload) => {
            debug!(
                video = ?payload.video_enabled,
                audio = ?payload.audio_enabled,
                "Participant state update"
            );

            // Broadcast to other participants
            Some(ServerMessage::ParticipantUpdated(
                ParticipantUpdatedPayload {
                    participant_id: participant_id.to_string(),
                    updates: PartialParticipant {
                        display_name: payload.display_name.clone(),
                        role: None,
                        is_on_stage: None,
                        video_enabled: payload.video_enabled,
                        audio_enabled: payload.audio_enabled,
                        hand_raised: payload.hand_raised,
                        reaction: payload.reaction.clone(),
                    },
                },
            ))
        }

        ClientMessage::MediaStateUpdate(payload) => {
            debug!(
                active_speaker = ?payload.active_speaker_id,
                "Media state update"
            );
            None
        }

        ClientMessage::LayoutUpdate(payload) => {
            debug!(
                preset = ?payload.preset,
                "Layout update (studio mode)"
            );

            Some(ServerMessage::LayoutStateUpdate(LayoutStateUpdatePayload {
                preset: payload.preset,
                sources: payload.sources.clone().unwrap_or_default(),
                overlays: payload.overlays.clone().unwrap_or_default(),
                changed_by: participant_id.to_string(),
            }))
        }

        ClientMessage::BroadcastControl(payload) => {
            info!(
                action = ?payload.action,
                "Broadcast control request"
            );

            match payload.action {
                allstrm_protocol::BroadcastAction::Start => {
                    // Generate stream key and notify client
                    let stream_key =
                        format!("sk_{}", uuid::Uuid::new_v4().to_string().replace("-", ""));

                    Some(ServerMessage::BroadcastReady(BroadcastReadyPayload {
                        rtmp_url: format!(
                            "rtmp://{}/live",
                            state
                                .config
                                .stream_service_url
                                .replace("http://", "")
                                .replace(":8083", ":1935")
                        ),
                        stream_key,
                    }))
                }
                _ => None,
            }
        }

        ClientMessage::StageControl(payload) => {
            info!(
                participant = %payload.participant_id,
                action = ?payload.action,
                "Stage control request"
            );

            let is_on_stage = matches!(payload.action, allstrm_protocol::StageAction::BringOnStage);

            Some(ServerMessage::ParticipantUpdated(
                ParticipantUpdatedPayload {
                    participant_id: payload.participant_id.clone(),
                    updates: PartialParticipant {
                        display_name: None,
                        role: None,
                        is_on_stage: Some(is_on_stage),
                        video_enabled: None,
                        audio_enabled: None,
                        hand_raised: None,
                        reaction: None,
                    },
                },
            ))
        }

        ClientMessage::ChatMessage(payload) => {
            debug!(content_len = payload.content.len(), "Chat message received");

            Some(ServerMessage::ChatMessageReceived(
                ChatMessageReceivedPayload {
                    id: format!(
                        "msg_{}",
                        uuid::Uuid::new_v4().to_string().replace("-", "")[..16].to_string()
                    ),
                    from_participant_id: participant_id.to_string(),
                    from_display_name: user_id.to_string(),
                    content: payload.content.clone(),
                    reply_to_id: payload.reply_to_id.clone(),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                },
            ))
        }

        ClientMessage::RecordingControl(payload) => {
            info!(
                action = ?payload.action,
                mode = ?payload.mode,
                "Recording control request"
            );

            Some(ServerMessage::RoomStateUpdate(RoomStateUpdatePayload {
                status: match payload.action {
                    allstrm_protocol::RecordingAction::Start => {
                        allstrm_protocol::RoomStatus::Recording
                    }
                    allstrm_protocol::RecordingAction::Stop => allstrm_protocol::RoomStatus::Idle,
                },
                viewer_count: None,
                stream_health: None,
            }))
        }
    }
}
