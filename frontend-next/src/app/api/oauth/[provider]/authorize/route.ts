import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_PROVIDERS } from '../../providers/route';

// Start OAuth authorization flow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const config = OAUTH_PROVIDERS[provider];

  if (!config) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Provider not configured. Use manual RTMP instead.' },
      { status: 400 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  const redirectUri = searchParams.get('redirect_uri') || '/dashboard';

  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  // Build OAuth state (contains user_id and redirect_uri)
  const state = Buffer.from(JSON.stringify({ userId, redirectUri, provider })).toString('base64url');

  // Build callback URL
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/oauth/${provider}/callback`;

  // Build authorization URL
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline', // For refresh tokens (Google)
    prompt: 'consent', // Force consent to get refresh token
  });

  // Provider-specific params
  if (provider === 'twitch') {
    authParams.set('force_verify', 'true');
  }
  if (provider === 'x') {
    authParams.set('code_challenge_method', 'plain');
    authParams.set('code_challenge', state); // Simplified PKCE
  }

  const authUrl = `${config.authUrl}?${authParams.toString()}`;

  return NextResponse.redirect(authUrl);
}
