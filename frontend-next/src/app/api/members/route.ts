import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

export interface OrganizationMember {
    id: string;
    email: string;
    role: 'owner' | 'admin' | 'member';
    status: 'active' | 'pending';
    invited_at: string;
    joined_at: string | null;
    full_name?: string;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    try {
        // 1. Get user's organization(s) - get the primary one (owner or first membership)
        const { data: memberships, error: memError } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', userId)
            .order('role', { ascending: true }); // owner first

        if (memError) throw memError;

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ members: [] });
        }

        // Use the first organization (should be the primary one)
        const orgId = memberships[0].organization_id;

        // 2. Fetch all members of this organization
        const { data: orgMembers, error: orgError } = await serviceRoleClient
            .from('organization_members')
            .select('id, user_id, role, invited_at, joined_at')
            .eq('organization_id', orgId);

        if (orgError) throw orgError;

        // 3. Fetch user details for each member
        const userIds = (orgMembers || []).map(m => m.user_id);
        const { data: users, error: userError } = await serviceRoleClient
            .from('users')
            .select('id, email, display_name')
            .in('id', userIds);

        if (userError) {
            // Fallback: try auth.users if core.users doesn't have the data
            console.warn('Could not fetch from core.users, trying to get email from metadata');
        }

        // Create a map of user_id to user details
        const userMap = new Map<string, { email: string; full_name?: string }>();
        (users || []).forEach(u => {
            userMap.set(u.id, { email: u.email, full_name: u.display_name });
        });

        // 4. Format the response
        const members: OrganizationMember[] = (orgMembers || []).map(member => {
            const userDetails = userMap.get(member.user_id);
            return {
                id: member.id,
                email: userDetails?.email || `user-${member.user_id.slice(0, 8)}@unknown`,
                role: member.role,
                status: member.joined_at ? 'active' : 'pending',
                invited_at: member.invited_at,
                joined_at: member.joined_at,
                full_name: userDetails?.full_name
            };
        });

        return NextResponse.json({ members, organization_id: orgId });

    } catch (error: any) {
        console.error('Members API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, email, role = 'member' } = body;

        if (!user_id || !email) {
            return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 });
        }

        // 1. Get user's organization
        const { data: memberships } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user_id)
            .order('role', { ascending: true });

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
        }

        const orgId = memberships[0].organization_id;
        const inviterRole = memberships[0].role;

        // Check if inviter has permission (owner or admin)
        if (inviterRole !== 'owner' && inviterRole !== 'admin') {
            return NextResponse.json({ error: 'Insufficient permissions to invite members' }, { status: 403 });
        }

        // 2. Check if email already exists in auth.users
        // For now, we'll create a pending invitation record
        // In production, this would send an email invitation

        // Create a placeholder user entry or find existing
        const { data: existingUser } = await serviceRoleClient
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            // Check if already a member
            const { data: existingMember } = await serviceRoleClient
                .from('organization_members')
                .select('id')
                .eq('organization_id', orgId)
                .eq('user_id', existingUser.id)
                .single();

            if (existingMember) {
                return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
            }

            // Add existing user to organization
            const { data: newMember, error: addError } = await serviceRoleClient
                .from('organization_members')
                .insert({
                    organization_id: orgId,
                    user_id: existingUser.id,
                    role: role,
                    invited_at: new Date().toISOString()
                })
                .select()
                .single();

            if (addError) throw addError;

            return NextResponse.json({
                success: true,
                member: {
                    id: newMember.id,
                    email: email,
                    role: role,
                    status: 'pending'
                }
            });
        }

        // User doesn't exist - in production, send invitation email
        // For now, return a message indicating invitation would be sent
        return NextResponse.json({
            success: true,
            message: 'Invitation would be sent to ' + email,
            pending: true
        });

    } catch (error: any) {
        console.error('Members POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('member_id');
    const userId = searchParams.get('user_id'); // The requester

    if (!memberId || !userId) {
        return NextResponse.json({ error: 'Missing member_id or user_id' }, { status: 400 });
    }

    try {
        // 1. Get member's organization
        const { data: member } = await serviceRoleClient
            .from('organization_members')
            .select('organization_id, role')
            .eq('id', memberId)
            .single();

        if (!member) {
            return NextResponse.json({ error: 'Member not found' }, { status: 404 });
        }

        // 2. Check requester's permissions
        const { data: requester } = await serviceRoleClient
            .from('organization_members')
            .select('role')
            .eq('organization_id', member.organization_id)
            .eq('user_id', userId)
            .single();

        if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        // Don't allow deleting owners
        if (member.role === 'owner') {
            return NextResponse.json({ error: 'Cannot remove organization owner' }, { status: 400 });
        }

        // 3. Delete the member
        const { error: deleteError } = await serviceRoleClient
            .from('organization_members')
            .delete()
            .eq('id', memberId);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Members DELETE Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
