//! WebRTC peer connection management
//!
//! This module manages WebRTC peer connections using webrtc-rs.
//! Each participant has a peer connection to the SFU for publishing
//! and subscribing to tracks.

use anyhow::Result;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, info};
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::api::API;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::track::track_local::TrackLocal;
use webrtc::track::track_remote::TrackRemote;

use crate::track_router::{TrackId, TrackKind, TrackRouter};

/// Events emitted by peer connections
#[derive(Debug, Clone)]
pub enum PeerEvent {
    /// ICE candidate generated (needs to be sent to client)
    IceCandidate {
        participant_id: String,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u16>,
    },
    /// Track received from participant
    TrackReceived {
        participant_id: String,
        track_id: String,
        kind: TrackKind,
    },
    /// Connection state changed
    ConnectionStateChanged {
        participant_id: String,
        state: RTCPeerConnectionState,
    },
    /// Participant disconnected
    Disconnected {
        participant_id: String,
    },
}

/// Manages peer connections for all participants
pub struct PeerConnectionManager {
    api: API,
    connections: DashMap<String, Arc<RTCPeerConnection>>,
    ice_servers: Vec<RTCIceServer>,
    /// Channel for peer events
    event_sender: mpsc::UnboundedSender<PeerEvent>,
    event_receiver: parking_lot::Mutex<Option<mpsc::UnboundedReceiver<PeerEvent>>>,
}

/// TURN server credentials
#[derive(Debug, Clone, Default)]
pub struct TurnCredentials {
    pub username: Option<String>,
    pub credential: Option<String>,
}

impl PeerConnectionManager {
    /// Create a new peer connection manager
    pub async fn new(stun_server: &str, turn_server: Option<&str>) -> Result<Self> {
        Self::new_with_credentials(stun_server, turn_server, TurnCredentials::default()).await
    }

    /// Create a new peer connection manager with TURN credentials
    pub async fn new_with_credentials(
        stun_server: &str,
        turn_server: Option<&str>,
        turn_credentials: TurnCredentials,
    ) -> Result<Self> {
        // Create media engine with default codecs
        let mut media_engine = MediaEngine::default();
        media_engine.register_default_codecs()?;

        // Create API
        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .build();

        // Configure ICE servers
        let mut ice_servers = vec![RTCIceServer {
            urls: vec![stun_server.to_string()],
            ..Default::default()
        }];

        if let Some(turn) = turn_server {
            ice_servers.push(RTCIceServer {
                urls: vec![turn.to_string()],
                username: turn_credentials.username.unwrap_or_default(),
                credential: turn_credentials.credential.unwrap_or_default(),
                ..Default::default()
            });
        }

        let (event_sender, event_receiver) = mpsc::unbounded_channel();

        Ok(Self {
            api,
            connections: DashMap::new(),
            ice_servers,
            event_sender,
            event_receiver: parking_lot::Mutex::new(Some(event_receiver)),
        })
    }

    /// Take the event receiver (can only be called once)
    pub fn take_event_receiver(&self) -> Option<mpsc::UnboundedReceiver<PeerEvent>> {
        self.event_receiver.lock().take()
    }

    /// Create a new peer connection for a participant
    pub async fn create_peer_connection(
        &self,
        participant_id: &str,
        room_id: &str,
        track_router: Arc<TrackRouter>,
    ) -> Result<Arc<RTCPeerConnection>> {
        info!(participant_id = %participant_id, "Creating peer connection");

        let config = RTCConfiguration {
            ice_servers: self.ice_servers.clone(),
            ..Default::default()
        };

        let peer_connection = Arc::new(self.api.new_peer_connection(config).await?);

        // Set up event handlers
        self.setup_ice_candidate_handler(&peer_connection, participant_id);
        self.setup_track_handler(&peer_connection, participant_id, room_id, track_router);
        self.setup_connection_state_handler(&peer_connection, participant_id);

        // Store connection
        self.connections.insert(participant_id.to_string(), peer_connection.clone());

        Ok(peer_connection)
    }

    fn setup_ice_candidate_handler(&self, pc: &Arc<RTCPeerConnection>, participant_id: &str) {
        let sender = self.event_sender.clone();
        let pid = participant_id.to_string();

        pc.on_ice_candidate(Box::new(move |candidate| {
            let sender = sender.clone();
            let pid = pid.clone();

            Box::pin(async move {
                if let Some(c) = candidate {
                    let candidate_str = c.to_json().map(|j| j.candidate).unwrap_or_default();
                    debug!(participant = %pid, candidate = %candidate_str, "ICE candidate generated");

                    let _ = sender.send(PeerEvent::IceCandidate {
                        participant_id: pid,
                        candidate: candidate_str,
                        sdp_mid: c.to_json().ok().and_then(|j| j.sdp_mid),
                        sdp_mline_index: c.to_json().ok().and_then(|j| j.sdp_mline_index),
                    });
                }
            })
        }));
    }

    fn setup_track_handler(
        &self,
        pc: &Arc<RTCPeerConnection>,
        participant_id: &str,
        room_id: &str,
        track_router: Arc<TrackRouter>,
    ) {
        let sender = self.event_sender.clone();
        let pid = participant_id.to_string();
        let rid = room_id.to_string();

        pc.on_track(Box::new(move |track, _receiver, _transceiver| {
            let sender = sender.clone();
            let pid = pid.clone();
            let rid = rid.clone();
            let track_router = track_router.clone();

            Box::pin(async move {
                let track_id = track.id();
                let kind = TrackKind::from_webrtc(track.kind());
                let codec = track.codec().capability.mime_type.clone();

                info!(
                    participant = %pid,
                    track_id = %track_id,
                    kind = ?kind,
                    codec = %codec,
                    "Track received from participant"
                );

                // Create track ID for routing
                let tid = TrackId::new(&rid, &pid, kind, &track_id);

                // Publish the track to the router
                let _track_sender = track_router.publish_track(tid.clone(), &codec);

                // Notify about new track
                let _ = sender.send(PeerEvent::TrackReceived {
                    participant_id: pid.clone(),
                    track_id: track_id.clone(),
                    kind,
                });

                // Start forwarding RTP packets
                Self::forward_track_packets(track, tid, track_router).await;
            })
        }));
    }

