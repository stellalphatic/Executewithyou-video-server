# AllStrm Documentation

## Overview

AllStrm is a professional live streaming and video meeting platform built on **LiveKit** + **Supabase**.

**Current Status**: Phase 1 Complete ✅

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System architecture & technology stack |
| [Phase 1 Status](PHASE1_STATUS.md) | Implementation progress (100% complete) |
| [Profit Strategy](PROFIT_STRATEGY.md) | Monetization & Phase 2 roadmap |
| [API Reference](api/README.md) | API endpoints & data messages |
| [Diagrams](architecture/DIAGRAMS.md) | Visual architecture diagrams |
| [Deployment](deployment/DEPLOYMENT.md) | Deployment guide |

---

## Project Structure

```
allstrm-backend/
├── frontend-next/           # Next.js 14 frontend
│   ├── src/
│   │   ├── app/             # Pages (dashboard, studio, meeting, login)
│   │   ├── components/      # React components (Studio, Meeting, etc.)
│   │   ├── hooks/           # useAllstrmLiveKit, useStudioEngines
│   │   ├── contexts/        # AuthContext
│   │   └── utils/           # Permissions, video processing
│   └── public/              # Static assets
├── docs/                    # Documentation (you are here)
│   ├── api/                 # API reference
│   ├── architecture/        # Diagrams
│   ├── deployment/          # Deployment guides
│   └── archive/             # Old Rust-based docs
├── archive/                 # Archived Rust microservices
│   └── rust-backend-v1/
├── supabase/                # Supabase configuration
├── migrations/              # Database migrations
├── docker-compose.yml       # LiveKit stack
├── livekit.yaml             # LiveKit server config
└── egress.yaml              # Egress service config
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Supabase CLI

### Quick Start

```bash
# 1. Start LiveKit stack
docker compose up -d

# 2. Start Supabase
supabase start

# 3. Start frontend
cd frontend-next
npm install
npm run dev
```

### Development Ports

| Service | Port | Purpose |
|---------|------|---------|
| Next.js | 3000 | Frontend |
| LiveKit | 7880 | WebRTC signaling |
| Supabase | 54321 | Auth, DB, Storage |
| MinIO | 9000/9001 | S3-compatible storage |
| Redis | 6379 | LiveKit state |

---

## Key Features (Phase 1 Complete)

### Studio
- ✅ Video/audio device management
- ✅ Multiple layout presets (solo, split, PiP, grid)
- ✅ Drag-and-drop stage management
- ✅ Custom zoom/pan per video feed
- ✅ Branding (logo, background, overlays)

### Presentation Pinning
- ✅ Pin presentation to fullscreen
- ✅ Zoom controls (1x - 3x)
- ✅ Drag-to-pan functionality
- ✅ Floating PiP for other participants

### Guest Management
- ✅ Waiting room with host admission
- ✅ Per-guest permissions (audio/video/screen/chat)
- ✅ Kick with notification
- ✅ Host-authoritative stage sync

### Going Live (RTMP)
- ✅ Multi-destination streaming (YouTube, Twitch, etc.)
- ✅ Stream health panel (Creator+)
- ✅ Hot switch per destination
- ✅ Metrics for nerds (Pro+)

### Recording
- ✅ WYSIWYG recording via canvas compositing
- ✅ 1920x1080 output
- ✅ WebM download

---

## Environment Variables

```env
# LiveKit
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start>
```

---

## Architecture Migration

We migrated from custom Rust microservices to LiveKit + Supabase for:
- **90% reduction** in backend code maintenance
- **Faster time-to-market** (months → weeks)
- **Battle-tested infrastructure** (WebRTC, scaling, egress)
- **Lower operational cost** (managed services)

Old documentation preserved in `docs/archive/` and `archive/rust-backend-v1/`.

---

## Phase 2 Roadmap

See [PROFIT_STRATEGY.md](PROFIT_STRATEGY.md) for full details:

1. Stripe billing integration
2. Usage metering & analytics
3. Cloud recording via Egress API
4. ISO track recording
5. Advanced guest management
