-- ============================================================================
-- ALLSTRM ENTERPRISE FEATURES MIGRATION
-- Version: 3.1.0
-- Date: January 2026
--
-- Adds support for:
-- - Private messaging between participants
-- - Recording destination preferences (local/cloud/both)
-- - Waiting room state for participants
-- - Guest permission configurations
-- - Stream health logging
-- ============================================================================

-- ============================================================================
-- SECTION 1: ROOM PARTICIPANT ENHANCEMENTS
-- ============================================================================

-- Add waiting room support to participants
ALTER TABLE core.room_participants
    ADD COLUMN IF NOT EXISTS is_in_waiting_room BOOLEAN NOT NULL DEFAULT FALSE;

-- Add is_on_stage for studio mode
ALTER TABLE core.room_participants
    ADD COLUMN IF NOT EXISTS is_on_stage BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for waiting room queries
CREATE INDEX IF NOT EXISTS idx_core_participants_waiting_room 
    ON core.room_participants(room_id) 
    WHERE is_in_waiting_room = TRUE;

-- Index for on-stage participants
CREATE INDEX IF NOT EXISTS idx_core_participants_on_stage 
    ON core.room_participants(room_id) 
    WHERE is_on_stage = TRUE;

-- ============================================================================
-- SECTION 2: PRIVATE MESSAGING
-- ============================================================================

-- Private messages between participants
CREATE TABLE IF NOT EXISTS core.private_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES core.rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES core.room_participants(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES core.room_participants(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Indexes for private messages
CREATE INDEX IF NOT EXISTS idx_private_messages_room ON core.private_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON core.private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON core.private_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_unread 
    ON core.private_messages(recipient_id) 
    WHERE is_read = FALSE;

-- ============================================================================
-- SECTION 3: GUEST PERMISSIONS
-- ============================================================================

-- Room guest permission settings (per room)
CREATE TABLE IF NOT EXISTS core.room_guest_permissions (
    room_id UUID PRIMARY KEY REFERENCES core.rooms(id) ON DELETE CASCADE,
    can_toggle_audio BOOLEAN NOT NULL DEFAULT TRUE,
    can_toggle_video BOOLEAN NOT NULL DEFAULT TRUE,
    can_share_screen BOOLEAN NOT NULL DEFAULT FALSE,
    can_send_chat BOOLEAN NOT NULL DEFAULT TRUE,
    can_raise_hand BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for guest permissions updated_at
DROP TRIGGER IF EXISTS set_updated_at_room_guest_permissions ON core.room_guest_permissions;
CREATE TRIGGER set_updated_at_room_guest_permissions BEFORE UPDATE ON core.room_guest_permissions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================================
-- SECTION 4: RECORDING ENHANCEMENTS
-- ============================================================================

-- Add recording destination preference
ALTER TABLE assets.recordings
    ADD COLUMN IF NOT EXISTS destination VARCHAR(32) DEFAULT 'cloud'
        CHECK (destination IN ('local', 'cloud', 'both'));

-- Add auto-upload flag for local recordings
ALTER TABLE assets.recordings
    ADD COLUMN IF NOT EXISTS auto_upload_to_cloud BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- SECTION 5: STREAM HEALTH LOGGING
-- ============================================================================

-- Historical stream health logs (for analytics)
CREATE TABLE IF NOT EXISTS stream.health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    destination_id UUID REFERENCES stream.destinations(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Connection metrics
    status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    bitrate_kbps INTEGER,
    frame_rate REAL,
    dropped_frames INTEGER,
    -- Quality metrics  
    latency_ms INTEGER,
    packet_loss_percent REAL,
    jitter_ms INTEGER,
    -- Viewer metrics
    viewer_count INTEGER,
    chat_message_count INTEGER,
    -- Error tracking
    error_code VARCHAR(64),
    error_message TEXT
);

-- Indexes for health logs
CREATE INDEX IF NOT EXISTS idx_health_logs_room ON stream.health_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_destination ON stream.health_logs(destination_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_timestamp ON stream.health_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_room_time 
    ON stream.health_logs(room_id, timestamp DESC);

-- Partition health logs by time (optional, for high-volume deployments)
-- Note: Would need to convert to partitioned table for production

-- ============================================================================
-- SECTION 6: DESTINATION ENHANCEMENTS
-- ============================================================================

-- Add viewer count and chat integration fields
ALTER TABLE stream.destinations
    ADD COLUMN IF NOT EXISTS viewer_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stream.destinations
    ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE stream.destinations
    ADD COLUMN IF NOT EXISTS chat_url TEXT;

-- ============================================================================
-- SECTION 7: ROOM SETTINGS ENHANCEMENTS
-- ============================================================================

-- Add column for waiting room enabled flag
-- (This is stored in room settings JSONB, but we add a convenience view)

-- Create a view for room settings with defaults
CREATE OR REPLACE VIEW core.room_settings_expanded AS
SELECT 
    r.id AS room_id,
    r.settings,
    COALESCE((r.settings->>'waiting_room_enabled')::BOOLEAN, TRUE) AS waiting_room_enabled,
    COALESCE((r.settings->>'auto_record')::BOOLEAN, FALSE) AS auto_record,
    COALESCE(r.settings->>'default_layout', 'grid') AS default_layout,
    COALESCE((r.settings->>'max_guests')::INTEGER, 10) AS max_guests
FROM core.rooms r;

-- ============================================================================
-- SECTION 8: CLEANUP FUNCTIONS
-- ============================================================================

-- Cleanup old health logs (keep last 7 days)
CREATE OR REPLACE FUNCTION stream.cleanup_old_health_logs(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM stream.health_logs
    WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old private messages (keep last 30 days)
CREATE OR REPLACE FUNCTION core.cleanup_old_private_messages(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM core.private_messages
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF ENTERPRISE FEATURES MIGRATION
-- ============================================================================
