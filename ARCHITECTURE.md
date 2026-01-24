# ALLSTRM v2 Architecture

> **Note**: This is ALLSTRM v2, rebuilt on LiveKit. The previous Rust architecture (v1) is archived at `/archive/rust-backend-v1/`.

## Overview

ALLSTRM v2 uses a simplified architecture built on **LiveKit** (open-source WebRTC infrastructure) and **Supabase** (Backend-as-a-Service). This replaces the previous custom 5-service Rust architecture.

### Why the Change?

| v1 (Rust) | v2 (LiveKit) |
|-----------|--------------|
| 5 custom microservices | 0 custom services |
| Custom WebRTC signaling | LiveKit handles it |
| Custom FFmpeg orchestration | LiveKit Egress |
| Weeks of debugging | Production-ready |
| ~20,000 lines of Rust | ~2,000 lines of TypeScript |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                     │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Browser   │  │   Mobile    │  │   Desktop   │                 │
│  │  (Next.js)  │  │  (Future)   │  │  (Future)   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│              ┌───────────┴───────────┐                              │
│              │   LiveKit React SDK   │                              │
│              │  @livekit/components  │                              │
│              └───────────┬───────────┘                              │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│    Supabase      │ │  LiveKit Server  │ │  LiveKit Egress  │
│                  │ │                  │ │                  │
│  ┌────────────┐  │ │  • WebRTC SFU    │ │  • Recording     │
│  │    Auth    │  │ │  • Signaling     │ │  • RTMP Output   │
│  │  (OAuth)   │  │ │  • Track Routing │ │  • HLS/DASH      │
│  └────────────┘  │ │  • Room Mgmt     │ │  • Compositing   │
│                  │ │                  │ │                  │
│  ┌────────────┐  │ └────────┬─────────┘ └────────┬─────────┘
│  │  Database  │  │          │                    │
│  │ (Postgres) │  │          └────────┬───────────┘
│  └────────────┘  │                   │
│                  │                   ▼
│  ┌────────────┐  │          ┌──────────────────┐
│  │ API Routes │  │          │      Redis       │
│  │ (Next.js)  │  │          │  (State/Queue)   │
│  └────────────┘  │          └──────────────────┘
│                  │
│  ┌────────────┐  │
│  │  Storage   │  │
│  │(R2/S3 Int.)│  │
│  └────────────┘  │
└──────────────────┘

                           │
                           ▼
              ┌──────────────────────────┐
              │   Streaming Platforms    │
              │                          │
              │  YouTube • Twitch • X    │
              │  Facebook • Custom RTMP  │
              └──────────────────────────┘
```

## Components

### Frontend (Next.js)

| Component | Purpose |
|-----------|---------|
| `@livekit/components-react` | Pre-built WebRTC UI components |
| `livekit-client` | Low-level WebRTC client |
| Supabase Client | Auth, database queries |
| API Routes | Token generation, business logic |

### Supabase

| Feature | Usage |
|---------|-------|
| **Auth** | User authentication, OAuth for streaming platforms |
| **Database** | Rooms, participants, destinations, recordings metadata |
| **API Routes** | Token generation, room management (in Next.js) |
| **Storage** | User avatars, assets (recordings stored in R2) |

### LiveKit Server

| Feature | Usage |
|---------|-------|
| **WebRTC SFU** | Multi-party video routing |
| **Signaling** | Automatic - no custom protocol needed |
| **Room Management** | Dynamic room creation via API |
| **Track Routing** | Selective forwarding, simulcast |

### LiveKit Egress

| Feature | Usage |
|---------|-------|
| **Room Composite** | Combine all participants into one stream |
| **Track Composite** | Specific tracks only |
| **RTMP Output** | Stream to YouTube, Twitch, etc. |
| **Recording** | Save to S3/R2 |

---

## Data Flow

### 1. User Joins Room

```
Browser                    Next.js API             Supabase           LiveKit
   │                           │                      │                  │
   │  GET /api/rooms/:id       │                      │                  │
   │ ─────────────────────────>│                      │                  │
   │                           │  SELECT * FROM rooms │                  │
   │                           │ ────────────────────>│                  │
   │                           │<─────────────────────│                  │
   │                           │                      │                  │
   │                           │  Generate JWT token  │                  │
   │                           │  (livekit-server-sdk)│                  │
   │                           │                      │                  │
   │<──────────────────────────│                      │                  │
   │  { room, token }          │                      │                  │
   │                           │                      │                  │
   │  Connect with token       │                      │                  │
   │ ─────────────────────────────────────────────────────────────────>│
   │                           │                      │                  │
   │  WebRTC established       │                      │                  │
   │<─────────────────────────────────────────────────────────────────│
