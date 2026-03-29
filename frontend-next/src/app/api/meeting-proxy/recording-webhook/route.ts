import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';

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
    });

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
              status: status === 3 ? 'completed' : 'failed', // EgressStatus.EGRESS_COMPLETE = 3
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
