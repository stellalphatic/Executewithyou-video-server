//! Server → Client message types
//!
//! These messages are sent from backend services to frontend clients.

use serde::{Deserialize, Serialize};
use crate::types::*;

/// All possible messages from server to client
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    // ============================================
    // CONNECTION RESPONSES
    // ============================================
    
    /// Join request accepted
    #[serde(rename = "JOIN_ACCEPTED")]
    JoinAccepted(JoinAcceptedPayload),
    
    /// Join request rejected
    #[serde(rename = "JOIN_REJECTED")]
    JoinRejected(JoinRejectedPayload),
    
    // ============================================
    // PARTICIPANT EVENTS
    // ============================================
    
    /// A participant joined the room
    #[serde(rename = "PARTICIPANT_JOINED")]
    ParticipantJoined(ParticipantJoinedPayload),
    
    /// A participant left the room
    #[serde(rename = "PARTICIPANT_LEFT")]
    ParticipantLeft(ParticipantLeftPayload),
    
    /// A participant's state was updated
    #[serde(rename = "PARTICIPANT_UPDATED")]
    ParticipantUpdated(ParticipantUpdatedPayload),
    
    // ============================================
    // WEBRTC SIGNALING (Forwarded)
    // ============================================
    
    /// Received an SDP offer
    #[serde(rename = "OFFER_RECEIVED")]
    OfferReceived(OfferReceivedPayload),
    
    /// Received an SDP answer
    #[serde(rename = "ANSWER_RECEIVED")]
    AnswerReceived(AnswerReceivedPayload),
    
    /// Received an ICE candidate
    #[serde(rename = "ICE_CANDIDATE_RECEIVED")]
    IceCandidateReceived(IceCandidateReceivedPayload),
    
    // ============================================
    // ROOM STATE
    // ============================================
    
    /// Room state changed
    #[serde(rename = "ROOM_STATE_UPDATE")]
    RoomStateUpdate(RoomStateUpdatePayload),
    
    /// Layout state changed (Studio mode)
    #[serde(rename = "LAYOUT_STATE_UPDATE")]
    LayoutStateUpdate(LayoutStateUpdatePayload),
    
    /// Broadcast is ready (RTMP URL available)
    #[serde(rename = "BROADCAST_READY")]
    BroadcastReady(BroadcastReadyPayload),
    
    // ============================================
    // CHAT
    // ============================================
    
    /// Chat message received
    #[serde(rename = "CHAT_MESSAGE_RECEIVED")]
    ChatMessageReceived(ChatMessageReceivedPayload),
    
    // ============================================
    // ERRORS
    // ============================================
    
    /// Error message
    #[serde(rename = "ERROR")]
    Error(ErrorPayload),
}

// ============================================
// PAYLOAD STRUCTURES
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinAcceptedPayload {
    pub participant_id: String,
    pub room: RoomInfo,
    pub participants: Vec<Participant>,
    pub ice_servers: Vec<IceServer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRejectedPayload {
    pub reason: JoinRejectedReason,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantJoinedPayload {
    pub participant: Participant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantLeftPayload {
    pub participant_id: String,
    pub reason: LeaveReason,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantUpdatedPayload {
    pub participant_id: String,
    /// Partial update - only changed fields
    pub updates: PartialParticipant,
}

/// Partial participant for updates (all fields optional)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialParticipant {
    pub display_name: Option<String>,
    pub role: Option<ParticipantRole>,
    pub is_on_stage: Option<bool>,
    pub video_enabled: Option<bool>,
    pub audio_enabled: Option<bool>,
    pub hand_raised: Option<bool>,
    pub reaction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferReceivedPayload {
    pub from_participant_id: String,
    pub sdp: String,
    pub track_types: Vec<TrackType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerReceivedPayload {
    pub from_participant_id: String,
    pub sdp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IceCandidateReceivedPayload {
    pub from_participant_id: String,
    pub candidate: String,
    pub sdp_m_line_index: u32,
    pub sdp_mid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomStateUpdatePayload {
    pub status: RoomStatus,
    pub viewer_count: Option<u32>,
    pub stream_health: Option<StreamHealth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutStateUpdatePayload {
    pub preset: LayoutPreset,
    pub sources: Vec<SourcePosition>,
    pub overlays: Vec<Overlay>,
    /// Participant ID who made the change
    pub changed_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastReadyPayload {
    pub rtmp_url: String,
    pub stream_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageReceivedPayload {
    pub id: String,
    pub from_participant_id: String,
    pub from_display_name: String,
    pub content: String,
    pub reply_to_id: Option<String>,
    /// Unix timestamp in milliseconds
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

/// Common error codes
pub mod error_codes {
    pub const INVALID_MESSAGE: &str = "INVALID_MESSAGE";
    pub const UNAUTHORIZED: &str = "UNAUTHORIZED";
    pub const FORBIDDEN: &str = "FORBIDDEN";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const RATE_LIMITED: &str = "RATE_LIMITED";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    pub const SIGNALING_ERROR: &str = "SIGNALING_ERROR";
    pub const MEDIA_ERROR: &str = "MEDIA_ERROR";
    pub const BROADCAST_ERROR: &str = "BROADCAST_ERROR";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_join_accepted_serialization() {
        let msg = ServerMessage::JoinAccepted(JoinAcceptedPayload {
            participant_id: "user-123".to_string(),
            room: RoomInfo {
                id: "room-456".to_string(),
                name: "Test Room".to_string(),
                mode: RoomMode::Meeting,
                host_id: "host-789".to_string(),
                settings: RoomSettings::default(),
            },
            participants: vec![],
            ice_servers: vec![IceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                username: None,
                credential: None,
            }],
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("JOIN_ACCEPTED"));
        assert!(json.contains("user-123"));
        assert!(json.contains("room-456"));

        let parsed: ServerMessage = serde_json::from_str(&json).unwrap();
        match parsed {
            ServerMessage::JoinAccepted(payload) => {
                assert_eq!(payload.participant_id, "user-123");
                assert_eq!(payload.room.name, "Test Room");
            }
            _ => panic!("Expected JoinAccepted"),
        }
    }

    #[test]
    fn test_error_serialization() {
        let msg = ServerMessage::Error(ErrorPayload {
            code: error_codes::UNAUTHORIZED.to_string(),
            message: "Invalid token".to_string(),
            details: None,
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("ERROR"));
        assert!(json.contains("UNAUTHORIZED"));
    }
}
