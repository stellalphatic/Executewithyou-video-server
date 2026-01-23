//! Track routing for SFU
//!
//! This module handles forwarding media tracks between participants.
//! When a participant publishes a track, other participants can subscribe to it.

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, info};
use webrtc::rtp::packet::Packet as RtpPacket;

/// Maximum buffered packets in the broadcast channel
const TRACK_CHANNEL_CAPACITY: usize = 256;

/// Identifies a track uniquely
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct TrackId {
    pub room_id: String,
    pub participant_id: String,
    pub track_kind: TrackKind,
    pub track_id: String,
}

impl TrackId {
    pub fn new(room_id: &str, participant_id: &str, kind: TrackKind, track_id: &str) -> Self {
        Self {
            room_id: room_id.to_string(),
            participant_id: participant_id.to_string(),
            track_kind: kind,
            track_id: track_id.to_string(),
        }
    }

    pub fn key(&self) -> String {
        format!(
            "{}:{}:{}:{}",
            self.room_id,
            self.participant_id,
            self.track_kind.as_str(),
            self.track_id
        )
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum TrackKind {
    Audio,
    Video,
    Screen,
}

impl TrackKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            TrackKind::Audio => "audio",
            TrackKind::Video => "video",
            TrackKind::Screen => "screen",
        }
    }

    pub fn from_webrtc(kind: webrtc::rtp_transceiver::rtp_codec::RTPCodecType) -> Self {
        match kind {
            webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Audio => TrackKind::Audio,
            webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Video => TrackKind::Video,
            _ => TrackKind::Video, // Default to video for unknown types
        }
    }
}

/// Published track info
#[derive(Debug, Clone)]
pub struct PublishedTrack {
    pub track_id: TrackId,
    pub codec: String,
    pub subscriber_count: usize,
}

/// Track sender for broadcasting RTP packets
pub struct TrackSender {
    pub track_id: TrackId,
    pub sender: broadcast::Sender<Arc<RtpPacket>>,
}

/// Track receiver for consuming RTP packets
pub struct TrackReceiver {
    pub track_id: TrackId,
    pub receiver: broadcast::Receiver<Arc<RtpPacket>>,
}

/// Routes tracks between publishers and subscribers
pub struct TrackRouter {
    /// Published tracks: track key -> sender
    published_tracks: DashMap<String, Arc<TrackSender>>,
    /// Subscriptions: subscriber_id -> list of track keys
    subscriptions: DashMap<String, Vec<String>>,
    /// Track metadata
    track_info: DashMap<String, PublishedTrack>,
}

impl TrackRouter {
    pub fn new() -> Self {
        Self {
            published_tracks: DashMap::new(),
            subscriptions: DashMap::new(),
            track_info: DashMap::new(),
        }
    }

    /// Publish a track, making it available for subscription
    pub fn publish_track(&self, track_id: TrackId, codec: &str) -> Arc<TrackSender> {
        let key = track_id.key();

        if let Some(existing) = self.published_tracks.get(&key) {
            debug!(track_key = %key, "Track already published, returning existing sender");
            return existing.clone();
        }

        let (sender, _) = broadcast::channel(TRACK_CHANNEL_CAPACITY);
        let track_sender = Arc::new(TrackSender {
            track_id: track_id.clone(),
            sender,
        });

        self.published_tracks.insert(key.clone(), track_sender.clone());
        self.track_info.insert(
            key.clone(),
            PublishedTrack {
                track_id,
                codec: codec.to_string(),
                subscriber_count: 0,
            },
        );

        info!(track_key = %key, codec = %codec, "Track published");
        track_sender
    }

    /// Unpublish a track
    pub fn unpublish_track(&self, track_id: &TrackId) {
        let key = track_id.key();
        self.published_tracks.remove(&key);
        self.track_info.remove(&key);
        info!(track_key = %key, "Track unpublished");
    }

    /// Subscribe to a track
    pub fn subscribe(&self, subscriber_id: &str, track_id: &TrackId) -> Option<TrackReceiver> {
        let key = track_id.key();

        let sender = self.published_tracks.get(&key)?;

        let receiver = sender.sender.subscribe();

        // Update subscription tracking
        self.subscriptions
            .entry(subscriber_id.to_string())
            .or_default()
            .push(key.clone());

        // Update subscriber count
        if let Some(mut info) = self.track_info.get_mut(&key) {
            info.subscriber_count += 1;
        }

        info!(
            subscriber = %subscriber_id,
            track_key = %key,
            "Subscribed to track"
        );

        Some(TrackReceiver {
            track_id: track_id.clone(),
            receiver,
        })
    }

