# ALLSTRM Backend Services

Comprehensive documentation of all backend services, their features, and API endpoints.

---

## Service Overview

| Service | Port | Purpose | Technology |
|---------|------|---------|------------|
| **Gateway** | 8080 | API Gateway, WebSocket, Auth | Axum, JWT |
| **Core** | 8081 | Rooms, Users, OAuth, Destinations | Axum, SQLx, PostgreSQL |
| **SFU** | 8082 | WebRTC Signaling, Media Routing | webrtc-rs, Axum |
| **Stream** | 8083 | FFmpeg, HLS, RTMP Relay | FFmpeg, Axum |
| **Storage** | 8084 | S3/R2, Recordings, Assets | aws-sdk-s3, Axum |

---

## 1. Gateway Service (Port 8080)

### Purpose
API Gateway handling authentication, rate limiting, WebSocket connections, and request routing to internal services.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| JWT Authentication | ✅ | Validates Supabase JWT tokens |
| Rate Limiting | ✅ | Token bucket algorithm (configurable RPS) |
| WebSocket Handler | ✅ | Real-time signaling with SFU forwarding |
| Request Proxying | ✅ | Routes API calls to internal services |
| CORS Support | ✅ | Configurable cross-origin policies |
| Prometheus Metrics | ✅ | `/metrics` endpoint for monitoring |
| Token Refresh | ✅ | Refresh expired access tokens |

### API Endpoints

#### Public Endpoints (No Auth)
```
GET  /health              - Health check
GET  /metrics             - Prometheus metrics
GET  /ws                  - WebSocket upgrade (token in query)
POST /auth/refresh        - Refresh JWT token
POST /auth/logout         - Logout (invalidate token)
```

#### Protected Endpoints (Require JWT)
All protected routes are nested under `/api/v1` and require valid JWT.

```
# Room Management (proxied to Core)
POST   /api/v1/rooms                    - Create room
GET    /api/v1/rooms                    - List rooms
GET    /api/v1/rooms/:id                - Get room
PATCH  /api/v1/rooms/:id                - Update room
DELETE /api/v1/rooms/:id                - Delete room
POST   /api/v1/rooms/:id/join           - Join room

# Destinations (proxied to Core)
GET    /api/v1/destinations             - List destinations
POST   /api/v1/destinations             - Create destination
PATCH  /api/v1/destinations/:id         - Update destination
DELETE /api/v1/destinations/:id         - Delete destination
POST   /api/v1/destinations/:id/test    - Test RTMP connection

# Storage (proxied to Storage)
POST   /api/v1/upload/sign              - Get presigned upload URL
POST   /api/v1/upload/complete          - Mark upload complete
GET    /api/v1/recordings               - List recordings
GET    /api/v1/recordings/:id           - Get recording
DELETE /api/v1/recordings/:id           - Delete recording

# SFU Signaling (proxied to SFU)
POST   /api/v1/sfu/rooms/:room_id/join                  - Join SFU room
POST   /api/v1/sfu/rooms/:room_id/offer                 - Send SDP offer
POST   /api/v1/sfu/rooms/:room_id/answer                - Send SDP answer
POST   /api/v1/sfu/rooms/:room_id/ice                   - Send ICE candidate
POST   /api/v1/sfu/rooms/:room_id/leave                 - Leave room
GET    /api/v1/sfu/rooms/:room_id/participants          - Get participants
POST   /api/v1/sfu/rooms/:room_id/subscribe             - Subscribe to track
POST   /api/v1/sfu/rooms/:room_id/unsubscribe           - Unsubscribe from track
POST   /api/v1/sfu/rooms/:room_id/admit                 - Admit from waiting room
GET    /api/v1/sfu/rooms/:room_id/waiting-participants  - List waiting room
```

### WebSocket Protocol

**Connection**: `wss://api.allstrm.io/ws?token=<jwt>&room_id=<uuid>&mode=meeting|studio`

