-- ============================================================================
-- STRIPE SUBSCRIPTION TRACKING
-- Version: 4.2.0
-- Date: January 2026
--
-- Adds tables for tracking Stripe subscriptions and payment history
-- ============================================================================

SET search_path TO core, public;

-- Subscription tracking table
CREATE TABLE IF NOT EXISTS core.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(64) NOT NULL UNIQUE,
    stripe_customer_id VARCHAR(64) NOT NULL,
    stripe_price_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'paused')),
    billing_interval VARCHAR(16) NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment history / Invoices
CREATE TABLE IF NOT EXISTS core.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES core.subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(64) NOT NULL UNIQUE,
    stripe_customer_id VARCHAR(64) NOT NULL,
    amount_paid INTEGER NOT NULL, -- in cents
    amount_due INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    status VARCHAR(32) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void')),
    invoice_url TEXT,
    invoice_pdf TEXT,
    hosted_invoice_url TEXT,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment methods (cards on file)
CREATE TABLE IF NOT EXISTS core.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(64) NOT NULL UNIQUE,
    type VARCHAR(32) NOT NULL DEFAULT 'card',
    card_brand VARCHAR(32),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    billing_name VARCHAR(255),
    billing_email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tier pricing configuration (source of truth for Stripe price IDs)
CREATE TABLE IF NOT EXISTS core.tier_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('free', 'creator', 'professional', 'broadcast', 'enterprise')),
    billing_interval VARCHAR(16) NOT NULL
        CHECK (billing_interval IN ('monthly', 'yearly')),
    stripe_price_id VARCHAR(64) NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    -- Limits for this tier (used when upgrading)
    max_rooms INTEGER NOT NULL,
    max_participants_per_room INTEGER NOT NULL,
    max_stream_hours_monthly INTEGER NOT NULL,
    max_recording_hours INTEGER NOT NULL,
    max_destinations INTEGER NOT NULL,
    max_team_members INTEGER NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tier_interval UNIQUE (tier, billing_interval)
);

-- Insert default tier pricing (you'll need to replace with real Stripe price IDs)
INSERT INTO core.tier_pricing (tier, billing_interval, stripe_price_id, price_cents, max_rooms, max_participants_per_room, max_stream_hours_monthly, max_recording_hours, max_destinations, max_team_members, features)
VALUES
    ('free', 'monthly', 'price_free_monthly', 0, 1, 5, 10, 0, 1, 1, '{"custom_branding": false, "iso_recording": false, "api_access": false}'::JSONB),
    ('creator', 'monthly', 'price_creator_monthly', 2900, 3, 10, 50, 10, 3, 3, '{"custom_branding": false, "iso_recording": false, "api_access": false}'::JSONB),
    ('creator', 'yearly', 'price_creator_yearly', 29000, 3, 10, 50, 10, 3, 3, '{"custom_branding": false, "iso_recording": false, "api_access": false}'::JSONB),
    ('professional', 'monthly', 'price_pro_monthly', 7900, 10, 25, 200, 50, 10, 10, '{"custom_branding": true, "iso_recording": false, "api_access": true}'::JSONB),
    ('professional', 'yearly', 'price_pro_yearly', 79000, 10, 25, 200, 50, 10, 10, '{"custom_branding": true, "iso_recording": false, "api_access": true}'::JSONB),
    ('broadcast', 'monthly', 'price_broadcast_monthly', 19900, 25, 50, 500, 200, 25, 25, '{"custom_branding": true, "iso_recording": true, "api_access": true}'::JSONB),
    ('broadcast', 'yearly', 'price_broadcast_yearly', 199000, 25, 50, 500, 200, 25, 25, '{"custom_branding": true, "iso_recording": true, "api_access": true}'::JSONB),
    ('enterprise', 'monthly', 'price_enterprise_monthly', 49900, 100, 100, 10000, 1000, 100, 100, '{"custom_branding": true, "iso_recording": true, "api_access": true, "sso": true, "dedicated_support": true}'::JSONB),
    ('enterprise', 'yearly', 'price_enterprise_yearly', 499000, 100, 100, 10000, 1000, 100, 100, '{"custom_branding": true, "iso_recording": true, "api_access": true, "sso": true, "dedicated_support": true}'::JSONB)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON core.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON core.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON core.subscriptions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoices_org ON core.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON core.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON core.payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_tier_pricing_active ON core.tier_pricing(tier, billing_interval) WHERE is_active = TRUE;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at_subscriptions ON core.subscriptions;
CREATE TRIGGER set_updated_at_subscriptions BEFORE UPDATE ON core.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- RLS
ALTER TABLE core.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tier_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own org subscriptions" ON core.subscriptions;
CREATE POLICY "Users can view own org subscriptions"
    ON core.subscriptions FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view own org invoices" ON core.invoices;
CREATE POLICY "Users can view own org invoices"
    ON core.invoices FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view own org payment methods" ON core.payment_methods;
CREATE POLICY "Users can view own org payment methods"
    ON core.payment_methods FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM core.organization_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Anyone can view active tier pricing" ON core.tier_pricing;
CREATE POLICY "Anyone can view active tier pricing"
    ON core.tier_pricing FOR SELECT
    USING (is_active = TRUE);

-- Function to update org limits when subscription changes
CREATE OR REPLACE FUNCTION core.update_org_limits_from_subscription()
RETURNS TRIGGER AS $$
DECLARE
    tier_info RECORD;
BEGIN
    -- Get tier info from tier_pricing based on the price ID
    SELECT * INTO tier_info
    FROM core.tier_pricing
    WHERE stripe_price_id = NEW.stripe_price_id;

    IF tier_info IS NOT NULL THEN
        UPDATE core.organizations
        SET
            billing_tier = tier_info.tier,
            max_rooms = tier_info.max_rooms,
            max_participants_per_room = tier_info.max_participants_per_room,
            max_stream_hours_monthly = tier_info.max_stream_hours_monthly,
            max_recording_hours = tier_info.max_recording_hours,
            max_destinations = tier_info.max_destinations,
            features = tier_info.features,
            stripe_subscription_id = NEW.stripe_subscription_id,
            updated_at = NOW()
        WHERE id = NEW.organization_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_subscription_change ON core.subscriptions;
CREATE TRIGGER on_subscription_change
    AFTER INSERT OR UPDATE ON core.subscriptions
    FOR EACH ROW
    WHEN (NEW.status = 'active' OR NEW.status = 'trialing')
    EXECUTE FUNCTION core.update_org_limits_from_subscription();

-- ============================================================================
-- END OF STRIPE SUBSCRIPTIONS MIGRATION
-- ============================================================================
