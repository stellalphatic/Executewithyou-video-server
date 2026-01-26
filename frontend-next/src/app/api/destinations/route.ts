import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitResponse } from '@/lib/rateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        db: { schema: 'stream' }
    }
);

const coreClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        db: { schema: 'core' }
    }
);

// Helper to get organization limits and current destination count
async function getOrgDestinationLimits(userId: string): Promise<{
    orgId: string;
    maxDestinations: number;
    currentDestinations: number;
    canCreate: boolean;
} | null> {
    // Get user's organization
    const { data: memberships } = await coreClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .order('role', { ascending: true });

    if (!memberships || memberships.length === 0) {
        return null;
    }

    const orgId = memberships[0].organization_id;

    // Get organization limits
    const { data: org } = await coreClient
        .from('organizations')
        .select('max_destinations')
        .eq('id', orgId)
        .single();

    if (!org) return null;

    // Get all room IDs for this org
    const { data: rooms } = await coreClient
        .from('rooms')
        .select('id')
        .eq('organization_id', orgId);

    const roomIds = (rooms || []).map(r => r.id);

    // Count current destinations across all org rooms
    let currentDestinations = 0;
    if (roomIds.length > 0) {
        const { count } = await supabase
            .from('destinations')
            .select('*', { count: 'exact', head: true })
            .in('room_id', roomIds);
        currentDestinations = count || 0;
    }

    const maxDestinations = org.max_destinations || 1;

    return {
        orgId,
        maxDestinations,
        currentDestinations,
        canCreate: currentDestinations < maxDestinations
    };
}

// GET /api/destinations?user_id=xxx
export async function GET(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.destinations);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    const userId = request.nextUrl.searchParams.get('user_id');
    if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const { data, error } = await supabase
        .from('destinations')
        .select('*')
        .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ destinations: data });
}

// POST /api/destinations
export async function POST(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.destinations);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    try {
        const body = await request.json();
        const { user_id, platform, name, rtmp_url, stream_key, room_id, enabled } = body;

        // room_id is required due to FK constraint in the database
        if (!room_id) {
            return NextResponse.json({ error: 'room_id is required to create a destination' }, { status: 400 });
        }

        if (!user_id) {
            return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
        }

        // Check tier limits before creating
        const limits = await getOrgDestinationLimits(user_id);

        if (!limits) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
        }

        if (!limits.canCreate) {
            return NextResponse.json({
                error: 'Destination limit reached',
                message: `You have reached the maximum of ${limits.maxDestinations} destination(s) for your plan. Please upgrade to add more destinations.`,
                current: limits.currentDestinations,
                max: limits.maxDestinations,
                upgrade_required: true
            }, { status: 403 });
        }

        const { data, error } = await supabase
            .from('destinations')
            .insert({
                user_id,
                room_id,
                organization_id: limits.orgId,
                platform,
                name,
                rtmp_url,
                stream_key_encrypted: stream_key, // Re-using existing column name from verified schema
                enabled: enabled ?? true,
                status: 'idle'
            })
            .select()
            .single();

        if (error) {
            console.error('[Destinations API] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}

// PATCH /api/destinations - for toggling enabled status
export async function PATCH(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.destinations);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    try {
        const body = await request.json();
        const { id, enabled, name } = body;

        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const updateData: any = {};
        if (enabled !== undefined) updateData.enabled = enabled;
        if (name !== undefined) updateData.name = name;

        const { data, error } = await supabase
            .from('destinations')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}

// DELETE /api/destinations?id=xxx
export async function DELETE(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.destinations);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase
        .from('destinations')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
