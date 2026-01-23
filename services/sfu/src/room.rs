//! Room management for SFU

use allstrm_protocol::{Participant, ParticipantRole, RoomMode};
use dashmap::DashMap;
use std::sync::Arc;
use tracing::{debug, info};

/// Room state managed by SFU
#[derive(Debug)]
pub struct Room {
    pub id: String,
    pub mode: RoomMode,
    pub host_id: String,
    pub participants: DashMap<String, ParticipantState>,
}

impl Room {
    pub fn new(id: String, mode: RoomMode, host_id: String) -> Self {
        Self {
            id,
            mode,
            host_id,
            participants: DashMap::new(),
        }
    }

    /// Add a participant to the room
    pub fn add_participant(&self, participant: ParticipantState) {
        info!(
            room_id = %self.id,
            participant_id = %participant.info.id,
            "Adding participant to room"
        );
        self.participants.insert(participant.info.id.clone(), participant);
    }

    /// Remove a participant from the room
    pub fn remove_participant(&self, participant_id: &str) -> Option<ParticipantState> {
        info!(
            room_id = %self.id,
            participant_id = %participant_id,
            "Removing participant from room"
        );
        self.participants.remove(participant_id).map(|(_, v)| v)
    }

    /// Get participant by ID
    pub fn get_participant(&self, participant_id: &str) -> Option<ParticipantState> {
        self.participants.get(participant_id).map(|p| p.clone())
    }

    /// Get all participants
    pub fn get_all_participants(&self) -> Vec<Participant> {
        self.participants
            .iter()
            .map(|p| p.info.clone())
            .collect()
    }

    /// Get participant count
    pub fn participant_count(&self) -> usize {
        self.participants.len()
    }
}

/// Participant state within a room
#[derive(Debug, Clone)]
pub struct ParticipantState {
    pub info: Participant,
    /// WebRTC peer connection ID
    pub peer_id: Option<String>,
    /// Published track IDs
    pub published_tracks: Vec<String>,
    /// Subscribed track IDs
    pub subscribed_tracks: Vec<String>,
}

impl ParticipantState {
    pub fn new(id: String, display_name: String, role: ParticipantRole) -> Self {
        Self {
            info: Participant {
                id,
                display_name,
                role,
                is_on_stage: role != ParticipantRole::Viewer,
                video_enabled: true,
                audio_enabled: true,
                hand_raised: false,
                reaction: None,
                is_in_waiting_room: false,
            },
            peer_id: None,
            published_tracks: Vec::new(),
            subscribed_tracks: Vec::new(),
        }
    }
}

/// Room manager
pub struct RoomManager {
    rooms: DashMap<String, Arc<Room>>,
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
        }
    }

    /// Get or create a room
    pub fn get_or_create(&self, room_id: &str, mode: RoomMode, host_id: &str) -> Arc<Room> {
        self.rooms
            .entry(room_id.to_string())
            .or_insert_with(|| {
                info!(room_id = %room_id, "Creating new room");
                Arc::new(Room::new(room_id.to_string(), mode, host_id.to_string()))
            })
            .clone()
    }

    /// Get a room by ID
    pub fn get(&self, room_id: &str) -> Option<Arc<Room>> {
        self.rooms.get(room_id).map(|r| r.clone())
    }

    /// Remove a room
    pub fn remove(&self, room_id: &str) -> Option<Arc<Room>> {
        info!(room_id = %room_id, "Removing room");
        self.rooms.remove(room_id).map(|(_, r)| r)
    }

    /// Get room count
    pub fn count(&self) -> usize {
        self.rooms.len()
    }

    /// Clean up empty rooms
    pub fn cleanup_empty_rooms(&self) {
        let empty_rooms: Vec<String> = self
            .rooms
            .iter()
            .filter(|r| r.participant_count() == 0)
            .map(|r| r.key().clone())
            .collect();

        for room_id in empty_rooms {
            debug!(room_id = %room_id, "Cleaning up empty room");
            self.rooms.remove(&room_id);
        }
    }
}

impl Default for RoomManager {
    fn default() -> Self {
        Self::new()
    }
}
