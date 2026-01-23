# ALLSTRM Backend Refactor - Team Implementation Checklist

**Date Started:** January 14, 2026  
**Status:** Architecture Complete ✅ | Development In Progress ⏳

---

## 📋 Completed Architecture Work (Today)

### Documentation ✅
- [x] Read & analyzed PDF specification
- [x] Identified architectural violations in original code
- [x] Created `ALLSTRM_Architecture_v3.md` (comprehensive, spec-aligned)
- [x] Created `DATA_FLOWS.md` (detailed diagrams for all 3 clients)
- [x] Created `REFACTOR_SUMMARY.md` (what changed, why, remaining work)
- [x] Created `CLIENT_SDK_HOST.ts` (complete host client reference implementation)

### Code Refactoring ✅
- [x] Refactored `main.rs` - Removed FFmpeg orchestration
- [x] New operating mode: Passive Relay + Async Recording
- [x] Created `src/media/rtmp.rs` stub (needs protocol implementation)
- [x] Created `src/storage/recording.rs` stub (needs R2 integration)
- [x] Clarified service responsibilities in code comments

### Architecture Decisions ✅
- [x] Confirmed: Host client does ALL mixing (not server)
- [x] Confirmed: 10-20s latency is intentional (spec-compliant)
- [x] Confirmed: Server is passive relay only (no FFmpeg, no frame modification)
- [x] Confirmed: Three-client model (desktop host, mobile host, website viewer)
- [x] Confirmed: Recording is async (non-blocking, post-live)

---

## 🚀 Next Phase: Implementation (Week 1-3)

### Phase 1A: RTMP Ingest Module (CRITICAL PATH)
**Assignee:** Backend Engineer #1  
**Timeline:** 3-4 days  
**Blocking:** Everything else

#### Tasks:
- [ ] Integrate RTMP library (evaluate: `rml-rtmp`, `amf`, or custom)
- [ ] Implement RTMP handshake & protocol parsing
- [ ] Parse CONNECT command (extract stream_key, room_id)
- [ ] Validate stream key against `participants` table
- [ ] Parse H.264 + AAC frames from RTMP stream
- [ ] Create HLS segmenter interface
- [ ] Create recording buffer interface
- [ ] Monitor bitrate & frame rate
- [ ] Handle graceful disconnect & error cases
- [ ] Add logging for debugging

**Definition of Done:**
```
✓ Accept RTMP PUSH from test client
✓ Parse stream_key and validate
✓ Write H.264 + AAC to segmenter
✓ Bitrate logged every 5s
✓ Connection survives 5+ minute stream
```

**Testing:**
```bash
# ffmpeg -i test.mp4 -c:v libx264 -preset fast -c:a aac -f flv rtmp://localhost/live/test_key
```

---

### Phase 1B: Recording Processor (CRITICAL PATH)
**Assignee:** Backend Engineer #2  
**Timeline:** 3-4 days  
**Blocking:** Recording features

#### Tasks:
- [ ] Setup AWS SDK for S3 (Cloudflare R2 compatible)
- [ ] Create R2Config from environment variables
- [ ] Implement buffer pool for media frames
- [ ] Implement `upload_to_r2()` function
- [ ] Create database schema for recordings table
- [ ] Implement recording lifecycle:
  - [ ] Start recording (create DB record, status='pending')
  - [ ] Buffer media frames (non-blocking)
  - [ ] On stop: transition to 'processing'
  - [ ] Upload segments to R2 (status='uploading')
  - [ ] Mark complete (status='completed')
- [ ] Handle errors gracefully (status='failed')
- [ ] Add metrics for upload speed, size

**Definition of Done:**
```
✓ Start recording, stream 60s, stop recording
✓ File appears in R2 bucket
✓ Database shows correct status progression
✓ Metadata matches actual file
```

---

### Phase 2: Host Client SDK (CRITICAL PATH)
**Assignee:** Frontend Engineer #1  
**Timeline:** 5-7 days  
**Blocking:** Host features

