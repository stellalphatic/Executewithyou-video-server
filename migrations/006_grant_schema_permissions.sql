-- ============================================================================
-- GRANT SCHEMA PERMISSIONS
-- Version: 1.0.0
-- Date: January 2026
--
-- Grants necessary permissions for Supabase roles to access custom schemas
-- ============================================================================

-- Grant usage on schemas to all relevant roles
GRANT USAGE ON SCHEMA core TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA stream TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA assets TO anon, authenticated, service_role;

-- Grant all privileges on all tables in core schema
GRANT ALL ON ALL TABLES IN SCHEMA core TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA core TO anon;

-- Grant all privileges on all tables in stream schema
GRANT ALL ON ALL TABLES IN SCHEMA stream TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA stream TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA stream TO anon;

-- Grant all privileges on all tables in assets schema
GRANT ALL ON ALL TABLES IN SCHEMA assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA assets TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA assets TO anon;

-- Grant sequence usage (for auto-increment columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO service_role, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA stream TO service_role, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA assets TO service_role, authenticated;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA stream GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA stream GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA stream GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA assets GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA assets GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA assets GRANT SELECT ON TABLES TO anon;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO service_role, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA stream TO service_role, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA assets TO service_role, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, authenticated;

-- ============================================================================
-- END OF PERMISSIONS
-- ============================================================================
