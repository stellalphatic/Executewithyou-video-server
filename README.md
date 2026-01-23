# ALLSTRM Backend

Microservices-based backend for the ALLSTRM streaming platform. Built with Rust for high performance and reliability.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Gateway** | 8080 | API Gateway, WebSocket, JWT validation, rate limiting |
| **Core** | 8081 | Room management, users, organizations, destinations |
| **SFU** | 8082 | WebRTC Selective Forwarding Unit for real-time media |
| **Stream** | 8083 | FFmpeg processing, RTMP ingest, HLS output |
| **Storage** | 8084 | Recording management, presigned URLs, R2/S3 |

## Quick Start

### Prerequisites

- Rust 1.75+
- PostgreSQL 15+
- Redis 7+
- FFmpeg 6+ (for Stream service)

### Setup

```bash
# Clone and setup
git clone https://github.com/your-org/allstrm-backend.git
cd allstrm-backend
cp .env.example .env

# Start infrastructure
make docker-up

# Run migrations
make db-migrate

# Build
cargo build --workspace
```

### Run Services

```bash
# All services
make dev

# Or individually
cargo run --package allstrm-gateway
cargo run --package allstrm-core
cargo run --package allstrm-sfu
cargo run --package allstrm-stream
cargo run --package allstrm-storage
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/deployment/HYBRID_DEPLOYMENT.md](docs/deployment/HYBRID_DEPLOYMENT.md) | Hybrid deployment guide |
| [docs/api/README.md](docs/api/README.md) | API reference |
| [docs/architecture/DIAGRAMS.md](docs/architecture/DIAGRAMS.md) | Architecture diagrams |
| [DATABASE.md](DATABASE.md) | Database setup guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture overview |

## Project Structure

```
allstrm-backend/
├── services/
│   ├── gateway/      # API Gateway
│   ├── core/         # Business logic
│   ├── sfu/          # WebRTC SFU
│   ├── stream/       # Media processing
│   ├── storage/      # Object storage
│   ├── protocol/     # Shared types
│   └── common/       # Utilities
├── migrations/       # SQL migrations
├── docs/             # Documentation
├── Makefile          # Dev commands
└── Cargo.toml        # Workspace config
```

## Make Commands

```bash
make help          # Show all commands
make dev           # Run all services
make build         # Build release
make test          # Run tests
make db-migrate    # Run migrations
make db-reset      # Reset database
make docker-up     # Start PostgreSQL/Redis
make docker-down   # Stop containers
```

## Configuration

Key environment variables (see `.env.example` for full list):

```bash
# Database
DATABASE_URL=postgres://allstrm:password@localhost:5432/allstrm

# Redis
REDIS_URL=redis://localhost:6379

# Auth (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret

# Storage (Cloudflare R2)
S3_ENDPOINT=https://account.r2.cloudflarestorage.com
S3_BUCKET=allstrm-recordings
S3_ACCESS_KEY=your-key
S3_SECRET_KEY=your-secret

# Service URLs (for Gateway)
CORE_SERVICE_URL=http://localhost:8081
SFU_SERVICE_URL=http://localhost:8082
STREAM_SERVICE_URL=http://localhost:8083
STORAGE_SERVICE_URL=http://localhost:8084
```

## Deployment

ALLSTRM supports three deployment modes:

1. **Cloud-Only**: All services in cloud
2. **Hybrid**: Gateway/Core in cloud, SFU/Stream on edge
3. **Self-Hosted**: Everything on-premise

See [Hybrid Deployment Guide](docs/deployment/HYBRID_DEPLOYMENT.md) for details.

## API Overview

### REST Endpoints
- `POST /api/v1/rooms` - Create room
- `GET /api/v1/rooms/:id` - Get room
- `POST /api/v1/rooms/:id/join` - Join room
- `POST /api/v1/destinations` - Add stream destination
- `GET /api/v1/recordings` - List recordings

### WebSocket
- `wss://host/ws` - Real-time signaling

See [API Reference](docs/api/README.md) for complete documentation.

## Development

```bash
# Format code
cargo fmt --all

# Lint
cargo clippy --workspace

# Check compilation
cargo check --workspace

# Run tests
cargo test --workspace
```

## License

MIT

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request
