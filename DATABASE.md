# ALLSTRM Database Setup

This document describes how to set up and manage the PostgreSQL database for ALLSTRM services.

## Quick Start

```bash
# Start PostgreSQL and Redis with Docker
make docker-up

# Run migrations
make db-migrate

# Or reset database completely (drops and recreates)
make db-reset
```

## Prerequisites

- PostgreSQL 15+ (or Docker)
- SQLx CLI (optional, for migration management)

### Install SQLx CLI

```bash
cargo install sqlx-cli --no-default-features --features rustls,postgres
```

## Database Configuration

Set the `DATABASE_URL` environment variable or add it to your `.env` file:

```bash
DATABASE_URL=postgres://allstrm:password@localhost:5432/allstrm
```

## Schema Architecture (v4.0.0)

ALLSTRM uses a production-hardened schema partitioned into functional domains for security and scale:

| Schema   | Service         | Purpose                                   |
|----------|-----------------|-------------------------------------------|
| `core`   | Core Service    | Users, organizations, rooms, API keys     |
| `stream` | Stream Service  | RTMP sessions, HLS segments, destinations |
| `assets` | Storage Service | Recordings, transcodes, uploads           |

### The "Why": Architectural Decisions
1. **Schema Partitioning**: Prevents hot tables (like `stream.health_metrics`) from impacting core application state.
2. **Organization-Centric**: Supports B2B team collaboration by making Organizations the primary resource owners.
3. **Identity Sync**: A PostgreSQL trigger bridges Supabase `auth.users` to `core.users` automatically on signup.
4. **Performance Tuning**: Hot tables like `stream.health_metrics` use a `fillfactor = 50` to allow for efficient "HOT updates" without table bloat.

## Migration Files

The database has been consolidated into a single, idempotent source of truth:

| File | Description |
|------|-------------|
| `003_consolidated_all.sql` | **Primary Entry Point**. Contains all schemas, tables, triggers, and RLS policies (v4.0.0). |

*Note: Older incremental migrations in `archive/` or previous versions are no longer used for fresh setups.*

## Running Migrations

### Option 1: Automatic (Development)

Services run migrations automatically on startup when `RUN_MIGRATIONS=true` (default in development):

```bash
# Migrations run when starting Core or Storage service
cargo run --package allstrm-core
```

### Option 2: SQLx CLI

```bash
# Run pending migrations
sqlx migrate run --source migrations

# Check migration status
sqlx migrate info --source migrations

# Revert last migration
sqlx migrate revert --source migrations
```

### Option 3: Make Commands

```bash
# Run migrations
make db-migrate

# Check status
make db-status

# Full reset (WARNING: drops all data)
make db-reset
```

### Option 4: Raw SQL (Fallback)

```bash
# Run all migrations with psql
make db-migrate-raw
```

## Development with Docker

The `docker-compose.dev.yml` file provides PostgreSQL and Redis for local development:

```bash
# Start services
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f postgres

# Stop services
docker compose -f docker-compose.dev.yml down

# Reset data (removes volumes)
docker compose -f docker-compose.dev.yml down -v
```

### Optional Tools

Start with pgAdmin and Redis Commander:

```bash
docker compose -f docker-compose.dev.yml --profile tools up -d
```

- pgAdmin: http://localhost:5050 (admin@allstrm.local / admin)
- Redis Commander: http://localhost:8081

## Production Deployment

For production, disable automatic migrations and run them separately:

```bash
# In production .env
RUN_MIGRATIONS=false

# Run migrations before deploying
sqlx migrate run --source migrations --database-url $DATABASE_URL
```

## Compile-Time Checking (Optional)

SQLx supports compile-time query verification. To enable:

1. Prepare offline data:
   ```bash
   cargo sqlx prepare --workspace
   ```

2. Commit the `.sqlx/` directory

3. Enable in `sqlx.toml`:
   ```toml
   [query]
   check = true
   ```

## Schema Sync

If the Rust code and database schema get out of sync:

1. Check what tables exist:
   ```sql
   SELECT table_schema, table_name
   FROM information_schema.tables
   WHERE table_schema IN ('core', 'stream', 'assets');
   ```

2. Run the compatibility migration:
   ```bash
   psql $DATABASE_URL -f migrations/005_code_compatibility.sql
   ```

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Migration Failed

```bash
# Check migration status
sqlx migrate info --source migrations

# View migration history
psql $DATABASE_URL -c "SELECT * FROM _sqlx_migrations ORDER BY version"
```

### Schema Mismatch

If you see errors like "relation does not exist":

```bash
# Ensure schemas exist
psql $DATABASE_URL -c "CREATE SCHEMA IF NOT EXISTS core; CREATE SCHEMA IF NOT EXISTS stream; CREATE SCHEMA IF NOT EXISTS assets;"

# Re-run migrations
make db-migrate
```

## Backup and Restore

```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```
