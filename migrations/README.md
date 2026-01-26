# AllStrm Database Migrations

## Current Schema

**`003_consolidated_all.sql`** - Complete consolidated schema (v4.0.0)

This single file contains the entire database schema for AllStrm:

### Schemas
- `core` - Users, organizations, rooms, participants, OAuth
- `stream` - RTMP sessions, HLS segments, destinations, health metrics
- `assets` - Recordings, transcodes, thumbnails, uploads
- `public` - OAuth connections (linked to Supabase auth.users)

### Tables Summary

| Schema | Table | Purpose |
|--------|-------|---------|
| core | users | User accounts |
| core | organizations | Billing entities with tier limits |
| core | organization_members | User-org membership |
| core | rooms | Streaming sessions |
| core | room_participants | Who's in each room |
| core | room_guest_permissions | Guest permission settings |
| core | private_messages | DMs between participants |
| core | api_keys | API authentication |
| core | oauth_connections | OAuth tokens (internal) |
| core | oauth_state | CSRF protection |
| core | youtube_broadcasts | Cached YouTube data |
| core | twitch_streams | Cached Twitch data |
| stream | rtmp_sessions | Active RTMP connections |
| stream | hls_segments | HLS chunk metadata |
| stream | destinations | RTMP/SRT output targets |
| stream | health_metrics | Real-time health (hot table) |
| stream | health_logs | Historical health data |
| assets | recordings | Recording files |
| assets | transcodes | Transcode jobs |
| assets | thumbnails | Video thumbnails |
| assets | uploads | General uploads |
| public | oauth_connections | OAuth tokens (Supabase auth) |

## Running Migrations

### Fresh Install (Supabase)
```bash
# Via Supabase CLI
supabase db reset

# Or direct SQL
psql $DATABASE_URL -f migrations/003_consolidated_all.sql
```

### Existing Database
The consolidated file uses `CREATE TABLE IF NOT EXISTS` and `DROP TRIGGER IF EXISTS` 
to be idempotent - safe to re-run.

## Archive

Old incremental migration files are preserved in `archive/`:
- `000_consolidated_schema.sql` - Original schema
- `001_enterprise_features.sql` - Enterprise additions
- `002_oauth_connections.sql` - OAuth tables

These are kept for reference only. Use `003_consolidated_all.sql` for new deployments.
