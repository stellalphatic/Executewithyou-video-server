# Frontend Implementation Tasks

Quick checklist for completing the frontend-backend integration.

## Completed

- [x] Backend: OAuth for 13 platforms
- [x] Backend: SFU with WebRTC signaling
- [x] Backend: Stream service with multi-destination
- [x] Backend: API documentation
- [x] Frontend: Platform IDs aligned with backend
- [x] Frontend: API client with all endpoints
- [x] Frontend: Wiring documentation
- [x] Frontend: SignalClient with real WebSocket + mock fallback
- [x] Frontend: WebRTCManager for peer connections
- [x] Frontend: useAllstrm hook integrated with SignalClient/WebRTCManager
- [x] Frontend: Chat and reactions wired to SignalClient
- [x] Frontend: Broadcast start/stop calling backend API
- [x] Frontend: Destination toggle calling backend API
- [x] Frontend: OAuth flow in Destinations component
- [x] Frontend: Manual RTMP form for destinations
- [x] Frontend: OAuth connection picker modal
- [x] Frontend: OAuth callback handling
- [x] Frontend: userId passed to Destinations from Dashboard/Studio

## Remaining Tasks

### Environment Setup
```bash
# Create frontend/.env
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Priority 1: OAuth UI Integration

### 1.1 Add OAuth Connect Button
In Destinations.tsx, add OAuth option when platform supports it:

```typescript
const handlePlatformClick = (platform) => {
    if (platform.supportsOAuth && isOAuthConfigured(platform.id)) {
        // Redirect to OAuth
        window.location.href = ApiClient.getOAuthUrl(platform.id, userId);
    } else {
        // Show manual RTMP form
        setShowManualForm(platform);
    }
};
```

### 2.2 Handle OAuth Callback
Add callback handler in Dashboard or App:

```typescript
useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true' && params.get('provider')) {
        // OAuth completed, refresh connections
        loadOAuthConnections();
    }
}, []);
```

### 2.3 List Connected Accounts
Show user's OAuth connections:

```typescript
const [connections, setConnections] = useState<OAuthConnection[]>([]);

useEffect(() => {
    ApiClient.listOAuthConnections(userId).then(r => setConnections(r.connections));
}, [userId]);

// Render connected accounts with "Add to Room" button
```

## Priority 3: Stream Control

### 3.1 Start/Stop Broadcast
In Studio.tsx, wire up broadcast buttons:

```typescript
const handleStartBroadcast = async () => {
    await ApiClient.createStreamSession(roomId);
    await ApiClient.startStream(roomId);

    // Start relays for each enabled destination
    for (const dest of destinations.filter(d => d.enabled)) {
        await ApiClient.startDestinationRelay(roomId, dest.id);
    }
};

const handleStopBroadcast = async () => {
    await ApiClient.stopStream(roomId);
};
```

### 3.2 Destination Status Polling
Poll for destination health:

```typescript
useEffect(() => {
    if (broadcastStatus !== 'live') return;

    const interval = setInterval(async () => {
        const session = await ApiClient.getStreamSession(roomId);
        // Update destination statuses from session.destinations
    }, 2000);

    return () => clearInterval(interval);
}, [broadcastStatus, roomId]);
```

## Priority 4: WebRTC Peer Connections

### 4.1 Create Peer Connection Function
```typescript
const createPeerConnection = (participantId: string, iceServers: RTCIceServer[]) => {
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

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
            // Handle reconnection
        }
    };

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
    });

    peerConnectionsRef.current.set(participantId, pc);
    return pc;
};
```

### 4.2 Publish Local Tracks
```typescript
const publishTracks = async (pc: RTCPeerConnection, participantId: string) => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalClient.send('sdp_offer', { sdp: offer.sdp });
};
```

## Files to Modify

| File | Changes Needed |
|------|----------------|
| `hooks/useAllstrm.ts` | Replace mock with real WebRTC/SignalClient |
| `lib/engines/SignalClient.ts` | Remove mock fallback, add reconnection |
| `components/Destinations.tsx` | Add OAuth flow, manual RTMP form |
| `components/Studio.tsx` | Wire broadcast start/stop |
| `pages/Dashboard.tsx` | Handle OAuth callback, list connections |
| `App.tsx` | Pass real user ID from Supabase |

## Testing Order

1. **Auth Flow**: Login with Supabase → Get JWT → Set in ApiClient
2. **Room CRUD**: Create room → List rooms → Get room
3. **WebSocket**: Connect to /ws → Join room → Receive events
4. **WebRTC**: Publish tracks → Exchange SDP → See remote video
5. **Destinations**: Add manual destination → Toggle → Delete
6. **OAuth**: Connect YouTube → Get stream key → Create destination
7. **Broadcast**: Start stream → Monitor health → Stop stream

## Quick Commands

```bash
# Start backend services
cd allstrm-backend
make docker-up          # Start Postgres/Redis
cargo run -p allstrm-gateway &
cargo run -p allstrm-core &
cargo run -p allstrm-sfu &
cargo run -p allstrm-stream &

# Start frontend
cd frontend
npm install
npm run dev
```

## Key Backend Ports

| Service | Port | Purpose             |
|---------|------|---------------------|
| Gateway | 8080 | API + WebSocket     |
| Core    | 8081 | Rooms, OAuth, Users |
| SFU     | 8082 | WebRTC Signaling    |
| Stream  | 8083 | RTMP/HLS/FFmpeg     |
| Storage | 8084 | R2/S3 Recordings    |