**Client → Server Messages**:
- `JoinRequest` - Join a room
- `LeaveRequest` - Leave room
- `Offer` - SDP offer (publish tracks)
- `Answer` - SDP answer (subscribe)
- `IceCandidate` - ICE candidate trickle
- `ParticipantUpdate` - Mute/unmute, hand raise
- `ChatMessage` - Send chat message
- `LayoutUpdate` - Change studio layout
- `BroadcastControl` - Start/stop broadcast
- `StageControl` - Bring on/off stage
- `RecordingControl` - Start/stop recording

**Server → Client Messages**:
- `JoinAccepted` - Room joined with ICE servers
- `JoinRejected` - Join failed (room full, etc.)
- `ParticipantJoined` - New participant
- `ParticipantLeft` - Participant left
- `ParticipantUpdated` - State change
- `AnswerReceived` - SDP answer from SFU
- `IceCandidateReceived` - ICE candidate
- `ChatMessageReceived` - Chat message
- `LayoutStateUpdate` - Layout changed
- `BroadcastReady` - RTMP URL + stream key
- `RoomStateUpdate` - Room status change
- `Error` - Error message

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `GATEWAY_PORT` | 8080 | HTTP/WS listen port |
| `GATEWAY_JWT_SECRET` | - | JWT signing secret (or `JWT_SECRET` in prod) |
| `GATEWAY_RATE_LIMIT_RPS` | 100 | Requests per second |
| `GATEWAY_RATE_LIMIT_BURST` | 200 | Burst capacity |
| `CORE_SERVICE_URL` | http://core:8081 | Core service URL |
| `SFU_SERVICE_URL` | http://sfu:8082 | SFU service URL |
| `STREAM_SERVICE_URL` | http://stream:8083 | Stream service URL |
| `STORAGE_SERVICE_URL` | http://storage:8084 | Storage service URL |
| `REDIS_URL` | redis://redis:6379 | Redis connection URL |
| `RUST_LOG` | info | Log level |

---

## 2. Core Service (Port 8081)

### Purpose
Central service for room management, user data, OAuth integrations, and destination configuration.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Room CRUD | ✅ | Create, read, update, delete rooms |
| Participant Management | ✅ | Track participants per room |
| OAuth Integration | ✅ | 13 streaming platforms |
| Destination Management | ✅ | RTMP destinations per room |
| User Management | ✅ | User profiles and settings |
| API Key Management | ✅ | Generate/revoke API keys |
| Database Migrations | ✅ | SQLx auto-migrations |

### OAuth Platforms (13)

| Platform | OAuth Type | Auto Stream Key | Status |
|----------|------------|-----------------|--------|
| YouTube | Google OAuth | ✅ | ✅ Implemented |
| Facebook Live | Facebook Login | ✅ | ✅ Implemented |
| LinkedIn Live | LinkedIn OAuth | ✅ | ✅ Implemented |
| X (Twitter) | OAuth 2.0 | ✅ | ✅ Implemented |
| Twitch | Twitch OAuth | ✅ | ✅ Implemented |
| Instagram Live | Facebook OAuth | ✅ | ✅ Implemented |
| TikTok Live | TikTok Login Kit | ✅ | ✅ Implemented |
| Kick | Manual RTMP | ❌ | ✅ Manual only |
| Vimeo | Vimeo OAuth | ✅ | ✅ Implemented |
| Amazon Live | Amazon OAuth | ✅ | ✅ Implemented |
| Brightcove | Client Credentials | ✅ | ✅ Implemented |
| Hopin | Hopin OAuth | ✅ | ✅ Implemented |
| Custom RTMP | Manual | ❌ | ✅ Manual only |

### API Endpoints

Core service exposes routes directly (not under /api/v1). Gateway proxies to these.