    /// Unsubscribe from a track
    pub fn unsubscribe(&self, subscriber_id: &str, track_id: &TrackId) {
        let key = track_id.key();

        // Remove from subscription list
        if let Some(mut subs) = self.subscriptions.get_mut(subscriber_id) {
            subs.retain(|k| k != &key);
        }

        // Update subscriber count
        if let Some(mut info) = self.track_info.get_mut(&key) {
            info.subscriber_count = info.subscriber_count.saturating_sub(1);
        }

        info!(
            subscriber = %subscriber_id,
            track_key = %key,
            "Unsubscribed from track"
        );
    }

    /// Unsubscribe from all tracks for a participant (when they leave)
    pub fn unsubscribe_all(&self, subscriber_id: &str) {
        if let Some((_, keys)) = self.subscriptions.remove(subscriber_id) {
            for key in keys {
                if let Some(mut info) = self.track_info.get_mut(&key) {
                    info.subscriber_count = info.subscriber_count.saturating_sub(1);
                }
            }
            info!(subscriber = %subscriber_id, "Unsubscribed from all tracks");
        }
    }

    /// Unpublish all tracks from a participant (when they leave)
    pub fn unpublish_all(&self, room_id: &str, participant_id: &str) {
        let prefix = format!("{}:{}:", room_id, participant_id);
        let keys_to_remove: Vec<String> = self
            .published_tracks
            .iter()
            .filter(|entry| entry.key().starts_with(&prefix))
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.published_tracks.remove(&key);
            self.track_info.remove(&key);
        }

        info!(
            room_id = %room_id,
            participant_id = %participant_id,
            "Unpublished all tracks from participant"
        );
    }

    /// Get all published tracks in a room
    pub fn get_room_tracks(&self, room_id: &str) -> Vec<PublishedTrack> {
        let prefix = format!("{}:", room_id);
        self.track_info
            .iter()
            .filter(|entry| entry.key().starts_with(&prefix))
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Get tracks published by a specific participant
    pub fn get_participant_tracks(&self, room_id: &str, participant_id: &str) -> Vec<PublishedTrack> {
        let prefix = format!("{}:{}:", room_id, participant_id);
        self.track_info
            .iter()
            .filter(|entry| entry.key().starts_with(&prefix))
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Send an RTP packet to all subscribers of a track
    pub fn forward_packet(&self, track_id: &TrackId, packet: RtpPacket) {
        let key = track_id.key();
        if let Some(sender) = self.published_tracks.get(&key) {
            // Ignore send errors (no subscribers)
            let _ = sender.sender.send(Arc::new(packet));
        }
    }

    /// Get statistics
    pub fn stats(&self) -> TrackRouterStats {
        TrackRouterStats {
            published_tracks: self.published_tracks.len(),
            total_subscriptions: self
                .subscriptions
                .iter()
                .map(|e| e.value().len())
                .sum(),
        }
    }
}

impl Default for TrackRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct TrackRouterStats {
    pub published_tracks: usize,
    pub total_subscriptions: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_publish_subscribe() {
        let router = TrackRouter::new();
        let track_id = TrackId::new("room1", "participant1", TrackKind::Video, "track1");

        // Publish
        let _sender = router.publish_track(track_id.clone(), "VP8");

        // Subscribe
        let receiver = router.subscribe("participant2", &track_id);
        assert!(receiver.is_some());

        // Check stats
        let stats = router.stats();
        assert_eq!(stats.published_tracks, 1);
        assert_eq!(stats.total_subscriptions, 1);
    }

    #[test]
    fn test_unsubscribe_all() {
        let router = TrackRouter::new();
        let track1 = TrackId::new("room1", "p1", TrackKind::Video, "t1");
        let track2 = TrackId::new("room1", "p1", TrackKind::Audio, "t2");

        router.publish_track(track1.clone(), "VP8");
        router.publish_track(track2.clone(), "opus");

        router.subscribe("p2", &track1);
        router.subscribe("p2", &track2);

        assert_eq!(router.stats().total_subscriptions, 2);

        router.unsubscribe_all("p2");
        assert_eq!(router.stats().total_subscriptions, 0);
    }
}
