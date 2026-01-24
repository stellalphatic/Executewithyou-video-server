# ALLSTRM SFU Service (S1)

Selective Forwarding Unit for Meeting Mode and Studio Mode signaling.

## Responsibilities

- **WebRTC Signaling**: Handle SDP offers/answers and ICE candidates
- **SFU Media Routing**: Forward media tracks between participants
- **Track Management**: Track participant→track mapping
- **ICE/STUN/TURN**: Provide NAT traversal support

## Architecture

```
Participants connect via Gateway WebSocket
          │
          ▼
    ┌─────────────┐
    │   SFU       │
    │  Service    │
    ├─────────────┤
    │ • WebRTC    │
    │   Signaling │
    │ • Media     │
    │   Routing   │
    │ • Track     │
    │   Forwarding│
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │   Redis     │
    │ (ephemeral  │
    │  state)     │
    └─────────────┘
```

## State Management

SFU state is **ephemeral** and stored in Redis:
- Room participant lists
- Track→participant mapping
- ICE connection state
- Active speaker detection

## Configuration

```bash
SFU_PORT=8082
SFU_STUN_SERVER=stun:stun.l.google.com:19302
SFU_TURN_SERVER=turn:your-turn-server.com:3478
SFU_TURN_USERNAME=...
SFU_TURN_CREDENTIAL=...
SFU_REDIS_URL=redis://localhost:6379/0
SFU_MAX_PARTICIPANTS_PER_ROOM=50
```

## Key Features

1. **Meeting Mode**: Full mesh SFU - everyone sends/receives all tracks
2. **Studio Mode**: Host receives all tracks, guests receive host track only
3. **Simulcast**: Multiple quality layers for bandwidth adaptation
4. **Active Speaker**: Server-side voice activity detection
