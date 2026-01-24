# What is ALLSTRM?

## Executive Summary

**ALLSTRM** is a professional **SaaS (Software as a Service) platform** for live streaming and video conferencing. Built with Rust and TypeScript for performance and reliability, it combines real-time video conferencing with multi-destination streaming—all accessible through a modern web interface.

Think of it as: **StreamYard meets Zoom, delivered as a service.**

Users sign up, open their browser, and start streaming. No software to install, no complex setup.

---

## The Problem ALLSTRM Solves

Content creators, businesses, and organizations currently face fragmented tooling:

| Need | Current Solution | Limitation |
|------|------------------|------------|
| Video Conferencing | Zoom, Meet, Teams | Can't stream to social platforms |
| Multi-Stream | StreamYard, Restream | Limited customization, expensive tiers |
| Collaborative Streaming | Multiple tools needed | Complex workflow, learning curve |
| Recording & Storage | Separate services | Disconnected from streaming workflow |

**ALLSTRM unifies all of these into a single web-based platform** with:
- Real-time video conferencing (WebRTC SFU)
- Multi-destination streaming (13+ platforms)
- Professional studio controls
- Integrated recording and storage
- Full OAuth integration with streaming platforms
- **No software installation required**—everything runs in the browser

---

## Core Capabilities

### 1. Meeting Mode (Video Conferencing)

Full video conferencing with professional features:

```
┌─────────────────────────────────────────────────────────────┐
│                     MEETING MODE                            │
│                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│   │ User A  │  │ User B  │  │ User C  │  │ User D  │        │
│   │ (Host)  │  │ (Guest) │  │ (Guest) │  │ (Guest) │        │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│        │            │            │            │             │
│        └────────────┴─────┬──────┴────────────┘             │
│                           │                                 │
│                    ┌──────▼──────┐                          │
│                    │  SFU Server │                          │
│                    │  (WebRTC)   │                          │
│                    └─────────────┘                          │
│                                                             │
│   Features:                                                 │
│   • Up to 50 participants                                   │
│   • Waiting room with host approval                         │
│   • Screen sharing                                          │
│   • Chat & reactions                                        │
│   • Hand raise                                              │
│   • Local & cloud recording                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2. Studio Mode (Professional Streaming)

Like StreamYard, but with full control:

```
┌─────────────────────────────────────────────────────────────┐
│                      STUDIO MODE                            │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  LIVE CANVAS                        │   │
│   │   ┌─────────┐ ┌─────────┐                           │   │
│   │   │ Host    │ │ Guest 1 │  ← Drag & resize          │   │
│   │   │ Camera  │ │ Camera  │                           │   │
│   │   └─────────┘ └─────────┘                           │   │
│   │        ┌──────────────────┐                         │   │
│   │        │ Screen Share     │                         │   │
│   │        └──────────────────┘                         │   │
│   │   [Lower Third: "John Smith - CEO"]                 │   │
│   └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              MULTI-DESTINATION OUTPUT               │   │
│   │                                                     │   │
│   │   🔴 YouTube    🔴 Twitch    🔴 Facebook            |   │
│   │   🔴 LinkedIn   🔴 X/Twitter  🔴 TikTok             │   │
│   │   🔴 Instagram  🔴 Kick       🔴 Vimeo              │   │
│   │   🔴 Amazon     🔴 Brightcove 🔴 Custom RTMP        │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3. Recording & Asset Management

Professional recording with multiple output options:

- **Mixed Recording**: Single composited video of the entire session
- **ISO Recording**: Individual tracks per participant (for post-production)
- **Cloud Storage**: Automatic upload to Cloudflare R2/S3
- **Transcoding**: Multiple quality variants (1080p, 720p, 480p)
- **Thumbnails**: Auto-generated at configurable intervals

---

## Technical Architecture

