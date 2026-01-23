//! Client → Server message types
//!
//! These messages are sent from frontend clients to the backend services.

use serde::{Deserialize, Serialize};
use crate::types::*;

/// All possible messages from client to server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    // ============================================
    // CONNECTION & ROOM
    // ============================================
    
    /// Request to join a room
    #[serde(rename = "JOIN_REQUEST")]
    JoinRequest(JoinRequestPayload),
    
    /// Request to leave the room
    #[serde(rename = "LEAVE_REQUEST")]
    LeaveRequest(LeaveRequestPayload),
    
    // ============================================
    // WEBRTC SIGNALING
    // ============================================
    
    /// WebRTC SDP offer
    #[serde(rename = "OFFER")]
    Offer(OfferPayload),
    
    /// WebRTC SDP answer
    #[serde(rename = "ANSWER")]
    Answer(AnswerPayload),
    
    /// WebRTC ICE candidate
    #[serde(rename = "ICE_CANDIDATE")]
    IceCandidate(IceCandidatePayload),
    
    // ============================================
    // PARTICIPANT STATE
    // ============================================
    
    /// Update local participant state
    #[serde(rename = "PARTICIPANT_UPDATE")]
    ParticipantUpdate(ParticipantUpdatePayload),
    
    /// Update media state (active speaker, pinned)
    #[serde(rename = "MEDIA_STATE_UPDATE")]
    MediaStateUpdate(MediaStateUpdatePayload),
    
    // ============================================
    // STUDIO MODE
    // ============================================
    
    /// Update layout configuration
    #[serde(rename = "LAYOUT_UPDATE")]
    LayoutUpdate(LayoutUpdatePayload),
    
    /// Control broadcast (start/stop/pause)
    #[serde(rename = "BROADCAST_CONTROL")]
    BroadcastControl(BroadcastControlPayload),
    
    /// Control participant staging
    #[serde(rename = "STAGE_CONTROL")]
    StageControl(StageControlPayload),
    
    // ============================================
    // CHAT
    // ============================================
    
    /// Send a chat message
    #[serde(rename = "CHAT_MESSAGE")]
    ChatMessage(ChatMessagePayload),
    
    // ============================================
    // RECORDING
    // ============================================
    
    /// Control recording
    #[serde(rename = "RECORDING_CONTROL")]
    RecordingControl(RecordingControlPayload),
}

// ============================================
// PAYLOAD STRUCTURES
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequestPayload {
    pub display_name: String,
    pub role: ParticipantRole,
    pub mode: RoomMode,
    pub media_capabilities: MediaCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveRequestPayload {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferPayload {
    /// Target participant ID, or "sfu" for SFU mode
    pub target_participant_id: String,
    pub sdp: String,
    pub track_types: Vec<TrackType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerPayload {
    pub target_participant_id: String,
    pub sdp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IceCandidatePayload {
    pub target_participant_id: String,
    pub candidate: String,
    pub sdp_m_line_index: u32,
    pub sdp_mid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantUpdatePayload {
    pub display_name: Option<String>,
    pub video_enabled: Option<bool>,
    pub audio_enabled: Option<bool>,
    pub screen_sharing: Option<bool>,
    pub hand_raised: Option<bool>,
    /// Reaction emoji or null to clear
    pub reaction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStateUpdatePayload {
    pub active_speaker_id: Option<String>,
    pub pinned_participant_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutUpdatePayload {
    pub preset: LayoutPreset,
    pub sources: Option<Vec<SourcePosition>>,
    pub overlays: Option<Vec<Overlay>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastControlPayload {
    pub action: BroadcastAction,
    /// Destination IDs to stream to
    pub destinations: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageControlPayload {
    pub participant_id: String,
    pub action: StageAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessagePayload {
    pub content: String,
    pub reply_to_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingControlPayload {
    pub action: RecordingAction,
    pub mode: RecordingMode,
    pub include_iso: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_join_request_serialization() {
        let msg = ClientMessage::JoinRequest(JoinRequestPayload {
            display_name: "Test User".to_string(),
            role: ParticipantRole::Guest,
            mode: RoomMode::Meeting,
            media_capabilities: MediaCapabilities {
                video: true,
                audio: true,
                screen_share: false,
            },
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("JOIN_REQUEST"));
        assert!(json.contains("Test User"));

        let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
        match parsed {
            ClientMessage::JoinRequest(payload) => {
                assert_eq!(payload.display_name, "Test User");
            }
            _ => panic!("Expected JoinRequest"),
        }
    }

    #[test]
    fn test_participant_update_serialization() {
        let msg = ClientMessage::ParticipantUpdate(ParticipantUpdatePayload {
            display_name: None,
            video_enabled: Some(false),
            audio_enabled: None,
            screen_sharing: None,
            hand_raised: Some(true),
            reaction: Some("👍".to_string()),
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("PARTICIPANT_UPDATE"));
        assert!(json.contains("handRaised"));

        let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
        match parsed {
            ClientMessage::ParticipantUpdate(payload) => {
                assert_eq!(payload.video_enabled, Some(false));
                assert_eq!(payload.hand_raised, Some(true));
            }
            _ => panic!("Expected ParticipantUpdate"),
        }
    }
}
