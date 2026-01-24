//! Stream engine - orchestrates the streaming pipeline

use crate::session::StreamState;
use crate::AppState;
use anyhow::Result;
use tracing::{info, warn};
use uuid::Uuid;

impl AppState {
    /// Start streaming for a session
    pub async fn start_streaming(&self, room_id: Uuid) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(&room_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        if !session.can_start() {
            return Err(anyhow::anyhow!(
                "Cannot start stream in state {:?}",
                session.state
            ));
        }

        session.state = StreamState::Connecting;
        let stream_key = session.stream_key.clone();
        drop(session); // Release lock before async operations

        // Start HLS transcoding
        let hls_pid = self
            .ffmpeg_manager
            .start_hls_transcoding(room_id, &stream_key)
            .await?;

        // Update session with process ID
        if let Some(mut session) = self.sessions.get_mut(&room_id) {
            session.ingest_process_id = Some(hls_pid);
            session.state = StreamState::Live;
            session.started_at = Some(chrono::Utc::now());
        }

        info!("Stream started for room {}", room_id);

        // Notify other services via callback
        self.notify_stream_started(room_id).await;

        Ok(())
    }

    /// Start RTP ingest for a session (via WebRTC egress)
    pub async fn start_rtp_ingest(&self, room_id: Uuid) -> Result<u16> {
        let mut session = self
            .sessions
            .get_mut(&room_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        // Force reset state if already live (since we are switching ingest methods)
        // or just check if can start.
        // For simplicity:
        session.state = StreamState::Connecting;
        drop(session);

        let (pid, port) = self
            .ffmpeg_manager
            .start_rtp_ingest(room_id)
            .await?;
        
        if let Some(mut session) = self.sessions.get_mut(&room_id) {
            session.ingest_process_id = Some(pid);
            session.state = StreamState::Live;
            session.started_at = Some(chrono::Utc::now());
        }

        info!("RTP Ingest started for room {} on port {}", room_id, port);
        self.notify_stream_started(room_id).await;

        Ok(port)
    }

    /// Stop streaming for a session
    pub async fn stop_streaming(&self, room_id: Uuid) -> Result<()> {
        let session = {
            let mut session = self
                .sessions
                .get_mut(&room_id)
                .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

            if !session.can_stop() {
                return Err(anyhow::anyhow!(
                    "Cannot stop stream in state {:?}",
                    session.state
                ));
            }

            session.state = StreamState::Stopping;
            session.clone()
        };

        // Stop all FFmpeg processes
        self.ffmpeg_manager.stop_all_for_room(&session).await?;

        // Stop all destination relays
        self.stop_all_relays(room_id).await?;

        // Update session state
        if let Some(mut session) = self.sessions.get_mut(&room_id) {
            session.state = StreamState::Ended;
            session.ingest_process_id = None;
        }

        info!("Stream stopped for room {}", room_id);

        // Notify other services
        self.notify_stream_stopped(room_id).await;

        // Clean up HLS files
        self.cleanup_hls_files(room_id).await;

        Ok(())
    }

    /// Handle RTMP publish event (stream started from broadcaster)
    pub async fn handle_rtmp_publish(&self, stream_key: &str) -> Result<Uuid> {
        let room_id = crate::ingest::parse_stream_key(stream_key)
            .ok_or_else(|| anyhow::anyhow!("Invalid stream key"))?;

        info!("RTMP publish started for room {} (key: {})", room_id, stream_key);

        // Verify session exists
        if !self.sessions.contains_key(&room_id) {
            warn!("No session found for stream key {}", stream_key);
            return Err(anyhow::anyhow!("No session found for this stream key"));
        }

        // Start streaming pipeline
        self.start_streaming(room_id).await?;

        Ok(room_id)
    }

    /// Handle RTMP publish done event (stream ended from broadcaster)
    pub async fn handle_rtmp_publish_done(&self, stream_key: &str) -> Result<Uuid> {
        let room_id = crate::ingest::parse_stream_key(stream_key)
            .ok_or_else(|| anyhow::anyhow!("Invalid stream key"))?;

        info!("RTMP publish ended for room {} (key: {})", room_id, stream_key);

        // Stop streaming pipeline
        self.stop_streaming(room_id).await?;

        Ok(room_id)
    }

    /// Notify core service that stream started
    async fn notify_stream_started(&self, room_id: Uuid) {
        let url = format!("{}/internal/stream-started", self.config.core_service_url);
        
        if let Err(e) = self
            .http_client
            .post(&url)
            .json(&serde_json::json!({
                "room_id": room_id,
                "started_at": chrono::Utc::now()
            }))
            .send()
            .await
        {
            warn!("Failed to notify stream started: {}", e);
        }
    }

    /// Notify core service that stream stopped
    async fn notify_stream_stopped(&self, room_id: Uuid) {
        let url = format!("{}/internal/stream-stopped", self.config.core_service_url);
        
        if let Err(e) = self
            .http_client
            .post(&url)
            .json(&serde_json::json!({
                "room_id": room_id,
                "stopped_at": chrono::Utc::now()
            }))
            .send()
            .await
        {
            warn!("Failed to notify stream stopped: {}", e);
        }
    }

    /// Clean up HLS segment files
    async fn cleanup_hls_files(&self, room_id: Uuid) {
        let hls_dir = self.config.hls_output_dir.join(room_id.to_string());
        
        if hls_dir.exists() {
            if let Err(e) = tokio::fs::remove_dir_all(&hls_dir).await {
                warn!("Failed to clean up HLS directory {:?}: {}", hls_dir, e);
            } else {
                info!("Cleaned up HLS files for room {}", room_id);
            }
        }
    }
}