### Distributed Microservices

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│                   (Web Browser - Desktop/Mobile)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GATEWAY (Port 8080)                          │
│  • JWT Authentication    • Rate Limiting (Token Bucket)         │
│  • WebSocket Handling    • Request Routing                      │
│  • Prometheus Metrics    • CORS Configuration                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    CORE     │    │     SFU     │    │   STREAM    │
│  (8081)     │    │   (8082)    │    │   (8083)    │
│             │    │             │    │             │
│ • Rooms     │    │ • WebRTC    │    │ • FFmpeg    │
│ • Users     │    │ • SDP/ICE   │    │ • HLS       │
│ • OAuth     │    │ • Tracks    │    │ • RTMP      │
│ • Orgs      │    │ • Routing   │    │ • Relay     │
└──────┬──────┘    └─────────────┘    └──────┬──────┘
       │                                      │
       │           ┌─────────────┐            │
       │           │   STORAGE   │◄───────────┘
       │           │   (8084)    │
       │           │             │
       │           │ • R2/S3     │
       │           │ • Presigned │
       │           │ • Assets    │
       └───────────┤             │
                   └──────┬──────┘
                          │
                          ▼
              ┌───────────────────────┐
              │      PostgreSQL       │
              │  (3 schemas: core,    │
              │   stream, assets)     │
              └───────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Rust + Tokio | Async, high-performance backend |
| **Web Framework** | Axum 0.7 | Modern, type-safe HTTP/WebSocket |
| **WebRTC** | webrtc-rs | Native Rust WebRTC implementation |
| **Frontend** | Next.js 16 + React | Modern, responsive UI |
| **Database** | PostgreSQL 15 + SQLx | Type-safe SQL queries |
| **Object Storage** | Cloudflare R2 / S3 | Recordings and assets |
| **Media Processing** | FFmpeg | Transcoding, HLS, RTMP relay |
| **Serialization** | Serde + JSON | Fast, typed serialization |
| **Observability** | Tracing + Prometheus | Logging and metrics |

---

## Platform Integrations

### OAuth-Connected Platforms (13)

ALLSTRM provides native OAuth integration with streaming platforms, allowing users to:
1. Connect their account once
2. Automatically fetch stream keys and RTMP URLs
3. Create live broadcasts directly from ALLSTRM

| Platform | OAuth | Auto Stream Key | Live Status |
|----------|-------|-----------------|-------------|
| YouTube | ✅ | ✅ | ✅ |
| Twitch | ✅ | ✅ | ✅ |
| Facebook | ✅ | ✅ | ✅ |
| LinkedIn | ✅ | ✅ | ✅ |
| X (Twitter) | ✅ | ✅ | ✅ |
| Instagram | ✅ | ✅ | ✅ |
| TikTok | ✅ | ✅ | ✅ |
| Kick | Manual | Manual | - |
| Vimeo | ✅ | ✅ | ✅ |
| Amazon Live | ✅ | ✅ | ✅ |
| Brightcove | ✅ | ✅ | ✅ |
| Hopin | ✅ | ✅ | ✅ |
| Custom RTMP | Manual | Manual | - |

---

## User Flows

### Flow 1: Quick Meeting

```
User → Create Room (Meeting Mode) → Share Link → Participants Join → 
Video Conference → Optional Recording → End Meeting
```

### Flow 2: Professional Broadcast

```
User → Create Room (Studio Mode) → Connect Destinations (OAuth) →
Invite Guests → Arrange Layout → Go Live → Multi-Stream →
Monitor Health → End Broadcast → Access Recording
```

### Flow 3: Hybrid Event

```
User → Create Room (Studio Mode) → 
├── Internal: WebRTC participants collaborate
└── External: RTMP output to YouTube/Twitch/etc.
```

---

## Deployment Architecture

