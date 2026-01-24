//! RTP Forwarder
//!
//! Forwards RTP packets from a track to a UDP destination.
//! Used for egress to FFmpeg/external services.

use crate::track_router::{TrackId, TrackRouter};
use anyhow::Result;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tracing::{error, info, warn};
use webrtc::util::Marshal;

pub struct RtpForwarder {
    router: Arc<TrackRouter>,
    active_forwarders: Arc<Mutex<Vec<String>>>, // List of active forwarder IDs
}

impl RtpForwarder {
    pub fn new(router: Arc<TrackRouter>) -> Self {
        Self {
            router,
            active_forwarders: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Start forwarding a track to a destination
    pub async fn start_forwarding(
        &self,
        track_id: TrackId,
        destination: SocketAddr,
    ) -> Result<()> {
        let router = self.router.clone();
        let forwarder_id = format!("{}-{}", track_id.key(), destination);

        // Create UDP socket
        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        socket.connect(destination).await?;
        let socket = Arc::new(socket);

        info!(
            track = %track_id.key(),
            destination = %destination,
            "Starting RTP forwarding"
        );

        // Spawn forwarding task
        tokio::spawn(async move {
            let subscriber_id = format!("forwarder-{}", uuid::Uuid::new_v4());
            
            // Subscribe to track
            let mut receiver = match router.subscribe(&subscriber_id, &track_id) {
                Some(r) => r.receiver,
                None => {
                    warn!(track = %track_id.key(), "Track not found for forwarding");
                    return;
                }
            };

            info!("RTP forwarder subscribed to track");

            // Forward loop
            loop {
                match receiver.recv().await {
                    Ok(packet) => {
                        // Marshal packet to bytes
                        match packet.marshal() {
                            Ok(buf) => {
                                if let Err(e) = socket.send(&buf).await {
                                    error!("Failed to send RTP packet: {}", e);
                                }
                            }
                            Err(e) => {
                                error!("Failed to marshal RTP packet: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("RTP forwarder receiver closed: {}", e);
                        break;
                    }
                }
            }
            
            info!("RTP forwarding stopped for {}", track_id.key());
        });

        Ok(())
    }
}
