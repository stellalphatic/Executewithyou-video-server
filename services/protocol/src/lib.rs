//! ALLSTRM Protocol Library
//!
//! This crate defines all WebSocket message types used between
//! the frontend clients and backend services.
//!
//! # Message Types
//!
//! Messages are categorized by direction and purpose:
//!
//! ## Client → Server
//! - Connection: `JoinRequest`, `LeaveRequest`
//! - WebRTC: `Offer`, `Answer`, `IceCandidate`
//! - State: `ParticipantUpdate`, `MediaStateUpdate`
//! - Studio: `LayoutUpdate`, `BroadcastControl`, `StageControl`
//! - Chat: `ChatMessage`
//! - Recording: `RecordingControl`
//!
//! ## Server → Client
//! - Connection: `JoinAccepted`, `JoinRejected`
//! - Events: `ParticipantJoined`, `ParticipantLeft`, `ParticipantUpdated`
//! - WebRTC: `OfferReceived`, `AnswerReceived`, `IceCandidateReceived`
//! - State: `RoomStateUpdate`, `LayoutStateUpdate`
//! - Chat: `ChatMessageReceived`
//! - Error: `ErrorMessage`

pub mod client;
pub mod server;
pub mod types;

pub use client::ClientMessage;
pub use server::ServerMessage;
pub use types::*;

/// Parse a raw WebSocket message into a ClientMessage
pub fn parse_client_message(json: &str) -> Result<ClientMessage, serde_json::Error> {
    serde_json::from_str(json)
}

/// Parse a raw WebSocket message into a ServerMessage
pub fn parse_server_message(json: &str) -> Result<ServerMessage, serde_json::Error> {
    serde_json::from_str(json)
}

/// Serialize a ServerMessage to JSON
pub fn serialize_server_message(msg: &ServerMessage) -> Result<String, serde_json::Error> {
    serde_json::to_string(msg)
}

/// Serialize a ClientMessage to JSON
pub fn serialize_client_message(msg: &ClientMessage) -> Result<String, serde_json::Error> {
    serde_json::to_string(msg)
}