    /// Forward RTP packets from a remote track to the router
    async fn forward_track_packets(
        track: Arc<TrackRemote>,
        track_id: TrackId,
        track_router: Arc<TrackRouter>,
    ) {
        let mut buf = vec![0u8; 1500];

        loop {
            match track.read(&mut buf).await {
                Ok((rtp_packet, _attributes)) => {
                    // Forward the RTP packet to subscribers
                    track_router.forward_packet(&track_id, rtp_packet);
                }
                Err(e) => {
                    debug!(error = %e, "Track read ended");
                    break;
                }
            }
        }

        // Track ended, unpublish it
        track_router.unpublish_track(&track_id);
        info!(track_key = %track_id.key(), "Track forwarding ended");
    }

    fn setup_connection_state_handler(&self, pc: &Arc<RTCPeerConnection>, participant_id: &str) {
        let sender = self.event_sender.clone();
        let pid = participant_id.to_string();

        pc.on_peer_connection_state_change(Box::new(move |state| {
            let sender = sender.clone();
            let pid = pid.clone();

            Box::pin(async move {
                info!(participant = %pid, state = ?state, "Connection state changed");

                let _ = sender.send(PeerEvent::ConnectionStateChanged {
                    participant_id: pid.clone(),
                    state,
                });

                if state == RTCPeerConnectionState::Disconnected
                    || state == RTCPeerConnectionState::Failed
                    || state == RTCPeerConnectionState::Closed
                {
                    let _ = sender.send(PeerEvent::Disconnected {
                        participant_id: pid,
                    });
                }
            })
        }));
    }

    /// Get a peer connection by participant ID
    pub fn get_peer_connection(&self, participant_id: &str) -> Option<Arc<RTCPeerConnection>> {
        self.connections.get(participant_id).map(|pc| pc.clone())
    }

    /// Handle an SDP offer and return an answer
    pub async fn handle_offer(
        &self,
        participant_id: &str,
        room_id: &str,
        offer_sdp: &str,
        track_router: Arc<TrackRouter>,
    ) -> Result<String> {
        // Get or create peer connection
        let peer_connection = match self.get_peer_connection(participant_id) {
            Some(pc) => pc,
            None => self.create_peer_connection(participant_id, room_id, track_router).await?,
        };

        // Set remote description (offer)
        let offer = RTCSessionDescription::offer(offer_sdp.to_string())?;
        peer_connection.set_remote_description(offer).await?;

        // Create answer
        let answer = peer_connection.create_answer(None).await?;

        // Set local description
        peer_connection.set_local_description(answer.clone()).await?;

        debug!(
            participant_id = %participant_id,
            "SDP answer created"
        );

        Ok(answer.sdp)
    }

    /// Handle an SDP answer (for when SFU sends offer to subscriber)
    pub async fn handle_answer(
        &self,
        participant_id: &str,
        answer_sdp: &str,
    ) -> Result<()> {
        let peer_connection = self
            .get_peer_connection(participant_id)
            .ok_or_else(|| anyhow::anyhow!("No peer connection for participant"))?;

        let answer = RTCSessionDescription::answer(answer_sdp.to_string())?;
        peer_connection.set_remote_description(answer).await?;

        debug!(
            participant_id = %participant_id,
            "SDP answer processed"
        );

        Ok(())
    }

    /// Add an ICE candidate
    pub async fn add_ice_candidate(
        &self,
        participant_id: &str,
        candidate: &str,
        sdp_m_line_index: Option<u16>,
        sdp_mid: Option<&str>,
    ) -> Result<()> {
        let peer_connection = self
            .get_peer_connection(participant_id)
            .ok_or_else(|| anyhow::anyhow!("No peer connection for participant"))?;

        let ice_candidate = RTCIceCandidateInit {
            candidate: candidate.to_string(),
            sdp_mid: sdp_mid.map(|s| s.to_string()),
            sdp_mline_index: sdp_m_line_index,
            username_fragment: None,
        };

        peer_connection.add_ice_candidate(ice_candidate).await?;

        debug!(
            participant_id = %participant_id,
            "ICE candidate added"
        );

        Ok(())
    }

    /// Add a track to send to a participant (for subscriptions)
    pub async fn add_track_to_peer(
        &self,
        participant_id: &str,
        track: Arc<dyn TrackLocal + Send + Sync>,
    ) -> Result<()> {
        let peer_connection = self
            .get_peer_connection(participant_id)
            .ok_or_else(|| anyhow::anyhow!("No peer connection for participant"))?;

        peer_connection.add_track(track).await?;

        debug!(
            participant_id = %participant_id,
            "Track added to peer connection"
        );

        Ok(())
    }

    /// Close and remove a peer connection
    pub async fn close_peer_connection(&self, participant_id: &str) -> Result<()> {
        if let Some((_, pc)) = self.connections.remove(participant_id) {
            pc.close().await?;
            info!(participant_id = %participant_id, "Peer connection closed");
        }
        Ok(())
    }

    /// Get count of active connections
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// Check if a participant has a peer connection
    pub fn has_connection(&self, participant_id: &str) -> bool {
        self.connections.contains_key(participant_id)
    }
}
