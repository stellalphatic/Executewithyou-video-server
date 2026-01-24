//! Shared types used in protocol messages

use serde::{Deserialize, Serialize};

/// Room mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomMode {
    Meeting,
    Studio,
}

impl Default for RoomMode {
    fn default() -> Self {
        Self::Meeting
    }
}

/// Participant role in a room
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParticipantRole {
    Host,
    CoHost,
    Guest,
    Viewer,
}

/// Leave/disconnect reason
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeaveReason {
    Left,
    Kicked,
    Disconnected,
    Timeout,
}

/// Join rejection reason
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JoinRejectedReason {
    RoomFull,
    NotAuthorized,
    RoomNotFound,
    Banned,
}

/// Recording mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingMode {
    Local,
    Cloud,
    Both,
}

/// Room status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomStatus {
    Idle,
    Live,
    Recording,
    Ended,
}

/// Stream quality indicator
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamQuality {
    Excellent,
    Good,
    Fair,
    Poor,
}

/// Layout preset
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayoutPreset {
    Grid,
    Spotlight,
    Pip,
    SideBySide,
    Custom,
}

/// Media track type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    Audio,
    Video,
    Screen,
}

/// Stage control action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageAction {
    BringOnStage,
    RemoveFromStage,
    MoveToGreenRoom,
}

/// Broadcast control action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BroadcastAction {
    Start,
    Stop,
    Pause,
}

/// Recording control action
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingAction {
    Start,
    Stop,
}

/// Participant information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub display_name: String,
    pub role: ParticipantRole,
    pub is_on_stage: bool,
    pub video_enabled: bool,
    pub audio_enabled: bool,
    pub hand_raised: bool,
    pub reaction: Option<String>,
    pub is_in_waiting_room: bool,
}

/// Media capabilities for joining
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaCapabilities {
    pub video: bool,
    pub audio: bool,
    pub screen_share: bool,
}

/// Room settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomSettings {
    pub max_participants: u32,
    pub allow_guests: bool,
    pub require_approval: bool,
    pub chat_enabled: bool,
    pub reactions_enabled: bool,
}

impl Default for RoomSettings {
    fn default() -> Self {
        Self {
            max_participants: 50,
            allow_guests: true,
            require_approval: false,
            chat_enabled: true,
            reactions_enabled: true,
        }
    }
}

/// Room information in join response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInfo {
    pub id: String,
    pub name: String,
    pub mode: RoomMode,
    pub host_id: String,
    pub settings: RoomSettings,
}

/// ICE server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceServer {
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub credential: Option<String>,
}

/// Stream health metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamHealth {
    pub bitrate: u32,
    pub fps: f32,
    pub quality: StreamQuality,
}

/// Source position in layout
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourcePosition {
    pub participant_id: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub z_index: u32,
}

/// Overlay information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Overlay {
    pub id: String,
    pub overlay_type: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub z_index: u32,
    pub data: serde_json::Value,
}
