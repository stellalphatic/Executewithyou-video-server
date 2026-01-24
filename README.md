# ALLSTRM Backend

Distributed backend for the ALLSTRM streaming platform. Built with Rust for high performance and reliability, featuring a Next.js frontend.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | 3000 | Next.js 16 UI for Meetings, Studio, and Dashboard |
| **Gateway** | 8080 | API Gateway, WebSocket, JWT validation, Rate limiting |
| **Core** | 8081 | Room management, Users, Organizations, Destinations |
| **SFU** | 8082 | WebRTC Selective Forwarding Unit for real-time media |
| **Stream** | 8083 | FFmpeg processing, RTMP ingest, HLS output |
| **Storage** | 8084 | Recording management, Presigned URLs, R2/S3 |

## Quick Start

### Prerequisites

- Docker
- Docker Compose

### Start Development Environment

The entire stack (Frontend + Backend + Database + Redis) is configured to run with Docker Compose.

```bash
# Clone and setup
git clone https://github.com/your-org/allstrm-backend.git
cd allstrm-backend
cp .env.example .env

# Start all services (Frontend hot-reload enabled)
make dev
```

Access the application:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Gateway**: [http://localhost:8080](http://localhost:8080)

### Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services in foreground (logs visible) |
| `make up` | Start all services in background (detached) |
| `make down` | Stop all services |
| `make logs` | Follow logs for all services |
| `make clean` | Stop services and remove volumes (RESET DATABASE) |
| `make build` | Rebuild all Docker images |

## Documentation

| Document | Description |
|----------|-------------|
| [frontend-next/README.md](frontend-next/README.md) | Frontend-specific documentation |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/deployment/HYBRID_DEPLOYMENT.md](docs/deployment/HYBRID_DEPLOYMENT.md) | Hybrid deployment guide |
| [docs/api/README.md](docs/api/README.md) | API reference |
| [docs/architecture/DIAGRAMS.md](docs/architecture/DIAGRAMS.md) | Architecture diagrams |

## Project Structure

```
allstrm-backend/
├── frontend-next/    # Next.js 16 Frontend
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
├── Makefile          # Docker shortcuts
└── docker-compose.services.yml # Main Docker config
```
