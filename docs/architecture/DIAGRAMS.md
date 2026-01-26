# ALLSTRM v4.1.0 - Complete Architecture Documentation

## Table of Contents
1. [System Overview](#1-system-overview)
2. [What Was Built](#2-what-was-built)
3. [Database Schema](#3-database-schema)
4. [Component Architecture](#4-component-architecture)
5. [Key User Flows](#5-key-user-flows)
6. [Why These Decisions](#6-why-these-decisions)
7. [Feature Completion](#7-feature-completion)

---

## 1. System Overview

### High-Level Architecture

```plantuml
@startuml ALLSTRM_System_Overview
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff
skinparam rectangleBorderColor #4a4a6a

title ALLSTRM v4.1.0 - System Architecture

actor "Host" as host
actor "Guest" as guest
actor "Viewer" as viewer

cloud "External Platforms" as external {
    [YouTube]
    [Twitch]
    [Facebook]
    [Custom RTMP]
}

package "Browser (Client)" as browser {
    [Next.js Frontend\n(React 19 + TypeScript)]
    [LiveKit Client SDK]
    [Supabase Client]
}

package "Backend Services" as backend {
    [Next.js API Routes\n(Rate Limited)]
    [Supabase Auth\n(JWT + OAuth)]
    [PostgreSQL\n(3 Schemas)]
}

package "Media Infrastructure" as media {
    [LiveKit Server\n(WebRTC SFU)]
    [LiveKit Egress\n(Recording + RTMP)]
    [Redis\n(Session State)]
    [MinIO/R2\n(Storage)]
}

host --> browser
guest --> browser
viewer --> browser

browser --> [Next.js API Routes\n(Rate Limited)] : REST API
browser --> [LiveKit Client SDK] : WebRTC
browser --> [Supabase Client] : Auth + DB

[Next.js API Routes\n(Rate Limited)] --> [Supabase Auth\n(JWT + OAuth)]
[Next.js API Routes\n(Rate Limited)] --> [PostgreSQL\n(3 Schemas)]
[Next.js API Routes\n(Rate Limited)] --> [LiveKit Server\n(WebRTC SFU)]

[LiveKit Client SDK] --> [LiveKit Server\n(WebRTC SFU)] : WebRTC + Data Channel

[LiveKit Server\n(WebRTC SFU)] --> [LiveKit Egress\n(Recording + RTMP)]
[LiveKit Server\n(WebRTC SFU)] --> [Redis\n(Session State)]

[LiveKit Egress\n(Recording + RTMP)] --> [MinIO/R2\n(Storage)] : Recordings
[LiveKit Egress\n(Recording + RTMP)] --> external : RTMP Streams

@enduml
```

### What This Diagram Shows
- **Three user roles**: Host (full control), Guest (limited permissions), Viewer (watch only)
- **Client layer**: Next.js frontend with LiveKit SDK for real-time media
- **Backend layer**: API routes with rate limiting, Supabase for auth and database
- **Media layer**: LiveKit handles all WebRTC complexity, Egress handles streaming out

---

## 2. What Was Built

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16 + React 19 | UI rendering, SSR |
| **State** | React Hooks + Context | No Redux needed |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **WebRTC** | LiveKit Client SDK | Real-time media |
| **Auth** | Supabase Auth | JWT + OAuth providers |
| **Database** | PostgreSQL 15+ | Via Supabase |
| **SFU** | LiveKit Server | WebRTC routing |
| **Egress** | LiveKit Egress | RTMP + Recording |
| **Storage** | MinIO (dev) / R2 (prod) | S3-compatible |
| **Cache** | Redis 7 | LiveKit state |

### Directory Structure

```
allstrm-backend/
├── frontend-next/
│   └── src/
│       ├── app/                    # Next.js App Router
│       │   ├── api/               # API Routes (rate-limited)
│       │   │   ├── rooms/         # Room CRUD + token generation
│       │   │   ├── egress/        # Start/stop streaming
│       │   │   ├── destinations/  # RTMP destinations
│       │   │   ├── oauth/         # Platform OAuth flows
│       │   │   └── users/         # User tier info
│       │   ├── studio/[roomId]/   # Host interface
│       │   ├── meeting/[roomId]/  # Guest interface
│       │   ├── dashboard/         # Room management
│       │   └── login/, signup/    # Auth pages
│       ├── components/
│       │   ├── Studio.tsx         # Main host component (~1000 lines)
│       │   ├── Meeting.tsx        # Guest view
│       │   ├── ErrorBoundary.tsx  # Error handling
│       │   ├── GreenRoom/         # Pre-call device setup
│       │   └── studio/            # Sub-components
│       ├── hooks/
│       │   └── useAllstrmLiveKit.ts  # Core LiveKit integration (~1660 lines)
│       ├── contexts/
│       │   └── AuthContext.tsx    # Auth + tier + multi-tab
│       ├── lib/
│       │   ├── api.ts             # API client
│       │   ├── rateLimit.ts       # Rate limiting utility
│       │   └── constants.ts       # Config
│       ├── types/
│       │   └── index.ts           # TypeScript interfaces
│       └── utils/
│           ├── permissions.ts     # Tier-based feature gating
│           └── layoutEngine.ts    # Video layout calculations
├── migrations/
│   └── 003_consolidated_all.sql   # Complete DB schema (v4.1.0)
├── docs/
│   ├── ARCHITECTURE.md            # High-level design
│   └── architecture/
│       └── DIAGRAMS.md            # This file
└── docker-compose.yml             # Local dev stack
```

---

## 3. Database Schema

### Entity Relationship Diagram

```plantuml
@startuml ALLSTRM_Database_ERD
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title ALLSTRM Database Schema v4.1.0

package "core schema" as core {
    entity "users" as users {
        * id : UUID <<PK>>
        --
        email : VARCHAR(255) <<unique>>
        display_name : VARCHAR(128)
        avatar_url : TEXT
        plan : VARCHAR(32)
        settings : JSONB
        created_at : TIMESTAMPTZ
        updated_at : TIMESTAMPTZ
    }

    entity "organizations" as orgs {
        * id : UUID <<PK>>
        --
        name : VARCHAR(128)
        slug : VARCHAR(64) <<unique>>
        billing_tier : VARCHAR(32)
        stripe_customer_id : VARCHAR(64)
        max_rooms : INTEGER
        max_participants_per_room : INTEGER
        max_stream_hours_monthly : INTEGER
        max_destinations : INTEGER
        features : JSONB
    }

    entity "organization_members" as org_members {
        * id : UUID <<PK>>
        --
        organization_id : UUID <<FK>>
        user_id : UUID <<FK>>
        role : VARCHAR(32)
        permissions : JSONB
    }

    entity "rooms" as rooms {
        * id : UUID <<PK>>
        --
        organization_id : UUID <<FK>>
        owner_id : UUID <<FK>>
        name : VARCHAR(255)
        mode : VARCHAR(32)
        status : VARCHAR(32)
        settings : JSONB
        stream_config : JSONB
    }

    entity "room_participants" as participants {
        * id : UUID <<PK>>
        --
        room_id : UUID <<FK>>
        user_id : UUID <<FK>>
        display_name : VARCHAR(128)
        role : VARCHAR(32)
        is_in_waiting_room : BOOLEAN
        is_on_stage : BOOLEAN
    }

    entity "room_guest_permissions" as guest_perms {
        * room_id : UUID <<PK,FK>>
        --
        can_toggle_audio : BOOLEAN
        can_toggle_video : BOOLEAN
        can_share_screen : BOOLEAN
        can_send_chat : BOOLEAN
    }
}

package "stream schema" as stream {
    entity "destinations" as dests {
        * id : UUID <<PK>>
        --
        room_id : UUID <<FK>>
        user_id : UUID <<FK>>
        platform : VARCHAR(32)
        name : VARCHAR(128)
        rtmp_url_encrypted : TEXT
        stream_key_encrypted : TEXT
        enabled : BOOLEAN
        status : VARCHAR(32)
    }

    entity "health_metrics" as health {
        * room_id : UUID <<PK>>
        --
        input_bitrate_kbps : INTEGER
        input_fps : REAL
        destinations_connected : INTEGER
        packet_loss_percent : REAL
    }
}

package "assets schema" as assets {
    entity "recordings" as recs {
        * id : UUID <<PK>>
        --
        room_id : UUID <<FK>>
        organization_id : UUID <<FK>>
        recording_type : VARCHAR(32)
        r2_key : VARCHAR(512)
        duration_seconds : INTEGER
        status : VARCHAR(32)
    }

    entity "uploads" as uploads {
        * id : UUID <<PK>>
        --
        room_id : UUID <<FK>>
        asset_type : VARCHAR(32)
        s3_key : VARCHAR(512)
        size_bytes : BIGINT
    }
}

package "public schema" as pub {
    entity "oauth_connections" as oauth {
        * id : UUID <<PK>>
        --
        user_id : UUID
        provider : VARCHAR(32)
        provider_user_id : VARCHAR(255)
        access_token_encrypted : TEXT
        refresh_token_encrypted : TEXT
        is_active : BOOLEAN
    }

    entity "youtube_broadcasts" as yt {
        * id : UUID <<PK>>
        --
        connection_id : UUID <<FK>>
        broadcast_id : VARCHAR(64)
        ingestion_address : TEXT
        status : VARCHAR(32)
    }
}

' Relationships
users ||--o{ org_members : "belongs to"
orgs ||--o{ org_members : "has"
orgs ||--o{ rooms : "owns"
users ||--o{ rooms : "creates"
rooms ||--o{ participants : "has"
rooms ||--|| guest_perms : "configures"
rooms ||--o{ dests : "streams to"
rooms ||--o{ recs : "produces"
rooms ||--o{ uploads : "stores"
users ||--o{ oauth : "connects"
oauth ||--o{ yt : "creates"

@enduml
```

### Schema Design Rationale

| Schema | Purpose | Why Separate? |
|--------|---------|---------------|
| **core** | Users, orgs, rooms | Core business logic, frequently queried |
| **stream** | RTMP, health metrics | Hot data with frequent updates |
| **assets** | Recordings, uploads | Large file metadata, separate scaling |
| **public** | OAuth connections | Supabase Auth integration, RLS policies |

### Key Constraints Added in v4.1.0
- ✅ FK constraints on `stream.destinations` → `core.rooms`, `core.users`
- ✅ `broadcast` tier added to plan CHECK constraints
- ✅ Removed duplicate `is_enabled` column
- ✅ Consolidated oauth_connections to public schema

---

## 4. Component Architecture

### Frontend Component Hierarchy

```plantuml
@startuml ALLSTRM_Component_Architecture
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title ALLSTRM Frontend Component Architecture

package "App Shell" as shell {
    [Providers] as providers
    [ErrorBoundary] as errbound
    [AuthContext] as auth
}

package "Pages" as pages {
    [Dashboard] as dash
    [Studio Page] as studio_page
    [Meeting Page] as meeting_page
    [Login/Signup] as login
}

package "Studio Components" as studio_comps {
    [Studio.tsx] as studio
    [Stage] as stage
    [VideoFeed] as vfeed
    [BrandingPanel] as brand
    [Destinations] as dests
    [GreenRoom] as green
    [WaitingRoom] as waiting
    [StreamHealthMonitor] as health
}

package "Hooks" as hooks {
    [useAllstrmLiveKit] as hook
    [useStudioEngines] as engines
}

package "External Services" as external {
    [LiveKit Server] as lk
    [Supabase] as sb
}

providers --> errbound
errbound --> auth
auth --> pages

dash --> hook
studio_page --> studio
meeting_page --> [Meeting.tsx]

studio --> stage
studio --> brand
studio --> dests
studio --> green
studio --> waiting
studio --> health

stage --> vfeed

studio --> hook
hook --> lk : WebRTC
hook --> sb : Auth + DB

@enduml
```

### useAllstrmLiveKit Hook - The Core

This is the heart of the application (~1660 lines). It handles:

```plantuml
@startuml useAllstrmLiveKit_Responsibilities
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title useAllstrmLiveKit Hook Responsibilities

package "useAllstrmLiveKit" {

    package "Connection" {
        [connect()]
        [disconnect()]
        [prepareCamera()]
    }

    package "Media Control" {
        [toggleVideo()]
        [toggleAudio()]
        [startScreenShare()]
        [stopScreenShare()]
        [switchDevice()]
    }

    package "Participant Management" {
        [admitParticipant()]
        [toggleStageStatus()]
        [removeParticipant()]
        [updatePermissions()]
    }

    package "Broadcast" {
        [startBroadcast()]
        [stopBroadcast()]
        [addDestination()]
        [toggleDestination()]
    }

    package "Recording" {
        [startRecording()]
        [stopRecording()]
        note right: WYSIWYG via\ncanvas compositing
    }

    package "Communication" {
        [sendChatMessage()]
        [sendDataMessage()]
        [handleDataReceived()]
    }

    package "State" {
        [participants]
        [localStream]
        [screenStream]
        [broadcastStatus]
        [chatMessages]
        [wasKicked]
    }
}

@enduml
```

---

## 5. Key User Flows

### Flow 1: Host Creates and Starts a Stream

```plantuml
@startuml Host_Stream_Flow
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff
skinparam sequenceArrowColor #4a9eff

title Host Creates and Starts a Stream

actor Host
participant "Dashboard" as dash
participant "Studio" as studio
participant "API Routes" as api
participant "LiveKit" as lk
participant "Egress" as egress
database "PostgreSQL" as db

Host -> dash : Click "New Room"
dash -> api : POST /api/rooms
api -> db : INSERT into core.rooms
db --> api : room_id
api --> dash : { id, name }

Host -> dash : Click "Enter Studio"
dash -> studio : Navigate with roomId

studio -> api : POST /api/rooms/{id}/token
note right: Rate limited\n30 req/min
api -> lk : Generate JWT
lk --> api : token
api --> studio : { token, serverUrl }

studio -> lk : room.connect(url, token)
lk --> studio : RoomEvent.Connected

Host -> studio : Add RTMP destination
studio -> api : POST /api/destinations
api -> db : INSERT into stream.destinations

Host -> studio : Click "Go Live"
studio -> api : POST /api/egress/start
note right: Rate limited\n10 req/min
api -> egress : startRoomCompositeEgress()
egress -> egress : Capture room video
egress --> api : egressId
api --> studio : { egressId, status: 'live' }

egress -> egress : Push RTMP to YouTube/Twitch

@enduml
```

### Flow 2: Guest Joins via Waiting Room

```plantuml
@startuml Guest_Join_Flow
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff
skinparam sequenceArrowColor #4a9eff

title Guest Joins via Waiting Room

actor Guest
actor Host
participant "Join Page" as join
participant "GreenRoom" as green
participant "Meeting" as meeting
participant "LiveKit" as lk

Guest -> join : Open invite link\n/join/room123?role=guest
join -> green : Show device setup

Guest -> green : Select camera/mic
green -> green : Preview video

Guest -> green : Click "Join"
green -> meeting : Navigate with config

meeting -> lk : POST /api/rooms/{id}/token\n{ role: 'guest' }
note right: Token includes\nmetadata.inWaitingRoom = true

meeting -> lk : room.connect()
lk --> meeting : Connected

meeting -> meeting : Show "Waiting for host..."
note right: Guest sees\nwaiting room UI

lk -> Host : ParticipantConnected event
Host -> Host : See guest in waiting panel

Host -> lk : sendDataMessage(\n{ type: 'admission', targetId })

lk -> meeting : DataReceived event
meeting -> meeting : Remove waiting overlay
meeting -> meeting : sessionStorage.admitted = true

Host -> lk : sendDataMessage({ type: 'stageSync', participants })
lk -> meeting : Apply stage state

@enduml
```

### Flow 3: WYSIWYG Recording

```plantuml
@startuml Recording_Flow
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title WYSIWYG Recording Flow

participant "Host" as host
participant "Stage\n(DOM Element)" as stage
participant "Canvas\n(1920x1080)" as canvas
participant "MediaRecorder" as recorder
participant "Browser" as browser

host -> host : Click "Record"

host -> stage : Get stageRef
note right: Stage contains:\n- VideoFeeds\n- Branding\n- Overlays

loop Every frame (30 fps)
    stage -> canvas : drawImage(stageRef, 0, 0)
    canvas -> canvas : captureStream(30)
end

canvas -> recorder : new MediaRecorder(stream)
recorder -> recorder : Start recording\nwebm/vp8+opus

note over recorder: Recording in progress...\nExact WYSIWYG output

host -> host : Click "Stop"
recorder -> recorder : Stop recording
recorder -> browser : ondataavailable(blob)
browser -> browser : Download .webm file

@enduml
```

### Flow 4: Permission Control

```plantuml
@startuml Permission_Flow
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title Host Controls Guest Permissions

actor Host
actor Guest
participant "GuestPermissionsPanel" as panel
participant "LiveKit\nData Channel" as lk
participant "Guest UI" as ui

Host -> panel : Toggle "Can Share Screen" OFF

panel -> lk : sendDataMessage({\n  type: 'permission',\n  targetId: guestId,\n  permissions: {\n    canShareScreen: false\n  }\n})

lk -> Guest : DataReceived event

Guest -> ui : setReceivedPermissions(...)

ui -> ui : Check permissions\nbefore each action

ui -> ui : Screen Share button\nshows lock icon,\ndisabled state

note over ui: Guest sees:\n"Screen sharing is\ndisabled by host"

@enduml
```

---

## 6. Why These Decisions

### Why LiveKit instead of Custom SFU?

| Aspect | Custom SFU (Old v1) | LiveKit (v4) |
|--------|---------------------|--------------|
| **Code to maintain** | ~15,000 lines Rust | 0 lines |
| **Features** | Basic SFU | Simulcast, Dynacast, Recording |
| **Time to production** | 6+ months | 2 weeks |
| **Scaling** | Custom k8s setup | LiveKit Cloud |
| **Cost** | High DevOps burden | $0.004/participant-minute |

**Decision**: Outsource undifferentiated heavy lifting. Focus on product features.

### Why Supabase instead of Custom Auth?

| Aspect | Custom Auth | Supabase |
|--------|-------------|----------|
| **JWT handling** | Manual | Built-in |
| **OAuth providers** | Implement each | Toggle on |
| **Row-level security** | Build from scratch | SQL policies |
| **Realtime** | WebSocket server | Built-in |

**Decision**: Auth is a solved problem. Don't reinvent.

### Why Schema Partitioning?

```
core schema   → Users, Rooms (frequently read, rarely updated)
stream schema → Health metrics (hot table, updates every second)
assets schema → Recordings (large files, separate backup strategy)
```

**Decision**: Prevent hot tables (health_metrics) from blocking core operations. Allows independent scaling.

### Why Client-Side Recording?

| Approach | Pros | Cons |
|----------|------|------|
| **Server-side (Egress)** | Higher quality, ISO tracks | Costs $$$, delayed access |
| **Client-side (Canvas)** | Instant, free, WYSIWYG | Browser-dependent |

**Decision**: Start with client-side for immediate value. Add server-side for Pro+ tiers.

### Why In-Memory Rate Limiting?

```typescript
// Simple, effective, no external dependencies
const rateLimitStore = new Map<string, RateLimitEntry>();
```

**Decision**: Good enough for single-instance. Can swap to Redis for multi-instance later.

---

## 7. Feature Completion

### What Works Now (v4.1.0)

```plantuml
@startuml Feature_Completion
!theme plain
skinparam backgroundColor #1a1a2e
skinparam defaultFontColor #ffffff

title Feature Completion Status

package "100% Complete" as complete #2d5a3d {
    [Studio Interface]
    [Meeting Interface]
    [Waiting Room]
    [Guest Admission]
    [Permission System]
    [WYSIWYG Recording]
    [Multi-destination RTMP]
    [Presentation Pinning]
    [Zoom/Pan Controls]
    [Screen Sharing]
    [Device Selection]
    [Auth + Sessions]
    [Tier-based Features]
    [Rate Limiting]
    [Error Boundaries]
}

package "Partially Working" as partial #5a5a2d {
    [Branding Panel]
    note right: Works but needs\nUI polish

    [Virtual Background]
    note right: MediaPipe not\nsegmenting properly
}

package "Not Started (Phase 2)" as future #5a2d2d {
    [ISO Recording]
    [Analytics Dashboard]
    [Stripe Integration]
    [Usage Metering]
    [Mobile App]
}

@enduml
```

### API Endpoints Status

| Endpoint | Method | Rate Limit | Status |
|----------|--------|------------|--------|
| `/api/rooms` | GET/POST/PATCH/DELETE | 20/min | ✅ Working |
| `/api/rooms/[id]/token` | POST | 30/min | ✅ Working |
| `/api/egress/start` | POST | 10/min | ✅ Working |
| `/api/egress/stop` | POST | 10/min | ✅ Working |
| `/api/destinations` | GET/POST/PATCH/DELETE | 30/min | ✅ Working |
| `/api/oauth/[provider]/authorize` | POST | 20/min | ✅ Working |
| `/api/oauth/[provider]/callback` | GET | 20/min | ✅ Working |
| `/api/users/[id]/tier` | GET | 100/min | ✅ Working |

### Database Health

- ✅ All FK constraints in place
- ✅ Indexes on frequently queried columns
- ✅ RLS policies on all user-facing tables
- ✅ Triggers for `updated_at` auto-update
- ✅ Cleanup functions for stale data

---

## Rendering These Diagrams

### Option 1: PlantUML Server
```bash
# Using PlantUML public server
curl -X POST -d "@diagram.puml" http://www.plantuml.com/plantuml/png/
```

### Option 2: Local PlantUML
```bash
# Install PlantUML
brew install plantuml  # macOS
sudo apt install plantuml  # Ubuntu

# Generate PNG
plantuml DIAGRAMS.md
```

### Option 3: VS Code Extension
Install "PlantUML" extension by jebbs, then use `Alt+D` to preview.

### Option 4: Online Editors
- [PlantUML Web Server](http://www.plantuml.com/plantuml/uml/)
- [PlantText](https://www.planttext.com/)

---

*Last Updated: January 26, 2026 - Version 4.1.0*
