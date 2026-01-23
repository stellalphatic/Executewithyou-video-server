//! Stream session management

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// State of a streaming session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamState {
    /// Session created but not streaming
    Idle,
    /// RTMP input connected, preparing
    Connecting,
    /// Actively streaming
    Live,
    /// Stream paused (input still connected)
    Paused,
    /// Stream stopped, cleaning up
    Stopping,
    /// Session ended
    Ended,
    /// Error state
    Error,
}

/// Layout preset for the stream output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayoutPreset {
    Single,
    SideBySide,
    Grid2x2,
    Grid3x3,
    PictureInPicture,
    Spotlight,
    Custom,
}

impl Default for LayoutPreset {
    fn default() -> Self {
        Self::Single
    }
}

/// Layout configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub preset: LayoutPreset,
    /// Which participant is featured (for spotlight/pip)
    pub featured_participant_id: Option<Uuid>,
    /// Custom positions for participants
    pub positions: HashMap<Uuid, ParticipantPosition>,
    /// Background color/image
    pub background: Option<String>,
    /// Show participant names
    pub show_names: bool,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            preset: LayoutPreset::default(),
            featured_participant_id: None,
            positions: HashMap::new(),
            background: None,
            show_names: true,
        }
    }
}

/// Position of a participant in the layout
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParticipantPosition {
    pub x: f32,      // 0.0 - 1.0
    pub y: f32,      // 0.0 - 1.0
    pub width: f32,  // 0.0 - 1.0
    pub height: f32, // 0.0 - 1.0
    pub z_index: i32,
}

/// Destination relay state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DestinationRelay {
    pub destination_id: Uuid,
    pub platform: String,
    pub rtmp_url: String,
    pub stream_key: String,
    pub state: DestinationState,
    pub started_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
    /// FFmpeg process ID for this relay
    pub process_id: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DestinationState {
    Idle,
    Starting,
    Active,
    Stopping,
    Error,
}

/// Stream statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StreamStats {
    pub bitrate_kbps: u32,
    pub fps: f32,
    pub resolution: String,
    pub duration_seconds: u64,
    pub bytes_sent: u64,
    pub frames_dropped: u64,
    pub encoding_speed: f32,
}

/// A streaming session for a room
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamSession {
    pub room_id: Uuid,
    pub state: StreamState,
    pub layout: LayoutConfig,
    /// RTMP stream key for this session
    pub stream_key: String,
    /// Active destination relays
    pub destinations: HashMap<Uuid, DestinationRelay>,
    /// HLS output enabled
    pub hls_enabled: bool,
    /// Recording enabled
    pub recording_enabled: bool,
    /// Recording ID if recording
    pub recording_id: Option<Uuid>,
    /// Stats
    pub stats: StreamStats,
    /// Created timestamp
    pub created_at: DateTime<Utc>,
    /// Started streaming timestamp
    pub started_at: Option<DateTime<Utc>>,
    /// Last error message
    pub last_error: Option<String>,
    /// FFmpeg ingest process ID
    pub ingest_process_id: Option<u32>,
}

impl StreamSession {
    pub fn new(room_id: Uuid) -> Self {
        // Generate a unique stream key for RTMP ingest
        let stream_key = format!(
            "{}_{}", 
            room_id.to_string().replace("-", ""),
            hex::encode(&uuid::Uuid::new_v4().as_bytes()[0..4])
        );

        Self {
            room_id,
            state: StreamState::Idle,
            layout: LayoutConfig::default(),
            stream_key,
            destinations: HashMap::new(),
            hls_enabled: true,
            recording_enabled: false,
            recording_id: None,
            stats: StreamStats::default(),
            created_at: Utc::now(),
            started_at: None,
            last_error: None,
            ingest_process_id: None,
        }
    }

    pub fn add_destination(&mut self, destination: DestinationRelay) {
        self.destinations.insert(destination.destination_id, destination);
    }

    pub fn remove_destination(&mut self, destination_id: Uuid) -> Option<DestinationRelay> {
        self.destinations.remove(&destination_id)
    }

    pub fn is_live(&self) -> bool {
        self.state == StreamState::Live
    }

    pub fn can_start(&self) -> bool {
        matches!(self.state, StreamState::Idle | StreamState::Paused)
    }

    pub fn can_stop(&self) -> bool {
        matches!(self.state, StreamState::Live | StreamState::Connecting)
    }

    /// Update stats from FFmpeg process output
    pub fn update_stats_from_ffmpeg(&mut self, ffmpeg_stats: &crate::ffmpeg::FfmpegStats) {
        self.stats.fps = ffmpeg_stats.fps;
        self.stats.encoding_speed = ffmpeg_stats.speed;
        self.stats.bytes_sent = ffmpeg_stats.size_kb * 1024;

        // Parse bitrate from string like "2048kbps"
        if let Some(bitrate_str) = ffmpeg_stats.bitrate.strip_suffix("kbps") {
            if let Ok(bitrate) = bitrate_str.parse::<f32>() {
                self.stats.bitrate_kbps = bitrate as u32;
            }
        }

        // Parse duration from time string like "00:01:30.50"
        if !ffmpeg_stats.time.is_empty() {
            let parts: Vec<&str> = ffmpeg_stats.time.split(':').collect();
            if parts.len() >= 3 {
                let hours: u64 = parts[0].parse().unwrap_or(0);
                let minutes: u64 = parts[1].parse().unwrap_or(0);
                let seconds: f64 = parts[2].parse().unwrap_or(0.0);
                self.stats.duration_seconds = hours * 3600 + minutes * 60 + seconds as u64;
            }
        }
    }
}
