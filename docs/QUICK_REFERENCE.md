# ALLSTRM v4.1.0 - Quick Reference

## TL;DR: What Is This?

**ALLSTRM** is a live streaming platform that lets hosts broadcast video to YouTube, Twitch, Facebook, and custom RTMP destinations with guest participation, waiting rooms, and real-time permissions.

```
Host creates room → Guests join via link → Host admits from waiting room
     ↓                                              ↓
Goes live to RTMP → Records locally (WYSIWYG) → Downloads .webm
```

---

## The Stack (One Sentence Each)

| Component | What It Does |
|-----------|--------------|
| **Next.js 16** | Frontend + API routes, all in one |
| **LiveKit** | Handles WebRTC magic (video routing, rooms) |
| **Supabase** | Auth + PostgreSQL + Storage in a box |
| **Redis** | LiveKit uses this for session state |
| **MinIO/R2** | Where recordings and uploads live |

---

## The Database (3 Schemas)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  core schema    │    │  stream schema  │    │  assets schema  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ users           │    │ destinations    │    │ recordings      │
│ organizations   │    │ health_metrics  │    │ uploads         │
│ rooms           │    │ rtmp_sessions   │    │ transcodes      │
│ participants    │    │ hls_segments    │    │ thumbnails      │
│ api_keys        │    │ health_logs     │    │                 │
│ oauth_state     │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐
│  public schema  │  ← Used by Supabase Auth
├─────────────────┤
│ oauth_connections│  (YouTube, Twitch tokens)
│ youtube_broadcasts│
│ twitch_streams  │
└─────────────────┘
```

---

## Key Files You'll Touch

| File | Lines | Purpose |
|------|-------|---------|
| `useAllstrmLiveKit.ts` | ~1660 | The brain - all LiveKit logic |
| `Studio.tsx` | ~1000 | Host interface |
| `Meeting.tsx` | ~400 | Guest interface |
| `permissions.ts` | ~214 | Tier-based feature gating |
| `003_consolidated_all.sql` | ~900 | Complete DB schema |
| `rateLimit.ts` | ~130 | API rate limiting |

---

## The 5 User Flows

### 1. Host Starts Streaming
```
Dashboard → Create Room → Enter Studio → Add Destination → Go Live
```

### 2. Guest Joins
```
Click invite link → Green Room (device setup) → Wait for admission → On stage
```

### 3. Recording
```
Click Record → Canvas captures stage → Stop → Download .webm
```

### 4. Permission Control
```
Host toggles "Can Share Screen" → Guest's button gets disabled
```

### 5. Going Live
```
Studio → Egress API → LiveKit captures room → RTMP to YouTube/Twitch
```

---

## Subscription Tiers

| Feature | Free | Creator | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Basic streaming | ✅ | ✅ | ✅ | ✅ |
| Waiting room | ✅ | ✅ | ✅ | ✅ |
| RTMP destinations | ❌ | 1 | 5 | ∞ |
| Stream health panel | ❌ | ✅ | ✅ | ✅ |
| Cloud recording | ❌ | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ❌ | ✅ |

---

## API Rate Limits

| Endpoint | Limit |
|----------|-------|
| Token generation | 30/min |
| Egress (go live) | 10/min |
| Destinations CRUD | 30/min |
| Rooms CRUD | 20/min |
| General API | 100/min |

---

## Running Locally

```bash
# 1. Start Supabase
supabase start

# 2. Start LiveKit stack
docker-compose up -d

# 3. Start frontend
cd frontend-next && npm run dev

# 4. Open http://localhost:3000
```

Test users (password: `password123`):
- `free@allstrm.local` - Free tier
- `creator@allstrm.local` - Creator tier
- `pro@allstrm.local` - Pro tier
- `enterprise@allstrm.local` - Enterprise tier

---

## What's Working (v4.1.0)

✅ Studio interface with video feeds
✅ Meeting interface for guests
✅ Waiting room + admission
✅ Guest permissions (audio/video/screen)
✅ WYSIWYG recording (downloads locally)
✅ Multi-destination RTMP streaming
✅ Presentation pinning with zoom/pan
✅ Screen sharing
✅ Chat (via data channel)
✅ Rate limiting on all APIs
✅ Error boundaries
✅ Tier-based feature gating

---

## What's Not Working Yet

⚠️ Virtual background (MediaPipe issue)
⚠️ Branding panel (needs polish)
❌ ISO recording (Phase 2)
❌ Analytics dashboard (Phase 2)
❌ Stripe billing (Phase 2)

---

## Common Commands

```bash
# Check TypeScript
npx tsc --noEmit

# Run migrations on Supabase
psql -h localhost -p 54322 -U postgres -d postgres -f migrations/003_consolidated_all.sql

# View LiveKit logs
docker logs allstrm-livekit -f

# View Egress logs
docker logs allstrm-egress -f
```

---

*v4.1.0 - Production Ready*
