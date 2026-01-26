# AllStrm Deployment Guide

## Overview

AllStrm uses a simplified deployment architecture with:
- **Next.js** - Frontend + API routes
- **LiveKit** - Real-time video/audio (self-hosted or cloud)
- **Supabase** - Auth, database, storage (self-hosted or cloud)

---

## Development Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Supabase CLI

### Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd allstrm-backend

# 2. Start LiveKit stack
docker compose up -d

# 3. Start Supabase
supabase start

# 4. Start frontend
cd frontend-next
npm install
cp .env.example .env.local  # Edit with your values
npm run dev
```

### Verify Services

| Service | URL | Expected |
|---------|-----|----------|
| Frontend | http://localhost:3000 | Login page |
| LiveKit | ws://localhost:7880 | WebSocket connection |
| Supabase | http://localhost:54321 | API gateway |
| MinIO Console | http://localhost:9001 | S3 browser |

---

## Environment Variables

### Required (.env.local)

```env
# LiveKit
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-start>
```

### Production Values

```env
# LiveKit Cloud (or self-hosted)
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=<your-api-key>
LIVEKIT_API_SECRET=<your-api-secret>

# Supabase Cloud (or self-hosted)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>
```

---

## Docker Services

### docker-compose.yml

```yaml
services:
  allstrm-livekit:
    image: livekit/livekit-server:v1.9
    ports:
      - "7880:7880"      # WebSocket
      - "7881:7881"      # RTC
      - "7882:7882/udp"  # UDP
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml

  allstrm-egress:
    image: livekit/egress:latest
    environment:
      - EGRESS_CONFIG_FILE=/etc/egress.yaml
    volumes:
      - ./egress.yaml:/etc/egress.yaml

  allstrm-redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  allstrm-minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"
```

### Start/Stop Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f allstrm-livekit

# Stop all services
docker compose down

# Reset (remove volumes)
docker compose down -v
```

---

## Production Deployment

### Option A: Vercel + LiveKit Cloud + Supabase Cloud

**Recommended for simplicity and scalability.**

1. **Deploy Frontend to Vercel**
   ```bash
   cd frontend-next
   vercel deploy --prod
   ```

2. **Use LiveKit Cloud**
   - Sign up at https://cloud.livekit.io
   - Create a project
   - Get API key and secret
   - Configure egress in LiveKit dashboard

3. **Use Supabase Cloud**
   - Sign up at https://supabase.com
   - Create a project
   - Run migrations in Supabase SQL editor
   - Get API keys

4. **Set Environment Variables in Vercel**
   - Add all production env vars in Vercel dashboard

### Option B: Self-Hosted (Docker + VPS)

**For full control and cost optimization at scale.**

1. **Provision Server**
   - Minimum: 4 CPU, 8GB RAM, 100GB SSD
   - Open ports: 80, 443, 7880-7882, 54321

