# AllStrm Architecture v2.0

## Overview

AllStrm is a professional live streaming and video meeting platform built on **LiveKit** for real-time communication and **Supabase** for backend services. This architecture was chosen to maximize profit margins by eliminating custom infrastructure costs.

## Architecture Decision

### Previous Architecture (Archived)
- Custom Rust microservices (gateway, stream, SFU, storage, protocol)
- High development and maintenance overhead
- Complex deployment requirements

### Current Architecture (Optimized for Profit)
- **LiveKit Cloud/Self-Hosted**: Handles all WebRTC, media routing, encoding
- **Supabase**: Auth, Database, Storage, Real-time subscriptions
- **Next.js Frontend**: Single deployable unit

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                               │
│   Next.js 14 + React + TypeScript + Tailwind CSS           │
│   - Studio Component (Live Streaming)                       │
│   - Meeting Component (Video Conferencing)                  │
│   - Dashboard, Auth, Media Library                          │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   LiveKit   │  │  Supabase   │  │   Egress    │
│   Server    │  │   Stack     │  │   Service   │
├─────────────┤  ├─────────────┤  ├─────────────┤
│ WebRTC SFU  │  │ PostgreSQL  │  │ Recording   │
│ Room Mgmt   │  │ Auth        │  │ RTMP Out    │
│ Data Msgs   │  │ Storage     │  │ HLS Export  │
│ Permissions │  │ Realtime    │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Core Services

### 1. LiveKit Server (Port 7880)
- **Purpose**: Real-time video/audio communication
- **Features**:
  - WebRTC SFU (Selective Forwarding Unit)
  - Room management
  - Data message passing (stage sync, permissions, chat)
  - Participant management
- **Config**: `livekit.yaml`

### 2. Supabase Stack (Port 54321)
- **Auth**: User authentication, JWT tokens
- **Database**: PostgreSQL for persistent data
- **Storage**: Media files, recordings
- **Realtime**: Presence, live updates

### 3. Egress Service
- **Purpose**: Recording and streaming output
- **Features**:
  - Room composite recording
  - Individual track recording
  - RTMP streaming to destinations
  - HLS/DASH output

## Data Flow

### Studio Session (Host Creates Stream)
```
1. Host clicks "Create Studio"
2. Frontend calls /api/livekit/token with role=host
3. Token generated with room:create, publish, subscribe grants
4. LiveKit room created, host joins
5. Host publishes camera/mic tracks
6. Host can add guests to stage via data messages
```

### Guest Joins (Waiting Room Flow)
```
1. Guest clicks join link
2. Frontend calls /api/livekit/token with role=guest
3. Token includes metadata: { waitingRoom: true, displayName }
4. Guest connects, sees waiting room overlay
5. Host receives participant:joined event
6. Host admits guest via data message { type: 'admission' }
7. Guest receives admission, waiting room overlay removed
8. Guest can be added to stage
```

### Stage Synchronization
```
Host is authoritative for stage state:
1. Host drags participant to stage
2. Host broadcasts { type: 'stageSync', participants: [...] }
3. All participants receive and update local view
4. Guest views are derived from host's broadcast
```

## Key Components

### Frontend Components
| Component | Purpose |
|-----------|---------|
| `Studio.tsx` | Main streaming studio UI |
| `Meeting.tsx` | Video meeting interface |
| `GreenRoom.tsx` | Backstage participant list |
| `VideoFeed.tsx` | Individual video rendering |
| `Destinations.tsx` | RTMP destination management |

### Custom Hooks
| Hook | Purpose |
|------|---------|
| `useAllstrmLiveKit.ts` | LiveKit room connection, state management |
| `useAllstrm.ts` | Legacy hook (deprecated) |
| `useStudioEngines.ts` | Layout engine, scene management |
| `useUploadQueue.ts` | Media upload management |

### API Routes
| Route | Purpose |
|-------|---------|
| `/api/livekit/token` | Generate LiveKit access tokens |
| `/api/auth/*` | Supabase auth handlers |

## Environment Variables

```env
# LiveKit
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>
```

## Docker Services

```yaml
services:
  allstrm-livekit:    # LiveKit server
  allstrm-egress:     # Recording/streaming
  allstrm-redis:      # LiveKit state store
  allstrm-minio:      # S3-compatible storage
```

## Security Model

### Token-Based Access
- All room access requires valid JWT tokens
- Tokens encode permissions (publish, subscribe, admin)
- Role-based grants (host, co-host, guest)

### Permission System
- Host can grant/revoke guest permissions in real-time
- Permissions: audio, video, screen share, chat
- Transmitted via data messages, enforced client-side

### Waiting Room
- Guests start in waiting room by default
- Host explicitly admits participants
- Admission state persisted in sessionStorage

## Scalability

### LiveKit
- Horizontal scaling via LiveKit Cloud
- Multi-region deployment supported
- Auto-scaling based on participant count

### Supabase
- Managed PostgreSQL with connection pooling
- Storage backed by S3-compatible service
- Realtime scales with connection count

## Cost Structure (Self-Hosted)

| Component | Cost Factor |
|-----------|-------------|
| LiveKit | Compute (transcode/route) |
| Storage | GB stored + bandwidth |
| Egress | Encoding minutes |
| Database | PG instance size |

## Migration from v1

The Rust microservices architecture was archived to `/archive/rust-backend-v1/`. Key benefits of migration:
- 90% reduction in backend code maintenance
- Eliminated custom SFU development
- Leveraged battle-tested LiveKit infrastructure
- Simplified deployment (Docker Compose)