ALLSTRM operates on a **hybrid infrastructure** combining cloud services with bare-metal servers for optimal performance and cost efficiency:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD REGION                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Control Plane (Auto-scaling)              │   │
│  │  • Gateway    • Core    • Storage                   │   │
│  │  • PostgreSQL (Managed)  • Redis (Managed)          │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ VPN / Service Mesh
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Edge: US    │  │ Edge: EU    │  │ Edge: APAC  │
│             │  │             │  │             │
│ • SFU       │  │ • SFU       │  │ • SFU       │
│ • Stream    │  │ • Stream    │  │ • Stream    │
│             │  │             │  │             │
│ Bare Metal  │  │ Bare Metal  │  │ Bare Metal  │
│ High-perf   │  │ High-perf   │  │ High-perf   │
│ servers     │  │ servers     │  │ servers     │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Why Hybrid?

| Component | Cloud | Bare Metal | Reason |
|-----------|-------|------------|--------|
| Gateway | ✅ | | Auto-scaling, managed SSL, global CDN |
| Core | ✅ | | Database proximity, stateless |
| Storage | ✅ | | Managed object storage (R2/S3) |
| **SFU** | | ✅ | Low latency WebRTC, high bandwidth |
| **Stream** | | ✅ | CPU-intensive FFmpeg, potential GPUs |

This architecture allows ALLSTRM to:
- **Scale globally** with edge nodes close to users
- **Minimize latency** for real-time video
- **Optimize costs** by using bare metal for compute-heavy workloads
- **Maintain reliability** with cloud-managed databases and storage

---

## Key Differentiators

### vs. StreamYard / Restream
- **No per-destination fees**: Tiered plans with unlimited destinations
- **WebRTC conferencing built-in**: Meetings + streaming in one platform
- **Hybrid infrastructure**: Bare metal for latency-sensitive workloads
- **More platform integrations**: 13+ native OAuth destinations

### vs. Zoom / Google Meet
- **Multi-destination streaming**: Go live to YouTube, Twitch, LinkedIn, etc.
- **Professional studio controls**: Layouts, overlays, lower thirds
- **Built for content creation**: Not just meetings—full production suite
- **Recording + transcoding**: Cloud-based processing and storage

---

## Who Is This For?

| Audience | Use Case |
|----------|----------|
| **Content Creators** | Podcast recording, live streaming to multiple platforms |
| **Businesses** | All-hands meetings, webinars, product launches |
| **Educational Institutions** | Virtual classrooms, recorded lectures |
| **Media Companies** | Live production, multi-platform distribution |
| **Events & Conferences** | Virtual/hybrid events with streaming |

---

## Current Status

### Implemented ✅
- Full 5-service distributed backend
- WebRTC SFU with track routing
- Multi-destination RTMP relay
- OAuth for 13 streaming platforms
- HLS output generation
- Recording (client-side + cloud)
- Presigned URL uploads
- Next.js frontend with real-time WebRTC

### Planned / In Progress 🚧
- Tiered billing enforcement (Free, Creator, Professional, Enterprise)
- Simulcast (multiple quality streams)
- GPU-accelerated encoding (NVENC)
- WHIP/WHEP protocol support
- AI features (background blur, noise cancellation)
- Mobile web optimizations

---

## Summary

**ALLSTRM is a SaaS streaming platform that unifies:**

1. **Video Conferencing** - WebRTC-based meetings with up to 50 participants
2. **Multi-Destination Streaming** - Broadcast to 13+ platforms simultaneously  
3. **Professional Studio** - Layouts, overlays, and production controls
4. **Recording & Storage** - Integrated cloud storage with transcoding
5. **Platform Integrations** - Native OAuth with YouTube, Twitch, Facebook, etc.

Built with **Rust** for performance and **TypeScript/React** for a modern web-based experience, ALLSTRM provides enterprise-grade streaming infrastructure accessible from any browser.

---

*For technical details, see [ARCHITECTURE.md](ARCHITECTURE.md). For deployment, see [deployment/HYBRID_DEPLOYMENT.md](deployment/HYBRID_DEPLOYMENT.md).*
