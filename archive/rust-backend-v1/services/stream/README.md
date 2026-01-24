# ALLSTRM Stream Service (S2)

Live streaming engine for Studio Mode - RTMP ingest, HLS output, multi-destination.

## Responsibilities

- **RTMP Ingest**: Receive composed stream from Host Client
- **HLS Segmentation**: Convert RTMP to HLS for CDN delivery
- **Multi-destination**: Relay to YouTube, Twitch, etc.
- **Recording Buffer**: Buffer stream data for cloud recording

## Architecture

```
Host Client                    Stream Service                    CDN
    │                               │                             │
    │ RTMP (composed stream)        │                             │
    │──────────────────────────────>│                             │
    │                               │                             │
    │                          ┌────┴────┐                        │
    │                          │ Segment │                        │
    │                          │ to HLS  │                        │
    │                          └────┬────┘                        │
    │                               │                             │
    │                               │ HLS segments                │
    │                               │────────────────────────────>│
    │                               │                             │
    │                          ┌────┴────┐                        │
    │                          │ Relay   │                        │
    │                          │ to      │────────> YouTube       │
    │                          │ Dests   │────────> Twitch        │
    │                          └─────────┘────────> Custom RTMP   │
```

## Database

Uses the `stream` schema:
- `stream.rtmp_sessions`
- `stream.hls_segments`
- `stream.destinations`
- `stream.recording_buffers`

## Configuration

```bash
STREAM_PORT=8083
STREAM_DATABASE_URL=postgres://user:pass@localhost:5432/allstrm
STREAM_RTMP_PORT=1935
STREAM_HLS_OUTPUT_DIR=/var/hls
STREAM_CDN_BASE_URL=https://cdn.allstrm.com
```

## Implementation Status

Partially implemented in monolithic backend at `src/media/`.
Key modules:
- `src/media/rtmp.rs` - RTMP ingest
- `src/media/hls.rs` - HLS segmentation
- `src/media/streaming/` - Destination management

Will be extracted as a separate microservice in Phase 2.
