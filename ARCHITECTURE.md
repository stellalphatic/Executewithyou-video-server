# ALLSTRM Backend: System Architecture

## Overview

ALLSTRM Backend is a microservices-based platform for real-time video communication and streaming. It provides WebRTC-based conferencing (similar to Zoom/Google Meet) with optional studio mode for live streaming (similar to StreamYard).

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ALLSTRM Backend                                     │
│                         (Microservices Architecture)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        External Clients                                   │   │
│   │   Web Browser ─────► WebSocket/HTTP ─────► Gateway (Port 8080)           │   │
│   │   Mobile App  ─────► HTTP/REST     ─────►                                │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                     Gateway Service (Port 8080)                          │   │
│   │   • JWT Authentication & Validation                                       │   │
│   │   • Rate Limiting (Token Bucket)                                          │   │
│   │   • WebSocket Connection Handling                                         │   │
│   │   • Request Routing to Internal Services                                  │   │
│   │   • CORS Configuration                                                    │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│           │              │                  │                    │               │
│           ▼              ▼                  ▼                    ▼               │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│   │    Core      │ │     SFU      │ │    Stream    │ │   Storage    │          │
│   │   Service    │ │   Service    │ │   Service    │ │   Service    │          │
│   │  Port 8081   │ │  Port 8082   │ │  Port 8083   │ │  Port 8084   │          │
│   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘          │
│          │                │                │                │                    │
│   ┌──────┴───────────────┴────────────────┴────────────────┴───────┐           │
│   │                     PostgreSQL Database                         │           │
│   │   • Room configuration       • User data                        │           │
│   │   • Destination settings     • API keys                         │           │
│   │   • Recording metadata       • Asset tracking                   │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                     S3/Cloudflare R2 Storage                     │           │
│   │   • Recording storage        • Asset uploads                     │           │
│   │   • Presigned URL generation                                     │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Services

### 1. Gateway Service (Port 8080)

**Purpose**: API Gateway and WebSocket termination point

**Responsibilities**:
- JWT token validation
- Rate limiting using token bucket algorithm
- WebSocket connection management
- Request proxying to internal services
- CORS configuration

**Key Files**:
- `services/gateway/src/main.rs` - Service entry point
- `services/gateway/src/auth.rs` - JWT validation
- `services/gateway/src/websocket.rs` - WebSocket handling with SFU forwarding
- `services/gateway/src/rate_limit.rs` - Token bucket rate limiter

**API Endpoints**:
- `GET /ws` - WebSocket upgrade for real-time communication
- `GET /health` - Health check
- `POST /api/v1/rooms` - Create room (proxied to Core)
- `GET /api/v1/rooms/:id` - Get room details (proxied to Core)

### 2. Core Service (Port 8081)

**Purpose**: Central data management and room configuration

**Responsibilities**:
- Room CRUD operations
- User and API key management
- Destination configuration (YouTube, Twitch, etc.)
- Participant tracking

**Key Files**:
- `services/core/src/main.rs` - Service entry point
- `services/core/src/routes/rooms.rs` - Room management
- `services/core/src/routes/destinations.rs` - Streaming destinations
- `services/core/src/routes/users.rs` - User management
- `services/core/src/db.rs` - PostgreSQL database layer

**API Endpoints**:
- `POST /api/rooms` - Create room
- `GET /api/rooms/:id` - Get room
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room
- `POST /api/rooms/:id/destinations` - Add streaming destination

### 3. SFU Service (Port 8082)

**Purpose**: WebRTC Selective Forwarding Unit for real-time media

**Responsibilities**:
- WebRTC peer connection management
- SDP offer/answer exchange
- ICE candidate handling
- Track forwarding between participants
- Room participant management

**Key Files**:
- `services/sfu/src/main.rs` - Service entry point
- `services/sfu/src/peer.rs` - WebRTC peer connection management
- `services/sfu/src/signaling.rs` - SDP/ICE signaling handlers
- `services/sfu/src/track_router.rs` - Media track forwarding
- `services/sfu/src/room.rs` - Room and participant state

**API Endpoints**:
- `POST /api/v1/rooms/:id/join` - Join room
- `POST /api/v1/rooms/:id/offer` - Submit SDP offer
- `POST /api/v1/rooms/:id/answer` - Submit SDP answer
- `POST /api/v1/rooms/:id/ice` - Submit ICE candidate
- `POST /api/v1/rooms/:id/leave` - Leave room
- `POST /api/v1/rooms/:id/subscribe` - Subscribe to track
- `POST /api/v1/rooms/:id/unsubscribe` - Unsubscribe from track

