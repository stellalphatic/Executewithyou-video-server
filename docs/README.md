<!-- .endpoint_url("https://<account>.r2.cloudflarestorage.com")
<!-- .force_path_style(true) --> 
<!-- use this else it will break the r2/s3 -->


# ALLSTRM Documentation

Welcome to the ALLSTRM streaming platform documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [Frontend-Backend Wiring](FRONTEND_BACKEND_WIRING.md) | How to connect React frontend to Rust backend |
| [Implementation Tasks](IMPLEMENTATION_TASKS.md) | Checklist for completing frontend integration |
| [API Reference](api/README.md) | REST and WebSocket API documentation |
| [Hybrid Deployment](deployment/HYBRID_DEPLOYMENT.md) | How to deploy ALLSTRM in hybrid mode |
| [Architecture Diagrams](architecture/DIAGRAMS.md) | PlantUML architecture diagrams |

## Project Structure

```
allstrm-backend/
├── services/
│   ├── gateway/     # API Gateway (port 8080)
│   ├── core/        # Room & User Management (port 8081)
│   ├── sfu/         # WebRTC SFU (port 8082)
│   ├── stream/      # FFmpeg/RTMP/HLS (port 8083)
│   ├── storage/     # R2/S3 Storage (port 8084)
│   ├── protocol/    # Shared protocol types
│   └── common/      # Shared utilities
├── migrations/      # Database migrations
├── docs/            # Documentation
│   ├── deployment/  # Deployment guides
│   ├── api/         # API documentation
│   ├── architecture/# Architecture diagrams
│   └── archive/     # Old documentation
└── Makefile         # Development commands
```

## Getting Started

### Prerequisites

- Rust 1.75+
- PostgreSQL 15+
- Redis 7+
- FFmpeg 6+ (for Stream service)
- Docker (optional)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/allstrm-backend.git
cd allstrm-backend

# Copy environment file
cp .env.example .env

# Start all services (Frontend + Backend + DB)
make dev
```

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Gateway | 8080 | HTTP/WS |
| Core | 8081 | HTTP |
| SFU | 8082 | HTTP/WebRTC |
| Stream | 8083 | HTTP/RTMP |
| Storage | 8084 | HTTP |

## Architecture Overview

ALLSTRM uses a distributed architecture (Single Database Pattern):

```
                    ┌─────────────┐
                    │   Clients   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Gateway   │ ← Auth, Rate Limit, Routing
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │    Core     │ │     SFU     │ │   Storage   │
    │  (Rooms)    │ │  (WebRTC)   │ │ (R2/S3)     │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           │        ┌──────▼──────┐
           │        │   Stream    │
           │        │  (FFmpeg)   │
           │        └─────────────┘
           │
    ┌──────▼──────┐
    │ PostgreSQL  │
    └─────────────┘
```

## Development Commands

```bash
make help        # Show all commands
make dev         # Run all services
make build       # Build release
make test        # Run tests
make db-migrate  # Run migrations
make db-reset    # Reset database
make docker-up   # Start PostgreSQL/Redis
```

## Additional Resources

- [Database Schema](../DATABASE.md) - Database setup and migration guide
- [Architecture](../ARCHITECTURE.md) - High-level architecture document
- [Archive](archive/) - Historical documentation
