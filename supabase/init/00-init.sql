-- Supabase Postgres Initialization Script
-- Creates all required roles and schemas for GoTrue (Auth) and Supabase services

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;

-- ============================================================================
-- Create supabase_admin role (required by migrate.sh in supabase/postgres image)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN PASSWORD 'postgres' SUPERUSER;
  END IF;
END
$$;

-- ============================================================================
-- Create supabase_auth_admin role (required by GoTrue)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN PASSWORD 'postgres' SUPERUSER;
  END IF;
END
$$;

-- ============================================================================
-- Grant privileges to supabase_auth_admin
-- ============================================================================
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON SCHEMA extensions TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON SCHEMA storage TO supabase_auth_admin;

-- Grant table, sequence, and function privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth TO supabase_auth_admin;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON FUNCTIONS TO supabase_auth_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supabase_auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO supabase_auth_admin;

-- ============================================================================
-- Create JWT roles (used by Supabase for row-level security)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- Grant usage on public schema to JWT roles
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Set default privileges for JWT roles
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- ============================================================================
-- Set search_path for supabase_auth_admin (CRITICAL for GoTrue to work)
-- ============================================================================
ALTER USER supabase_auth_admin SET search_path TO auth, public;