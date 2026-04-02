/// <reference types="node" />
import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver, EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const EWY_CALLBACK_URL = process.env.EWY_CALLBACK_URL;
const EWY_WEBHOOK_SECRET = process.env.EWY_WEBHOOK_SECRET;

/**
 * POST /api/meeting-proxy/recording-webhook
 * 
 * LiveKit sends webhook events here when egress/recording status changes.
 * On completion, we forward the recording info to EWY's callback endpoint
 * so it can update the meeting's recordingUrl.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const authHeader = req.headers.get('authorization') || '';

    // Verify LiveKit webhook signature
    const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    let event;
    try {
      event = await receiver.receive(body, authHeader);
    } catch {
      console.error('[Recording Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('[Recording Webhook] Event received:', event.event, {
      egressId: event.egressInfo?.egressId,
      roomName: event.egressInfo?.roomName,
      status: event.egressInfo?.status,
      participant: event.participant?.identity,
      room: event.room?.name,
    });

    const isMerchant = event.participant?.identity?.startsWith('merchant_');

    // Auto-start egress when the merchant joins
    if (event.event === 'participant_joined' && event.room) {
      const room = event.room;
      let metadata: any = {};
      try {
        metadata = JSON.parse(room.metadata || '{}');
      } catch(e) {}
      
      console.log(`[Recording Webhook] Participant joined ${room.name}. Identity: ${event.participant?.identity}`);
      
      // If autoRecord is true and it's the merchant joining
      if (metadata.autoRecord && isMerchant) {
        console.log(`[Recording Webhook] Merchant joined, triggering auto-record for room: ${room.name}`);
        
        const egressClient = new EgressClient(
          process.env.LIVEKIT_URL || 'http://localhost:7880',
          LIVEKIT_API_KEY,
          LIVEKIT_API_SECRET
        );
        
        try {
          // Check if egress already exists
          const existing = await egressClient.listEgress({ roomName: room.name, active: true });
          if (!existing || existing.length === 0) {
            const s3Upload = new S3Upload({
              accessKey: process.env.S3_ACCESS_KEY_ID || '',
              secret: process.env.S3_SECRET_ACCESS_KEY || '',
              bucket: process.env.S3_BUCKET || 'executewithyou-recordings',
              region: process.env.S3_REGION || 'us-east-1',
              endpoint: process.env.S3_ENDPOINT_URL || '',
              forcePathStyle: false, // Must be false for AWS S3
            });

            const fileOutput = new EncodedFileOutput({
              filepath: `recordings/${room.name.replace('ewym_', '')}/${Date.now()}.mp4`,
              output: { case: 's3', value: s3Upload },
            });

            await egressClient.startRoomCompositeEgress(
              room.name,
              { file: fileOutput },
              { layout: 'grid' }
            );
            console.log(`[Recording Webhook] Successfully started RoomCompositeEgress for ${room.name}`);
          } else {
             console.log(`[Recording Webhook] Egress already active for ${room.name}, skipping.`);
          }
        } catch (e) {
          console.error(`[Recording Webhook] Failed to start auto-recording for ${room.name}:`, e);
        }
      }
    }

    // Stop auto-record when the merchant leaves and mark meeting as completed proactively
    if (event.event === 'participant_left' && event.room) {
      if (isMerchant) {
        const room = event.room;
        console.log(`[Recording Webhook] Merchant left, stopping egress for room: ${room.name}`);
        const egressClient = new EgressClient(
          process.env.LIVEKIT_URL || 'http://localhost:7880',
          LIVEKIT_API_KEY,
          LIVEKIT_API_SECRET
        );
        
        try {
          const existing = await egressClient.listEgress({ roomName: room.name, active: true });
          if (existing && existing.length > 0) {
            for (const egress of existing) {
              await egressClient.stopEgress(egress.egressId);
              console.log(`[Recording Webhook] Stopped egress ${egress.egressId}`);
            }
          }
        } catch (e) {
          console.error(`[Recording Webhook] Failed to stop auto-recording for ${room.name}:`, e);
        }

        // Notify EWY immediately that the meeting is completed
        const meetingId = room.name?.startsWith('ewym_') ? room.name.replace('ewym_', '') : null;
        if (meetingId && EWY_CALLBACK_URL && EWY_WEBHOOK_SECRET) {
          try {
            console.log(`[Recording Webhook] Notifying EWY to mark meeting ${meetingId} as completed (Merchant left)`);
            await fetch(EWY_CALLBACK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': EWY_WEBHOOK_SECRET,
              },
              body: JSON.stringify({
                meetingId,
                status: 'completed',
              }),
            });
          } catch (err) {
            console.error('[Recording Webhook] Failed to notify EWY of meeting completion:', err);
          }
        }
      }
    }

    // Handle egress completion events
    if (event.event === 'egress_ended' && event.egressInfo) {
      const { egressId, roomName, status } = event.egressInfo;

      // Extract meetingId from room name (format: ewym_<meetingId>)
      const meetingId = roomName?.startsWith('ewym_')
        ? roomName.replace('ewym_', '')
        : null;

      if (!meetingId) {
        console.log('[Recording Webhook] Not an EWY meeting room, skipping');
        return NextResponse.json({ ok: true, skipped: true });
      }

      // Extract recording file path from egress results
      let recordingPath = '';
      let fileSizeBytes = 0;
      let durationSeconds = 0;

      // Check file results (for S3 recordings)
      const fileResults = event.egressInfo.fileResults;
      if (fileResults && fileResults.length > 0) {
        const fileResult = fileResults[0];
        recordingPath = fileResult.filename || '';
        fileSizeBytes = Number(fileResult.size || 0);
        durationSeconds = Math.floor(Number(fileResult.duration || 0) / 1e9); // nanoseconds to seconds
      }

      // Forward to EWY callback
      if (EWY_CALLBACK_URL && EWY_WEBHOOK_SECRET) {
        try {
          const callbackResponse = await fetch(EWY_CALLBACK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Secret': EWY_WEBHOOK_SECRET,
            },
            body: JSON.stringify({
              meetingId,
              egressId,
              status: (status === 3 || String(status) === 'EGRESS_COMPLETE') ? 'completed' : 'failed', // EgressStatus.EGRESS_COMPLETE = 3
              recordingPath,
              fileSizeBytes,
              durationSeconds,
              completedAt: new Date().toISOString(),
            }),
          });

          if (!callbackResponse.ok) {
            console.error('[Recording Webhook] EWY callback failed:', callbackResponse.status);
          } else {
            console.log('[Recording Webhook] EWY callback success for meeting:', meetingId);
          }
        } catch (callbackError) {
          console.error('[Recording Webhook] EWY callback error:', callbackError);
        }
      } else {
        console.warn('[Recording Webhook] EWY_CALLBACK_URL or EWY_WEBHOOK_SECRET not set');
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Recording Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
