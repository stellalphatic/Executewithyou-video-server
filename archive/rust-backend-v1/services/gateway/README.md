# ALLSTRM Gateway Service

API Gateway for all ALLSTRM client connections.

## Responsibilities

- **JWT Validation**: Verify tokens from Supabase Auth
- **WebSocket Upgrade**: Handle `/ws` connections and route to appropriate service
- **Rate Limiting**: Per-user and per-IP request throttling
- **Request Routing**: Proxy requests to internal services

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ws` | WebSocket | Main signaling connection |
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/auth/refresh` | POST | Token refresh proxy |

## WebSocket Routing

```
Client connects: wss://api.allstrm.com/ws?token=...&room_id=...&mode=...

Gateway:
1. Validate JWT token
2. Check room exists (allstrm-core)
3. Based on mode:
   - mode=meeting → route to allstrm-sfu
   - mode=studio → route to allstrm-sfu (signaling) + register with allstrm-stream
4. Maintain bidirectional message forwarding
```

## Configuration

```bash
GATEWAY_PORT=8080
GATEWAY_JWT_SECRET=your-jwt-secret
GATEWAY_JWT_AUDIENCE=your-supabase-project
GATEWAY_RATE_LIMIT_RPS=100
GATEWAY_RATE_LIMIT_BURST=200

# Service discovery
CORE_SERVICE_URL=http://allstrm-core:8081
SFU_SERVICE_URL=http://allstrm-sfu:8082
STREAM_SERVICE_URL=http://allstrm-stream:8083
STORAGE_SERVICE_URL=http://allstrm-storage:8084
```

## Building

```bash
cargo build -p allstrm-gateway --release
```

## Running

```bash
cargo run -p allstrm-gateway
```
