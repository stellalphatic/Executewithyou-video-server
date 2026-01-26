-- ============================================================================
-- FIX: handle_new_user() trigger function
-- Version: 4.2.1
-- Date: January 2026
--
-- Fixes slug generation to properly sanitize special characters
-- ============================================================================

-- Helper function to generate a clean slug
CREATE OR REPLACE FUNCTION public.slugify(text_input TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    -- Convert to lowercase
    result := LOWER(text_input);
    -- Replace spaces and underscores with hyphens
    result := REGEXP_REPLACE(result, '[\s_]+', '-', 'g');
    -- Remove all characters that aren't alphanumeric or hyphens
    result := REGEXP_REPLACE(result, '[^a-z0-9-]', '', 'g');
    -- Replace multiple consecutive hyphens with single hyphen
    result := REGEXP_REPLACE(result, '-+', '-', 'g');
    -- Remove leading/trailing hyphens
    result := TRIM(BOTH '-' FROM result);
    -- Ensure it's not empty, default to 'workspace'
    IF result = '' OR result IS NULL THEN
        result := 'workspace';
    END IF;
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Updated handle_new_user function with proper slug sanitization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    display_name_val VARCHAR(128);
    base_slug VARCHAR(64);
    final_slug VARCHAR(64);
    slug_suffix INTEGER;
BEGIN
    -- Extract display name from metadata, fallback to email prefix
    display_name_val := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );

    -- Ensure display_name is not empty
    IF display_name_val IS NULL OR display_name_val = '' THEN
        display_name_val := 'User';
    END IF;

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

    -- 2. Generate a unique slug
    -- Sanitize the display name for use in slug
    base_slug := public.slugify(display_name_val);

    -- Add random suffix to ensure uniqueness
    final_slug := base_slug || '-' || floor(random()*10000)::text;

    -- If somehow still conflicts, keep trying with different random numbers
    slug_suffix := 0;
    WHILE EXISTS (SELECT 1 FROM core.organizations WHERE slug = final_slug) AND slug_suffix < 100 LOOP
        slug_suffix := slug_suffix + 1;
        final_slug := base_slug || '-' || floor(random()*100000)::text;
    END LOOP;

    -- Final fallback: use UUID fragment
    IF EXISTS (SELECT 1 FROM core.organizations WHERE slug = final_slug) THEN
        final_slug := base_slug || '-' || REPLACE(gen_random_uuid()::text, '-', '')::varchar(8);
    END IF;

    -- 3. Create a default organization for the user
    INSERT INTO core.organizations (
        name,
        slug,
        billing_tier,
        max_rooms,
        max_participants_per_room,
        max_stream_hours_monthly,
        max_recording_hours,
        max_destinations
    )
    VALUES (
        display_name_val || '''s Workspace',
        final_slug,
        'free',
        1,  -- max_rooms
        5,  -- max_participants
        10, -- max_stream_hours
        0,  -- max_recording_hours
        1   -- max_destinations
    )
    RETURNING id INTO new_org_id;

    -- 4. Add user as owner to their new organization
    INSERT INTO core.organization_members (organization_id, user_id, role, permissions, joined_at)
    VALUES (
        new_org_id,
        NEW.id,
        'owner',
        '{"can_manage_billing": true, "can_manage_members": true, "can_create_rooms": true}'::JSONB,
        NOW()
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the user creation
        RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
        -- Re-raise to ensure proper error handling
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- END OF FIX
-- ============================================================================
