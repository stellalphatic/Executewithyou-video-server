import { EgressClient, StreamProtocol, EncodedFileOutput, StreamOutput, RoomCompositeOptions } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StartEgressRequest {
  roomId: string;
  destinationIds: string[];
  recordingEnabled?: boolean;
  layout?: 'grid' | 'speaker' | 'single-speaker';
}

export async function POST(req: NextRequest) {
  try {
    const body: StartEgressRequest = await req.json();
    const { roomId, destinationIds, recordingEnabled = false, layout = 'grid' } = body;

    // Get streaming destinations from database
    const { data: destinations, error: destError } = await supabase
      .from('destinations')
      .select('*')
      .in('id', destinationIds);

    if (destError || !destinations?.length) {
      return Response.json(
        { error: 'No valid destinations found' },
        { status: 400 }
      );
    }

    // Initialize LiveKit Egress client
    const egressClient = new EgressClient(
      process.env.LIVEKIT_URL || 'http://localhost:7880',
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // Build RTMP stream outputs
    const streamOutputs: StreamOutput[] = destinations.map((dest) => ({
      protocol: StreamProtocol.RTMP,
      urls: [`${dest.rtmp_url}/${dest.stream_key}`],
    }));

    // Optional recording output
    let fileOutputs: EncodedFileOutput[] = [];
    if (recordingEnabled) {
      fileOutputs = [{
        filepath: `recordings/${roomId}/${Date.now()}.mp4`,
        disableManifest: false,
        s3: {
          accessKey: process.env.R2_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID!,
          secret: process.env.R2_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY!,
          bucket: process.env.R2_BUCKET || 'allstrm-recordings',
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT || process.env.S3_ENDPOINT_URL,
          forcePathStyle: true,
        },
      }];
    }

    // Room composite options
    const options: RoomCompositeOptions = {
      layout: layout,
      audioOnly: false,
      videoOnly: false,
    };

    // Start room composite egress
    const egress = await egressClient.startRoomCompositeEgress(
      roomId,
      {
        streamOutputs,
        fileOutputs: recordingEnabled ? fileOutputs : undefined,
      },
      options
    );

    // Store egress job in database
    for (const dest of destinations) {
      await supabase.from('egress_jobs').insert({
        room_id: roomId,
        destination_id: dest.id,
        egress_id: egress.egressId,
        status: 'starting',
      });
    }

    // If recording, store recording record
    if (recordingEnabled) {
      await supabase.from('recordings').insert({
        room_id: roomId,
        egress_id: egress.egressId,
        status: 'recording',
      });
    }

    return Response.json({
      success: true,
      egressId: egress.egressId,
      status: egress.status,
      destinations: destinations.map((d) => ({
        id: d.id,
        platform: d.platform,
        name: d.name,
      })),
    });
  } catch (error) {
    console.error('[Egress Start] Error:', error);
    return Response.json(
      { error: 'Failed to start streaming', details: String(error) },
      { status: 500 }
    );
  }
}
