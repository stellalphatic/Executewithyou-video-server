import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId } = await params;

    // Use Service Role Key to bypass RLS and access 'core' schema
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            db: { schema: 'core' }
        }
    );

    // Get user's plan from core.users
    const { data, error } = await supabase
        .from('users')
        .select('plan')
        .eq('id', userId)
        .single();

    if (error || !data) {
        console.error(`[Tier API] Error fetching tier for user ${userId}:`, error);
        // Default to free tier if user not found in core.users
        return NextResponse.json({ tier: 'free' });
    }

    return NextResponse.json({
        tier: data.plan || 'free'
    });
}
