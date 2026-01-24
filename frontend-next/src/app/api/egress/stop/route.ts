import { EgressClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StopEgressRequest {
  egressId: string;
  roomId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: StopEgressRequest = await req.json();
    const { egressId, roomId } = body;

    // Initialize LiveKit Egress client
    const egressClient = new EgressClient(
      process.env.LIVEKIT_URL || 'http://localhost:7880',
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // Stop the egress
    await egressClient.stopEgress(egressId);

    // Update egress jobs in database
    await supabase
      .from('egress_jobs')
      .update({ status: 'stopped', ended_at: new Date().toISOString() })
      .eq('egress_id', egressId);

    // Update recording status if applicable
    await supabase
      .from('recordings')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('egress_id', egressId);

    return Response.json({
      success: true,
      egressId,
      status: 'stopped',
    });
  } catch (error) {
    console.error('[Egress Stop] Error:', error);
    return Response.json(
      { error: 'Failed to stop streaming', details: String(error) },
      { status: 500 }
    );
  }
}

// GET - List active egress for a room
export async function GET(req: NextRequest) {
  try {
    const roomId = req.nextUrl.searchParams.get('roomId');

    if (!roomId) {
      return Response.json(
        { error: 'roomId is required' },
        { status: 400 }
      );
    }

    // Initialize LiveKit Egress client
    const egressClient = new EgressClient(
      process.env.LIVEKIT_URL || 'http://localhost:7880',
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // List egress for the room
    const egressList = await egressClient.listEgress({ roomName: roomId });

    // Get database records for more details
    const { data: dbJobs } = await supabase
      .from('egress_jobs')
      .select('*, destinations(*)')
      .eq('room_id', roomId)
      .is('ended_at', null);

    return Response.json({
      active: egressList.map((e) => ({
        egressId: e.egressId,
        status: e.status,
        startedAt: e.startedAt,
        roomId: e.roomName,
      })),
      dbJobs: dbJobs || [],
    });
  } catch (error) {
    console.error('[Egress List] Error:', error);
    return Response.json(
      { error: 'Failed to list egress', details: String(error) },
      { status: 500 }
    );
  }
}
