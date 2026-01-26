import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OAUTH_PROVIDERS } from '../../../providers/route';

// Get RTMP destination info from OAuth connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: connectionId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch the OAuth connection
  const { data: connection, error: fetchError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const config = OAUTH_PROVIDERS[connection.provider];
  if (!config) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  // Refresh token if expired
  let accessToken = connection.access_token;
  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    if (connection.refresh_token) {
      const refreshed = await refreshAccessToken(connection.provider, connection.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        
        // Update token in database
        await supabase
          .from('oauth_connections')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || connection.refresh_token,
            token_expires_at: refreshed.expires_in
              ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              : connection.token_expires_at,
          })
          .eq('id', connectionId);
      } else {
        return NextResponse.json({ error: 'Token refresh failed', need_reauth: true }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Token expired', need_reauth: true }, { status: 401 });
    }
  }

  // Fetch RTMP info from provider
  try {
    const rtmpInfo = await fetchRTMPInfo(connection.provider, accessToken, config);
    
    return NextResponse.json({
      provider: connection.provider,
      provider_username: connection.provider_username,
      rtmp_url: rtmpInfo.rtmpUrl,
      stream_key: rtmpInfo.streamKey,
    });
  } catch (err) {
    console.error(`Failed to fetch RTMP info for ${connection.provider}:`, err);
    return NextResponse.json({ 
      error: 'Failed to fetch RTMP info',
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Refresh access token
async function refreshAccessToken(
  provider: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) return null;

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch RTMP URL and stream key from each provider
async function fetchRTMPInfo(
  provider: string,
  accessToken: string,
  config: typeof OAUTH_PROVIDERS[keyof typeof OAUTH_PROVIDERS]
): Promise<{ rtmpUrl: string; streamKey: string }> {
  const clientId = process.env[config.clientIdEnv];

  switch (provider) {
    case 'youtube': {
      // First, get the bound live stream
      const broadcastRes = await fetch(
        'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=contentDetails&broadcastStatus=upcoming&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (!broadcastRes.ok) {
        throw new Error('Failed to fetch YouTube broadcasts');
      }
      
      const broadcasts = await broadcastRes.json();
      const streamId = broadcasts.items?.[0]?.contentDetails?.boundStreamId;
      
      if (!streamId) {
        // No upcoming broadcast, create one or use default stream
        const streamsRes = await fetch(
          'https://www.googleapis.com/youtube/v3/liveStreams?part=cdn,snippet&mine=true',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!streamsRes.ok) {
          throw new Error('Failed to fetch YouTube streams');
        }
        
        const streams = await streamsRes.json();
        const stream = streams.items?.[0];
        
        if (!stream) {
          throw new Error('No YouTube stream found. Create a live stream in YouTube Studio first.');
        }
        
        return {
          rtmpUrl: stream.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: stream.cdn?.ingestionInfo?.streamName || '',
        };
      }
      
      // Get the stream key for this specific stream
      const streamRes = await fetch(
        `https://www.googleapis.com/youtube/v3/liveStreams?part=cdn&id=${streamId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      const streamData = await streamRes.json();
      const stream = streamData.items?.[0];
      
      return {
        rtmpUrl: stream?.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
        streamKey: stream?.cdn?.ingestionInfo?.streamName || '',
      };
    }

    case 'twitch': {
      const res = await fetch('https://api.twitch.tv/helix/streams/key', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId!,
        },
      });
      
      if (!res.ok) {
        // Try getting broadcaster ID first
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': clientId!,
          },
        });
        const userData = await userRes.json();
        const broadcasterId = userData.data?.[0]?.id;
        
        if (!broadcasterId) {
          throw new Error('Failed to get Twitch broadcaster ID');
        }
        
        const keyRes = await fetch(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${broadcasterId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': clientId!,
          },
        });
        
        if (!keyRes.ok) {
          throw new Error('Failed to fetch Twitch stream key');
        }
        
        const keyData = await keyRes.json();
        return {
          rtmpUrl: 'rtmp://live.twitch.tv/app',
          streamKey: keyData.data?.[0]?.stream_key || '',
        };
      }
      
      const data = await res.json();
      return {
        rtmpUrl: 'rtmp://live.twitch.tv/app',
        streamKey: data.data?.[0]?.stream_key || '',
      };
    }

    case 'facebook': {
      // Create a live video to get the stream URL
      const res = await fetch('https://graph.facebook.com/v18.0/me/live_videos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'UNPUBLISHED',
          title: 'AllStrm Live Stream',
        }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to create Facebook live video');
      }
      
      const data = await res.json();
      return {
        rtmpUrl: data.stream_url?.split('?')[0] || 'rtmps://live-api-s.facebook.com:443/rtmp/',
        streamKey: data.stream_url?.includes('?') 
          ? data.stream_url.split('?')[1] 
          : data.secure_stream_url?.split('/').pop() || '',
      };
    }

    case 'linkedin': {
      // LinkedIn Live requires approved accounts
      // Return placeholder - user needs custom RTMP setup
      return {
        rtmpUrl: 'rtmp://1-rtmp.linkedin.com/live',
        streamKey: 'Contact LinkedIn for stream key',
      };
    }

    case 'x': {
      // X/Twitter Live has limited API support
      return {
        rtmpUrl: 'rtmp://va.pscp.tv:80/x',
        streamKey: 'Use X/Twitter app for stream key',
      };
    }

    case 'vimeo': {
      // Fetch RTMP link
      const res = await fetch('https://api.vimeo.com/me/live_events', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch Vimeo live events');
      }
      
      const data = await res.json();
      const event = data.data?.[0];
      
      if (!event) {
        throw new Error('No Vimeo live event found. Create one in Vimeo first.');
      }
      
      return {
        rtmpUrl: event.streaming_configuration?.rtmp?.link || 'rtmps://rtmp-global.cloud.vimeo.com/live',
        streamKey: event.streaming_configuration?.rtmp?.key || '',
      };
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
