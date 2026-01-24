# ALLSTRM Hybrid Deployment Guide

This guide explains how to deploy ALLSTRM using a hybrid architecture that combines cloud services with on-premise or edge computing for optimal performance and cost efficiency.

## Deployment Architecture

ALLSTRM uses a **hybrid deployment model** combining cloud and edge infrastructure:

| Layer | Components | Infrastructure |
|-------|------------|----------------|
| **Cloud** | Gateway, Core, Storage, Database | Auto-scaling cloud (AWS/GCP) |
| **Edge** | SFU, Stream | Bare-metal servers for low latency |

## Recommended Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Gateway   │  │    Core     │  │   Storage (R2/S3)       │ │
│  │   (8080)    │  │   (8081)    │  │   (8084)                │ │
│  │             │  │             │  │                         │ │
│  │  - Auth     │  │  - Rooms    │  │  - Recordings           │ │
│  │  - Routing  │  │  - Users    │  │  - Presigned URLs       │ │
│  │  - Rate Lmt │  │  - Orgs     │  │  - CDN Integration      │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
    ┌─────┴────────────────┴──────────────────────┴─────┐
    │              PRIVATE NETWORK / VPN                 │
    └─────┬────────────────┬──────────────────────┬─────┘
          │                │                      │
┌─────────┼────────────────┼──────────────────────┼───────────────┐
│         ▼                ▼                      ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │     SFU     │  │   Stream    │  │    Local Storage        │ │
│  │   (8082)    │  │   (8083)    │  │    (Recordings Cache)   │ │
│  │             │  │             │  │                         │ │
│  │  - WebRTC   │  │  - FFmpeg   │  │  - HLS Segments         │ │
│  │  - Media    │  │  - RTMP     │  │  - Recording Buffer     │ │
│  │  - Tracks   │  │  - HLS      │  │  - Upload Queue         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                      EDGE LAYER                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Component Placement Strategy

### Cloud Components (Always in Cloud)

| Service | Port | Why Cloud? |
|---------|------|------------|
| Gateway | 8080 | Global entry point, CDN integration |
| Core | 8081 | Database proximity, user management |
| Storage | 8084 | R2/S3 API integration |

### Edge Components (Can be Edge/On-Premise)

| Service | Port | Why Edge? |
|---------|------|-----------|
| SFU | 8082 | Low-latency WebRTC, local media routing |
| Stream | 8083 | FFmpeg processing, local HLS generation |

## Deployment Steps

### Prerequisites

- Docker and Docker Compose
- PostgreSQL 15+ database
- Redis 7+ (for session state)
- Cloudflare R2 or AWS S3 bucket
- Domain with SSL certificates

### Step 1: Database Setup

```bash
# Create database
createdb allstrm

# Run migrations
psql -d allstrm -f migrations/000_consolidated_schema.sql

# Or use the Makefile
make db-migrate
```

### Step 2: Configure Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit the following variables:

```bash
# Database
DATABASE_URL=postgres://user:pass@db-host:5432/allstrm

# Redis
REDIS_URL=redis://redis-host:6379

# Supabase (Production Auth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret

# Storage (Cloudflare R2)
R2_ENDPOINT=https://account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=allstrm-recordings

# Service URLs (for Gateway routing)
CORE_SERVICE_URL=http://core:8081
SFU_SERVICE_URL=http://sfu:8082
STREAM_SERVICE_URL=http://stream:8083
STORAGE_SERVICE_URL=http://storage:8084
```

### Step 3: Build Services

```bash
# Build all services
cargo build --release --workspace

# Or build individually
cargo build --release --package allstrm-gateway
cargo build --release --package allstrm-core
cargo build --release --package allstrm-sfu
cargo build --release --package allstrm-stream
cargo build --release --package allstrm-storage
```

### Step 4: Deploy Cloud Layer

#### Using Docker Compose

```yaml
# docker-compose.cloud.yml
version: '3.8'

services:
  gateway:
    image: allstrm/gateway:latest
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
    depends_on:
      - core

  core:
    image: allstrm/core:latest
    ports:
      - "8081:8081"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - RUN_MIGRATIONS=true

  storage:
    image: allstrm/storage:latest
    ports:
      - "8084:8084"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - S3_ENDPOINT=${R2_ENDPOINT}
      - S3_BUCKET=${R2_BUCKET}
      - S3_ACCESS_KEY=${R2_ACCESS_KEY_ID}
      - S3_SECRET_KEY=${R2_SECRET_ACCESS_KEY}
```

#### Using Kubernetes

