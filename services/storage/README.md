# ALLSTRM Storage Service

Object storage management for recordings, uploads, and media assets.

## Responsibilities

- **Presigned URLs**: Generate S3-compatible presigned URLs for uploads
- **Recording Management**: Track recording metadata
- **Transcoding Queue**: Queue recordings for transcoding
- **Asset Management**: Track thumbnails, transcodes, etc.

## Storage Backend

Cloudflare R2 (S3-compatible):
- Recordings bucket: `allstrm-recordings`
- Assets bucket: `allstrm-assets`

## Database

Uses the `assets` schema:
- `assets.recordings`
- `assets.transcodes`
- `assets.thumbnails`
- `assets.upload_parts`

## API Endpoints

### Upload
- `POST /api/v1/upload/sign` - Get presigned upload URL
- `POST /api/v1/upload/complete` - Complete multipart upload

### Recordings
- `GET    /api/v1/recordings` - List recordings
- `GET    /api/v1/recordings/:id` - Get recording
- `DELETE /api/v1/recordings/:id` - Delete recording
- `POST   /api/v1/recordings/:id/transcode` - Start transcode job

## Upload Flow

```
Frontend                     Storage Service                    R2
    │                               │                            │
    │ POST /upload/sign             │                            │
    │ {roomId, chunkIndex, ...}     │                            │
    │─────────────────────────────>│                            │
    │                               │ Generate presigned URL     │
    │<─────────────────────────────│                            │
    │ {uploadUrl, recordingId}      │                            │
    │                               │                            │
    │ PUT uploadUrl                 │                            │
    │───────────────────────────────────────────────────────────>│
    │                               │                            │
    │<───────────────────────────────────────────────────────────│
    │ ETag                          │                            │
    │                               │                            │
    │ POST /upload/complete         │                            │
    │ {recordingId, chunks}         │                            │
    │─────────────────────────────>│                            │
    │                               │ Concatenate chunks         │
    │<─────────────────────────────│                            │
    │ {playbackUrl, duration}       │                            │
```

## Configuration

```bash
STORAGE_PORT=8084
STORAGE_DATABASE_URL=postgres://user:pass@localhost:5432/allstrm
STORAGE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
STORAGE_R2_ACCESS_KEY=...
STORAGE_R2_SECRET_KEY=...
STORAGE_R2_BUCKET=allstrm-recordings
STORAGE_PRESIGNED_URL_EXPIRY=3600
```

## Implementation Status

Partially implemented in monolithic backend at `src/storage/`.
Key modules:
- `src/storage/recording.rs` - R2 upload handling

Will be extracted as a separate microservice in Phase 2.
