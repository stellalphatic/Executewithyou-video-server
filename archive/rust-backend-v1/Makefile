# ALLSTRM Docker Development Makefile

.PHONY: help dev dev-hot up down restart logs build clean shell-frontend shell-backend \
        hot hot-up hot-down hot-restart hot-logs hot-build hot-clean \
        hot-sfu hot-gateway hot-core hot-stream hot-storage

# Default target
help:
	@echo "ALLSTRM Docker Development Commands"
	@echo ""
	@echo "=== PRODUCTION-LIKE (pre-built images) ==="
	@echo "  make dev      Start all services in foreground"
	@echo "  make up       Start all services in background (detached)"
	@echo "  make down     Stop all services"
	@echo "  make restart  Restart all services"
	@echo "  make logs     Follow logs for all services"
	@echo "  make build    Rebuild all docker images"
	@echo "  make clean    Stop services and remove volumes (RESET DATA)"
	@echo ""
	@echo "=== HOT RELOAD DEVELOPMENT (recommended for dev) ==="
	@echo "  make hot      Start all services with hot reload (foreground)"
	@echo "  make hot-up   Start all services with hot reload (background)"
	@echo "  make hot-down Stop hot reload services"
	@echo "  make hot-logs Follow hot reload logs"
	@echo "  make hot-build Rebuild hot reload images"
	@echo "  make hot-clean Stop and remove hot reload volumes"
	@echo ""
	@echo "=== SERVICE-SPECIFIC HOT RELOAD ==="
	@echo "  make hot-sfu      Restart SFU service only"
	@echo "  make hot-gateway  Restart Gateway service only"
	@echo "  make hot-core     Restart Core service only"
	@echo "  make hot-stream   Restart Stream service only"
	@echo "  make hot-storage  Restart Storage service only"
	@echo ""
	@echo "=== SHELL ACCESS ==="
	@echo "  make shell-frontend   Open shell inside frontend container"
	@echo "  make shell-gateway    Open shell inside gateway container"
	@echo "  make shell-sfu        Open shell inside sfu container"

# ============================================================================
# Production-like Commands (pre-built images)
# ============================================================================

dev:
	docker compose -f docker-compose.services.yml up

up:
	docker compose -f docker-compose.services.yml up -d

down:
	docker compose -f docker-compose.services.yml down

restart:
	docker compose -f docker-compose.services.yml restart

logs:
	docker compose -f docker-compose.services.yml logs -f

build:
	docker compose -f docker-compose.services.yml build

clean:
	docker compose -f docker-compose.services.yml down -v

# ============================================================================
# Hot Reload Development Commands
# ============================================================================

# Start all services with hot reload enabled
hot:
	docker compose -f docker-compose.dev-services.yml up

# Start hot reload in background
hot-up:
	docker compose -f docker-compose.dev-services.yml up -d

# Stop hot reload services
hot-down:
	docker compose -f docker-compose.dev-services.yml down

# Restart hot reload services
hot-restart:
	docker compose -f docker-compose.dev-services.yml restart

# Follow hot reload logs
hot-logs:
	docker compose -f docker-compose.dev-services.yml logs -f

# Rebuild hot reload images (needed when Dockerfile.dev changes)
hot-build:
	docker compose -f docker-compose.dev-services.yml build --no-cache

# Clean hot reload (removes volumes including compiled cache)
hot-clean:
	docker compose -f docker-compose.dev-services.yml down -v

# ============================================================================
# Service-Specific Hot Reload Commands
# ============================================================================

hot-sfu:
	docker compose -f docker-compose.dev-services.yml restart sfu

hot-gateway:
	docker compose -f docker-compose.dev-services.yml restart gateway

hot-core:
	docker compose -f docker-compose.dev-services.yml restart core

hot-stream:
	docker compose -f docker-compose.dev-services.yml restart stream

hot-storage:
	docker compose -f docker-compose.dev-services.yml restart storage

# View individual service logs
hot-logs-sfu:
	docker compose -f docker-compose.dev-services.yml logs -f sfu

hot-logs-gateway:
	docker compose -f docker-compose.dev-services.yml logs -f gateway

hot-logs-core:
	docker compose -f docker-compose.dev-services.yml logs -f core

# ============================================================================
# Shell Shortcuts
# ============================================================================

shell-frontend:
	docker compose -f docker-compose.services.yml exec frontend sh

shell-gateway:
	docker compose -f docker-compose.services.yml exec gateway sh

shell-sfu:
	docker compose -f docker-compose.dev-services.yml exec sfu bash
