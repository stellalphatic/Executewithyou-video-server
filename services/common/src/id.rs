//! ID generation utilities

use uuid::Uuid;

/// Generate a new room ID
pub fn new_room_id() -> String {
    format!("room_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string())
}

/// Generate a new participant ID
pub fn new_participant_id() -> String {
    format!("part_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string())
}

/// Generate a new stream key
pub fn new_stream_key() -> String {
    format!("sk_{}", Uuid::new_v4().to_string().replace("-", ""))
}

/// Generate a new recording ID
pub fn new_recording_id() -> String {
    format!("rec_{}", Uuid::new_v4().to_string().replace("-", "")[..16].to_string())
}

/// Generate a new destination ID
pub fn new_destination_id() -> String {
    format!("dest_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string())
}

/// Generate a new message ID
pub fn new_message_id() -> String {
    format!("msg_{}", Uuid::new_v4().to_string().replace("-", "")[..16].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_room_id_format() {
        let id = new_room_id();
        assert!(id.starts_with("room_"));
        assert_eq!(id.len(), 17); // "room_" + 12 chars
    }

    #[test]
    fn test_stream_key_uniqueness() {
        let key1 = new_stream_key();
        let key2 = new_stream_key();
        assert_ne!(key1, key2);
    }
}
