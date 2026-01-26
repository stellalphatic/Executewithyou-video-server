import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OAUTH_PROVIDERS } from '../../providers/route';

// OAuth callback - exchange code for tokens
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const config = OAUTH_PROVIDERS[provider];

  if (!config) {
    return NextResponse.redirect('/dashboard?error=unknown_provider');
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error(`OAuth error for ${provider}:`, error);
    return NextResponse.redirect(`/dashboard?error=${error}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect('/dashboard?error=missing_code');
  }

  // Decode state
  let state: { userId: string; redirectUri: string; provider: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
  } catch {
    return NextResponse.redirect('/dashboard?error=invalid_state');
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return NextResponse.redirect('/dashboard?error=not_configured');
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/oauth/${provider}/callback`;

  // Exchange code for tokens
  try {
    const tokenParams: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    };

    // X/Twitter requires PKCE
    if (provider === 'x') {
      tokenParams['code_verifier'] = stateParam;
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`Token exchange failed for ${provider}:`, errorText);
      return NextResponse.redirect('/dashboard?error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();

    // Get user info from provider
    const accountInfo = await fetchAccountInfo(provider, tokens.access_token, clientId);

    // Store in Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseServiceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not set');
      return NextResponse.redirect('/dashboard?error=server_config');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert OAuth connection
    const { error: dbError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: state.userId,
        provider,
        provider_user_id: accountInfo.id,
        provider_username: accountInfo.username,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: tokens.expires_in 
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        scopes: config.scopes,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider,provider_user_id',
      });

    if (dbError) {
      console.error('Failed to store OAuth connection:', dbError);
      return NextResponse.redirect('/dashboard?error=db_error');
    }

    // Redirect back to app
    const redirectUrl = state.redirectUri || '/dashboard';
    return NextResponse.redirect(`${redirectUrl}?oauth_success=${provider}`);

  } catch (err) {
    console.error(`OAuth callback error for ${provider}:`, err);
    return NextResponse.redirect('/dashboard?error=callback_failed');
  }
}

// Fetch account info from each provider
async function fetchAccountInfo(
  provider: string, 
  accessToken: string,
  clientId?: string
): Promise<{ id: string; username: string }> {
  switch (provider) {
    case 'youtube': {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const channel = data.items?.[0];
      return {
        id: channel?.id || 'unknown',
        username: channel?.snippet?.title || 'YouTube Channel',
      };
    }

    case 'twitch': {
      const res = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId!,
        },
      });
      const data = await res.json();
      const user = data.data?.[0];
      return {
        id: user?.id || 'unknown',
        username: user?.display_name || user?.login || 'Twitch User',
      };
    }

    case 'facebook': {
      const res = await fetch(
        'https://graph.facebook.com/v18.0/me?fields=id,name',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      return {
        id: data.id || 'unknown',
        username: data.name || 'Facebook User',
      };
    }

    case 'linkedin': {
      const res = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.id || 'unknown',
        username: `${data.localizedFirstName || ''} ${data.localizedLastName || ''}`.trim() || 'LinkedIn User',
      };
    }

    case 'x': {
      const res = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.data?.id || 'unknown',
        username: data.data?.username || 'X User',
      };
    }

    case 'vimeo': {
      const res = await fetch('https://api.vimeo.com/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.uri?.split('/').pop() || 'unknown',
        username: data.name || 'Vimeo User',
      };
    }

    default:
      return { id: 'unknown', username: 'Unknown' };
  }
}
