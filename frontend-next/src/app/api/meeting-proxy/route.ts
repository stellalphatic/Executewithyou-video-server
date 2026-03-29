import { AccessToken, TrackSource, RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitResponse } from '@/lib/rateLimit';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://localhost:7880';
const MEETING_API_SECRET = process.env.MEETING_API_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface CreateMeetingRequest {
  meetingId: string;        // EWY meeting UUID
  merchantName: string;     // Display name for merchant (host)
  clientName: string;       // Display name for client (guest)
  merchantId: string;       // EWY merchant user ID
  clientId?: string;        // EWY client ID (optional)
  duration?: number;        // Duration in minutes
  autoRecord?: boolean;     // Start recording automatically
}

/**
 * POST /api/meeting-proxy
 * 
 * Secure endpoint called by ExecuteWithYou to create meeting rooms.
 * Requires MEETING_API_SECRET in Authorization header.
 * Returns room details and tokens for both merchant and client.
 */
export async function POST(req: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(req);
  const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.rooms);
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit);
  }

  // Verify API secret
  const authHeader = req.headers.get('authorization');
  if (!MEETING_API_SECRET || !authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedSecret = authHeader.replace('Bearer ', '');
  if (providedSecret !== MEETING_API_SECRET) {
    return NextResponse.json({ error: 'Invalid API secret' }, { status: 401 });
  }

  try {
    const body: CreateMeetingRequest = await req.json();
    const {
      meetingId,
      merchantName,
      clientName,
      merchantId,
      clientId,
      duration = 45,
      autoRecord = true,
    } = body;

    if (!meetingId || !merchantName || !clientName || !merchantId) {
      return NextResponse.json(
        { error: 'meetingId, merchantName, clientName, and merchantId are required' },
        { status: 400 }
      );
    }

    // Use meetingId as the LiveKit room name for traceability
    const roomName = `ewym_${meetingId}`;

    // Create room via LiveKit Room Service
    const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300,          // 5 min after last participant leaves
      maxParticipants: 10,        // Allow some buffer
      metadata: JSON.stringify({
        source: 'executewithyou',
        meetingId,
        merchantId,
        clientId: clientId || null,
        duration,
        autoRecord,
        createdAt: new Date().toISOString(),
      }),
    });

    // Generate HOST token (merchant)
    const hostToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `merchant_${merchantId}`,
      name: merchantName,
      ttl: `${Math.max(duration * 2, 120)}m`, // 2x duration or 2 hours min
      metadata: JSON.stringify({
        role: 'host',
        isHost: true,
        source: 'executewithyou',
        ewMeetingId: meetingId,
      }),
    });

    hostToken.addGrant({
      room: roomName,
      roomJoin: true,
      roomCreate: true,
      roomAdmin: true,
      roomRecord: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
      canUpdateOwnMetadata: true,
    });

    // Generate GUEST token (client)
    const guestIdentity = clientId ? `client_${clientId}` : `guest_${meetingId}`;
    const guestToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: guestIdentity,
      name: clientName,
      ttl: `${Math.max(duration * 2, 120)}m`,
      metadata: JSON.stringify({
        role: 'guest',
        isHost: false,
        inWaitingRoom: false, // Direct join for scheduled meetings
        source: 'executewithyou',
        ewMeetingId: meetingId,
      }),
    });

    guestToken.addGrant({
      room: roomName,
      roomJoin: true,
      roomCreate: false,
      roomAdmin: false,
      roomRecord: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
      canUpdateOwnMetadata: true,
    });

    const hostJwt = await hostToken.toJwt();
    const guestJwt = await guestToken.toJwt();

    // Build meeting URLs
    const hostUrl = `${APP_URL}/meeting/${roomName}?token=${hostJwt}&role=host`;
    const guestUrl = `${APP_URL}/meeting/${roomName}?token=${guestJwt}&role=guest`;

    console.log('[Meeting Proxy] Room created:', {
      roomName,
      meetingId,
      autoRecord,
    });

    return NextResponse.json({
      success: true,
      roomId: roomName,
      hostToken: hostJwt,
      guestToken: guestJwt,
      hostUrl,
      guestUrl,
      serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    });
  } catch (error) {
    console.error('[Meeting Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create meeting room' },
      { status: 500 }
    );
  }
}