**WebRTC Flow**:
```
Client                    Gateway                    SFU
  │                          │                         │
  │─── WS Connect ──────────►│                         │
  │                          │─── HTTP: join ─────────►│
  │◄── JOIN_ACCEPTED ────────│◄── participants, ICE ───│
  │                          │                         │
  │─── OFFER ───────────────►│─── HTTP: offer ────────►│
  │                          │◄── SDP answer ──────────│
  │◄── ANSWER_RECEIVED ──────│                         │
  │                          │                         │
  │─── ICE_CANDIDATE ───────►│─── HTTP: ice ──────────►│
  │                          │                         │
  │◄═══ WebRTC Media ═══════►│                         │
```

### 4. Stream Service (Port 8083)

**Purpose**: RTMP ingest and multi-destination streaming

**Responsibilities**:
- Stream session management
- FFmpeg process orchestration
- HLS transcoding output
- RTMP relay to destinations (YouTube, Twitch, etc.)
- Recording management
- Layout compositing

**Key Files**:
- `services/stream/src/main.rs` - Service entry point
- `services/stream/src/ffmpeg.rs` - FFmpeg process management with stats parsing
- `services/stream/src/session.rs` - Stream session state machine
- `services/stream/src/routes/hls.rs` - HLS playlist/segment serving
- `services/stream/src/routes/control.rs` - Stream start/stop control

**API Endpoints**:
- `POST /api/sessions` - Create streaming session
- `POST /api/sessions/:id/start` - Start streaming
- `POST /api/sessions/:id/stop` - Stop streaming
- `POST /api/sessions/:id/destinations/:dest_id/start` - Start relay to destination
- `GET /hls/:id/playlist.m3u8` - HLS playlist
- `GET /hls/:id/:segment` - HLS segment
- `GET /api/sessions/:id/stats` - Stream statistics

**Streaming Flow**:
```
                    ┌─────────────┐
                    │   Browser   │
                    │   (RTMP)    │
                    └──────┬──────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │      nginx-rtmp / RTMP       │
            │      (External Service)      │
            └──────────────┬───────────────┘
                           │ Callback
                           ▼
┌───────────────────────────────────────────────────────────┐
│                     Stream Service                         │
│                                                            │
│   RTMP Input ──► FFmpeg ──┬──► HLS Output                 │
│                           │                                │
│                           ├──► RTMP Relay (YouTube)       │
│                           ├──► RTMP Relay (Twitch)        │
│                           └──► Recording (MP4)            │
└───────────────────────────────────────────────────────────┘
```

### 5. Storage Service (Port 8084)

**Purpose**: Recording and asset management with S3/R2 integration

**Responsibilities**:
- Presigned URL generation for uploads/downloads
- Recording metadata management
- Asset tracking
- S3/Cloudflare R2 integration

**Key Files**:
- `services/storage/src/main.rs` - Service entry point
- `services/storage/src/s3.rs` - S3/R2 client
- `services/storage/src/routes/upload.rs` - Presigned upload URLs
- `services/storage/src/routes/recordings.rs` - Recording management
- `services/storage/src/routes/assets.rs` - Asset management

**API Endpoints**:
- `POST /api/upload/presign` - Get presigned upload URL
- `POST /api/upload/complete` - Mark upload complete
- `POST /api/download/presign` - Get presigned download URL
- `GET /api/recordings` - List recordings
- `GET /api/recordings/:id` - Get recording details
- `DELETE /api/recordings/:id` - Delete recording

## Shared Crates

### allstrm-common

Common utilities and configuration:
- Error types
- ID generation
- Configuration management

### allstrm-protocol

WebSocket message types for client-server communication:
- Client messages (JoinRequest, Offer, Answer, IceCandidate, etc.)
- Server messages (JoinAccepted, ParticipantJoined, AnswerReceived, etc.)
- Type definitions (RoomMode, ParticipantRole, etc.)

## Data Flow

### Meeting Mode (Video Conference)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client A │     │ Gateway  │     │   SFU    │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │── WS Connect ─►│                │
     │                │── Join ───────►│
     │◄─ ICE Servers ─│◄──────────────│
     │                │                │
     │── SDP Offer ──►│── Forward ────►│
     │◄─ SDP Answer ──│◄──────────────│
     │                │                │
     │══ WebRTC ════════════════════►│
     │                │                │
     │                │     ┌──────────┐
     │                │     │ Client B │
     │                │     └────┬─────┘
     │◄══ Media from B ══════════│
