-- ============================================================================
-- ALLSTRM CONSOLIDATED DATABASE SCHEMA
-- Version: 3.0.0
-- Date: January 2026
--
-- Single-file schema for the ALLSTRM streaming platform.
-- Supports both microservices architecture (Core, Stream, Storage services)
-- and hybrid deployment modes.
--
-- Target: PostgreSQL 15+
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 2: SCHEMAS (Microservices Architecture)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS core;    -- Core service: users, rooms, orgs
CREATE SCHEMA IF NOT EXISTS stream;  -- Stream service: RTMP, HLS, destinations
CREATE SCHEMA IF NOT EXISTS assets;  -- Storage service: recordings, uploads

-- ============================================================================
-- SECTION 3: CORE SCHEMA TABLES
-- ============================================================================

SET search_path TO core, public;

-- Users table
CREATE TABLE IF NOT EXISTS core.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    avatar_url TEXT,
    plan VARCHAR(32) NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'creator', 'professional', 'enterprise')),
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations (billing entity)
CREATE TABLE IF NOT EXISTS core.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    logo_url TEXT,
    billing_tier VARCHAR(32) NOT NULL DEFAULT 'free'
        CHECK (billing_tier IN ('free', 'creator', 'professional', 'enterprise')),
    stripe_customer_id VARCHAR(64),
    stripe_subscription_id VARCHAR(64),
    max_rooms INTEGER NOT NULL DEFAULT 1,
    max_participants_per_room INTEGER NOT NULL DEFAULT 5,
    max_stream_hours_monthly INTEGER NOT NULL DEFAULT 10,
    max_recording_hours INTEGER NOT NULL DEFAULT 0,
    max_destinations INTEGER NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '{"custom_branding": false, "iso_recording": false, "api_access": false}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Organization members
CREATE TABLE IF NOT EXISTS core.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    permissions JSONB NOT NULL DEFAULT '{"can_manage_billing": false, "can_manage_members": false, "can_create_rooms": true}'::JSONB,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMPTZ,
    CONSTRAINT unique_org_member UNIQUE (organization_id, user_id)
);

-- Rooms (streaming sessions)
CREATE TABLE IF NOT EXISTS core.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128),
    description TEXT,
    thumbnail_url TEXT,
    mode VARCHAR(32) NOT NULL DEFAULT 'meeting'
        CHECK (mode IN ('meeting', 'studio', 'webinar')),
    settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    stream_config JSONB NOT NULL DEFAULT '{"resolution": "1080p", "fps": 30, "video_bitrate_kbps": 5000}'::JSONB,
    status VARCHAR(32) NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'preparing', 'live', 'recording', 'paused', 'ending', 'ended')),
    active_service VARCHAR(32) CHECK (active_service IN ('sfu', 'streaming', NULL)),
    active_node_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    CONSTRAINT unique_room_slug UNIQUE (organization_id, slug)
);

-- Room participants
CREATE TABLE IF NOT EXISTS core.room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES core.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    display_name VARCHAR(128) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(32) NOT NULL DEFAULT 'guest'
        CHECK (role IN ('owner', 'host', 'co_host', 'guest', 'viewer')),
    status VARCHAR(32) NOT NULL DEFAULT 'connected'
        CHECK (status IN ('connected', 'disconnected', 'reconnecting')),
    tracks JSONB NOT NULL DEFAULT '{}',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- API Keys
CREATE TABLE IF NOT EXISTS core.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    scopes JSONB NOT NULL DEFAULT '["read"]'::JSONB,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 4: STREAM SCHEMA TABLES
-- ============================================================================

SET search_path TO stream, public;

-- RTMP Sessions
CREATE TABLE IF NOT EXISTS stream.rtmp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    stream_key VARCHAR(128) NOT NULL UNIQUE,
    client_ip INET,
    client_user_agent TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_data_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    video_codec VARCHAR(32),
    audio_codec VARCHAR(32),
    resolution VARCHAR(16),
    fps REAL,
    bitrate_kbps INTEGER,
    bytes_received BIGINT NOT NULL DEFAULT 0,
    engine_node_id VARCHAR(64) NOT NULL DEFAULT 'local'
);

-- HLS Segments
CREATE TABLE IF NOT EXISTS stream.hls_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    session_id UUID REFERENCES stream.rtmp_sessions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_keyframe_start BOOLEAN NOT NULL DEFAULT FALSE,
    local_path VARCHAR(512),
    cdn_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT unique_segment UNIQUE (room_id, sequence_number)
);

-- Stream Destinations
CREATE TABLE IF NOT EXISTS stream.destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    organization_id UUID,
    platform VARCHAR(32) NOT NULL
        CHECK (platform IN ('youtube', 'twitch', 'facebook', 'linkedin', 'x', 'instagram', 'tiktok', 'kick', 'vimeo', 'amazon', 'brightcove', 'hopin', 'custom_rtmp', 'custom_srt')),
    name VARCHAR(128) NOT NULL,
    rtmp_url TEXT,
    rtmp_url_encrypted TEXT,
    stream_key_encrypted TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_connected BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'connecting', 'connected', 'error', 'disconnected')),
    last_error TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,
    bytes_sent BIGINT NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stream Health Metrics