#### Tasks:
- [ ] Setup React + TypeScript project
- [ ] Copy `CLIENT_SDK_HOST.ts` as reference
- [ ] Implement `useAllstrmHost` hook:
  - [ ] WebSocket signaling (join, leave)
  - [ ] WebRTC peer connection pool (1 per participant)
  - [ ] Implement `AudioContext` mixer:
    - [ ] GainNode for master volume
    - [ ] Per-source gain nodes
    - [ ] Audio worklet for advanced mixing
    - [ ] Loudness normalization (-23 LUFS)
  - [ ] Implement layout renderer (Canvas 2D or WebGL)
  - [ ] Implement encoding pipeline:
    - [ ] Browser WebCodecs API (preferred)
    - [ ] Fallback: FFmpeg.wasm
  - [ ] Implement RTMP upload via fetch/WebSocket
  - [ ] Implement preset layouts (single, side-by-side, grid, PiP)
  - [ ] Error handling & reconnection logic

- [ ] Build Studio UI component:
  - [ ] Preview canvas
  - [ ] Participant list
  - [ ] Layout preset buttons
  - [ ] Volume sliders (per-source + master)
  - [ ] Go Live / Stop Stream buttons
  - [ ] Recording controls

- [ ] Add testing:
  - [ ] Unit tests for audio mixing
  - [ ] Unit tests for layout calculation
  - [ ] Integration test: receive 3 WebRTC streams, mix, verify output

**Definition of Done:**
```
✓ Open host.allstrm.localhost
✓ Add 3 test participants
✓ Mix audio locally
✓ Switch layouts without glitch
✓ Encode to RTMP stream
✓ Stream received at server
✓ Stream visible in viewers (via CDN)
```

---

### Phase 3: Database Schema Migration
**Assignee:** DevOps / Backend  
**Timeline:** 1-2 days

#### Tasks:
- [ ] Migrate schema (see `ALLSTRM_Architecture_v3.md` §8)
- [ ] Create `organizations` table
- [ ] Create `rooms` table (with `layout_state` JSONB)
- [ ] Create `participants` table
- [ ] Create `recordings` table
- [ ] Create `session_heartbeats` table (optimized for 5000+ writes/sec)
- [ ] Add GIN indexes on JSONB columns
- [ ] Add partial indexes on active entities
- [ ] Implement RLS policies (if using Supabase)
- [ ] Run migrations on dev, staging, production

**SQL Files to Create:**
```
migrations/
  001_initial_schema.sql (organizations, rooms, participants)
  002_recording_schema.sql (recordings, heartbeats)
  003_indexes.sql (GIN, partial indexes)
  004_rls_policies.sql (row-level security)
  005_sample_data.sql (test data)
```

---

### Phase 4: Viewer Client (HLS)
**Assignee:** Frontend Engineer #2  
**Timeline:** 3-4 days

#### Tasks:
- [ ] Setup React player component
- [ ] Integrate HLS.js library
- [ ] Implement adaptive bitrate selection
- [ ] Implement 10-20s buffer management
- [ ] Handle segment fetch errors + retry
- [ ] Show loading spinner while buffering
- [ ] Add playback controls (play/pause, volume)
- [ ] Monitor network latency (RTT to CDN)
- [ ] Error handling (stream ended, connection lost)

**Definition of Done:**
```
✓ Viewer opens viewer.allstrm.localhost?room=<id>
✓ HLS stream plays with 10-20s delay
✓ Switch bitrates on network change
✓ Smooth segment transitions (no choppy video)
✓ Works on Chrome, Firefox, Safari, iOS, Android
```

---

### Phase 5: Mobile Host (SRT) - MVP
**Assignee:** Mobile Engineer  
**Timeline:** 4-5 days

#### Tasks (MVP: Camera-only, no mixing):
- [ ] Setup iOS project (Swift)
- [ ] Setup Android project (Kotlin)
- [ ] Integrate SRT library (e.g., srt-swift, srt-android)
- [ ] Implement camera capture
- [ ] Implement mic capture
- [ ] Encode to H.264 + AAC
- [ ] Stream via SRT to server
- [ ] Implement WebSocket signaling
- [ ] Handle audio/video toggle
- [ ] Add network quality indicator

**Testing (MVP):**
```
✓ Launch iOS app
✓ Select camera
✓ Press "Go Live"
✓ Server receives SRT stream
✓ Stream appears in viewers
```