```

### Studio Mode (Live Streaming)

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Encoder  │     │ nginx-   │     │  Stream  │     │ YouTube  │
│ (OBS)    │     │  rtmp    │     │ Service  │     │ Twitch   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │═══ RTMP ══════►│                │                │
     │                │── Callback ───►│                │
     │                │                │                │
     │                │                │── FFmpeg ─────►│ HLS
     │                │                │── FFmpeg ─────►│ RTMP
     │                │                │                │
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Tokio (async Rust) |
| Web Framework | Axum 0.7 |
| WebRTC | webrtc-rs 0.10 |
| Database | PostgreSQL + SQLx |
| Object Storage | S3/Cloudflare R2 |
| Streaming | FFmpeg |
| RTMP Server | nginx-rtmp (external) |
| Serialization | Serde + JSON |
| Tracing | tracing + tracing-subscriber |

## Configuration

Environment variables for each service:

### Gateway
- `GATEWAY_PORT` - HTTP/WS port (default: 8080)
- `GATEWAY_JWT_SECRET` - JWT signing secret
- `CORE_SERVICE_URL` - Core service URL
- `SFU_SERVICE_URL` - SFU service URL
- `STREAM_SERVICE_URL` - Stream service URL
- `STORAGE_SERVICE_URL` - Storage service URL

### Core
- `CORE_PORT` - HTTP port (default: 8081)
- `DATABASE_URL` - PostgreSQL connection string

### SFU
- `SFU_PORT` - HTTP port (default: 8082)
- `SFU_STUN_SERVER` - STUN server URL
- `SFU_TURN_SERVER` - Optional TURN server URL
- `SFU_REDIS_URL` - Redis for state (optional)

### Stream
- `STREAM_PORT` - HTTP port (default: 8083)
- `STREAM_RTMP_PORT` - RTMP callback port
- `STREAM_FFMPEG_PATH` - Path to FFmpeg binary
- `STREAM_HLS_OUTPUT_DIR` - HLS segment output directory

### Storage
- `STORAGE_PORT` - HTTP port (default: 8084)
- `DATABASE_URL` - PostgreSQL connection string
- `S3_ENDPOINT_URL` - S3/R2 endpoint
- `S3_ACCESS_KEY_ID` - S3 access key
- `S3_SECRET_ACCESS_KEY` - S3 secret key
- `S3_BUCKET_NAME` - S3 bucket name

## Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  gateway:
    build:
      context: .
      dockerfile: services/gateway/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - GATEWAY_JWT_SECRET=${JWT_SECRET}
      - CORE_SERVICE_URL=http://core:8081
      - SFU_SERVICE_URL=http://sfu:8082
      - STREAM_SERVICE_URL=http://stream:8083
      - STORAGE_SERVICE_URL=http://storage:8084

  core:
    build:
      context: .
      dockerfile: services/core/Dockerfile
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/allstrm

  sfu:
    build:
      context: .
      dockerfile: services/sfu/Dockerfile
    environment:
      - SFU_STUN_SERVER=stun:stun.l.google.com:19302

  stream:
    build:
      context: .
      dockerfile: services/stream/Dockerfile
    volumes:
      - hls_output:/var/www/hls
    depends_on:
      - nginx-rtmp

  storage:
    build:
      context: .
      dockerfile: services/storage/Dockerfile
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/allstrm
      - S3_ENDPOINT_URL=${S3_ENDPOINT}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_KEY}

  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=allstrm
      - POSTGRES_PASSWORD=password

  nginx-rtmp:
    image: tiangolo/nginx-rtmp
    ports:
      - "1935:1935"
    volumes:
      - hls_output:/var/www/hls

volumes:
  postgres_data:
  hls_output:
```

## Health Checks

Each service exposes a `/health` endpoint:

```json
{
  "status": "healthy",
  "service": "allstrm-sfu",
  "version": "0.1.0",
  "active_connections": 5,
  "active_rooms": 2
}
```

## Future Enhancements

- [ ] Redis for session state sharing
- [ ] Simulcast support in SFU
- [ ] GPU-accelerated encoding (NVENC/QuickSync)
- [ ] Kubernetes deployment manifests
- [ ] Prometheus metrics export
- [ ] Distributed tracing (OpenTelemetry)
- [ ] WHIP/WHEP support for WebRTC streaming
- [ ] Active speaker detection
