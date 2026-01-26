# AllStrm API Reference

## Overview

AllStrm uses **Next.js API Routes** for backend functionality, with **LiveKit** handling real-time communication and **Supabase** for authentication and data persistence.

## Base URLs

```
Development: http://localhost:3000/api
Production: https://app.allstrm.io/api
```

---

## Authentication

Authentication is handled by Supabase Auth. All protected routes require a valid session.

### Supabase Session
```typescript
// Client-side auth check
const { data: { user } } = await supabase.auth.getUser();
```

---

## API Endpoints

### LiveKit Token Generation

```http
POST /api/livekit/token
Content-Type: application/json
```

**Request Body:**
```json
{
  "roomName": "studio-abc123",
  "participantName": "John Doe",
  "role": "host" | "co-host" | "guest",
  "metadata": {
    "displayName": "John",
    "waitingRoom": true
  }
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Token Grants by Role:**

| Role | Permissions |
|------|-------------|
| host | room:create, room:admin, publish, subscribe, data |
| co-host | publish, subscribe, data |
| guest | subscribe, data (publish gated by host) |

---

### Egress API (Recording & Streaming)

#### Start Recording/Stream

```http
POST /api/egress/start
Content-Type: application/json
```

**Request Body:**
```json
{
  "roomName": "studio-abc123",
  "outputs": [
    {
      "type": "rtmp",
      "url": "rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx"
    }
  ]
}
```

**Response:**
```json
{
  "egressId": "EG_xxxxxxxxxxxxx",
  "status": "starting"
}
```

#### Stop Recording/Stream

```http
POST /api/egress/stop
Content-Type: application/json
```

**Request Body:**
```json
{
  "egressId": "EG_xxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "status": "stopped"
}
```

---

## LiveKit Data Messages

Real-time communication between participants uses LiveKit's Data API.

### Message Types

#### Stage Synchronization
```json
{
  "type": "stageSync",
  "participants": [
    {
      "id": "PA_xxx",
      "name": "John",
      "isOnStage": true,
      "position": { "x": 0, "y": 0, "width": 0.5, "height": 1 }
    }
  ],
  "timestamp": 1706234567890
}
```

#### Admission (Waiting Room)
```json
{
  "type": "admission",
  "participantId": "PA_xxx",
  "admitted": true
}
```

#### Kick Participant
```json
{
  "type": "kick",
  "participantId": "PA_xxx",
  "reason": "Removed by host"
}
```

#### Permission Update
```json
{
  "type": "permissionUpdate",
  "participantId": "PA_xxx",
  "permissions": {
    "audio": true,
    "video": false,
    "screenShare": false,
    "chat": true
  }
}
```

---

## Environment Variables

```env
# LiveKit Server
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>
```

---

## OAuth API (Streaming Platform Integrations)

OAuth enables automatic RTMP URL and stream key retrieval from connected platforms.

### List OAuth Providers

```http
GET /api/oauth/providers
```

**Response:**
```json
{
  "providers": [
    {
      "name": "youtube",
      "display_name": "YouTube",
      "icon": "youtube",
      "is_configured": true
    },
    {
      "name": "twitch",
      "display_name": "Twitch", 
      "icon": "twitch",
      "is_configured": false
    }
  ]
}
```

> **Note:** `is_configured` is `true` only when the platform's OAuth credentials are set in environment variables. Platforms with `is_configured: false` fall back to manual RTMP entry.

---

### Start OAuth Authorization

```http
GET /api/oauth/{provider}/authorize?user_id={uuid}&redirect_uri={path}
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| provider | string | Platform ID (youtube, twitch, facebook, linkedin, x, vimeo) |
| user_id | uuid | Supabase user ID |
| redirect_uri | string | Redirect path after OAuth (default: /dashboard) |

**Response:** Redirects to provider's OAuth consent page

---

### OAuth Callback

```http
GET /api/oauth/{provider}/callback?code={code}&state={state}
```

Handles the OAuth callback from providers. On success, redirects to:
```
{redirect_uri}?oauth_success={provider}
```

---

### List User Connections

```http
GET /api/oauth/connections?user_id={uuid}
```

**Response:**
```json
{
  "connections": [
    {
      "id": "conn_abc123",
      "provider": "youtube",
      "provider_user_id": "UC_xxx",
      "provider_username": "My YouTube Channel",
      "created_at": "2026-01-25T12:00:00Z",
      "updated_at": "2026-01-25T12:00:00Z"
    }
  ]
}
```

---

### Delete OAuth Connection

```http
DELETE /api/oauth/connections?id={conn_id}&user_id={uuid}
```

**Response:**
```json
{ "success": true }
```

---

### Get RTMP Destination from OAuth

```http
GET /api/oauth/connections/{id}/destination?user_id={uuid}
```

**Response:**
```json
{
  "provider": "youtube",
  "provider_username": "My Channel",
  "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
  "stream_key": "xxxx-xxxx-xxxx-xxxx"
}
```

> This endpoint automatically refreshes expired tokens when a refresh_token is available.

---

### OAuth Environment Variables

To enable OAuth for a platform, set these environment variables:

| Platform | Environment Variables |
|----------|----------------------|
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` |
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| X (Twitter) | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| Vimeo | `VIMEO_CLIENT_ID`, `VIMEO_CLIENT_SECRET` |

Also required: `SUPABASE_SERVICE_ROLE_KEY` (for storing OAuth tokens)

---

## RTMP Destinations

RTMP destinations are stored in browser localStorage and managed client-side.

**Storage Key:** `allstrm_destinations`

**Destination Object:**
```json
{
  "id": "dest_xxx",
  "name": "YouTube Live",
  "platform": "youtube",
  "rtmpUrl": "rtmp://a.rtmp.youtube.com/live2",
  "streamKey": "xxxx-xxxx-xxxx",
  "enabled": true
}
```

**Supported Platforms:**
- YouTube Live (OAuth + Manual)
- Twitch (OAuth + Manual)
- Facebook Live (OAuth + Manual)
- LinkedIn Live (OAuth + Manual)
- X / Twitter (OAuth + Manual)
- Vimeo (OAuth + Manual)
- Kick (Manual only)
- Custom RTMP (Manual only)
- Custom SRT (Manual only)

---

## Error Handling

All API responses follow this format for errors:

```json
{
  "error": "error_code",
  "message": "Human readable message"
}
```

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `invalid_request` | Missing or invalid parameters |
| 401 | `unauthorized` | Missing or invalid auth |
| 403 | `forbidden` | Insufficient permissions |
| 500 | `internal_error` | Server error |

---

## Rate Limiting

API routes are subject to Next.js/Vercel rate limits:
- 100 requests per 10 seconds per IP (development)
- Custom limits configurable for production

---

## WebSocket Events (LiveKit)

```javascript
// Subscribe to room events
room.on(RoomEvent.ParticipantConnected, (participant) => {});
room.on(RoomEvent.ParticipantDisconnected, (participant) => {});
room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {});
room.on(RoomEvent.DataReceived, (payload, participant) => {});
room.on(RoomEvent.ConnectionStateChanged, (state) => {});
```

See [LiveKit Client SDK](https://docs.livekit.io/client-sdk-js/) for full documentation.
