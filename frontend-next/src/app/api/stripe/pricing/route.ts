import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

export interface TierPricing {
    id: string;
    tier: 'free' | 'creator' | 'professional' | 'broadcast' | 'enterprise';
    billing_interval: 'monthly' | 'yearly';
    stripe_price_id: string;
    price_cents: number;
    currency: string;
    max_rooms: number;
    max_participants_per_room: number;
    max_stream_hours_monthly: number;
    max_recording_hours: number;
    max_destinations: number;
    max_team_members: number;
    features: Record<string, boolean>;
}

// GET /api/stripe/pricing - Get available pricing tiers
export async function GET(req: NextRequest) {
    try {
        const { data: pricing, error } = await serviceRoleClient
            .from('tier_pricing')
            .select('*')
            .eq('is_active', true)
            .order('tier', { ascending: true })
            .order('billing_interval', { ascending: true });

        if (error) throw error;

        // Group by tier for easier consumption
        const groupedPricing: Record<string, { monthly?: TierPricing; yearly?: TierPricing }> = {};

        (pricing || []).forEach(p => {
            if (!groupedPricing[p.tier]) {
                groupedPricing[p.tier] = {};
            }
            groupedPricing[p.tier][p.billing_interval as 'monthly' | 'yearly'] = p;
        });

        // Create structured response with tier order
        const tiers = ['free', 'creator', 'professional', 'broadcast', 'enterprise'];
        const orderedPricing = tiers.map(tier => ({
            tier,
            name: getTierDisplayName(tier),
            description: getTierDescription(tier),
            pricing: groupedPricing[tier] || null
        })).filter(t => t.pricing);

        return NextResponse.json({
            pricing: orderedPricing,
            raw: pricing
        });

    } catch (error: any) {
        console.error('Pricing API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function getTierDisplayName(tier: string): string {
    const names: Record<string, string> = {
        free: 'Free',
        creator: 'Creator',
        professional: 'Professional',
        broadcast: 'Broadcast',
        enterprise: 'Enterprise'
    };
    return names[tier] || tier;
}

function getTierDescription(tier: string): string {
    const descriptions: Record<string, string> = {
        free: 'Perfect for getting started',
        creator: 'For solo creators and small projects',
        professional: 'For growing teams and businesses',
        broadcast: 'For high-volume streaming needs',
        enterprise: 'Custom solutions for large organizations'
    };
    return descriptions[tier] || '';
}
