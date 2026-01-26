# ALLSTRM API Reference

## Base URL

```
Production: https://api.allstrm.io
Development: http://localhost:8080
```

## Authentication

All API requests require a JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Tokens are issued by Supabase Auth or the local dev mode refresh endpoint.

---

## Gateway Endpoints (Port 8080)

### Health Check

```http
GET /health
```

Response: `200 OK`
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

### Token Refresh

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token"
}
```

Response: `200 OK`
```json
{
  "access_token": "new_jwt_token",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "new_refresh_token",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

### Logout

```http
POST /auth/logout
Content-Type: application/json

{
  "refresh_token": "optional_refresh_token"
}
```

Response: `204 No Content`

---

## Room Endpoints

### Create Room

```http
POST /api/v1/rooms
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Stream",
  "mode": "studio",
  "settings": {
    "max_participants": 10,
    "auto_record": false
  }
}
```

Response: `201 Created`
```json
{
  "id": "uuid",
  "name": "My Stream",
  "mode": "studio",
  "status": "idle",
  "settings": {},
  "created_at": "2026-01-19T12:00:00Z"
}
```

### List Rooms

```http
GET /api/v1/rooms?limit=20&offset=0
Authorization: Bearer <token>
```

Response: `200 OK`
```json
{
  "rooms": [...],
  "total": 50,
  "limit": 20,
  "offset": 0
}
```

### Get Room

```http
GET /api/v1/rooms/:id
Authorization: Bearer <token>
```

### Update Room

```http
PATCH /api/v1/rooms/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "status": "live"
}
```

### Delete Room

```http
DELETE /api/v1/rooms/:id
Authorization: Bearer <token>
```

Response: `204 No Content`

### Join Room

```http
POST /api/v1/rooms/:id/join
Authorization: Bearer <token>
Content-Type: application/json

{
  "display_name": "John Doe",
  "role": "guest"
}
```

Response: `200 OK`
```json
{
  "participant_id": "uuid",
  "room_id": "uuid",
  "ice_servers": [...]
}
```

---

## Destination Endpoints

### List Destinations

```http
GET /api/v1/destinations?room_id=<uuid>
Authorization: Bearer <token>
```

### Create Destination

```http
POST /api/v1/destinations
Authorization: Bearer <token>
Content-Type: application/json

{
  "room_id": "uuid",
  "platform": "youtube",
  "name": "My YouTube Channel",
  "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
  "stream_key": "xxxx-xxxx-xxxx"
}
```

### Update Destination

```http
PATCH /api/v1/destinations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true
}
```

### Delete Destination

```http
DELETE /api/v1/destinations/:id
Authorization: Bearer <token>
```

### Test Destination

```http
POST /api/v1/destinations/:id/test
Authorization: Bearer <token>
```

---

## Recording Endpoints

### List Recordings

```http
GET /api/v1/recordings?room_id=<uuid>
Authorization: Bearer <token>
```

### Get Recording

```http
GET /api/v1/recordings/:id
Authorization: Bearer <token>
```

Response includes presigned download URL:
```json
{
  "id": "uuid",
  "room_id": "uuid",
  "status": "completed",
  "duration_seconds": 3600,
  "download_url": "https://r2.../signed-url"
}
```

### Delete Recording

```http
DELETE /api/v1/recordings/:id
Authorization: Bearer <token>
```

---

## Upload Endpoints

### Get Presigned Upload URL

```http
POST /api/v1/upload/sign
Authorization: Bearer <token>
Content-Type: application/json

{
  "room_id": "uuid",
  "filename": "overlay.png",
  "content_type": "image/png",
  "size_bytes": 102400
}
```

Response:
```json
{
  "upload_url": "https://r2.../presigned",
  "asset_id": "uuid",
  "expires_at": "2026-01-19T13:00:00Z"
}
```

### Complete Upload

```http
POST /api/v1/upload/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "asset_id": "uuid"
}
```

---

## WebSocket API

### Connection

```
wss://api.allstrm.io/ws?token=<jwt_token>&room_id=<uuid>
```

### Message Format

All messages use JSON format:

```json
{
  "type": "message_type",
  "payload": { ... }
}
```

### Client → Server Messages

#### Join Room
```json
{
  "type": "join",
  "payload": {
    "room_id": "uuid",
    "display_name": "John",
    "role": "guest"
  }
}
```

#### SDP Offer
```json
{
  "type": "sdp_offer",
  "payload": {
    "sdp": "v=0\r\n..."
  }
}
```

#### ICE Candidate
```json
{
  "type": "ice_candidate",
  "payload": {
    "candidate": "candidate:...",
    "sdp_mid": "0",
    "sdp_m_line_index": 0
  }
}
```

#### Leave Room
```json
{
  "type": "leave",
  "payload": {}
}
```

### Server → Client Messages

#### Join Accepted
```json
{
  "type": "join_accepted",
  "payload": {
    "participant_id": "uuid",
    "room_id": "uuid",
    "participants": [...],
    "ice_servers": [...]
  }
}
```

#### SDP Answer
```json
{
  "type": "sdp_answer",
  "payload": {
    "sdp": "v=0\r\n..."
  }
}
```

#### Participant Joined
```json
{
  "type": "participant_joined",
  "payload": {
    "participant_id": "uuid",
    "display_name": "Jane",
    "role": "guest"
  }
}
```

#### Participant Left
```json
{
  "type": "participant_left",
  "payload": {
    "participant_id": "uuid"
  }
}
```

#### Error
```json
{
  "type": "error",
  "payload": {
    "code": "room_full",
    "message": "Room has reached maximum capacity"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "error_code",
  "message": "Human readable message"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Invalid or expired token |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `validation_error` | 400 | Invalid request body |
| `rate_limited` | 429 | Too many requests |
| `internal_error` | 500 | Server error |

---

## OAuth Endpoints

ALLSTRM supports OAuth integration for automatic stream key fetching from 13 platforms.

### List OAuth Providers

```http
GET /api/oauth/providers
Authorization: Bearer <token>
```

Response: `200 OK`
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
      "name": "facebook",
      "display_name": "Facebook Live",
      "icon": "facebook",
      "is_configured": true
    },
    {
      "name": "twitch",
      "display_name": "Twitch",
      "icon": "twitch",
      "is_configured": true
    }
  ]
}
```

### Supported Platforms

| Platform | OAuth Type | Stream Key Fetching |
|----------|------------|---------------------|
| YouTube | Google OAuth | Automatic |
| Facebook Live | Facebook Login | Automatic |
| LinkedIn Live | LinkedIn OAuth | Automatic |
| X (Twitter) | OAuth 2.0 + PKCE | Automatic |
| Twitch | Twitch OAuth | Automatic |
| Instagram Live | Facebook OAuth | Automatic (Business) |
| TikTok Live | TikTok Login Kit | Automatic |
| Kick | Manual RTMP | Manual |
| Vimeo | Vimeo OAuth | Automatic |
| Amazon Live | Amazon OAuth | Automatic |
| Brightcove | Client Credentials | Automatic |
| Hopin | Hopin OAuth | Automatic |
| Custom RTMP | Manual | Manual |

### Initiate OAuth Flow

```http
GET /api/oauth/:provider/authorize?user_id=<uuid>&redirect_uri=/dashboard
```

Redirects to the provider's OAuth consent page. After authorization, the user is redirected to the callback URL, then to the specified `redirect_uri`.

### OAuth Callback

```http
GET /api/oauth/:provider/callback?code=<auth_code>&state=<state_token>
```

Handled internally. Exchanges the authorization code for tokens and stores the connection.

### List User's OAuth Connections

```http
GET /api/oauth/connections?user_id=<uuid>
Authorization: Bearer <token>
```

Response: `200 OK`
```json
{
  "connections": [
    {
      "id": "uuid",
      "provider": "youtube",
      "provider_user_id": "UC...",
      "provider_username": "MyChannel",
      "provider_display_name": "My YouTube Channel",
      "is_active": true,
      "created_at": "2026-01-19T12:00:00Z"
    }
  ]
}
```

### Disconnect OAuth Connection

```http
DELETE /api/oauth/connections/:connection_id
Authorization: Bearer <token>
```

Response: `204 No Content`

### Get Stream Destination from Connection

```http
GET /api/oauth/connections/:connection_id/destination
Authorization: Bearer <token>
```

Response: `200 OK`
```json
{
  "provider": "youtube",
  "channel_id": "UC...",
  "channel_name": "My Channel",
  "rtmp_url": "rtmp://a.rtmp.youtube.com/live2",
  "stream_key": "xxxx-xxxx-xxxx",
  "backup_rtmp_url": "rtmp://b.rtmp.youtube.com/live2",
  "title": "Live Stream",
  "is_live": false
}
```

---

## Rate Limiting

Default limits:
- 100 requests per second per IP
- 200 burst capacity

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705669200
```
