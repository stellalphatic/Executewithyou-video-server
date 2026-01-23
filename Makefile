# ALLSTRM Backend Makefile
# Database and development utilities

.PHONY: help db-create db-drop db-reset db-migrate db-status db-prepare dev build test clean

# Default target
help:
	@echo "ALLSTRM Backend Development Commands"
	@echo ""
	@echo "Database:"
	@echo "  make db-create    Create the database"
	@echo "  make db-drop      Drop the database"
	@echo "  make db-reset     Drop and recreate database with migrations"
	@echo "  make db-migrate   Run pending migrations"
	@echo "  make db-status    Show migration status"
	@echo "  make db-prepare   Prepare SQLx for offline compilation"
	@echo ""
	@echo "Development:"
	@echo "  make dev          Run all services in development mode"
	@echo "  make build        Build all services in release mode"
	@echo "  make test         Run all tests"
	@echo "  make clean        Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    Start PostgreSQL and Redis containers"
	@echo "  make docker-down  Stop containers"
	@echo ""
	@echo "Environment:"
	@echo "  Ensure DATABASE_URL is set or .env file exists"
	@echo "  Example: DATABASE_URL=postgres://allstrm:password@localhost:5432/allstrm"

# Load .env file if it exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Database URL with fallback
DATABASE_URL ?= postgres://allstrm:password@localhost:5432/allstrm

# Extract database name from URL
DB_NAME := $(shell echo $(DATABASE_URL) | sed -E 's|.*/([^?]+).*|\1|')
DB_USER := $(shell echo $(DATABASE_URL) | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS := $(shell echo $(DATABASE_URL) | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_HOST := $(shell echo $(DATABASE_URL) | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT := $(shell echo $(DATABASE_URL) | sed -E 's|.*:([0-9]+)/.*|\1|')

# ============================================================================
# Database Commands
# ============================================================================

db-create:
	@echo "Creating database $(DB_NAME)..."
	@PGPASSWORD=$(DB_PASS) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d postgres -c "CREATE DATABASE $(DB_NAME);" 2>/dev/null || echo "Database may already exist"
	@echo "Database $(DB_NAME) ready"

db-drop:
	@echo "Dropping database $(DB_NAME)..."
	@PGPASSWORD=$(DB_PASS) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d postgres -c "DROP DATABASE IF EXISTS $(DB_NAME);"
	@echo "Database $(DB_NAME) dropped"

db-migrate:
	@echo "Running migrations..."
	@if command -v sqlx >/dev/null 2>&1; then \
		sqlx migrate run --source migrations; \
	else \
		echo "sqlx-cli not found. Installing..."; \
		cargo install sqlx-cli --no-default-features --features rustls,postgres; \
		sqlx migrate run --source migrations; \
	fi
	@echo "Migrations complete"

db-status:
	@echo "Migration status:"
	@if command -v sqlx >/dev/null 2>&1; then \
		sqlx migrate info --source migrations; \
	else \
		echo "sqlx-cli not installed. Run: cargo install sqlx-cli --no-default-features --features rustls,postgres"; \
	fi

db-reset: db-drop db-create db-migrate
	@echo "Database reset complete"

db-prepare:
	@echo "Preparing SQLx for offline compilation..."
	@cargo sqlx prepare --workspace
	@echo "SQLx prepared. Commit the .sqlx directory to version control."

# Run migrations using psql directly (fallback if sqlx-cli not available)
db-migrate-raw:
	@echo "Running migrations with psql..."
	@for file in migrations/*.sql; do \
		echo "Applying $$file..."; \
		PGPASSWORD=$(DB_PASS) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -f "$$file"; \
	done
	@echo "Migrations complete"

# ============================================================================
# Development Commands
# ============================================================================

dev:
	@echo "Starting development services..."
	@echo "Make sure PostgreSQL and Redis are running"
	@cargo run --package allstrm-gateway &
	@cargo run --package allstrm-core &
	@cargo run --package allstrm-sfu &
	@cargo run --package allstrm-stream &
	@cargo run --package allstrm-storage &
	@echo "All services starting. Check logs for details."

build:
	@echo "Building all services..."
	@cargo build --release --workspace
	@echo "Build complete. Binaries in target/release/"

test:
	@echo "Running tests..."
	@cargo test --workspace
	@echo "Tests complete"

clean:
	@echo "Cleaning build artifacts..."
	@cargo clean
	@echo "Clean complete"

# ============================================================================
# Docker Commands
# ============================================================================

docker-up:
	@echo "Starting PostgreSQL and Redis..."
	@docker compose -f docker-compose.dev.yml up -d postgres redis
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3
	@echo "Services started"

docker-down:
	@echo "Stopping containers..."
	@docker compose -f docker-compose.dev.yml down
	@echo "Containers stopped"

docker-logs:
	@docker compose -f docker-compose.dev.yml logs -f

# ============================================================================
# Individual Service Commands
# ============================================================================

run-gateway:
	@cargo run --package allstrm-gateway

run-core:
	@cargo run --package allstrm-core

run-sfu:
	@cargo run --package allstrm-sfu

run-stream:
	@cargo run --package allstrm-stream

run-storage:
	@cargo run --package allstrm-storage

# ============================================================================
# Utility Commands
# ============================================================================

fmt:
	@cargo fmt --all

lint:
	@cargo clippy --workspace -- -D warnings

check:
	@cargo check --workspace