```
# Health
GET  /health                                    - Health check

# Room Management
POST   /api/rooms                               - Create room
GET    /api/rooms                               - List rooms (with filters)
GET    /api/rooms/:room_id                      - Get room details
PUT    /api/rooms/:room_id                      - Update room
DELETE /api/rooms/:room_id                      - Delete room
GET    /api/rooms/:room_id/participants         - Get room participants

# Broadcast
POST   /api/rooms/:room_id/broadcast/start      - Start broadcast

# Destinations
POST   /api/rooms/:room_id/destinations                   - Create destination
GET    /api/rooms/:room_id/destinations                   - List destinations
GET    /api/rooms/:room_id/destinations/:destination_id   - Get destination
PUT    /api/rooms/:room_id/destinations/:destination_id   - Update destination
DELETE /api/rooms/:room_id/destinations/:destination_id   - Delete destination
POST   /api/rooms/:room_id/destinations/:destination_id/toggle - Enable/disable

# Users
GET    /api/users/:user_id                      - Get user profile
POST   /api/users/:user_id/api-keys             - Create API key
GET    /api/users/:user_id/api-keys             - List API keys
DELETE /api/users/:user_id/api-keys/:key_id    - Revoke API key

# OAuth
GET    /api/oauth/providers                     - List OAuth providers
GET    /api/oauth/:provider/authorize           - Start OAuth flow
GET    /api/oauth/:provider/callback            - OAuth callback
GET    /api/oauth/connections                   - List user connections
DELETE /api/oauth/connections/:connection_id    - Disconnect
GET    /api/oauth/connections/:connection_id/destination - Get stream info
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CORE_PORT` | 8081 | HTTP listen port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DATABASE_POOL_SIZE` | 10 | Connection pool size |
| `RUN_MIGRATIONS` | true | Auto-run migrations |
| `REDIS_URL` | redis://redis:6379 | Redis connection URL |
| `JWT_SECRET` | - | JWT signing secret |
| `SFU_SERVICE_URL` | http://sfu:8082 | SFU service URL |
| `STREAM_SERVICE_URL` | http://stream:8083 | Stream service URL |
| `RUST_LOG` | info | Log level |
| `OAUTH_REDIRECT_BASE_URL` | - | Base URL for OAuth callbacks |
| `GOOGLE_CLIENT_ID` | - | YouTube OAuth |
| `GOOGLE_CLIENT_SECRET` | - | YouTube OAuth |
| `FACEBOOK_APP_ID` | - | Facebook/Instagram OAuth |
| `FACEBOOK_APP_SECRET` | - | Facebook/Instagram OAuth |
| `TWITCH_CLIENT_ID` | - | Twitch OAuth |
| `TWITCH_CLIENT_SECRET` | - | Twitch OAuth |
| `LINKEDIN_CLIENT_ID` | - | LinkedIn OAuth |
| `LINKEDIN_CLIENT_SECRET` | - | LinkedIn OAuth |
| `TWITTER_CLIENT_ID` | - | X/Twitter OAuth |
| `TWITTER_CLIENT_SECRET` | - | X/Twitter OAuth |
| `TIKTOK_CLIENT_KEY` | - | TikTok OAuth |
| `TIKTOK_CLIENT_SECRET` | - | TikTok OAuth |
| `VIMEO_CLIENT_ID` | - | Vimeo OAuth |
| `VIMEO_CLIENT_SECRET` | - | Vimeo OAuth |
| `AMAZON_CLIENT_ID` | - | Amazon OAuth |
| `AMAZON_CLIENT_SECRET` | - | Amazon OAuth |
| `BRIGHTCOVE_ACCOUNT_ID` | - | Brightcove OAuth |
| `BRIGHTCOVE_CLIENT_SECRET` | - | Brightcove OAuth |
| `HOPIN_CLIENT_ID` | - | Hopin OAuth |
| `HOPIN_CLIENT_SECRET` | - | Hopin OAuth |

---

## 3. SFU Service (Port 8082)

### Purpose
Selective Forwarding Unit for real-time WebRTC media communication between participants.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| WebRTC Signaling | ✅ | SDP offer/answer exchange |
| ICE Handling | ✅ | ICE candidate trickle |
| Track Routing | ✅ | Forward media between participants |
| Room Management | ✅ | In-memory room state |
| Waiting Room | ✅ | Guests wait for host approval |
| Track Subscription | ✅ | Subscribe/unsubscribe to tracks |
| RTP Forwarding | ✅ | Forward RTP to Stream service |
| Egress | ✅ | Export room to Stream service |
| STUN/TURN Support | ✅ | Configurable ICE servers |

### API Endpoints

```
# Health (returns active connection/room counts)
GET  /health                                    - Health check with stats

