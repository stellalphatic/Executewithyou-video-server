# Frontend-Backend Wiring Guide

Complete reference for connecting the React frontend to the Rust backend.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                          FRONTEND                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Landing │  │Dashboard│  │ Studio  │  │ Meeting │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                 │
│  ┌────┴────────────┴────────────┴────────────┴────┐            │
│  │              lib/api.ts (REST)                 │            │
│  │         lib/engines/SignalClient.ts (WS)       │            │
│  │              hooks/useAllstrm.ts               │            │
│  └────────────────────────┬───────────────────────┘            │
└───────────────────────────┼────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                       BACKEND (Rust)                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Gateway :8080                         │  │
│  │  • /api/v1/* → Core, Stream, Storage                    │  │
│  │  • /ws → WebSocket signaling                            │  │
│  │  • JWT validation, rate limiting                        │  │
│  └───────────────────────┬─────────────────────────────────┘  │
│                          │                                    │
│  ┌───────────┐ ┌─────────┴─────────┐ ┌───────────┐            │
│  │Core :8081 │ │   SFU :8082       │ │Stream:8083│            │
│  │ • Rooms   │ │ • WebRTC signaling│ │ • RTMP    │            │
│  │ • OAuth   │ │ • Track routing   │ │ • HLS     │            │
│  │ • Users   │ │ • SDP/ICE         │ │ • FFmpeg  │            │
│  └───────────┘ └───────────────────┘ └───────────┘            │
└───────────────────────────────────────────────────────────────┘
```

## Current State

### Frontend Files to Wire

| File | Purpose | Backend Connection |
|------|---------|-------------------|
| `lib/api.ts` | REST API client | Gateway `/api/v1/*` |
| `lib/engines/SignalClient.ts` | WebSocket client | Gateway `/ws` |
| `hooks/useAllstrm.ts` | Main hook (currently mock) | Needs real WebRTC |
| `components/Destinations.tsx` | Destination management | Core OAuth + destinations |

### What's Currently Mocked

The `useAllstrm.ts` hook currently runs in **mock mode**:
- Creates fake participants with canvas streams
- No real WebRTC connections
- No real WebSocket messages
- Recording only works client-side

## API Endpoint Mapping

### REST Endpoints (lib/api.ts)

Update `lib/api.ts` to use these endpoints:

```typescript
const API_BASE = 'http://localhost:8080/api'; // Gateway

// === ROOMS ===
// Create room
POST /api/rooms
Body: { owner_id: UUID, name: string, mode: "studio" | "meeting" }

// List rooms
GET /api/rooms?owner_id=<uuid>&limit=20&offset=0

// Get room
GET /api/rooms/:room_id

// Update room
PUT /api/rooms/:room_id
Body: { name?: string, status?: string, settings?: object }

// Delete room
DELETE /api/rooms/:room_id

// Get participants
GET /api/rooms/:room_id/participants

// === DESTINATIONS ===
// Create destination
POST /api/rooms/:room_id/destinations
Body: { platform: string, name: string, rtmp_url: string, stream_key: string }

// List destinations
GET /api/rooms/:room_id/destinations

// Update destination
PUT /api/rooms/:room_id/destinations/:destination_id

// Delete destination
DELETE /api/rooms/:room_id/destinations/:destination_id

// Toggle destination
POST /api/rooms/:room_id/destinations/:destination_id/toggle

// === OAUTH ===
// List providers
GET /api/oauth/providers

// Initiate OAuth
GET /api/oauth/:provider/authorize?user_id=<uuid>&redirect_uri=/dashboard

// List connections
GET /api/oauth/connections?user_id=<uuid>

// Disconnect
DELETE /api/oauth/connections/:connection_id

// Get stream destination from OAuth
GET /api/oauth/connections/:connection_id/destination

// === STREAM SERVICE ===
// Create session
POST /stream/sessions
Body: { room_id: UUID }

// Get session
GET /stream/sessions/:room_id

// Start stream
POST /stream/sessions/:room_id/start

// Stop stream
POST /stream/sessions/:room_id/stop

// Set layout
POST /stream/sessions/:room_id/layout
Body: { preset: string, positions: [...] }

// Start destination relay
POST /stream/sessions/:room_id/destinations/:destination_id/start

// Stop destination relay
POST /stream/sessions/:room_id/destinations/:destination_id/stop

// === USERS ===
GET /api/users/:user_id
POST /api/users/:user_id/api-keys
GET /api/users/:user_id/api-keys
DELETE /api/users/:user_id/api-keys/:key_id
```

### WebSocket Messages (SignalClient.ts)

Connect to: `wss://api.allstrm.io/ws?token=<jwt>&room_id=<uuid>`

#### Client → Server

```typescript
// Join room
{ type: "join", payload: { room_id, display_name, role } }

// SDP Offer (publish tracks)
{ type: "sdp_offer", payload: { sdp: "v=0\r\n..." } }

// SDP Answer (subscribe to tracks)
{ type: "sdp_answer", payload: { participant_id, sdp: "v=0\r\n..." } }

// ICE Candidate
{ type: "ice_candidate", payload: { candidate, sdp_mid, sdp_m_line_index } }

// Mute/unmute
{ type: "track_update", payload: { track_id, enabled: boolean } }

// Leave
{ type: "leave", payload: {} }

// Chat
{ type: "chat", payload: { text: string } }

// Reaction
{ type: "reaction", payload: { emoji: string } }
```

#### Server → Client

```typescript
// Join accepted
{ type: "join_accepted", payload: { participant_id, room_id, participants, ice_servers } }

// Participant joined
{ type: "participant_joined", payload: { participant_id, display_name, role } }

// Participant left
{ type: "participant_left", payload: { participant_id } }

// SDP Offer (subscribe to new participant)
{ type: "sdp_offer", payload: { participant_id, sdp } }

// SDP Answer
{ type: "sdp_answer", payload: { sdp } }

// ICE Candidate
{ type: "ice_candidate", payload: { participant_id, candidate, sdp_mid, sdp_m_line_index } }

// Track updated
{ type: "track_updated", payload: { participant_id, track_id, kind, enabled } }

// Chat message
{ type: "chat", payload: { sender_id, sender_name, text, timestamp } }

// Error
{ type: "error", payload: { code, message } }
```

## Implementation Tasks

### Priority 1: API Client Update

Update `lib/api.ts`:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export class ApiClient {
    private static token: string | null = null;

    static setToken(token: string) {
        this.token = token;
    }

    private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
        };

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...headers, ...options.headers }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `API Error: ${response.statusText}`);
        }

        if (response.status === 204) return {} as T;
        return response.json();
    }

    // === Rooms ===
    static async createRoom(data: { owner_id: string, name: string, mode: 'studio' | 'meeting' }) {
        return this.request('/rooms', { method: 'POST', body: JSON.stringify(data) });
    }

    static async listRooms(ownerId: string, limit = 20, offset = 0) {
        return this.request(`/rooms?owner_id=${ownerId}&limit=${limit}&offset=${offset}`);
    }

    static async getRoom(roomId: string) {
        return this.request(`/rooms/${roomId}`);
    }

    static async joinRoom(roomId: string, displayName: string) {
        return this.request(`/rooms/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ display_name: displayName })
        });
    }

    // === Destinations ===
    static async listDestinations(roomId: string) {
        return this.request(`/rooms/${roomId}/destinations`);
    }

    static async createDestination(roomId: string, data: { platform: string, name: string, rtmp_url: string, stream_key: string }) {
        return this.request(`/rooms/${roomId}/destinations`, { method: 'POST', body: JSON.stringify(data) });
    }

    static async deleteDestination(roomId: string, destinationId: string) {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}`, { method: 'DELETE' });
    }

    static async toggleDestination(roomId: string, destinationId: string) {
        return this.request(`/rooms/${roomId}/destinations/${destinationId}/toggle`, { method: 'POST' });
    }

    // === OAuth ===
    static async listOAuthProviders() {
        return this.request('/oauth/providers');
    }

    static async listOAuthConnections(userId: string) {
        return this.request(`/oauth/connections?user_id=${userId}`);
    }

    static async disconnectOAuth(connectionId: string) {
        return this.request(`/oauth/connections/${connectionId}`, { method: 'DELETE' });
    }

    static async getStreamDestination(connectionId: string) {
        return this.request(`/oauth/connections/${connectionId}/destination`);
    }

    static getOAuthUrl(provider: string, userId: string, redirectUri = '/dashboard') {
        return `${API_BASE}/oauth/${provider}/authorize?user_id=${userId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    // === Stream Service ===
    static async createStreamSession(roomId: string) {
        return this.request('/stream/sessions', { method: 'POST', body: JSON.stringify({ room_id: roomId }) });
    }

    static async startStream(roomId: string) {
        return this.request(`/stream/sessions/${roomId}/start`, { method: 'POST' });
    }

    static async stopStream(roomId: string) {
        return this.request(`/stream/sessions/${roomId}/stop`, { method: 'POST' });
    }

    static async startDestinationRelay(roomId: string, destinationId: string) {
        return this.request(`/stream/sessions/${roomId}/destinations/${destinationId}/start`, { method: 'POST' });
    }

    static async stopDestinationRelay(roomId: string, destinationId: string) {
        return this.request(`/stream/sessions/${roomId}/destinations/${destinationId}/stop`, { method: 'POST' });
    }
}
```

### Priority 2: WebSocket Integration

Update `SignalClient.ts` to work with real backend:

```typescript
export class SignalClient {
    private ws: WebSocket | null = null;
    private url: string;

    constructor(baseUrl: string = 'ws://localhost:8080') {
        this.url = baseUrl;
    }

    connect(token: string, roomId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const wsUrl = `${this.url}/ws?token=${token}&room_id=${roomId}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                resolve();
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.emit(message.type, message.payload);
            };

            this.ws.onerror = (err) => reject(err);
            this.ws.onclose = () => this.handleReconnect();
        });
    }

    // ... rest of implementation
}
```

### Priority 3: WebRTC Integration in useAllstrm

The hook needs to:
1. Connect to SignalClient
2. Create RTCPeerConnection for each participant
3. Handle SDP offer/answer exchange
4. Handle ICE candidate exchange
5. Manage MediaStream tracks

Key changes needed in `useAllstrm.ts`:

```typescript
// Replace mock peer creation with real WebRTC
const createPeerConnection = (participantId: string) => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            signalClient.send('ice_candidate', {
                participant_id: participantId,
                candidate: event.candidate.candidate,
                sdp_mid: event.candidate.sdpMid,
                sdp_m_line_index: event.candidate.sdpMLineIndex
            });
        }
    };

    pc.ontrack = (event) => {
        setRemoteStreams(prev => ({
            ...prev,
            [participantId]: event.streams[0]
        }));
    };

    // Add local tracks
    localStream?.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    return pc;
};
```

### Priority 4: OAuth UI Integration

Update `Destinations.tsx` to support OAuth:

```typescript
// Add OAuth connect button for each platform
const handleOAuthConnect = (platform: string) => {
    const url = ApiClient.getOAuthUrl(platform, userId, window.location.pathname);
    window.location.href = url; // Redirect to OAuth
};

// After OAuth callback, fetch stream destination
const handleOAuthCallback = async (connectionId: string) => {
    const dest = await ApiClient.getStreamDestination(connectionId);
    // Auto-create destination with fetched RTMP URL and stream key
    await ApiClient.createDestination(roomId, {
        platform: dest.provider,
        name: dest.channel_name,
        rtmp_url: dest.rtmp_url,
        stream_key: dest.stream_key
    });
};
```

## Environment Variables

Create `frontend-next/.env.local`:

```bash
# API endpoint
NEXT_PUBLIC_API_URL=http://localhost:8080/api

# WebSocket endpoint
NEXT_PUBLIC_WS_URL=ws://localhost:8080

# Supabase (for auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Type Alignment

### Backend Types (Rust) → Frontend Types (TypeScript)

| Backend | Frontend | Notes |
|---------|----------|-------|
| `Room` | `Room` | Add `participants` field client-side |
| `Participant` | `Participant` | Match exactly |
| `Destination` | `Destination` | Add `health` client-side |
| `OAuthConnection` | New type needed | For OAuth connections |
| `StreamSession` | New type needed | For stream state |

### New Types to Add

```typescript
// Add to types.ts

export interface OAuthConnection {
    id: string;
    provider: string;
    provider_user_id: string;
    provider_username?: string;
    provider_display_name?: string;
    is_active: boolean;
    created_at: string;
}

export interface OAuthProvider {
    name: string;
    display_name: string;
    icon: string;
    is_configured: boolean;
}

export interface StreamDestination {
    provider: string;
    channel_id: string;
    channel_name: string;
    rtmp_url: string;
    stream_key: string;
    backup_rtmp_url?: string;
    is_live: boolean;
}

export interface StreamSession {
    room_id: string;
    state: 'idle' | 'connecting' | 'live' | 'stopping' | 'ended';
    stream_key: string;
    destinations: DestinationRelay[];
    hls_enabled: boolean;
    recording_enabled: boolean;
    started_at?: string;
}

export interface DestinationRelay {
    destination_id: string;
    state: 'idle' | 'starting' | 'active' | 'stopping' | 'error';
    error_message?: string;
}
```

## Testing Checklist

### REST API
- [ ] Create room
- [ ] List rooms
- [ ] Join room
- [ ] Create destination (manual)
- [ ] OAuth flow (all 13 platforms)
- [ ] Get stream destination from OAuth

### WebSocket
- [ ] Connect with JWT
- [ ] Join room
- [ ] Receive participant events
- [ ] Exchange SDP offer/answer
- [ ] Exchange ICE candidates

### WebRTC
- [ ] Local media capture
- [ ] Publish tracks to SFU
- [ ] Subscribe to remote tracks
- [ ] Handle track mute/unmute
- [ ] Screen share

### Streaming
- [ ] Start broadcast
- [ ] Start individual destinations
- [ ] Monitor destination health
- [ ] Stop broadcast

## Platform IDs Reference

| Platform | Backend ID | Frontend ID (current) |
|----------|------------|----------------------|
| YouTube | `youtube` | `youtube` |
| Facebook | `facebook` | `facebook` |
| LinkedIn | `linkedin` | `linked_in` ⚠️ |
| X/Twitter | `x` | `twitter` ⚠️ |
| Twitch | `twitch` | `twitch` |
| Instagram | `instagram` | `instagram` |
| TikTok | `tiktok` | `tik_tok` ⚠️ |
| Kick | `kick` | `kick` |
| Vimeo | `vimeo` | `vimeo` |
| Amazon | `amazon` | `amazon_live` ⚠️ |
| Brightcove | `brightcove` | `brightcove` |
| Hopin | `hopin` | `hopin` |
| Custom | `custom_rtmp` | `custom` ⚠️ |

⚠️ = Needs alignment between frontend and backend

## Quick Fixes Needed

1. **Destinations.tsx line 118-128**: Fix platform IDs to match backend
2. **api.ts**: Update all endpoints to match actual backend routes
3. **types.ts**: Add OAuth and Stream types
4. **useAllstrm.ts**: Replace mock with real SignalClient + WebRTC
