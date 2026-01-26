-- ============================================================================
-- OAUTH CONNECTIONS MIGRATION
-- Version: 1.0.0
-- Date: January 2026
--
-- Adds OAuth connections table for streaming platform integrations
-- (YouTube, Twitch, Facebook, LinkedIn, X, Vimeo)
-- ============================================================================

-- OAuth connections table (stores OAuth tokens for streaming destinations)
CREATE TABLE IF NOT EXISTS public.oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(32) NOT NULL
        CHECK (provider IN ('youtube', 'twitch', 'facebook', 'linkedin', 'x', 'vimeo')),
    provider_user_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one connection per provider account per user
    CONSTRAINT unique_user_provider_account UNIQUE (user_id, provider, provider_user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_id ON public.oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON public.oauth_connections(provider);

-- Enable RLS
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own connections
CREATE POLICY "Users can view own oauth connections"
    ON public.oauth_connections
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own connections
CREATE POLICY "Users can create own oauth connections"
    ON public.oauth_connections
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update own oauth connections"
    ON public.oauth_connections
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete own oauth connections"
    ON public.oauth_connections
    FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_oauth_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oauth_connections_updated_at
    BEFORE UPDATE ON public.oauth_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_oauth_connections_updated_at();

-- Comment
COMMENT ON TABLE public.oauth_connections IS 'OAuth tokens for streaming platform integrations (YouTube, Twitch, etc.)';
