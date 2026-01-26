import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

// GET /api/users/[userId] - Get user with their organizations
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId } = await params;

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    try {
        // Get user data
        const { data: user, error: userError } = await serviceRoleClient
            .from('users')
            .select('id, email, display_name, avatar_url, plan, created_at')
            .eq('id', userId)
            .single();

        if (userError) {
            console.error('[Users API] Error fetching user:', userError);
            return NextResponse.json({ error: userError.message }, { status: 500 });
        }

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get user's organizations through memberships
        const { data: memberships, error: memError } = await serviceRoleClient
            .from('organization_members')
            .select(`
                role,
                permissions,
                organization_id,
                organizations (
                    id,
                    name,
                    slug,
                    billing_tier,
                    max_rooms,
                    max_destinations,
                    max_stream_hours_monthly,
                    max_participants_per_room,
                    features
                )
            `)
            .eq('user_id', userId);

        if (memError) {
            console.error('[Users API] Error fetching memberships:', memError);
            return NextResponse.json({ error: memError.message }, { status: 500 });
        }

        // Format organizations with user's role
        const organizations = (memberships || []).map(m => ({
            ...(m.organizations as any),
            role: m.role,
            permissions: m.permissions
        }));

        return NextResponse.json({
            ...user,
            organizations
        });

    } catch (error: any) {
        console.error('[Users API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/users/[userId] - Update user profile
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId } = await params;

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { display_name, avatar_url } = body;

        const updateData: any = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

        const { data, error } = await serviceRoleClient
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[Users API] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
