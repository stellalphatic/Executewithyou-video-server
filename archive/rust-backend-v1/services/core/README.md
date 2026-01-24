# ALLSTRM Core Service

Business logic service for rooms, users, organizations, destinations, and OAuth integrations.

## Responsibilities

- **Room CRUD**: Create, read, update, delete rooms
- **User Management**: User profiles, permissions
- **Organization Management**: Multi-tenant organization support
- **Destinations CRUD**: RTMP destination management
- **OAuth Integration**: 13 streaming platform OAuth connections
- **Permissions**: Role-based access control

## Database

Uses the `core` schema:
- `core.organizations`
- `core.users` (Supabase auth)
- `core.rooms`
- `core.room_participants`
- `core.api_keys`
- `core.oauth_connections` - OAuth platform connections
- `core.oauth_state` - CSRF tokens for OAuth flows

Uses the `stream` schema:
- `stream.destinations`

## Configuration

```bash
CORE_PORT=8081
CORE_DATABASE_URL=postgres://user:pass@localhost:5432/allstrm
CORE_REDIS_URL=redis://localhost:6379/1
RUN_MIGRATIONS=true
```

### OAuth Configuration (Optional)

```bash
# Required for OAuth callbacks
OAUTH_REDIRECT_BASE_URL=http://localhost:8080

# YouTube (Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Facebook/Instagram
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# X/Twitter
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=

# Twitch
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# Vimeo
VIMEO_CLIENT_ID=
VIMEO_CLIENT_SECRET=

# Amazon
AMAZON_CLIENT_ID=
AMAZON_CLIENT_SECRET=

# Brightcove
BRIGHTCOVE_ACCOUNT_ID=
BRIGHTCOVE_CLIENT_SECRET=

# Hopin
HOPIN_CLIENT_ID=
HOPIN_CLIENT_SECRET=
```

## API Endpoints

### Rooms
- `POST   /api/rooms` - Create room
- `GET    /api/rooms` - List rooms
- `GET    /api/rooms/:id` - Get room
- `PUT    /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room
- `GET    /api/rooms/:id/participants` - List participants

### Destinations
- `POST   /api/rooms/:room_id/destinations` - Create destination
- `GET    /api/rooms/:room_id/destinations` - List destinations
- `GET    /api/rooms/:room_id/destinations/:id` - Get destination
- `PUT    /api/rooms/:room_id/destinations/:id` - Update destination
- `DELETE /api/rooms/:room_id/destinations/:id` - Delete destination
- `POST   /api/rooms/:room_id/destinations/:id/toggle` - Toggle enabled

### OAuth
- `GET    /api/oauth/providers` - List available OAuth providers
- `GET    /api/oauth/:provider/authorize` - Initiate OAuth flow
- `GET    /api/oauth/:provider/callback` - OAuth callback
- `GET    /api/oauth/connections` - List user's connections
- `DELETE /api/oauth/connections/:id` - Disconnect platform
- `GET    /api/oauth/connections/:id/destination` - Get stream key/URL

### Users
- `GET    /api/users/:id` - Get user
- `POST   /api/users/:id/api-keys` - Create API key
- `GET    /api/users/:id/api-keys` - List API keys
- `DELETE /api/users/:id/api-keys/:key_id` - Revoke API key

## Supported OAuth Platforms

| Platform | ID | OAuth Type | Auto Stream Key |
|----------|-----|------------|-----------------|
| YouTube | `youtube` | Google OAuth | Yes |
| Facebook Live | `facebook` | Facebook Login | Yes |
| LinkedIn Live | `linkedin` | LinkedIn OAuth | Yes |
| X (Twitter) | `x` | OAuth 2.0 + PKCE | Yes |
| Twitch | `twitch` | Twitch OAuth | Yes |
| Instagram Live | `instagram` | Facebook OAuth | Yes (Business) |
| TikTok Live | `tiktok` | TikTok Login Kit | Yes |
| Kick | `kick` | Manual RTMP | No |
| Vimeo | `vimeo` | Vimeo OAuth | Yes |
| Amazon Live | `amazon` | Amazon OAuth | Yes |
| Brightcove | `brightcove` | Client Credentials | Yes |
| Hopin | `hopin` | Hopin OAuth | Yes |
| Custom RTMP | `custom_rtmp` | Manual | No |

## Running

```bash
# Development
cargo run --package allstrm-core

# Production
cargo build --release --package allstrm-core
./target/release/allstrm-core
```