# Signaling
POST /api/v1/rooms/:room_id/join               - Join room (returns ICE servers)
POST /api/v1/rooms/:room_id/offer              - Handle SDP offer (publish)
POST /api/v1/rooms/:room_id/answer             - Handle SDP answer (subscribe)
POST /api/v1/rooms/:room_id/ice                - Handle ICE candidate
POST /api/v1/rooms/:room_id/leave              - Leave room
GET  /api/v1/rooms/:room_id/participants       - Get room participants

# Track Management
POST /api/v1/rooms/:room_id/subscribe          - Subscribe to participant track
POST /api/v1/rooms/:room_id/unsubscribe        - Unsubscribe from track

# Waiting Room
POST /api/v1/rooms/:room_id/admit              - Admit participant from waiting
GET  /api/v1/rooms/:room_id/waiting-participants - List waiting participants

# Egress (forward to Stream service)
POST /api/v1/egress/start                      - Start RTP egress to Stream
```

### WebRTC Flow

```
┌──────────┐           ┌──────────┐           ┌──────────┐
│  Client  │           │   SFU    │           │  Client  │
│    A     │           │          │           │    B     │
└────┬─────┘           └────┬─────┘           └────┬─────┘
     │                      │                      │
     │──── JOIN ───────────►│                      │
     │◄─── ICE SERVERS ─────│                      │
     │                      │                      │
     │──── OFFER (publish)─►│                      │
     │◄─── ANSWER ──────────│                      │
     │                      │                      │
     │══════ WebRTC ═══════►│                      │
     │   (Audio/Video)      │                      │
     │                      │                      │
     │                      │◄──── JOIN ───────────│
     │                      │──── ICE SERVERS ────►│
     │                      │                      │
     │                      │◄──── SUBSCRIBE ──────│
     │                      │      (to Client A)   │
     │                      │                      │
     │                      │══════ WebRTC ═══════►│
     │                      │  (Forwarded media)   │
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SFU_PORT` | 8082 | HTTP listen port |
| `PUBLIC_IP` | 127.0.0.1 | Public IP for WebRTC candidates |
| `STUN_SERVER` | stun:stun.l.google.com:19302 | STUN server URL |
| `TURN_SERVER` | - | TURN server URL (optional) |
| `TURN_USERNAME` | - | TURN username |
| `TURN_PASSWORD` | - | TURN password |
| `REDIS_URL` | redis://redis:6379 | Redis connection URL |
| `CORE_SERVICE_URL` | http://core:8081 | Core service URL |
| `RUST_LOG` | info | Log level |

**Note**: SFU also exposes UDP ports 10000-10100 for WebRTC media.

---

## 4. Stream Service (Port 8083)

### Purpose
Media processing service handling FFmpeg, HLS generation, and RTMP relay to streaming destinations.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Session Management | ✅ | Create/manage stream sessions |
| HLS Transcoding | ✅ | Generate HLS from input |
| RTMP Relay | ✅ | Relay to multiple destinations |
| RTP Ingest | ✅ | Receive RTP from SFU |
| Recording | ✅ | Record to MP4 |
| FFmpeg Stats | ✅ | Parse bitrate, fps, health |
| RTMP Callbacks | ✅ | on_publish, on_publish_done |
| Destination Health | ✅ | Monitor relay status |

### API Endpoints

```
# Health
GET  /health                                    - Health check

# Session Management
POST   /api/sessions                            - Create session
GET    /api/sessions/:room_id                   - Get session
DELETE /api/sessions/:room_id                   - Delete session

# Stream Control
POST   /api/sessions/:room_id/start             - Start stream
POST   /api/sessions/:room_id/stop              - Stop stream
POST   /api/sessions/:room_id/ingest/rtp        - Start RTP ingest from SFU

# Destination Relay
POST   /api/sessions/:room_id/destinations/:destination_id/start  - Start relay
POST   /api/sessions/:room_id/destinations/:destination_id/stop   - Stop relay

