-- ============================================================================
-- ALLSTRM CONSOLIDATED DATABASE SCHEMA
-- Version: 4.1.0
-- Date: January 2026
--
-- Single consolidated schema file for the ALLSTRM streaming platform.
-- Merges: 000_consolidated_schema.sql, 001_enterprise_features.sql, 002_oauth_connections.sql
--
-- Target: PostgreSQL 15+ / Supabase
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 2: SCHEMAS
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
        CHECK (plan IN ('free', 'creator', 'professional', 'broadcast', 'enterprise')),
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
        CHECK (billing_tier IN ('free', 'creator', 'professional', 'broadcast', 'enterprise')),
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

-- Projects (Workspace grouping)
CREATE TABLE IF NOT EXISTS core.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rooms (streaming sessions)
CREATE TABLE IF NOT EXISTS core.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES core.projects(id) ON DELETE SET NULL,
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
    is_in_waiting_room BOOLEAN NOT NULL DEFAULT FALSE,
    is_on_stage BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- Room guest permissions
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

-- Private messages
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

-- OAuth State (CSRF protection for OAuth flows)
CREATE TABLE IF NOT EXISTS core.oauth_state (
    state VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,  -- References auth.users via Supabase
    provider VARCHAR(32) NOT NULL,
    redirect_uri TEXT NOT NULL,
    room_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
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
    room_id UUID NOT NULL REFERENCES core.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL
        CHECK (platform IN ('youtube', 'twitch', 'facebook', 'linkedin', 'x', 'instagram', 'tiktok', 'kick', 'vimeo', 'amazon', 'brightcove', 'hopin', 'custom_rtmp', 'custom_srt')),
    name VARCHAR(128) NOT NULL,
    rtmp_url TEXT,
    rtmp_url_encrypted TEXT,
    stream_key_encrypted TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_connected BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'connecting', 'connected', 'live', 'error', 'disconnected')),
    last_error TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,
    bytes_sent BIGINT NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    viewer_count INTEGER NOT NULL DEFAULT 0,
    chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    chat_url TEXT,
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stream Health Metrics (real-time)
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

-- Stream Health Logs (historical)
CREATE TABLE IF NOT EXISTS stream.health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL,
    destination_id UUID REFERENCES stream.destinations(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    bitrate_kbps INTEGER,
    frame_rate REAL,
    dropped_frames INTEGER,
    latency_ms INTEGER,
    packet_loss_percent REAL,
    jitter_ms INTEGER,
    viewer_count INTEGER,
    chat_message_count INTEGER,
    error_code VARCHAR(64),
    error_message TEXT
);

-- ============================================================================
-- SECTION 5: ASSETS SCHEMA TABLES
-- ============================================================================

SET search_path TO assets, public;

-- Recordings
CREATE TABLE IF NOT EXISTS assets.recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES core.rooms(id) ON DELETE CASCADE,
    project_id UUID REFERENCES core.projects(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES core.organizations(id) ON DELETE CASCADE,
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
    destination VARCHAR(32) DEFAULT 'cloud'
        CHECK (destination IN ('local', 'cloud', 'both')),
    auto_upload_to_cloud BOOLEAN NOT NULL DEFAULT FALSE,
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
    room_id UUID NOT NULL REFERENCES core.rooms(id) ON DELETE CASCADE,
    project_id UUID REFERENCES core.projects(id) ON DELETE SET NULL,
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
-- SECTION 6: PUBLIC SCHEMA - OAUTH (for Supabase auth.users)
-- ============================================================================

SET search_path TO public;

-- OAuth connections (linked to auth.users for Supabase Auth)
-- Primary table for all OAuth integrations with streaming platforms
CREATE TABLE IF NOT EXISTS public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- References auth.users (managed by Supabase)
    provider VARCHAR(32) NOT NULL
        CHECK (provider IN ('youtube', 'twitch', 'facebook', 'linkedin', 'x', 'instagram', 'tiktok', 'kick', 'vimeo', 'custom_rtmp')),
    provider_user_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(255),
    provider_display_name VARCHAR(255),
    provider_avatar_url TEXT,
    -- Token storage (encrypted for security)
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    -- Status tracking
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_provider_account UNIQUE (user_id, provider, provider_user_id)
);