```yaml
# k8s/cloud-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: allstrm-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
        - name: gateway
          image: allstrm/gateway:latest
          ports:
            - containerPort: 8080
          envFrom:
            - secretRef:
                name: allstrm-secrets
---
# Add similar deployments for core and storage
```

### Step 5: Deploy Edge Layer

#### Option A: Docker on Edge Server

```yaml
# docker-compose.edge.yml
version: '3.8'

services:
  sfu:
    image: allstrm/sfu:latest
    ports:
      - "8082:8082"
      - "10000-10100:10000-10100/udp"  # WebRTC ports
    environment:
      - REDIS_URL=${REDIS_URL}
      - CORE_SERVICE_URL=https://api.allstrm.io

  stream:
    image: allstrm/stream:latest
    ports:
      - "8083:8083"
      - "1935:1935"  # RTMP
    environment:
      - REDIS_URL=${REDIS_URL}
      - STORAGE_SERVICE_URL=https://api.allstrm.io/storage
    volumes:
      - /var/allstrm/hls:/var/allstrm/hls
      - /var/allstrm/recordings:/var/allstrm/recordings
```

#### Option B: Systemd Services

```bash
# /etc/systemd/system/allstrm-sfu.service
[Unit]
Description=ALLSTRM SFU Service
After=network.target

[Service]
Type=simple
User=allstrm
WorkingDirectory=/opt/allstrm
ExecStart=/opt/allstrm/bin/allstrm-sfu
EnvironmentFile=/opt/allstrm/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Step 6: Configure Load Balancer

For production, use a load balancer (Cloudflare, AWS ALB, or nginx):

```nginx
# /etc/nginx/sites-available/allstrm
upstream gateway {
    server gateway1:8080;
    server gateway2:8080;
    server gateway3:8080;
}

server {
    listen 443 ssl http2;
    server_name api.allstrm.io;

    ssl_certificate /etc/ssl/certs/allstrm.crt;
    ssl_certificate_key /etc/ssl/private/allstrm.key;

    location / {
        proxy_pass http://gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

## Scaling Considerations

### Horizontal Scaling

| Service | Scaling Strategy |
|---------|------------------|
| Gateway | Stateless, scale horizontally behind LB |
| Core | Stateless, scale horizontally |
| SFU | Stateful per session, use consistent hashing |
| Stream | Stateful per room, use sticky sessions |
| Storage | Stateless, scale horizontally |

### Resource Requirements

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Gateway | 1 core | 512MB | Minimal |
| Core | 2 cores | 1GB | Minimal |
| SFU | 4+ cores | 4GB | Minimal |
| Stream | 4+ cores | 8GB | 100GB+ SSD |
| Storage | 1 core | 512MB | Minimal |

### Network Requirements

| Service | Bandwidth | Latency |
|---------|-----------|---------|
| SFU | 100 Mbps+ per instance | < 50ms to clients |
| Stream | 50 Mbps per destination | < 100ms to CDN |

## Monitoring

### Health Endpoints

All services expose health endpoints:

```bash
curl http://localhost:8080/health  # Gateway
curl http://localhost:8081/health  # Core
curl http://localhost:8082/health  # SFU
curl http://localhost:8083/health  # Stream
curl http://localhost:8084/health  # Storage
```

### Metrics (Prometheus)

```bash
curl http://localhost:8080/metrics
```

### Key Metrics to Monitor

- `allstrm_active_rooms` - Number of active streaming rooms
- `allstrm_active_participants` - Total participants across all rooms
- `allstrm_ffmpeg_processes` - Running FFmpeg processes
- `allstrm_webrtc_connections` - Active WebRTC connections
- `allstrm_bytes_streamed` - Total bytes streamed

## Troubleshooting

### Common Issues

1. **WebRTC Connection Failures**
   - Check UDP ports 10000-10100 are open
   - Verify STUN/TURN server configuration
   - Check firewall rules

2. **HLS Playback Issues**
   - Verify segment directory permissions
   - Check FFmpeg process logs
   - Ensure CDN cache is configured correctly

3. **Database Connection Issues**
   - Verify DATABASE_URL is correct
   - Check PostgreSQL max_connections
   - Ensure SSL is configured if required

### Log Locations

```bash
# Docker
docker logs allstrm-gateway

# Systemd
journalctl -u allstrm-sfu -f

# Application logs
tail -f /var/log/allstrm/gateway.log
```

## Security Checklist

- [ ] SSL/TLS on all public endpoints
- [ ] JWT secrets rotated and secure
- [ ] Database credentials not in code
- [ ] R2/S3 bucket policies configured
- [ ] Network segmentation between cloud and edge
- [ ] Rate limiting enabled on Gateway
- [ ] CORS configured properly
- [ ] Firewall rules for edge services