---

### Phase 6: Signaling Protocol Alignment
**Assignee:** Backend Engineer  
**Timeline:** 2-3 days

#### Update `src/signaling/websocket.rs`:
- [ ] Message type: `join` (host/guest/viewer role)
- [ ] Message type: `participant_joined` (with role + ingest_type)
- [ ] Message type: `participant_left`
- [ ] Message type: `media_state_changed` (video/audio toggle)
- [ ] Message type: `room_status` (idle, live, recording, ended)
- [ ] Message type: `start_recording` (mixed/iso)
- [ ] Message type: `stop_recording`
- [ ] Message type: `ice_candidate` (WebRTC ICE)
- [ ] Message type: `offer` / `answer` (WebRTC SDP)
- [ ] Broadcast to all participants correctly
- [ ] Error message format standardized
- [ ] Rate limiting on signaling messages

**IMPORTANT - What NOT to add:**
```
❌ layout_changed (host controls layout locally!)
❌ ffmpeg_status (no server-side FFmpeg!)
❌ frame_request (no frame processing!)
❌ quality_adjustment_server (host controls quality!)
```

---

### Phase 7: CDN Integration (Cloudflare)
**Assignee:** DevOps  
**Timeline:** 2-3 days

#### Tasks:
- [ ] Create R2 bucket for recordings
- [ ] Setup HLS origin (server `/hls/*` endpoint)
- [ ] Configure Cloudflare caching rules:
  - [ ] `.m3u8` files: 10s TTL, no cache
  - [ ] `.ts` segments: 1 year TTL, immutable
- [ ] Setup Cloudflare Workers (optional) for:
  - [ ] Origin shield (reduce origin load)
  - [ ] Custom logging
- [ ] Test CDN path:
  - [ ] Start stream on host
  - [ ] Wait 5-10s
  - [ ] Access viewer via CDN URL
  - [ ] Verify segments served from edge
- [ ] Monitor cache hit ratio (target: >95%)

---

### Phase 8: E2E Testing & Performance
**Assignee:** QA Engineer  
**Timeline:** 3-5 days

#### Test Cases:
```
[TC-001] Single Host + 1 Viewer
  ✓ Host goes live
  ✓ Viewer sees stream after 10-20s
  ✓ Recording completes
  ✓ Host disconnects
  ✓ Viewer sees stream end

[TC-002] Host + 3 Guests + 10 Viewers
  ✓ All guests' audio mixed
  ✓ Layout changes instantly
  ✓ No sync drift
  ✓ All viewers see same content
  ✓ Recording has all guests

[TC-003] Network Degradation
  ✓ Host loses 20% packets
  ✓ Quality degrades gracefully
  ✓ Stream continues
  ✓ Viewers see lower bitrate

[TC-004] Server Pod Restart
  ✓ Pod crashes mid-stream
  ✓ Kubernetes restarts pod
  ✓ Host reconnects within 5s
  ✓ Recording resumes
  ✓ Viewers experience <10s gap

[TC-005] 100 Concurrent Rooms
  ✓ 100 hosts streaming
  ✓ 500 viewers total
  ✓ Server memory < 8GB
  ✓ CPU utilization < 80%
  ✓ All streams healthy
```

#### Performance Targets:
| Metric | Target | Test |
|--------|--------|------|
| TTFF | < 5s | Viewer measures time from click to first frame |
| Audio latency | < 100ms | Host to server (WebRTC + mixing) |
| Layout change latency | < 1s | Host triggers layout → rendered on stream |
| Segment availability | 100% | No missing .ts files |
| Stream continuity | 99.9% | < 1% error rate across 1hr+ streams |

---

## 📅 Timeline Summary

```
Week 1:
  Mon-Tue:  RTMP Ingest (Phase 1A)      [Backend #1]
  Mon-Tue:  Recording Processor (Phase 1B) [Backend #2]
  Wed-Fri:  Host Client SDK (Phase 2)   [Frontend #1]
  Wed:      Database Schema (Phase 3)   [DevOps]

Week 2:
  Mon-Wed:  Viewer Client (Phase 4)     [Frontend #2]
  Mon-Thu:  Mobile Host (Phase 5)       [Mobile]
  Tue-Wed:  Signaling Protocol (Phase 6) [Backend]
  Thu:      CDN Integration (Phase 7)   [DevOps]

Week 3:
  Mon-Fri:  E2E Testing (Phase 8)       [QA]
  Thu-Fri:  Performance Optimization    [Backend]
  Fri:      Code Review & Merge         [Team]

**Go Live:** Early February (MVP Features Only)
```

