//! Prometheus metrics for the SFU service

use metrics::{counter, describe_counter, describe_gauge, describe_histogram, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use std::sync::OnceLock;

/// Global prometheus handle
static PROMETHEUS_HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();

/// Initialize the Prometheus metrics exporter
pub fn init_metrics() -> &'static PrometheusHandle {
    PROMETHEUS_HANDLE.get_or_init(|| {
        let handle = PrometheusBuilder::new()
            .install_recorder()
            .expect("Failed to install Prometheus recorder");

        // WebRTC connection metrics
        describe_counter!(
            "sfu_connections_total",
            "Total number of WebRTC connections established"
        );
        describe_gauge!(
            "sfu_active_connections",
            "Number of active WebRTC connections"
        );
        describe_counter!(
            "sfu_connection_failures_total",
            "Total number of connection failures"
        );

        // Room metrics
        describe_gauge!("sfu_active_rooms", "Number of active rooms");
        describe_histogram!(
            "sfu_participants_per_room",
            "Number of participants per room"
        );

        // Media metrics
        describe_counter!(
            "sfu_bytes_received_total",
            "Total bytes received from participants"
        );
        describe_counter!(
            "sfu_bytes_sent_total",
            "Total bytes sent to participants"
        );
        describe_histogram!(
            "sfu_rtp_packet_latency_ms",
            "RTP packet forwarding latency in milliseconds"
        );
        describe_counter!(
            "sfu_packets_dropped_total",
            "Total RTP packets dropped"
        );

        // Track metrics
        describe_gauge!("sfu_active_tracks", "Number of active media tracks");
        describe_counter!(
            "sfu_track_subscriptions_total",
            "Total track subscriptions"
        );

        // Signaling metrics
        describe_counter!(
            "sfu_signaling_messages_total",
            "Total signaling messages processed"
        );
        describe_histogram!(
            "sfu_signaling_latency_ms",
            "Signaling message processing latency"
        );

        // ICE metrics
        describe_counter!(
            "sfu_ice_candidates_total",
            "Total ICE candidates gathered"
        );
        describe_counter!(
            "sfu_ice_failures_total",
            "Total ICE connection failures"
        );

        handle
    })
}

/// Get the Prometheus handle
pub fn get_handle() -> Option<&'static PrometheusHandle> {
    PROMETHEUS_HANDLE.get()
}

// ===== Connection Metrics =====

pub fn record_connection() {
    counter!("sfu_connections_total").increment(1);
}

pub fn increment_active_connections() {
    gauge!("sfu_active_connections").increment(1.0);
}

pub fn decrement_active_connections() {
    gauge!("sfu_active_connections").decrement(1.0);
}

pub fn record_connection_failure(reason: &str) {
    counter!("sfu_connection_failures_total", "reason" => reason.to_string()).increment(1);
}

// ===== Room Metrics =====

pub fn set_active_rooms(count: f64) {
    gauge!("sfu_active_rooms").set(count);
}

pub fn record_room_participants(room_id: &str, count: usize) {
    histogram!("sfu_participants_per_room", "room_id" => room_id.to_string()).record(count as f64);
}

// ===== Media Metrics =====

pub fn record_bytes_received(bytes: u64, participant_id: &str) {
    counter!("sfu_bytes_received_total", "participant_id" => participant_id.to_string()).increment(bytes);
}

pub fn record_bytes_sent(bytes: u64, participant_id: &str) {
    counter!("sfu_bytes_sent_total", "participant_id" => participant_id.to_string()).increment(bytes);
}

pub fn record_rtp_latency(latency_ms: f64) {
    histogram!("sfu_rtp_packet_latency_ms").record(latency_ms);
}

pub fn record_packet_dropped(reason: &str) {
    counter!("sfu_packets_dropped_total", "reason" => reason.to_string()).increment(1);
}

// ===== Track Metrics =====

pub fn set_active_tracks(count: f64) {
    gauge!("sfu_active_tracks").set(count);
}

pub fn record_track_subscription(track_type: &str) {
    counter!("sfu_track_subscriptions_total", "type" => track_type.to_string()).increment(1);
}

// ===== Signaling Metrics =====

pub fn record_signaling_message(message_type: &str) {
    counter!("sfu_signaling_messages_total", "type" => message_type.to_string()).increment(1);
}

pub fn record_signaling_latency(latency_ms: f64, message_type: &str) {
    histogram!("sfu_signaling_latency_ms", "type" => message_type.to_string()).record(latency_ms);
}

// ===== ICE Metrics =====

pub fn record_ice_candidate(candidate_type: &str) {
    counter!("sfu_ice_candidates_total", "type" => candidate_type.to_string()).increment(1);
}

pub fn record_ice_failure(reason: &str) {
    counter!("sfu_ice_failures_total", "reason" => reason.to_string()).increment(1);
}
