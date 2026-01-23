//! Relay management for multi-destination streaming

use crate::session::{DestinationRelay, DestinationState};
use crate::AppState;
use anyhow::Result;
use tracing::{error, info};
use uuid::Uuid;

impl AppState {
    /// Start streaming to a destination
    pub async fn start_destination_relay(
        &self,
        room_id: Uuid,
        destination_id: Uuid,
        rtmp_url: &str,
        stream_key: &str,
        platform: &str,
    ) -> Result<()> {
        // Get the session
        let mut session = self
            .sessions
            .get_mut(&room_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        // Get the source stream key
        let source_key = session.stream_key.clone();

        // Start FFmpeg relay
        let pid = self
            .ffmpeg_manager
            .start_destination_relay(room_id, &source_key, rtmp_url, stream_key)
            .await?;

        // Update destination state
        let relay = DestinationRelay {
            destination_id,
            platform: platform.to_string(),
            rtmp_url: rtmp_url.to_string(),
            stream_key: stream_key.to_string(),
            state: DestinationState::Active,
            started_at: Some(chrono::Utc::now()),
            error: None,
            process_id: Some(pid),
        };

        session.destinations.insert(destination_id, relay);

        info!(
            "Started relay for room {} to {} ({})",
            room_id, platform, destination_id
        );

        Ok(())
    }

    /// Stop streaming to a destination
    pub async fn stop_destination_relay(
        &self,
        room_id: Uuid,
        destination_id: Uuid,
    ) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(&room_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        if let Some(relay) = session.destinations.get_mut(&destination_id) {
            relay.state = DestinationState::Stopping;

            if let Some(pid) = relay.process_id {
                self.ffmpeg_manager.stop_process(pid).await?;
            }

            relay.state = DestinationState::Idle;
            relay.process_id = None;
            relay.started_at = None;

            info!(
                "Stopped relay for room {} to {} ({})",
                room_id, relay.platform, destination_id
            );
        }

        Ok(())
    }

    /// Stop all destination relays for a room
    pub async fn stop_all_relays(&self, room_id: Uuid) -> Result<()> {
        let destination_ids: Vec<Uuid> = {
            let session = self
                .sessions
                .get(&room_id)
                .ok_or_else(|| anyhow::anyhow!("Session not found"))?;
            session.destinations.keys().cloned().collect()
        };

        for dest_id in destination_ids {
            if let Err(e) = self.stop_destination_relay(room_id, dest_id).await {
                error!("Failed to stop relay {}: {}", dest_id, e);
            }
        }

        Ok(())
    }
}