---

## ✅ Definition of "Done"

### For Each Module:
1. **Code Complete** – All functionality implemented
2. **Tests Pass** – Unit + integration tests green
3. **Documentation** – Code comments + architectural doc updated
4. **Reviewed** – 1+ peer review, approved by tech lead
5. **Performance** – Meets latency & memory targets
6. **Error Handling** – Graceful failures, logged
7. **Monitoring** – Metrics exposed for Prometheus

### For Overall MVP:
1. **Core Features Work** – Host streams, viewers consume, recordings save
2. **3-Client Model Active** – Desktop, mobile, viewer all functional
3. **E2E Tests Pass** – All TC-001 through TC-005 pass
4. **Performance Baseline** – Meets targets in Phase 8 table
5. **Documentation Complete** – Architecture, SDK, deployment docs finalized
6. **Team Trained** – All developers understand spec + architecture
7. **Ready to Scale** – Can handle 5,000+ subscribers via K8s

---

## 🛑 Blockers & Dependencies

### Critical Path:
```
RTMP Ingest → Host Client SDK → E2E Testing
    ↓              ↓                ↓
Recording → Signaling → Viewer Client
    ↓
CDN Integration → Go Live
```

### External Dependencies:
- [ ] Cloudflare account & R2 bucket (DevOps)
- [ ] Supabase project (or PostgreSQL + Auth)
- [ ] GitHub Actions or CI/CD pipeline
- [ ] Staging environment (Kubernetes)
- [ ] Mobile app signing certificates (iOS/Android)

---

## 📞 Communication

### Daily Standup (10am UTC)
- Backend: Blockers, merge requests
- Frontend: Component progress, design feedback
- DevOps: Infrastructure status
- QA: Test coverage, bug findings

### Weekly Sync (Friday 4pm UTC)
- Architecture decisions
- Scope adjustments
- Risk assessment
- Next week planning

### Slack Channels
- `#allstrm-backend` – Technical discussion
- `#allstrm-frontend` – UI/UX
- `#allstrm-deployment` – DevOps
- `#allstrm-releases` – Go/no-go

---

## 🎯 Success Criteria

By **January 31, 2026**:
- ✅ RTMP ingest working
- ✅ Host client SDK functional
- ✅ Recording to R2 working
- ✅ Viewer HLS playback working
- ✅ E2E test suite green
- ✅ Performance targets met
- ✅ Team trained & confident

---

## 📚 Reference Documents

All in `/docs/`:
1. `ALLSTRM_Architecture_v3.md` – Spec-aligned architecture
2. `DATA_FLOWS.md` – Detailed client flows & diagrams
3. `REFACTOR_SUMMARY.md` – What changed & why
4. `CLIENT_SDK_HOST.ts` – Reference TypeScript implementation

Also:
- Original PDF spec: `Allstrm – Complete Architecture, Features & Deployment Specification.pdf`
- This file: `IMPLEMENTATION_CHECKLIST.md`

---

## 👥 Team Assignments

| Role | Name | Responsibility | Phases |
|------|------|---|---|
| **Tech Lead** | — | Architecture, code review, decisions | All |
| **Backend #1** | — | RTMP ingest, recording | 1A, 1B, 6 |
| **Backend #2** | — | Signaling, database, integration | 3, 6 |
| **Frontend #1** | — | Host client SDK, studio UI | 2 |
| **Frontend #2** | — | Viewer client, HLS player | 4 |
| **Mobile** | — | iOS/Android host client | 5 |
| **DevOps** | — | Database, CDN, infrastructure | 3, 7 |
| **QA** | — | Testing, performance, release | 8 |

---

**Document Created:** January 14, 2026  
**Author:** Engineering Team  
**Status:** Ready for Implementation  
**Next Review:** January 20, 2026