# HLS Output
GET    /hls/:room_id/playlist.m3u8              - HLS master playlist
GET    /hls/:room_id/:segment                   - HLS segment file (.ts)

# RTMP Callbacks (called by RTMP ingest)
POST   /rtmp/on_publish                         - Stream publish started
POST   /rtmp/on_publish_done                    - Stream publish ended

# Stats
GET    /api/sessions/:room_id/stats             - Stream statistics (bitrate, fps)
```

### Streaming Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Stream Service                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│    ┌─────────────┐                                                  │
│    │   Browser   │                                                  │
│    │  (WebRTC)   │                                                  │
│    └──────┬──────┘                                                  │
│           │                                                         │
│           ▼                                                         │
│    ┌─────────────┐         ┌─────────────────────────────────────┐  │ 
│    │    SFU      │         │           FFmpeg Manager            │  │ 
│    │  (RTP Out)  ├────────►│                                     │  │ 
│    └─────────────┘         │  Input ──┬──► HLS (.m3u8, .ts)      │  │
│                            │          │                          │  │
│                            │          ├──► RTMP Relay (YouTube)  │  │
│                            │          │                          │  │
│                            │          ├──► RTMP Relay (Twitch)   │  │
│                            │          │                          │  │
│                            │          ├──► RTMP Relay (Facebook) │  │
│                            │          │                          │  │
│                            │          └──► Recording (MP4)       │  │
│                            └─────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### FFmpeg Pipeline

**HLS Transcoding**:
```bash
ffmpeg -i <input> \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 4000k -maxrate 4000k -bufsize 8000k -g 60 \
  -c:a aac -b:a 128k -ar 44100 \
  -f hls -hls_time 2 -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  output.m3u8
```

**RTMP Relay** (copy, no re-encoding):
```bash
ffmpeg -i <input> -c copy -f flv rtmp://destination/key
```

**Recording**:
```bash
ffmpeg -i <input> \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  output.mp4
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `STREAM_PORT` | 8083 | HTTP listen port |
| `RTMP_PORT` | 1935 | RTMP ingest port |
| `FFMPEG_PATH` | ffmpeg | Path to FFmpeg binary |
| `HLS_OUTPUT_DIR` | /tmp/allstrm/hls | HLS output directory |
| `HLS_SEGMENT_DURATION` | 2 | HLS segment duration (seconds) |
| `HLS_PLAYLIST_SIZE` | 6 | HLS playlist size |
| `MAX_BITRATE` | 6000 | Max video bitrate (kbps) |
| `DEFAULT_RESOLUTION` | 1920x1080 | Default output resolution |
| `CORE_SERVICE_URL` | http://core:8081 | Core service URL |
| `STORAGE_SERVICE_URL` | http://storage:8084 | Storage service URL |
| `RUST_LOG` | info | Log level |

---

## 5. Storage Service (Port 8084)

### Purpose
Recording and asset management with S3/Cloudflare R2 integration for cloud storage.

### Features

| Feature | Status | Description |
|---------|--------|-------------|
| Presigned Uploads | ✅ | Generate presigned upload URLs |
| Presigned Downloads | ✅ | Generate presigned download URLs |
| Recording Management | ✅ | CRUD for recordings |
| Asset Management | ✅ | CRUD for assets (overlays, etc.) |
| S3/R2 Integration | ✅ | aws-sdk-s3 compatible |
| Status Tracking | ✅ | Upload/transcode status |
| Room-based Listing | ✅ | List by room_id |

### API Endpoints

Storage service exposes routes directly. Gateway proxies upload/recordings to these.

```
# Health
GET  /health                                    - Health check

# Presigned URLs
POST /api/upload/presign                        - Get presigned upload URL
POST /api/upload/complete                       - Mark upload complete
POST /api/download/presign                      - Get presigned download URL

# Recording Management
POST   /api/recordings                          - Create recording metadata
GET    /api/recordings/:recording_id            - Get recording
DELETE /api/recordings/:recording_id            - Delete recording
GET    /api/rooms/:room_id/recordings           - List room recordings
POST   /api/recordings/:recording_id/status     - Update recording status

# Asset Management
POST   /api/assets                              - Create asset
GET    /api/assets/:asset_id                    - Get asset
DELETE /api/assets/:asset_id                    - Delete asset
GET    /api/rooms/:room_id/assets               - List room assets
```

