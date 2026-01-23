# ALLSTRM Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [UML Diagrams](#uml-diagrams)
3. [Next Steps / TODO](#next-steps--todo)
4. [Hybrid Deployment Strategy](#hybrid-deployment-strategy)

---

## System Overview

ALLSTRM is a microservices-based live streaming platform built with Rust, supporting:
- **Video Conferencing** (Meeting Mode)
- **Live Streaming** (Studio Mode)
- **Multi-Platform Broadcasting** (13+ destinations)

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                      │
│  (Browser / OBS / Mobile)                                           │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GATEWAY (Port 8080)                               │
│  • JWT Authentication  • Rate Limiting  • WebSocket  • Routing      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┬───────────────┐
       ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ CORE (8081)  │ │ SFU (8082)   │ │ STREAM (8083)│ │ STORAGE(8084)│
│              │ │              │ │              │ │              │
│ • Rooms      │ │ • WebRTC     │ │ • FFmpeg     │ │ • R2/S3      │
│ • Users      │ │ • SDP/ICE    │ │ • HLS        │ │ • Presigned  │
│ • OAuth      │ │ • Tracks     │ │ • RTMP Relay │ │ • Recordings │
│ • Dest.      │ │ • Media Fwd  │ │ • Recording  │ │ • Assets     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
       │                                                   │
       └───────────────────┬───────────────────────────────┘
                           ▼
              ┌─────────────────────────┐
              │      PostgreSQL         │
              │   (3 schemas: core,     │
              │    stream, assets)      │
              └─────────────────────────┘
```

---

## UML Diagrams

### 1. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ALLSTRM SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        <<Frontend>>                                  │   │
│  │                       React + TypeScript                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│  │  │   Studio    │  │   Meeting   │  │  Dashboard  │  │  Library   │  │   │
│  │  │  Component  │  │  Component  │  │  Component  │  │ Component  │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │   │
│  │         │                │                │               │         │   │
│  │         └────────────────┴────────────────┴───────────────┘         │   │
│  │                                  │                                   │   │
│  │  ┌───────────────────────────────┴───────────────────────────────┐  │   │
│  │  │                      Engine Layer                              │  │   │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │  │   │
│  │  │  │ SFUWebRTC    │ │ SignalClient │ │ BroadcastEngine      │   │  │   │
│  │  │  │ Manager      │ │ (WebSocket)  │ │ (WebGL Compositor)   │   │  │   │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────────┘   │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     │ HTTP/WebSocket                        │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     <<API Gateway>>                                  │   │
│  │                    Gateway Service (8080)                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │   Auth   │ │  Rate    │ │ WebSocket│ │  Proxy   │ │ Metrics  │  │   │
│  │  │Middleware│ │ Limiter  │ │ Handler  │ │  Router  │ │ Export   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│        ┌────────────────────────┼────────────────────────┐                 │
│        │                        │                        │                 │
│        ▼                        ▼                        ▼                 │
│  ┌───────────┐           ┌───────────┐           ┌───────────┐             │
│  │<<Service>>│           │<<Service>>│           │<<Service>>│             │
│  │   Core    │           │    SFU    │           │  Stream   │             │
│  │  (8081)   │           │  (8082)   │           │  (8083)   │             │
│  │           │           │           │           │           │             │
│  │ • Rooms   │           │ • WebRTC  │           │ • FFmpeg  │             │
│  │ • Users   │           │ • SDP/ICE │           │ • HLS     │             │
│  │ • OAuth   │           │ • Tracks  │           │ • RTMP    │             │
│  └─────┬─────┘           └───────────┘           └─────┬─────┘             │
│        │                                               │                   │
│        │         ┌───────────┐                        │                   │
│        │         │<<Service>>│                        │                   │
│        │         │  Storage  │◄───────────────────────┘                   │
│        │         │  (8084)   │                                            │
│        │         │ • R2/S3   │                                            │
│        │         │ • Assets  │                                            │
│        │         └─────┬─────┘                                            │
│        │               │                                                   │
│        └───────┬───────┘                                                   │
│                ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      <<Database>>                                    │  │
│  │                      PostgreSQL 15                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│  │  │core schema  │  │stream schema│  │assets schema│                  │  │
│  │  │• users      │  │• sessions   │  │• recordings │                  │  │
│  │  │• rooms      │  │• segments   │  │• transcodes │                  │  │
│  │  │• oauth      │  │• health     │  │• thumbnails │                  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2. Sequence Diagram - Meeting Mode (Video Conference)

```
┌──────┐          ┌─────────┐         ┌──────┐          ┌─────┐
│Client│          │ Gateway │         │ SFU  │          │Core │
└──┬───┘          └────┬────┘         └──┬───┘          └──┬──┘
   │                   │                 │                 │
   │  WS Connect       │                 │                 │
   │──────────────────►│                 │                 │
   │                   │                 │                 │
   │  JOIN_REQUEST     │                 │                 │
   │──────────────────►│  POST /join     │                 │
   │                   │────────────────►│                 │
   │                   │                 │  Get Room       │
   │                   │                 │────────────────►│
   │                   │                 │◄────────────────│
   │                   │◄────────────────│                 │
   │  JOIN_ACCEPTED    │ (participants,  │                 │
   │◄──────────────────│  ICE servers)   │                 │
   │                   │                 │                 │
   │  Create PeerConnection              │                 │
   │  (with ICE servers)                 │                 │
   │                   │                 │                 │
   │  OFFER (SDP)      │                 │                 │
   │──────────────────►│  POST /offer    │                 │
   │                   │────────────────►│                 │
   │                   │◄────────────────│                 │
   │  ANSWER           │  (SDP answer)   │                 │
   │◄──────────────────│                 │                 │
   │                   │                 │                 │
   │  ICE_CANDIDATE    │                 │                 │
   │──────────────────►│  POST /ice      │                 │
   │                   │────────────────►│                 │
   │                   │                 │                 │
   │ ════════════════════════════════════│                 │
   │   WebRTC Media (Audio/Video)        │                 │
   │ ════════════════════════════════════│                 │
   │                   │                 │                 │
   │  PARTICIPANT_JOINED                 │                 │
   │◄──────────────────│ (broadcast to   │                 │
   │                   │  all clients)   │                 │
   │                   │                 │                 │
```

### 3. Sequence Diagram - Studio Mode (Live Streaming)

```
┌──────┐    ┌─────────┐    ┌──────┐    ┌───────┐    ┌─────────────┐
│ OBS  │    │ Gateway │    │Stream│    │Storage│    │Destinations │
└──┬───┘    └────┬────┘    └──┬───┘    └───┬───┘    └──────┬──────┘
   │             │            │            │               │
   │ RTMP Stream │            │            │               │
   │ (H.264+AAC) │            │            │               │
   │────────────────────────►│            │               │
   │             │            │            │               │
   │             │ on_publish │            │               │
   │             │◄───────────│            │               │
   │             │            │            │               │
   │             │            │ Start FFmpeg               │
   │             │            │────┐       │               │
   │             │            │    │       │               │
   │             │            │◄───┘       │               │
   │             │            │            │               │
   │             │            │ HLS Output │               │
   │             │            │───────────►│               │
   │             │            │ (.ts files)│               │
   │             │            │            │               │
   │             │            │ RTMP Relay │               │
   │             │            │───────────────────────────►│
   │             │            │ (to each   │               │
   │             │            │ destination)               │
   │             │            │            │               │
   │             │ DESTINATION_UPDATE      │               │
   │             │◄───────────│            │               │
   │             │ (status: live,          │               │
   │             │  bitrate, fps)          │               │
   │             │            │            │               │
   │ Disconnect  │            │            │               │
   │────────────────────────►│            │               │
   │             │            │            │               │
   │             │            │ Upload     │               │
   │             │            │ Recording  │               │
   │             │            │───────────►│               │
   │             │            │            │ Store in R2   │
   │             │            │            │───────────────►
   │             │            │            │               │
```

### 4. State Diagram - Room Status

```
                    ┌─────────┐
                    │  idle   │
                    └────┬────┘
                         │ create_room()
                         ▼
                    ┌─────────┐
         ┌─────────│preparing│──────────┐
         │         └────┬────┘          │
         │              │ participants  │ timeout
         │              │ join          │
         │              ▼               ▼
         │         ┌─────────┐     ┌─────────┐
         │    ┌───►│  live   │     │  ended  │
         │    │    └────┬────┘     └─────────┘
         │    │         │               ▲
         │    │ resume  │ pause()       │
         │    │         ▼               │
         │    │    ┌─────────┐          │
         │    └────│ paused  │          │
         │         └────┬────┘          │
         │              │ stop()        │
         │              ▼               │
         │         ┌─────────┐          │
         │         │ ending  │──────────┘
         │         └─────────┘
         │              ▲
         └──────────────┘
              error
```

### 5. Class Diagram - Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                         CORE ENTITIES                           │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐
│   Organization   │       │      User        │
├──────────────────┤       ├──────────────────┤
│ - id: UUID       │       │ - id: UUID       │
│ - name: String   │       │ - email: String  │
│ - slug: String   │       │ - display_name   │
│ - billing_tier   │       │ - avatar_url     │
│ - max_rooms      │       │ - plan: Plan     │
│ - features: JSON │       │ - settings: JSON │
└────────┬─────────┘       └────────┬─────────┘
         │ 1                        │ 1
         │                          │
         │ has many                 │ has many
         │                          │
         ▼ *                        ▼ *
┌──────────────────┐       ┌──────────────────┐
│      Room        │       │ OAuthConnection  │
├──────────────────┤       ├──────────────────┤
│ - id: UUID       │       │ - id: UUID       │
│ - name: String   │       │ - provider       │
│ - mode: RoomMode │       │ - access_token   │
│ - status         │       │ - refresh_token  │
│ - stream_config  │       │ - is_active      │
└────────┬─────────┘       └──────────────────┘
         │ 1
         │
         │ has many
         │
         ▼ *
┌──────────────────┐       ┌──────────────────┐
│   Participant    │       │   Destination    │
├──────────────────┤       ├──────────────────┤
│ - id: UUID       │◄──────│ - id: UUID       │
│ - room_id        │       │ - room_id        │
│ - user_id        │       │ - platform       │
│ - display_name   │       │ - rtmp_url       │
│ - role           │       │ - stream_key     │
│ - tracks: JSON   │       │ - status         │
│ - status         │       │ - enabled        │
└──────────────────┘       └──────────────────┘

┌───────────────────────────────────────────────────┐
│                   ENUMERATIONS                     │
├───────────────────────────────────────────────────┤
│ RoomMode:    meeting | studio | webinar           │
│ RoomStatus:  idle | preparing | live | paused |   │
│              recording | ending | ended           │
│ DestStatus:  idle | connecting | live | unstable |│
│              reconnecting | error | offline       │
│ Platform:    youtube | twitch | facebook |        │
│              linkedin | x | tiktok | instagram |  │
│              kick | vimeo | amazon | brightcove | │
│              hopin | custom_rtmp                  │
└───────────────────────────────────────────────────┘
```

### 6. Deployment Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD REGION                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Load Balancer (nginx/ALB)                    │  │
│  │                         Port 443 (HTTPS)                          │  │
│  └─────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                        │
│        ┌───────────────────────┼───────────────────────┐               │
│        │                       │                       │               │
│        ▼                       ▼                       ▼               │
│  ┌───────────┐          ┌───────────┐          ┌───────────┐          │
│  │ Gateway   │          │ Gateway   │          │ Gateway   │          │
│  │ Instance 1│          │ Instance 2│          │ Instance N│          │
│  │ (8080)    │          │ (8080)    │          │ (8080)    │          │
│  └─────┬─────┘          └─────┬─────┘          └─────┬─────┘          │
│        │                      │                      │                 │
│        └──────────────────────┼──────────────────────┘                 │
│                               │                                        │
│                               ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Internal Service Mesh                         │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │  │
│  │  │  Core   │  │   SFU   │  │ Stream  │  │ Storage │            │  │
│  │  │ (8081)  │  │ (8082)  │  │ (8083)  │  │ (8084)  │            │  │
│  │  │         │  │         │  │         │  │         │            │  │
│  │  │ x3 pods │  │ x5 pods │  │ x3 pods │  │ x2 pods │            │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │  │
│  └───────┼───────────┼───────────┼───────────┼────────────────────┘  │
│          │           │           │           │                        │
│          └───────────┴─────┬─────┴───────────┘                        │
│                            │                                          │
│  ┌─────────────────────────┼─────────────────────────────────────┐   │
│  │         Data Layer      │                                      │   │
│  │  ┌──────────────┐  ┌────┴────────┐  ┌──────────────────────┐  │   │
│  │  │  PostgreSQL  │  │    Redis    │  │   Cloudflare R2      │  │   │
│  │  │  (Primary +  │  │  (Cluster)  │  │   (Object Storage)   │  │   │
│  │  │   Replicas)  │  │             │  │                      │  │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps / TODO

### Immediate (This Week)

| Priority | Task | Status | Details |
|----------|------|--------|---------|
| **P0** | OAuth Credentials Setup | Pending | Add YouTube, Twitch, Facebook API keys to enable OAuth |
| **P0** | Test Full Streaming Flow | Pending | Test OBS → RTMP → HLS → Destinations |
| **P1** | Database Migrations | Pending | Run all migrations on fresh PostgreSQL |
| **P1** | Environment Variables | Pending | Document all required env vars in `.env.example` |

### Short Term (Next 2 Weeks)

| Priority | Task | Status | Details |
|----------|------|--------|---------|
| **P1** | Destination Sync to Room | Pending | Sync localStorage destinations to room when creating |
| **P1** | WebSocket Reconnection | Pending | Implement auto-reconnect with backoff |
| **P2** | Error Handling UI | Pending | Better error messages for API failures |
| **P2** | Loading States | Pending | Add skeleton loaders throughout UI |
| **P2** | Mobile Responsive | Pending | Make dashboard mobile-friendly |

### Medium Term (Next Month)

| Priority | Task | Status | Details |
|----------|------|--------|---------|
| **P2** | Recording Playback | Pending | Add video player for recordings |
| **P2** | Transcoding Pipeline | Pending | Generate 720p/480p variants |
| **P2** | Thumbnail Generation | Pending | Auto-generate thumbnails at 1m mark |
| **P3** | Analytics Dashboard | Pending | Stream metrics, viewer counts |
| **P3** | Team Management | Pending | Invite team members, roles |

### Long Term (Next Quarter)

| Priority | Task | Status | Details |
|----------|------|--------|---------|
| **P3** | Simulcast Support | Pending | Multiple quality streams from SFU |
| **P3** | GPU Encoding | Pending | NVENC/QuickSync support in Stream service |
| **P3** | Kubernetes Deployment | Pending | Helm charts, horizontal scaling |
| **P4** | WHIP/WHEP Protocol | Pending | WebRTC-based streaming |
| **P4** | AI Features | Planned | Background blur, noise cancellation |

### Code Quality

- [ ] Add unit tests for all services
- [ ] Add integration tests for API endpoints
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Add OpenTelemetry tracing
- [ ] Prometheus metrics for all services

---

## Hybrid Deployment Strategy

### Overview

Hybrid deployment combines **cloud infrastructure** for management/control plane with **bare metal/edge servers** for media-intensive workloads (SFU, Stream).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     HYBRID DEPLOYMENT TOPOLOGY                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────┐
                    │      CLOUD REGION           │
                    │   (AWS/GCP/Azure)           │
                    │                             │
                    │  ┌───────────────────────┐  │
                    │  │  Control Plane        │  │
                    │  │  • Gateway            │  │
                    │  │  • Core Service       │  │
                    │  │  • Storage Service    │  │
                    │  │  • PostgreSQL (RDS)   │  │
                    │  │  • Redis (ElastiCache)│  │
                    │  └───────────┬───────────┘  │
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                                   │ Service Mesh / VPN
                    ┌──────────────┼──────────────┐
                    │              │              │
          ┌─────────┴────┐  ┌─────┴────────┐  ┌──┴───────────┐
          │              │  │              │  │              │
          ▼              ▼  ▼              ▼  ▼              ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ EDGE LOCATION 1 │ │ EDGE LOCATION 2 │ │ EDGE LOCATION 3 │
│ (US-West)       │ │ (EU-Central)    │ │ (APAC)          │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │ SFU Service │ │ │ │ SFU Service │ │ │ │ SFU Service │ │
│ │ (WebRTC)    │ │ │ │ (WebRTC)    │ │ │ │ (WebRTC)    │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │ Stream Svc  │ │ │ │ Stream Svc  │ │ │ │ Stream Svc  │ │
│ │ (FFmpeg)    │ │ │ │ (FFmpeg)    │ │ │ │ (FFmpeg)    │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│                 │ │                 │ │                 │
│ Bare Metal:     │ │ Bare Metal:     │ │ Bare Metal:     │
│ • 32 cores      │ │ • 32 cores      │ │ • 32 cores      │
│ • 128GB RAM     │ │ • 128GB RAM     │ │ • 128GB RAM     │
│ • 10Gbps NIC    │ │ • 10Gbps NIC    │ │ • 10Gbps NIC    │
│ • GPU (opt.)    │ │ • GPU (opt.)    │ │ • GPU (opt.)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Why Hybrid?

| Component | Cloud | Bare Metal | Reason |
|-----------|-------|------------|--------|
| Gateway | ✅ | | Auto-scaling, managed SSL |
| Core | ✅ | | Database proximity, stateless |
| Storage | ✅ | | Managed object storage (R2/S3) |
| Database | ✅ | | Managed PostgreSQL, backups |
| Redis | ✅ | | Managed, high availability |
| **SFU** | | ✅ | Low latency, high bandwidth |
| **Stream** | | ✅ | CPU-intensive FFmpeg, GPUs |

### Configuration for Hybrid Mode

#### 1. Cloud Services (`docker-compose.cloud.yml`)

```yaml
version: "3.9"

services:
  gateway:
    image: allstrm/gateway:latest
    environment:
      GATEWAY_PORT: "8080"
      CORE_SERVICE_URL: "http://core:8081"
      SFU_SERVICE_URL: "https://sfu.edge-us.allstrm.io"   # Edge SFU
      STREAM_SERVICE_URL: "https://stream.edge-us.allstrm.io"
      STORAGE_SERVICE_URL: "http://storage:8084"
      JWT_SECRET: "${JWT_SECRET}"
      REDIS_URL: "redis://elasticache.amazonaws.com:6379"
    ports:
      - "8080:8080"
    deploy:
      replicas: 3

  core:
    image: allstrm/core:latest
    environment:
      CORE_PORT: "8081"
      DATABASE_URL: "postgres://user:pass@rds.amazonaws.com:5432/allstrm"
      REDIS_URL: "redis://elasticache.amazonaws.com:6379"
    deploy:
      replicas: 2

  storage:
    image: allstrm/storage:latest
    environment:
      STORAGE_PORT: "8084"
      DATABASE_URL: "postgres://user:pass@rds.amazonaws.com:5432/allstrm"
      S3_ENDPOINT: "https://s3.amazonaws.com"
      S3_BUCKET: "allstrm-recordings"
      S3_REGION: "us-east-1"
    deploy:
      replicas: 2
```

#### 2. Edge Server Setup (`edge-server.sh`)

```bash
#!/bin/bash
# Edge server setup script for SFU and Stream services

# System requirements check
echo "Checking system requirements..."
CPU_CORES=$(nproc)
RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
echo "CPU Cores: $CPU_CORES, RAM: ${RAM_GB}GB"

if [ "$CPU_CORES" -lt 16 ]; then
    echo "Warning: Recommended 16+ cores for production"
fi

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install FFmpeg with hardware encoding support
apt-get update
apt-get install -y ffmpeg vainfo

# Pull service images
docker pull allstrm/sfu:latest
docker pull allstrm/stream:latest

# Configure networking
# Enable BBR congestion control for better streaming
echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
sysctl -p

# Start services
docker-compose -f docker-compose.edge.yml up -d
```

#### 3. Edge Services (`docker-compose.edge.yml`)

```yaml
version: "3.9"

services:
  sfu:
    image: allstrm/sfu:latest
    network_mode: host  # Required for WebRTC UDP
    environment:
      SFU_PORT: "8082"
      PUBLIC_IP: "${PUBLIC_IP}"  # Edge server's public IP
      STUN_SERVER: "stun:stun.l.google.com:19302"
      TURN_SERVER: "turn:turn.allstrm.io:3478"
      TURN_USERNAME: "${TURN_USERNAME}"
      TURN_PASSWORD: "${TURN_PASSWORD}"
      REDIS_URL: "redis://elasticache.amazonaws.com:6379"
      CORE_SERVICE_URL: "https://api.allstrm.io"
    volumes:
      - /var/log/allstrm:/var/log/allstrm
    restart: unless-stopped

  stream:
    image: allstrm/stream:latest
    network_mode: host
    environment:
      STREAM_PORT: "8083"
      RTMP_PORT: "1935"
      FFMPEG_PATH: "/usr/bin/ffmpeg"
      HLS_OUTPUT_DIR: "/data/hls"
      CORE_SERVICE_URL: "https://api.allstrm.io"
      STORAGE_SERVICE_URL: "https://api.allstrm.io/storage"
      # GPU encoding (if available)
      FFMPEG_HWACCEL: "vaapi"  # or "nvenc" for NVIDIA
    volumes:
      - /data/hls:/data/hls
      - /dev/dri:/dev/dri  # GPU access
    restart: unless-stopped
```

### Service Discovery

For hybrid deployments, use a service mesh or DNS-based discovery:

#### Option A: Consul Service Mesh

```yaml
# consul-config.hcl
services {
  name = "sfu"
  id   = "sfu-edge-us-1"
  port = 8082
  tags = ["edge", "us-west", "webrtc"]

  check {
    http     = "http://localhost:8082/health"
    interval = "10s"
    timeout  = "2s"
  }
}
```

#### Option B: DNS-Based (Simpler)

```
# DNS Records for edge services
sfu.edge-us.allstrm.io    → Edge US IP
sfu.edge-eu.allstrm.io    → Edge EU IP
sfu.edge-ap.allstrm.io    → Edge APAC IP

stream.edge-us.allstrm.io → Edge US IP
stream.edge-eu.allstrm.io → Edge EU IP
stream.edge-ap.allstrm.io → Edge APAC IP
```

### Routing Logic

The Gateway routes requests to the nearest edge based on user location:

```rust
// In gateway/src/routes/routing.rs

async fn select_edge_node(user_ip: IpAddr) -> String {
    // Use GeoIP to determine user's region
    let region = geoip_lookup(user_ip);

    match region {
        Region::NorthAmerica => "https://sfu.edge-us.allstrm.io",
        Region::Europe => "https://sfu.edge-eu.allstrm.io",
        Region::AsiaPacific => "https://sfu.edge-ap.allstrm.io",
        _ => "https://sfu.edge-us.allstrm.io", // Default
    }
}
```

### Monitoring Hybrid Setup

```yaml
# prometheus.yml for hybrid monitoring
global:
  scrape_interval: 15s

scrape_configs:
  # Cloud services
  - job_name: 'cloud-gateway'
    static_configs:
      - targets: ['gateway:8080']

  - job_name: 'cloud-core'
    static_configs:
      - targets: ['core:8081']

  # Edge services (discovered via Consul or static)
  - job_name: 'edge-sfu'
    static_configs:
      - targets:
        - 'sfu.edge-us.allstrm.io:8082'
        - 'sfu.edge-eu.allstrm.io:8082'
        - 'sfu.edge-ap.allstrm.io:8082'

  - job_name: 'edge-stream'
    static_configs:
      - targets:
        - 'stream.edge-us.allstrm.io:8083'
        - 'stream.edge-eu.allstrm.io:8083'
        - 'stream.edge-ap.allstrm.io:8083'
```

### Cost Comparison

| Deployment | Monthly Cost (Est.) | Pros | Cons |
|------------|---------------------|------|------|
| **Full Cloud** | $2,000-5,000 | Easy scaling, managed | High bandwidth costs |
| **Full Bare Metal** | $500-1,500 | Low cost, full control | Ops overhead |
| **Hybrid** | $800-2,000 | Best of both | Complexity |

### Security Considerations

1. **VPN Tunnel**: Use WireGuard/IPSec between cloud and edge
2. **mTLS**: Mutual TLS for service-to-service communication
3. **Firewall**: Only expose necessary ports (8082, 8083, 1935)
4. **DDoS Protection**: Cloudflare/AWS Shield for edge servers

### Failover Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    FAILOVER LOGIC                            │
└─────────────────────────────────────────────────────────────┘

Primary Edge (US-West) fails:
  ↓
Gateway detects health check failure (3 consecutive)
  ↓
Route traffic to Secondary Edge (US-East)
  ↓
Alert ops team via PagerDuty
  ↓
Auto-recovery when Primary comes back online
```

---

## Quick Start Commands

```bash
# Development (hot-reload frontend)
docker-compose -f docker-compose.services.yml up -d

# Production (nginx frontend)
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f frontend
docker-compose logs -f gateway
docker-compose logs -f core

# Rebuild specific service
docker-compose up -d --build frontend

# Check service health
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
curl http://localhost:8084/health
```

---

## Summary

ALLSTRM is a production-ready streaming platform with:

- **5 Microservices** (Gateway, Core, SFU, Stream, Storage)
- **3 Modes** (Meeting, Studio, Webinar)
- **13 Streaming Destinations** with OAuth
- **Hybrid Deployment** support (Cloud + Edge)
- **WebGL Compositing** for efficient rendering
- **FFmpeg Integration** for transcoding

**Next immediate action**: Set up OAuth credentials for at least one platform (YouTube or Twitch) to enable the full streaming workflow.
