import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Client for core schema (users, organizations, rooms, etc.)
const coreClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'core' } }
);

// Client for assets schema (recordings, uploads)
const assetsClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { db: { schema: 'assets' } }
);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const orgId = searchParams.get('organization_id');

    if (!userId && !orgId) {
        return NextResponse.json({ error: 'Missing userId or organization_id' }, { status: 400 });
    }

    try {
        // 1. Fetch user's organizations if only userId is provided
        let targetOrgIds: string[] = [];
        if (orgId) {
            targetOrgIds = [orgId];
        } else {
            const { data: orgs } = await coreClient
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', userId);
            targetOrgIds = (orgs || []).map(o => o.organization_id);
        }

        // 2. Fetch rooms for the organizations (for uploads and room name lookup)
        const { data: rooms } = await coreClient
            .from('rooms')
            .select('id, name')
            .or(`organization_id.in.(${targetOrgIds.join(',')}),owner_id.eq.${userId}`);

        const roomIds = (rooms || []).map(r => r.id);
        const roomNameMap = new Map((rooms || []).map(r => [r.id, r.name]));

        // 3. Fetch Recordings from assets schema
        const { data: recordings, error: recError } = await assetsClient
            .from('recordings')
            .select('*')
            .in('organization_id', targetOrgIds);

        if (recError) throw recError;

        // 4. Fetch Uploads from assets schema
        const { data: uploads, error: upError } = await assetsClient
            .from('uploads')
            .select('*')
            .in('room_id', roomIds);

        if (upError) throw upError;

        // 5. Map to unified ExtendedAsset format
        const formattedRecordings = (recordings || []).map(rec => ({
            id: rec.id,
            title: rec.metadata?.title || `Recording - ${new Date(rec.created_at).toLocaleDateString()}`,
            thumbnail: rec.metadata?.thumbnail_url || 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80', // Fallback
            duration: rec.duration_seconds ? `${Math.floor(rec.duration_seconds / 60)}:${(rec.duration_seconds % 60).toString().padStart(2, '0')}` : '00:00',
            date: new Date(rec.created_at).toISOString().split('T')[0],
            size: rec.size_bytes ? `${(rec.size_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB',
            type: 'video',
            status: rec.status === 'completed' ? 'ready' : rec.status === 'failed' ? 'error' : 'processing',
            origin: 'studio', // Assume studio for now
            room_id: rec.room_id,
            room_name: roomNameMap.get(rec.room_id) || 'Unknown',
            resolution: rec.resolution
        }));

        const formattedUploads = (uploads || []).map(up => ({
            id: up.id,
            title: up.name,
            thumbnail: up.metadata?.thumbnail_url || 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&q=80', // Fallback
            duration: '00:00',
            date: new Date(up.created_at).toISOString().split('T')[0],
            size: up.size_bytes ? `${(up.size_bytes / 1024 / 1024).toFixed(1)} MB` : '0 MB',
            type: up.asset_type === 'audio' ? 'audio' : up.asset_type === 'image' ? 'image' : 'video',
            status: 'ready',
            origin: 'upload',
            room_id: up.room_id,
            room_name: roomNameMap.get(up.room_id) || 'Unknown',
            resolution: 'N/A'
        }));

        return NextResponse.json({
            assets: [...formattedRecordings, ...formattedUploads]
        });

    } catch (error: any) {
        console.error('Assets API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type'); // 'recording' | 'upload'

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    try {
        const table = type === 'upload' ? 'uploads' : 'recordings';
        const { error } = await assetsClient
            .from(table)
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