-- YouTube Broadcasts (cached broadcast metadata)
CREATE TABLE IF NOT EXISTS public.youtube_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.oauth_connections(id) ON DELETE CASCADE,
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

-- Twitch Streams (cached channel metadata)
CREATE TABLE IF NOT EXISTS public.twitch_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.oauth_connections(id) ON DELETE CASCADE,
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

-- Enable RLS for public.oauth_connections
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for oauth_connections
DROP POLICY IF EXISTS "Users can view own oauth connections" ON public.oauth_connections;
CREATE POLICY "Users can view own oauth connections"
    ON public.oauth_connections FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own oauth connections" ON public.oauth_connections;
CREATE POLICY "Users can create own oauth connections"
    ON public.oauth_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own oauth connections" ON public.oauth_connections;
CREATE POLICY "Users can update own oauth connections"
    ON public.oauth_connections FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own oauth connections" ON public.oauth_connections;
CREATE POLICY "Users can delete own oauth connections"
    ON public.oauth_connections FOR DELETE
    USING (auth.uid() = user_id);

-- Enable RLS for youtube_broadcasts and twitch_streams
ALTER TABLE public.youtube_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitch_streams ENABLE ROW LEVEL SECURITY;

-- RLS Policies for youtube_broadcasts
DROP POLICY IF EXISTS "Users can view own youtube broadcasts" ON public.youtube_broadcasts;
CREATE POLICY "Users can view own youtube broadcasts"
    ON public.youtube_broadcasts FOR SELECT
    USING (connection_id IN (SELECT id FROM public.oauth_connections WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own youtube broadcasts" ON public.youtube_broadcasts;
CREATE POLICY "Users can manage own youtube broadcasts"
    ON public.youtube_broadcasts FOR ALL
    USING (connection_id IN (SELECT id FROM public.oauth_connections WHERE user_id = auth.uid()));

-- RLS Policies for twitch_streams
DROP POLICY IF EXISTS "Users can view own twitch streams" ON public.twitch_streams;
CREATE POLICY "Users can view own twitch streams"
    ON public.twitch_streams FOR SELECT
    USING (connection_id IN (SELECT id FROM public.oauth_connections WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own twitch streams" ON public.twitch_streams;
CREATE POLICY "Users can manage own twitch streams"
    ON public.twitch_streams FOR ALL
    USING (connection_id IN (SELECT id FROM public.oauth_connections WHERE user_id = auth.uid()));

-- ============================================================================
-- SECTION 7: INDEXES
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
CREATE INDEX IF NOT EXISTS idx_core_participants_waiting_room ON core.room_participants(room_id) WHERE is_in_waiting_room = TRUE;
CREATE INDEX IF NOT EXISTS idx_core_participants_on_stage ON core.room_participants(room_id) WHERE is_on_stage = TRUE;
CREATE INDEX IF NOT EXISTS idx_core_api_keys_org ON core.api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_core_api_keys_user ON core.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_room ON core.private_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON core.private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_recipient ON core.private_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_unread ON core.private_messages(recipient_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON core.oauth_state(expires_at);

-- Stream indexes
CREATE INDEX IF NOT EXISTS idx_stream_rtmp_active ON stream.rtmp_sessions(room_id) WHERE disconnected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stream_rtmp_key ON stream.rtmp_sessions(stream_key);
CREATE INDEX IF NOT EXISTS idx_stream_hls_room ON stream.hls_segments(room_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_stream_dest_room ON stream.destinations(room_id);
CREATE INDEX IF NOT EXISTS idx_stream_dest_user ON stream.destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_stream_dest_enabled ON stream.destinations(room_id, enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_health_logs_room ON stream.health_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_destination ON stream.health_logs(destination_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_timestamp ON stream.health_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_room_time ON stream.health_logs(room_id, timestamp DESC);

-- Assets indexes
CREATE INDEX IF NOT EXISTS idx_assets_recordings_room ON assets.recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_assets_recordings_org ON assets.recordings(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_recordings_status ON assets.recordings(status) WHERE status != 'deleted';
CREATE INDEX IF NOT EXISTS idx_assets_transcodes_recording ON assets.transcodes(recording_id);
CREATE INDEX IF NOT EXISTS idx_assets_uploads_room ON assets.uploads(room_id);

-- Public oauth indexes
CREATE INDEX IF NOT EXISTS idx_public_oauth_user_id ON public.oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_public_oauth_provider ON public.oauth_connections(provider);
CREATE INDEX IF NOT EXISTS idx_public_oauth_active ON public.oauth_connections(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_youtube_broadcasts_connection ON public.youtube_broadcasts(connection_id);
CREATE INDEX IF NOT EXISTS idx_twitch_streams_connection ON public.twitch_streams(connection_id);

-- ============================================================================
-- SECTION 8: FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to core tables
DROP TRIGGER IF EXISTS set_updated_at_users ON core.users;
CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON core.users
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_organizations ON core.organizations;
CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON core.organizations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_rooms ON core.rooms;
CREATE TRIGGER set_updated_at_rooms BEFORE UPDATE ON core.rooms
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_room_guest_permissions ON core.room_guest_permissions;
CREATE TRIGGER set_updated_at_room_guest_permissions BEFORE UPDATE ON core.room_guest_permissions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_destinations ON stream.destinations;
CREATE TRIGGER set_updated_at_destinations BEFORE UPDATE ON stream.destinations
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Public oauth_connections trigger
CREATE OR REPLACE FUNCTION update_oauth_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS oauth_connections_updated_at ON public.oauth_connections;
CREATE TRIGGER oauth_connections_updated_at
    BEFORE UPDATE ON public.oauth_connections
    FOR EACH ROW EXECUTE FUNCTION update_oauth_connections_updated_at();

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

-- Handle new user registration (Supabase Auth trigger)
-- This function syncs auth.users with core.users and creates a default org
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    display_name_val VARCHAR(128);
BEGIN
    -- Extract display name from metadata, fallback to email prefix
    display_name_val := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), SPLIT_PART(NEW.email, '@', 1));

    -- 1. Create entry in core.users
    INSERT INTO core.users (id, email, display_name, avatar_url, plan)
    VALUES (
        NEW.id,
        NEW.email,
        display_name_val,
        NEW.raw_user_meta_data->>'avatar_url',
        'free'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW();

    -- 2. Create a default organization for the user
    INSERT INTO core.organizations (name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours)
    VALUES (
        CONCAT(display_name_val, '''s Workspace'),
        CONCAT(LOWER(REPLACE(display_name_val, ' ', '-')), '-', floor(random()*1000)::text),
        'free',
        1,  -- max_rooms
        5,  -- max_participants
        10, -- max_stream_hours
        0   -- max_recording_hours
    )
    RETURNING id INTO new_org_id;

    -- 3. Add user as owner to their new organization
    INSERT INTO core.organization_members (organization_id, user_id, role, permissions)
    VALUES (
        new_org_id,
        NEW.id,
        'owner',
        '{"can_manage_billing": true, "can_manage_members": true, "can_create_rooms": true}'::JSONB
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute handle_new_user on auth.users insert
-- Note: This requires superuser or being run by Supabase service role
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

-- Cleanup old private messages
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

-- Cleanup old health logs
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

-- ============================================================================
-- SECTION 9: VIEWS
-- ============================================================================

-- Room settings expanded view
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
-- SECTION 10: SEED DATA
-- ============================================================================

-- Note: Passwords for all seeded users is 'password123'
-- Hash: $2a$10$7Z8BRS.fU89y1Wv.9i4MBO0O1B6r/.Y1K6bS3B.r5l6O1b1l2l3l4

-- 1. Free Tier
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES (
    '00000000-0000-0000-0000-000000000001', 
    'free@allstrm.local', 
    '$2a$10$7Z8BRS.fU89y1Wv.9i4MBO0O1B6r/.Y1K6bS3B.r5l6O1b1l2l3l4', 
    NOW(), 
    '{"provider":"email","providers":["email"]}', 
    '{"full_name":"Free User"}', 
    'authenticated', 
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO core.users (id, email, display_name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'free@allstrm.local', 'Free User', 'free')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.organizations (id, name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours, max_destinations)
VALUES ('00000000-0000-0000-0001-000000000001', 'Free Workspace', 'free-workspace', 'free', 1, 5, 10, 0, 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO core.organization_members (organization_id, user_id, role)
VALUES ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'owner')
ON CONFLICT DO NOTHING;

-- 2. Creator Tier
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES (
    '00000000-0000-0000-0000-000000000002', 
    'creator@allstrm.local', 
    '$2a$10$rstcnl.Ef6z1cggRH088Ge3p3BsGbsP2ylC9qUwBQRJU77U65Aybu', 
    NOW(), 
    '{"provider":"email","providers":["email"]}', 
    '{"full_name":"Creator User"}', 
    'authenticated', 
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO core.users (id, email, display_name, plan)
VALUES ('00000000-0000-0000-0000-000000000002', 'creator@allstrm.local', 'Creator User', 'creator')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.organizations (id, name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours, max_destinations)
VALUES ('00000000-0000-0000-0001-000000000002', 'Creator Studio', 'creator-studio', 'creator', 3, 10, 50, 10, 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO core.organization_members (organization_id, user_id, role)
VALUES ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000002', 'owner')
ON CONFLICT DO NOTHING;

-- 3. Professional Tier
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES (
    '00000000-0000-0000-0000-000000000003', 
    'pro@allstrm.local', 
    '$2a$10$rstcnl.Ef6z1cggRH088Ge3p3BsGbsP2ylC9qUwBQRJU77U65Aybu', 
    NOW(), 
    '{"provider":"email","providers":["email"]}', 
    '{"full_name":"Pro User"}', 
    'authenticated', 
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO core.users (id, email, display_name, plan)
VALUES ('00000000-0000-0000-0000-000000000003', 'pro@allstrm.local', 'Pro User', 'professional')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.organizations (id, name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours, max_destinations)
VALUES ('00000000-0000-0000-0001-000000000003', 'Professional Team', 'pro-team', 'professional', 10, 25, 200, 50, 10)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO core.organization_members (organization_id, user_id, role)
VALUES ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000003', 'owner')
ON CONFLICT DO NOTHING;

-- 4. Enterprise Tier
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES (
    '00000000-0000-0000-0000-000000000004', 
    'enterprise@allstrm.local', 
    '$2a$10$rstcnl.Ef6z1cggRH088Ge3p3BsGbsP2ylC9qUwBQRJU77U65Aybu', 
    NOW(), 
    '{"provider":"email","providers":["email"]}', 
    '{"full_name":"Enterprise Admin"}', 
    'authenticated', 
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO core.users (id, email, display_name, plan)
VALUES ('00000000-0000-0000-0000-000000000004', 'enterprise@allstrm.local', 'Enterprise Admin', 'enterprise')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.organizations (id, name, slug, billing_tier, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours, max_destinations, features)
VALUES (
    '00000000-0000-0000-0001-000000000004', 
    'Enterprise Corp', 
    'enterprise-corp', 
    'enterprise', 
    100, 
    100, 
    10000, 
    1000, 
    100,
    '{"custom_branding": true, "iso_recording": true, "api_access": true}'::JSONB
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO core.organization_members (organization_id, user_id, role)
VALUES ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000004', 'owner')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 11: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.oauth_connections IS 'OAuth tokens for streaming platform integrations (YouTube, Twitch, etc.) - linked to auth.users';
COMMENT ON TABLE public.youtube_broadcasts IS 'Cached YouTube broadcast metadata for OAuth connections';
COMMENT ON TABLE public.twitch_streams IS 'Cached Twitch channel metadata for OAuth connections';
COMMENT ON TABLE stream.destinations IS 'RTMP/SRT streaming destinations for rooms';
COMMENT ON TABLE assets.recordings IS 'Recording files stored in R2/S3';
COMMENT ON TABLE stream.health_logs IS 'Historical stream health metrics for analytics';

-- ============================================================================
-- SECTION 12: RLS FOR CORE AND STREAM SCHEMAS
-- ============================================================================

-- Enable RLS for core tables
ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets.uploads ENABLE ROW LEVEL SECURITY;

-- 1. core.users policies
DROP POLICY IF EXISTS "Users can view own profile" ON core.users;
CREATE POLICY "Users can view own profile"
    ON core.users FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON core.users;
CREATE POLICY "Users can update own profile"
    ON core.users FOR UPDATE
    USING (auth.uid() = id);

-- 2. core.organizations policies
-- (Allows viewing if member of the organization)
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON core.organizations;
CREATE POLICY "Users can view organizations they belong to"
    ON core.organizations FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM core.organization_members
        WHERE organization_id = core.organizations.id
        AND user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Owners can update their organizations" ON core.organizations;
CREATE POLICY "Owners can update their organizations"
    ON core.organizations FOR UPDATE
    USING (id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid() AND role = 'owner'
    ));

-- 2b. core.projects policies
DROP POLICY IF EXISTS "Users can view projects in their organizations" ON core.projects;
CREATE POLICY "Users can view projects in their organizations"
    ON core.projects FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Owners can manage their projects" ON core.projects;
CREATE POLICY "Owners can manage their projects"
    ON core.projects FOR ALL
    USING (owner_id = auth.uid());

-- 3. core.organization_members policies
DROP POLICY IF EXISTS "Users can view workspace members" ON core.organization_members;
CREATE POLICY "Users can view workspace members"
    ON core.organization_members FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

-- 4. core.rooms policies
DROP POLICY IF EXISTS "Users can view rooms in their organizations" ON core.rooms;
CREATE POLICY "Users can view rooms in their organizations"
    ON core.rooms FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage their rooms" ON core.rooms;
CREATE POLICY "Owners can manage their rooms"
    ON core.rooms FOR ALL
    USING (owner_id = auth.uid());

-- 5. stream.destinations policies
DROP POLICY IF EXISTS "Users can manage destinations for their rooms" ON stream.destinations;
CREATE POLICY "Users can manage destinations for their rooms"
    ON stream.destinations FOR ALL
    USING (room_id IN (
        SELECT id FROM core.rooms WHERE owner_id = auth.uid()
    ));

-- 6. assets.recordings policies
DROP POLICY IF EXISTS "Users can view recordings in their organizations" ON assets.recordings;
CREATE POLICY "Users can view recordings in their organizations"
    ON assets.recordings FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Owners can manage their recordings" ON assets.recordings;
CREATE POLICY "Owners can manage their recordings"
    ON assets.recordings FOR ALL
    USING (room_id IN (
        SELECT id FROM core.rooms WHERE owner_id = auth.uid()
    ));

-- 7. assets.uploads policies
DROP POLICY IF EXISTS "Users can view uploads in their rooms" ON assets.uploads;
CREATE POLICY "Users can view uploads in their rooms"
    ON assets.uploads FOR SELECT
    USING (room_id IN (
        SELECT id FROM core.rooms WHERE organization_id IN (
            SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
        ) OR owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Owners can manage their uploads" ON assets.uploads;
CREATE POLICY "Owners can manage their uploads"
    ON assets.uploads FOR ALL
    USING (room_id IN (
        SELECT id FROM core.rooms WHERE owner_id = auth.uid()
    ));

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
