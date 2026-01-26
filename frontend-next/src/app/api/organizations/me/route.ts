import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

export interface OrganizationWithLimits {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    billing_tier: 'free' | 'creator' | 'professional' | 'broadcast' | 'enterprise';
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    // Limits
    max_rooms: number;
    max_participants_per_room: number;
    max_stream_hours_monthly: number;
    max_recording_hours: number;
    max_destinations: number;
    features: {
        custom_branding: boolean;
        iso_recording: boolean;
        api_access: boolean;
        sso?: boolean;
        dedicated_support?: boolean;
    };
    // Current usage
    current_rooms_count: number;
    current_destinations_count: number;
    current_members_count: number;
    // Subscription info
    subscription?: {
        status: string;
        billing_interval: string;
        current_period_end: string;
        cancel_at_period_end: boolean;
    };
    // User's role in this org
    user_role: 'owner' | 'admin' | 'member';
    user_permissions: {
        can_manage_billing: boolean;
        can_manage_members: boolean;
        can_create_rooms: boolean;
    };
    created_at: string;
}

// GET /api/organizations/me?user_id=xxx
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    try {
        // 1. Get user's primary organization membership
        const { data: memberships, error: memError } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role, permissions')
            .eq('user_id', userId)
            .order('role', { ascending: true }); // owner first

        if (memError) throw memError;

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        const membership = memberships[0];
        const orgId = membership.organization_id;

        // 2. Get organization details
        const { data: org, error: orgError } = await serviceRoleClient
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();

        if (orgError) throw orgError;
        if (!org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        // 3. Get current usage counts
        // Count rooms
        const { count: roomsCount } = await serviceRoleClient
            .from('rooms')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);

        // Count destinations (via rooms in org)
        const { data: orgRooms } = await serviceRoleClient
            .from('rooms')
            .select('id')
            .eq('organization_id', orgId);

        const roomIds = (orgRooms || []).map(r => r.id);
        let destinationsCount = 0;
        if (roomIds.length > 0) {
            const streamClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                { db: { schema: 'stream' } }
            );
            const { count } = await streamClient
                .from('destinations')
                .select('*', { count: 'exact', head: true })
                .in('room_id', roomIds);
            destinationsCount = count || 0;
        }

        // Count members
        const { count: membersCount } = await serviceRoleClient
            .from('organization_members')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);

        // 4. Get subscription info if exists
        let subscription = undefined;
        if (org.stripe_subscription_id) {
            const { data: sub } = await serviceRoleClient
                .from('subscriptions')
                .select('status, billing_interval, current_period_end, cancel_at_period_end')
                .eq('stripe_subscription_id', org.stripe_subscription_id)
                .single();

            if (sub) {
                subscription = {
                    status: sub.status,
                    billing_interval: sub.billing_interval,
                    current_period_end: sub.current_period_end,
                    cancel_at_period_end: sub.cancel_at_period_end
                };
            }
        }

        // 5. Build response
        const response: OrganizationWithLimits = {
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo_url: org.logo_url,
            billing_tier: org.billing_tier,
            stripe_customer_id: org.stripe_customer_id,
            stripe_subscription_id: org.stripe_subscription_id,
            // Limits
            max_rooms: org.max_rooms,
            max_participants_per_room: org.max_participants_per_room,
            max_stream_hours_monthly: org.max_stream_hours_monthly,
            max_recording_hours: org.max_recording_hours,
            max_destinations: org.max_destinations,
            features: org.features || {
                custom_branding: false,
                iso_recording: false,
                api_access: false
            },
            // Current usage
            current_rooms_count: roomsCount || 0,
            current_destinations_count: destinationsCount,
            current_members_count: membersCount || 0,
            // Subscription
            subscription,
            // User's role
            user_role: membership.role,
            user_permissions: membership.permissions || {
                can_manage_billing: membership.role === 'owner',
                can_manage_members: membership.role === 'owner' || membership.role === 'admin',
                can_create_rooms: true
            },
            created_at: org.created_at
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Organizations API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/organizations/me - Update organization settings
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, name, logo_url } = body;

        if (!user_id) {
            return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
        }

        // Get user's org and verify they're owner/admin
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user_id)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 404 });
        }

        const membership = memberships[0];
        if (membership.role !== 'owner' && membership.role !== 'admin') {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (logo_url !== undefined) updateData.logo_url = logo_url;

        const { data, error } = await serviceRoleClient
            .from('organizations')
            .update(updateData)
            .eq('id', membership.organization_id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Organizations PATCH Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