### Storage Flow

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │         │ Storage  │         │   R2/S3  │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ POST /upload/presign                    │
     │───────────────────►│                    │
     │                    │                    │
     │◄───────────────────│                    │
     │ { upload_url, asset_id }                │
     │                    │                    │
     │                    │                    │
     │ PUT (presigned URL)                     │
     │────────────────────────────────────────►│
     │◄────────────────────────────────────────│
     │ 200 OK                                  │
     │                    │                    │
     │ POST /upload/complete                   │
     │───────────────────►│                    │
     │                    │ (Mark as uploaded) │
     │◄───────────────────│                    │
     │ { asset }          │                    │
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `STORAGE_PORT` | 8084 | HTTP listen port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `DATABASE_POOL_SIZE` | 10 | Connection pool size |
| `RUN_MIGRATIONS` | true | Auto-run migrations |
| `S3_ENDPOINT` | - | S3/R2 endpoint (e.g., http://minio:9000) |
| `S3_BUCKET` | allstrm | S3 bucket name |
| `S3_REGION` | us-east-1 | S3 region |
| `S3_ACCESS_KEY` | - | S3 access key |
| `S3_SECRET_KEY` | - | S3 secret key |
| `PRESIGNED_URL_EXPIRY_SECS` | 3600 | Presigned URL expiry (seconds) |
| `MAX_UPLOAD_SIZE_MB` | 500 | Max upload size in MB |
| `RUST_LOG` | info | Log level |

---

## Database Schema

The PostgreSQL database uses 3 schemas:

### `core` Schema
- `users` - User accounts
- `organizations` - Multi-tenant organizations
- `rooms` - Streaming rooms
- `participants` - Room participants
- `destinations` - RTMP destinations
- `oauth_connections` - OAuth tokens
- `api_keys` - User API keys

### `stream` Schema
- `stream_sessions` - Active stream sessions
- `stream_segments` - HLS segments metadata
- `destination_health` - Relay health metrics

### `assets` Schema
- `recordings` - Recording metadata
- `transcodes` - Transcode variants
- `thumbnails` - Generated thumbnails
- `assets` - User-uploaded assets

---

## Health Check Responses

All services expose `/health`:

```json
{
  "status": "healthy",
  "service": "allstrm-sfu",
  "version": "0.1.0",
  "active_connections": 5,
  "active_rooms": 2
}
```

---

## Inter-Service Communication

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Gateway                                  │
│                           (Port 8080)                               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│     Core      │       │      SFU      │       │    Storage    │
│  (Port 8081)  │       │  (Port 8082)  │       │  (Port 8084)  │
│               │       │               │       │               │
│ • Rooms       │       │ • WebRTC      │       │ • Presigned   │
│ • OAuth       │       │ • Signaling   │       │ • Recordings  │
│ • Users       │       │ • Tracks      │       │ • Assets      │
└───────────────┘       └───────┬───────┘       └───────────────┘
                                │
                                │ RTP Forward
                                ▼
                        ┌───────────────┐
                        │    Stream     │
                        │  (Port 8083)  │
                        │               │
                        │ • FFmpeg      │
                        │ • HLS         │
                        │ • RTMP Relay  │
                        └───────────────┘
```

---

## Summary

**ALLSTRM Backend** consists of 5 microservices written in Rust:

1. **Gateway** - Entry point, authentication, WebSocket handling
2. **Core** - Business logic, OAuth for 13 platforms, destinations
3. **SFU** - Real-time WebRTC media routing (up to 50 participants)
4. **Stream** - FFmpeg processing, HLS output, RTMP relay
5. **Storage** - S3/R2 integration, recordings, assets

All services are:
- Built with **Axum 0.7** (async Rust web framework)
- Use **Tokio** runtime for async I/O
- Expose **health endpoints** for monitoring
- Support **tracing** for observability
- Designed for **horizontal scaling** (except SFU which is stateful per session)
