# ALLSTRM Microservices

This directory contains the coarse-grained microservices that comprise the ALLSTRM backend.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| `allstrm-gateway` | 8080 | API Gateway, WebSocket upgrade, JWT validation |
| `allstrm-core` | 8081 | Room CRUD, User management, Destinations |
| `allstrm-sfu` | 8082 | S1 - Meeting Mode SFU, WebRTC signaling |
| `allstrm-stream` | 8083 | S2 - Studio Mode, RTMP/HLS, Multi-destination |
| `allstrm-storage` | 8084 | S3/R2 management, Presigned URLs, Recordings |

## Architecture

```
                    ┌─────────────────────┐
                    │   allstrm-gateway   │
                    │       :8080         │
                    │                     │
                    │ • JWT Validation    │
                    │ • WebSocket Upgrade │
                    │ • Rate Limiting     │
                    │ • Request Routing   │
                    └─────────┬───────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  allstrm-core   │  │  allstrm-sfu    │  │ allstrm-stream  │
│     :8081       │  │     :8082       │  │     :8083       │
│                 │  │                 │  │                 │
│ • Room CRUD     │  │ • WebRTC SFU    │  │ • RTMP Ingest   │
│ • Users/Orgs    │  │ • ICE/TURN      │  │ • HLS Output    │
│ • Destinations  │  │ • Track Routing │  │ • Multi-dest    │
│ • Permissions   │  │ • Meeting Mode  │  │ • Studio Mode   │
│                 │  │                 │  │                 │
│ DB: core.*      │  │ Redis: ephemeral│  │ DB: stream.*    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ allstrm-storage │
                     │     :8084       │
                     │                 │
                     │ • Presigned URLs│
                     │ • R2 Management │
                     │ • Transcoding   │
                     │                 │
                     │ DB: assets.*    │
                     └─────────────────┘
```

## Development

Each service is a separate Rust crate that shares common libraries:

```bash
# Build all services
cargo build --workspace

# Build specific service
cargo build -p allstrm-gateway

# Run specific service
cargo run -p allstrm-gateway

# Run tests for all services
cargo test --workspace
```

## Shared Crates

| Crate | Purpose |
|-------|---------|
| `allstrm-common` | Shared types, errors, configuration |
| `allstrm-protocol` | WebSocket message types, signaling protocol |
| `allstrm-db` | Database pool, queries, migrations |

## Configuration

Services read configuration from environment variables:

```bash
# Gateway
GATEWAY_PORT=8080
GATEWAY_JWT_SECRET=...
GATEWAY_RATE_LIMIT_RPS=100

# Core
CORE_PORT=8081
CORE_DATABASE_URL=postgres://...
CORE_REDIS_URL=redis://...

# SFU
SFU_PORT=8082
SFU_STUN_SERVER=stun:stun.l.google.com:19302
SFU_TURN_SERVER=turn:...
SFU_REDIS_URL=redis://...

# Stream
STREAM_PORT=8083
STREAM_DATABASE_URL=postgres://...
STREAM_RTMP_PORT=1935
STREAM_HLS_OUTPUT_DIR=/var/hls

# Storage
STORAGE_PORT=8084
STORAGE_DATABASE_URL=postgres://...
STORAGE_R2_ENDPOINT=...
STORAGE_R2_ACCESS_KEY=...
STORAGE_R2_SECRET_KEY=...
STORAGE_R2_BUCKET=allstrm-recordings
```

## Inter-Service Communication

Services communicate via:
1. **gRPC** - For synchronous service-to-service calls
2. **Redis Pub/Sub** - For real-time events
3. **PostgreSQL NOTIFY** - For database change events

## Deployment

See [DEPLOYMENT_SPEC.md](../docs/DEPLOYMENT_SPEC.md) for Kubernetes manifests and hybrid deployment patterns.
