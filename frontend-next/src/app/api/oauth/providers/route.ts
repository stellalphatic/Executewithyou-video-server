import { NextResponse } from 'next/server';

// OAuth provider configuration
// Providers are configured via environment variables
// If client ID/secret not set, provider won't appear as OAuth-enabled

interface OAuthProviderConfig {
  name: string;
  displayName: string;
  icon: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  rtmpApiUrl?: string; // URL to fetch RTMP info
}

const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  youtube: {
    name: 'youtube',
    displayName: 'YouTube',
    icon: 'youtube',
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    scopes: ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    rtmpApiUrl: 'https://www.googleapis.com/youtube/v3/liveStreams',
  },
  twitch: {
    name: 'twitch',
    displayName: 'Twitch',
    icon: 'twitch',
    clientIdEnv: 'TWITCH_CLIENT_ID',
    clientSecretEnv: 'TWITCH_CLIENT_SECRET',
    scopes: ['channel:read:stream_key', 'user:read:email'],
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    rtmpApiUrl: 'https://api.twitch.tv/helix/streams/key',
  },
  facebook: {
    name: 'facebook',
    displayName: 'Facebook Live',
    icon: 'facebook',
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientSecretEnv: 'FACEBOOK_APP_SECRET',
    scopes: ['publish_video', 'pages_show_list', 'pages_read_engagement'],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    rtmpApiUrl: 'https://graph.facebook.com/v18.0/me/live_videos',
  },
  linkedin: {
    name: 'linkedin',
    displayName: 'LinkedIn Live',
    icon: 'linkedin',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    scopes: ['w_member_social', 'r_liteprofile'],
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  },
  x: {
    name: 'x',
    displayName: 'X (Twitter)',
    icon: 'x',
    clientIdEnv: 'X_CLIENT_ID',
    clientSecretEnv: 'X_CLIENT_SECRET',
    scopes: ['tweet.read', 'users.read', 'offline.access'],
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
  },
  vimeo: {
    name: 'vimeo',
    displayName: 'Vimeo',
    icon: 'vimeo',
    clientIdEnv: 'VIMEO_CLIENT_ID',
    clientSecretEnv: 'VIMEO_CLIENT_SECRET',
    scopes: ['public', 'private', 'video_files', 'interact'],
    authUrl: 'https://api.vimeo.com/oauth/authorize',
    tokenUrl: 'https://api.vimeo.com/oauth/access_token',
  },
};

export async function GET() {
  const providers = Object.entries(OAUTH_PROVIDERS).map(([key, config]) => {
    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    const isConfigured = !!(clientId && clientSecret);

    return {
      name: config.name,
      display_name: config.displayName,
      icon: config.icon,
      is_configured: isConfigured,
    };
  });

  return NextResponse.json({ providers });
}

// Export provider configs for use in other routes
export { OAUTH_PROVIDERS };
export type { OAuthProviderConfig };
