import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitResponse } from '@/lib/rateLimit';

// Validate environment variables at startup
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimit = checkRateLimit(clientIP, RATE_LIMITS.token);
    if (!rateLimit.success) {
      return rateLimitResponse(rateLimit);
    }
    // Validate required environment variables
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      console.error('[Token Route] Missing required environment variables:', {
        hasApiKey: !!LIVEKIT_API_KEY,
        hasApiSecret: !!LIVEKIT_API_SECRET,
      });
      return NextResponse.json(
        { error: 'Server configuration error: LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    if (!LIVEKIT_URL) {
      console.error('[Token Route] Missing NEXT_PUBLIC_LIVEKIT_URL');
      return NextResponse.json(
        { error: 'Server configuration error: LiveKit URL not configured' },
        { status: 500 }
      );
    }

    // Parse request
    const { roomId } = await params;
    
    let body: { displayName?: string; role?: string; userId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { displayName, role, userId } = body;

    // Validate required fields
    if (!roomId || typeof roomId !== 'string') {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedRoomId = roomId.trim().substring(0, 128);
    const sanitizedDisplayName = (displayName || 'Anonymous').trim().substring(0, 64);
    const sanitizedRole = ['host', 'co-host', 'guest', 'viewer'].includes(role || '') 
      ? role 
      : 'viewer';
    const sanitizedUserId = (userId || `user_${Date.now()}_${Math.random().toString(36).substring(7)}`).trim().substring(0, 128);

    // Determine permissions based on role
    const isHost = sanitizedRole === 'host';
    const isCoHost = sanitizedRole === 'co-host';
    const canPublish = isHost || isCoHost || sanitizedRole === 'guest';
    const canSubscribe = true;

    // Create LiveKit access token with proper configuration
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: sanitizedUserId,
      name: sanitizedDisplayName,
      ttl: '1h', // Token expires in 1 hour
      metadata: JSON.stringify({
        role: sanitizedRole,
        isHost,
        inWaitingRoom: sanitizedRole === 'guest', // Guests start in waiting room
        joinedAt: new Date().toISOString(),
      }),
    });

    // Build track sources array using proper enum values
    const publishSources: TrackSource[] = canPublish
      ? [
          TrackSource.CAMERA,
          TrackSource.MICROPHONE,
          TrackSource.SCREEN_SHARE,
          TrackSource.SCREEN_SHARE_AUDIO,
        ]
      : [];

    // Grant room access with explicit permissions
    token.addGrant({
      room: sanitizedRoomId,
      roomJoin: true,
      roomCreate: isHost, // Only hosts can create rooms
      roomList: false,
      roomRecord: isHost || isCoHost, // Hosts and co-hosts can record
      roomAdmin: isHost, // Only hosts have admin access
      canPublish,
      canSubscribe,
      canPublishData: true,
      canPublishSources: publishSources,
      canUpdateOwnMetadata: true,
      hidden: false,
      recorder: false,
    });

    // Generate JWT
    const jwt = await token.toJwt();

    console.log('[Token Route] Token generated successfully:', {
      roomId: sanitizedRoomId,
      identity: sanitizedUserId,
      role: sanitizedRole,
      canPublish,
    });

    return NextResponse.json({
      token: jwt,
      room: {
        id: sanitizedRoomId,
        name: `Room ${sanitizedRoomId}`,
      },
      serverUrl: LIVEKIT_URL,
    }, {
      headers: rateLimit.headers,
    });
  } catch (error) {
    console.error('[Token Route] Unexpected error:', error);
    
    // Don't expose internal error details to client
    return NextResponse.json(
      { error: 'Failed to generate access token' },
      { status: 500 }
    );
  }
}