2. **Setup Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```

3. **Deploy All Services**
   ```bash
   git clone <repo-url>
   cd allstrm-backend
   cp .env.example .env
   # Edit .env with production values
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **Setup Reverse Proxy (nginx/Caddy)**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name app.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   
   server {
       listen 443 ssl http2;
       server_name livekit.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:7880;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

---

## Database Migrations

### Run Migrations

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase SQL Editor
# Copy contents of migrations/000_consolidated_schema.sql
# Then copy migrations/002_oauth_connections.sql
```

### Migration Files

| File | Description |
|------|-------------|
| `000_consolidated_schema.sql` | Core tables (users, rooms, etc.) |
| `001_enterprise_features.sql` | Enterprise tier features |
| `002_oauth_connections.sql` | OAuth tokens for streaming platforms |

---

## OAuth Configuration (Optional)

OAuth enables automatic RTMP URL and stream key retrieval from streaming platforms. If not configured, users can still manually enter RTMP credentials.

### Setup Steps

1. **Create OAuth Apps** on each platform you want to support:

| Platform | Developer Console | Callback URL |
|----------|-------------------|--------------|
| YouTube | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | `https://app.yourdomain.com/api/oauth/youtube/callback` |
| Twitch | [Twitch Dev Console](https://dev.twitch.tv/console/apps) | `https://app.yourdomain.com/api/oauth/twitch/callback` |
| Facebook | [Facebook Developers](https://developers.facebook.com/apps/) | `https://app.yourdomain.com/api/oauth/facebook/callback` |
| LinkedIn | [LinkedIn Developers](https://www.linkedin.com/developers/apps) | `https://app.yourdomain.com/api/oauth/linkedin/callback` |
| X (Twitter) | [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard) | `https://app.yourdomain.com/api/oauth/x/callback` |
| Vimeo | [Vimeo Developer](https://developer.vimeo.com/apps) | `https://app.yourdomain.com/api/oauth/vimeo/callback` |

2. **Set Environment Variables**:

```env
# Required for OAuth token storage
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# YouTube (Google)
YOUTUBE_CLIENT_ID=xxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxx

# Twitch
TWITCH_CLIENT_ID=xxxxx
TWITCH_CLIENT_SECRET=xxxxx

# Add others as needed...
```

3. **Run OAuth Migration**:
```sql
-- migrations/002_oauth_connections.sql
-- Run in Supabase SQL Editor or via CLI
```

### OAuth Scopes Required

| Platform | Required Scopes |
|----------|-----------------|
| YouTube | `youtube`, `youtube.readonly` |
| Twitch | `channel:read:stream_key`, `user:read:email` |
| Facebook | `publish_video`, `pages_show_list` |
| LinkedIn | `w_member_social`, `r_liteprofile` |
| X | `tweet.read`, `users.read`, `offline.access` |
| Vimeo | `public`, `private`, `video_files`, `interact` |

### Platform-Specific Notes

- **YouTube**: Requires app verification for production use
- **Facebook**: Requires app review for `publish_video` permission
- **LinkedIn Live**: Requires approved creator account
- **X/Twitter**: Limited Live API support; stream key may need manual entry
- **Vimeo Live**: Requires Premium+ subscription

### Fallback Behavior

When OAuth is not configured for a platform:
1. `listOAuthProviders` returns `is_configured: false`
2. UI shows "Enter RTMP manually" instead of "Connect with [Platform]"
3. Users enter RTMP URL and stream key directly

This ensures the app works even without OAuth setup.

---

## Scaling Considerations

### LiveKit Scaling

| Concurrent Streams | Recommendation |
|--------------------|----------------|
| 1-10 | Single server |
| 10-100 | LiveKit Cloud or 2-3 servers |
| 100+ | LiveKit Cloud with auto-scaling |

### Storage Scaling

| Usage | Recommendation |
|-------|----------------|
| < 100GB | MinIO/Supabase Storage |
| 100GB-1TB | S3/R2 with CDN |
| 1TB+ | Multi-region S3 with CDN |

---

## Monitoring

### Health Checks

```bash
# LiveKit
curl http://localhost:7880/healthz

# Next.js
curl http://localhost:3000/api/health

# Supabase
curl http://localhost:54321/health
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f allstrm-livekit
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| WebSocket connection failed | Check NEXT_PUBLIC_LIVEKIT_URL, verify ports open |
| Auth not working | Verify Supabase keys, check CORS settings |
| Recording not starting | Check egress service logs, verify MinIO access |
| Camera not working | HTTPS required in production, check permissions |

### Debug Mode

```bash
# Enable debug logging in Next.js
DEBUG=* npm run dev

# Enable LiveKit debug
docker compose logs -f allstrm-livekit 2>&1 | grep -E "(error|warn)"
```

---

## Security Checklist

- [ ] SSL/TLS enabled (HTTPS required for WebRTC)
- [ ] Environment variables secured (not in git)
- [ ] Supabase RLS policies configured
- [ ] LiveKit API keys rotated periodically
- [ ] CORS configured for production domain only
- [ ] Rate limiting enabled on API routes
- [ ] MinIO/S3 bucket policies configured