```

### 2. Start Streaming (Go Live)

```
Browser                    Next.js API             LiveKit Server    Egress
   │                           │                      │                │
   │  POST /api/egress/start   │                      │                │
   │  { roomId, destinations } │                      │                │
   │ ─────────────────────────>│                      │                │
   │                           │                      │                │
   │                           │  StartRoomComposite  │                │
   │                           │  { rtmp_urls: [...]} │                │
   │                           │ ────────────────────>│                │
   │                           │                      │  Create Job    │
   │                           │                      │ ──────────────>│
   │                           │                      │                │
   │                           │<─────────────────────│                │
   │                           │  { egress_id }       │                │
   │<──────────────────────────│                      │                │
   │                           │                      │  RTMP Stream   │
   │                           │                      │  ────────────> │
   │                           │                      │  (to YouTube)  │
```

---

## Database Schema

```sql
-- Rooms (simplified from v1)
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  host_id UUID REFERENCES auth.users(id),
  livekit_room_name VARCHAR(255) UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Streaming Destinations (OAuth tokens for platforms)
CREATE TABLE destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  platform VARCHAR(50) NOT NULL, -- 'youtube', 'twitch', 'facebook', etc.
  name VARCHAR(255),
  rtmp_url TEXT,
  stream_key TEXT, -- encrypted
  oauth_access_token TEXT, -- encrypted
  oauth_refresh_token TEXT, -- encrypted
  oauth_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recordings
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  egress_id VARCHAR(255), -- LiveKit egress ID
  status VARCHAR(50) DEFAULT 'pending',
  storage_path TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Active Egress Jobs
CREATE TABLE egress_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  destination_id UUID REFERENCES destinations(id),
  egress_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'starting',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
```

---

## API Routes

### Token Generation

```typescript
// app/api/rooms/[roomId]/token/route.ts
import { AccessToken } from 'livekit-server-sdk';

export async function POST(req: Request, { params }) {
  const { roomId } = params;
  const { displayName, role } = await req.json();
  const user = await getAuthenticatedUser(req);
  
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: user.id, name: displayName }
  );
  
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: role === 'host' || role === 'co-host',
    canSubscribe: true,
    canPublishData: true,
  });
  
  return Response.json({ token: token.toJwt() });
}
```

### Start Egress

```typescript
// app/api/egress/start/route.ts
import { EgressClient } from 'livekit-server-sdk';

export async function POST(req: Request) {
  const { roomId, destinationIds, recordingEnabled } = await req.json();
  
  const egressClient = new EgressClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
  
  const destinations = await getDestinations(destinationIds);
  const streamOutputs = destinations.map(d => ({
    protocol: StreamProtocol.RTMP,
    urls: [`${d.rtmp_url}/${d.stream_key}`],
  }));
  
  const egress = await egressClient.startRoomCompositeEgress(
    roomId,
    { streamOutputs }
  );
  
  return Response.json({ egressId: egress.egressId });
}
```

---

## Environment Variables

```bash
# LiveKit
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY=your-access-key
R2_SECRET_KEY=your-secret-key
R2_BUCKET=allstrm-recordings
```

---

## Development

```bash
# Start all services
docker-compose up -d

# Start frontend
cd frontend-next && npm run dev
```

---

## Production Deployment

| Service | Recommendation |
|---------|----------------|
| **LiveKit** | [LiveKit Cloud](https://livekit.io/cloud) - $0.004/participant-minute |
| **Supabase** | [Supabase Cloud](https://supabase.com) - Free tier available |
| **Frontend** | Vercel or Cloudflare Pages |
| **Storage** | Cloudflare R2 - No egress fees |

### Cost Estimate (500 users, 100 streams/month)

| Service | Monthly Cost |
|---------|--------------|
| LiveKit Cloud | ~$200-400 |
| Supabase Pro | $25 |
| Cloudflare R2 | ~$50-100 |
| Vercel Pro | $20 |
| **Total** | **~$300-550** |

---

## Migration from v1

The v1 Rust codebase is archived at `/archive/rust-backend-v1/`.

### What Changed

| v1 (Rust) | v2 (LiveKit) |
|-----------|--------------|
| Custom SFU in Rust | LiveKit Server |
| Custom signaling protocol | LiveKit SDK |
| FFmpeg service | LiveKit Egress |
| 5 microservices | 0 custom backend services |
| Complex deployment | Simple Docker stack |

### What Remains

- Next.js frontend (refactored for LiveKit)
- Supabase for auth/DB
- PostgreSQL schema (simplified)
- OAuth integrations

---

## References

- [LiveKit Documentation](https://docs.livekit.io)
- [LiveKit React Components](https://docs.livekit.io/reference/components/react/)
- [Supabase Documentation](https://supabase.com/docs)
- [Archived v1 Code](/archive/rust-backend-v1/)