CREATE TABLE IF NOT EXISTS stream.health_metrics (
    room_id UUID PRIMARY KEY,
    session_id UUID REFERENCES stream.rtmp_sessions(id),
    engine_node_id VARCHAR(64) NOT NULL DEFAULT 'local',
    cpu_percent REAL,
    memory_mb REAL,
    disk_io_mbps REAL,
    input_bitrate_kbps INTEGER,
    input_fps REAL,
    input_width INTEGER,
    input_height INTEGER,
    hls_segment_lag_ms INTEGER,
    destinations_connected INTEGER NOT NULL DEFAULT 0,
    destinations_failed INTEGER NOT NULL DEFAULT 0,
    rtt_ms INTEGER,
    packet_loss_percent REAL,
    jitter_ms INTEGER,
    recording_buffer_mb REAL,
    hls_buffer_segments INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 50);

-- ============================================================================
-- SECTION 5: ASSETS SCHEMA TABLES
-- ============================================================================

SET search_path TO assets, public;

-- Recordings
CREATE TABLE IF NOT EXISTS assets.recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    organization_id UUID,
    source_buffer_id UUID,
    recording_type VARCHAR(32) NOT NULL DEFAULT 'mixed'
        CHECK (recording_type IN ('mixed', 'iso_video', 'iso_audio', 'composite')),
    participant_id UUID,
    r2_bucket VARCHAR(64) NOT NULL DEFAULT 'allstrm-recordings',
    r2_key VARCHAR(512),
    s3_key VARCHAR(512),
    r2_region VARCHAR(32) NOT NULL DEFAULT 'auto',
    file_size_bytes BIGINT,
    size_bytes BIGINT,
    duration_seconds INTEGER,
    checksum_sha256 VARCHAR(64),
    video_codec VARCHAR(32),
    audio_codec VARCHAR(32),
    format VARCHAR(32) NOT NULL DEFAULT 'mp4',
    resolution VARCHAR(16),
    fps INTEGER,
    bitrate_kbps INTEGER,
    status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'uploading', 'processing', 'available', 'completed', 'failed', 'deleted')),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}',
    recorded_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transcodes
CREATE TABLE IF NOT EXISTS assets.transcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES assets.recordings(id) ON DELETE CASCADE,
    format VARCHAR(32) NOT NULL CHECK (format IN ('mp4', 'webm', 'hls', 'audio_mp3', 'audio_aac')),
    quality VARCHAR(32) NOT NULL CHECK (quality IN ('original', '1080p', '720p', '480p', '360p', 'audio_only')),
    r2_key VARCHAR(512) NOT NULL,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress_percent INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    job_id VARCHAR(64),
    worker_id VARCHAR(64),
    job_started_at TIMESTAMPTZ,
    job_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_transcode UNIQUE (recording_id, format, quality)
);

