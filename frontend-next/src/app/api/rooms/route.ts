import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitResponse } from '@/lib/rateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        db: { schema: 'core' }
    }
);

// Helper to get organization limits and current usage
async function getOrgLimitsAndUsage(userId: string): Promise<{
    orgId: string;
    maxRooms: number;
    currentRooms: number;
    canCreate: boolean;
} | null> {
    // Get user's organization
    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, role, permissions')
        .eq('user_id', userId)
        .order('role', { ascending: true });

    if (!memberships || memberships.length === 0) {
        return null;
    }

    const orgId = memberships[0].organization_id;
    const canCreateRooms = memberships[0].permissions?.can_create_rooms !== false;

    // Get organization limits
    const { data: org } = await supabase
        .from('organizations')
        .select('max_rooms')
        .eq('id', orgId)
        .single();

    if (!org) return null;

    // Count current rooms
    const { count } = await supabase
        .from('rooms')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId);

    const currentRooms = count || 0;
    const maxRooms = org.max_rooms || 1;

    return {
        orgId,
        maxRooms,
        currentRooms,
        canCreate: canCreateRooms && currentRooms < maxRooms
    };
}

// GET /api/rooms?owner_id=xxx
export async function GET(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.rooms);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    const ownerId = request.nextUrl.searchParams.get('owner_id');
    if (!ownerId) return NextResponse.json({ error: 'owner_id required' }, { status: 400 });

    const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rooms: data });
}

// POST /api/rooms
export async function POST(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.rooms);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    try {
        const body = await request.json();
        const { owner_id, name, mode, settings } = body;

        if (!owner_id || !name) {
            return NextResponse.json({ error: 'owner_id and name are required' }, { status: 400 });
        }

        // Check tier limits before creating
        const limits = await getOrgLimitsAndUsage(owner_id);

        if (!limits) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
        }

        if (!limits.canCreate) {
            return NextResponse.json({
                error: 'Room limit reached',
                message: `You have reached the maximum of ${limits.maxRooms} room(s) for your plan. Please upgrade to create more rooms.`,
                current: limits.currentRooms,
                max: limits.maxRooms,
                upgrade_required: true
            }, { status: 403 });
        }

        const { data, error } = await supabase
            .from('rooms')
            .insert({
                owner_id,
                organization_id: limits.orgId,
                name,
                mode: mode || 'studio',
                settings: settings || {},
                status: 'idle'
            })
            .select()
            .single();

        if (error) {
            console.error('[Rooms API] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}

// PATCH /api/rooms - for updating room settings or status
export async function PATCH(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.rooms);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    try {
        const body = await request.json();
        const { id, name, status, settings, description } = body;

        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (status !== undefined) updateData.status = status;
        if (settings !== undefined) updateData.settings = settings;
        if (description !== undefined) updateData.description = description;

        const { data, error } = await supabase
            .from('rooms')
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

// DELETE /api/rooms?id=xxx
export async function DELETE(request: NextRequest) {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.rooms);
    if (!rateLimit.success) {
        return rateLimitResponse(rateLimit);
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