-- Thumbnails
CREATE TABLE IF NOT EXISTS assets.thumbnails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES assets.recordings(id) ON DELETE CASCADE,
    r2_key VARCHAR(512) NOT NULL,
    timestamp_seconds INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format VARCHAR(16) NOT NULL DEFAULT 'webp' CHECK (format IN ('webp', 'jpg', 'png')),
    file_size_bytes INTEGER,
    thumbnail_type VARCHAR(32) NOT NULL DEFAULT 'frame'
        CHECK (thumbnail_type IN ('frame', 'poster', 'sprite', 'animated_gif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_thumbnail UNIQUE (recording_id, timestamp_seconds, thumbnail_type)
);

-- Uploads (general assets)
CREATE TABLE IF NOT EXISTS assets.uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    asset_type VARCHAR(32) NOT NULL
        CHECK (asset_type IN ('image', 'video', 'audio', 'overlay', 'background', 'logo', 'other')),
    name VARCHAR(255) NOT NULL,
    s3_key VARCHAR(512) NOT NULL UNIQUE,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 6: INDEXES
-- ============================================================================

SET search_path TO public;

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_core_users_email ON core.users(email);
CREATE INDEX IF NOT EXISTS idx_core_org_members_user ON core.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_core_org_members_org ON core.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_core_rooms_org ON core.rooms(organization_id);
CREATE INDEX IF NOT EXISTS idx_core_rooms_owner ON core.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_core_rooms_status ON core.rooms(status) WHERE status NOT IN ('idle', 'ended');
CREATE INDEX IF NOT EXISTS idx_core_room_participants_room ON core.room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_core_room_participants_user ON core.room_participants(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_core_room_participants_active ON core.room_participants(room_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_core_api_keys_org ON core.api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_core_api_keys_user ON core.api_keys(user_id);

-- Stream indexes
CREATE INDEX IF NOT EXISTS idx_stream_rtmp_active ON stream.rtmp_sessions(room_id) WHERE disconnected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stream_rtmp_key ON stream.rtmp_sessions(stream_key);
CREATE INDEX IF NOT EXISTS idx_stream_hls_room ON stream.hls_segments(room_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_stream_dest_room ON stream.destinations(room_id);
CREATE INDEX IF NOT EXISTS idx_stream_dest_enabled ON stream.destinations(room_id, enabled) WHERE enabled = TRUE;

-- Assets indexes
CREATE INDEX IF NOT EXISTS idx_assets_recordings_room ON assets.recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_assets_recordings_org ON assets.recordings(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_recordings_status ON assets.recordings(status) WHERE status != 'deleted';
CREATE INDEX IF NOT EXISTS idx_assets_transcodes_recording ON assets.transcodes(recording_id);
CREATE INDEX IF NOT EXISTS idx_assets_uploads_room ON assets.uploads(room_id);

-- ============================================================================
-- SECTION 7: FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS set_updated_at_users ON core.users;
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON core.users
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_organizations ON core.organizations;
CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON core.organizations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_rooms ON core.rooms;
CREATE TRIGGER set_updated_at_rooms BEFORE UPDATE ON core.rooms
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_destinations ON stream.destinations;
CREATE TRIGGER set_updated_at_destinations BEFORE UPDATE ON stream.destinations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Generate stream key
CREATE OR REPLACE FUNCTION public.generate_stream_key(room_id UUID)
RETURNS VARCHAR(128) AS $$
BEGIN
    RETURN CONCAT(
        REPLACE(room_id::TEXT, '-', ''),
        '_',
        encode(gen_random_bytes(16), 'hex')
    );
END;
$$ LANGUAGE plpgsql;

-- Cleanup stale participants
CREATE OR REPLACE FUNCTION core.cleanup_stale_participants(timeout_seconds INTEGER DEFAULT 60)
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE core.room_participants
    SET left_at = NOW(), status = 'disconnected'
    WHERE left_at IS NULL
      AND joined_at < NOW() - (timeout_seconds || ' seconds')::INTERVAL;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 8: OAUTH CONNECTIONS
-- ============================================================================

SET search_path TO core, public;

-- OAuth Connections (stores user connections to streaming platforms)
CREATE TABLE IF NOT EXISTS core.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL
        CHECK (provider IN ('youtube', 'twitch', 'facebook', 'linkedin', 'x', 'instagram', 'tiktok', 'kick', 'vimeo', 'amazon', 'brightcove', 'hopin', 'custom_rtmp')),
    provider_user_id VARCHAR(128) NOT NULL,
    provider_username VARCHAR(128),
    provider_display_name VARCHAR(255),
    provider_avatar_url TEXT,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

-- OAuth State (for CSRF protection during OAuth flow)
CREATE TABLE IF NOT EXISTS core.oauth_state (
    state VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    redirect_uri TEXT NOT NULL,
    room_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);

-- YouTube Broadcast Info (cached from YouTube API)
CREATE TABLE IF NOT EXISTS core.youtube_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES core.oauth_connections(id) ON DELETE CASCADE,
    broadcast_id VARCHAR(64) NOT NULL,
    stream_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    privacy_status VARCHAR(32) NOT NULL DEFAULT 'unlisted',
    ingestion_address TEXT,
    stream_name TEXT,
    backup_ingestion_address TEXT,
    resolution VARCHAR(32),
    frame_rate VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'ready',
    scheduled_start_time TIMESTAMPTZ,
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_broadcast UNIQUE (connection_id, broadcast_id)
);

-- Twitch Stream Info (cached from Twitch API)
CREATE TABLE IF NOT EXISTS core.twitch_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES core.oauth_connections(id) ON DELETE CASCADE,
    channel_id VARCHAR(64) NOT NULL,
    channel_name VARCHAR(128) NOT NULL,
    stream_key_encrypted TEXT,
    ingest_endpoint TEXT,
    title VARCHAR(255),
    game_id VARCHAR(32),
    game_name VARCHAR(128),
    is_live BOOLEAN NOT NULL DEFAULT FALSE,
    viewer_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_twitch_channel UNIQUE (connection_id, channel_id)
);

-- OAuth connection indexes
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user ON core.oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON core.oauth_connections(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON core.oauth_state(expires_at);
CREATE INDEX IF NOT EXISTS idx_youtube_broadcasts_connection ON core.youtube_broadcasts(connection_id);
CREATE INDEX IF NOT EXISTS idx_twitch_streams_connection ON core.twitch_streams(connection_id);

-- Trigger for oauth_connections updated_at
DROP TRIGGER IF EXISTS set_updated_at_oauth_connections ON core.oauth_connections;
CREATE TRIGGER set_updated_at_oauth_connections BEFORE UPDATE ON core.oauth_connections
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Cleanup expired OAuth states
CREATE OR REPLACE FUNCTION core.cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM core.oauth_state WHERE expires_at < NOW();
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 9: SEED DATA
-- ============================================================================

-- Development user
INSERT INTO core.users (id, email, display_name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@allstrm.local', 'Development User', 'enterprise')
ON CONFLICT (email) DO NOTHING;

-- Development organization
INSERT INTO core.organizations (id, name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours)
VALUES ('00000000-0000-0000-0000-000000000002', 'ALLSTRM Development', 'allstrm-dev', 'enterprise', 100, 50, 10000, 1000)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
