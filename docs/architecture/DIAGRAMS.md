# ALLSTRM Architecture Diagrams

This document contains architecture diagrams in PlantUML format. You can render these using:
- [PlantUML Online](https://www.plantuml.com/plantuml/uml)
- VS Code PlantUML extension
- IntelliJ IDEA PlantUML plugin

## 1. System Overview

```plantuml
@startuml ALLSTRM_System_Overview
!theme plain

title ALLSTRM Streaming Platform - System Overview

actor "Host" as host
actor "Guest" as guest
actor "Viewer" as viewer

cloud "Frontend (Next.js)" as frontend {
  [Dashboard]
  [Studio]
  [Viewer Page]
}

cloud "ALLSTRM Backend" as backend {
  package "Cloud Services" {
    [Gateway\n:8080] as gateway
    [Core\n:8081] as core
    [Storage\n:8084] as storage
  }

  package "Edge Services" {
    [SFU\n:8082] as sfu
    [Stream\n:8083] as stream
  }
}

database "PostgreSQL" as db
database "Redis" as redis
cloud "Cloudflare R2" as r2

host --> [Studio] : Manage Room
guest --> [Studio] : Join Room
viewer --> [Viewer Page] : Watch HLS

[Dashboard] --> gateway : REST API
[Studio] --> gateway : WebSocket
[Viewer Page] --> stream : HLS Segments

gateway --> core : Proxy
gateway --> sfu : WebSocket Forward
gateway --> storage : Proxy

core --> db : SQL
sfu --> redis : Pub/Sub
stream --> redis : State
storage --> r2 : S3 API

sfu <--> stream : Media Relay

@enduml
```

## 2. Service Architecture

```plantuml
@startuml ALLSTRM_Service_Architecture
!theme plain

title ALLSTRM Microservices Architecture

package "Gateway Service (8080)" as gateway_pkg {
  [Auth Middleware]
  [Rate Limiter]
  [WebSocket Handler]
  [Proxy Router]
}

package "Core Service (8081)" as core_pkg {
  [Room Management]
  [User Management]
  [Organization Management]
  [Destination Management]
  [API Key Management]
}

package "SFU Service (8082)" as sfu_pkg {
  [Peer Connection Manager]
  [Track Router]
  [Signaling Handler]
  [Room Manager]
}

package "Stream Service (8083)" as stream_pkg {
  [FFmpeg Manager]
  [RTMP Handler]
  [HLS Generator]
  [Session Manager]
  [Stats Collector]
}

package "Storage Service (8084)" as storage_pkg {
  [Recording Manager]
  [Presigned URL Generator]
  [Asset Manager]
  [S3 Client]
}

database "PostgreSQL" as db {
  [core schema]
  [stream schema]
  [assets schema]
}

database "Redis" as redis

cloud "Cloudflare R2" as r2

[Auth Middleware] --> [Room Management] : validate
[WebSocket Handler] --> [Signaling Handler] : forward
[Proxy Router] --> [Room Management]
[Proxy Router] --> [Recording Manager]

[Room Management] --> [core schema]
[Session Manager] --> [stream schema]
[Recording Manager] --> [assets schema]

[Peer Connection Manager] --> redis : session state
[FFmpeg Manager] --> redis : job queue
[Track Router] --> [FFmpeg Manager] : media

[S3 Client] --> r2 : upload/download

@enduml
```

## 3. WebRTC Signaling Flow

```plantuml
@startuml WebRTC_Signaling
!theme plain

title WebRTC Connection Flow

participant "Client" as client
participant "Gateway" as gateway
participant "SFU" as sfu
participant "Track Router" as router
participant "Redis" as redis

== Join Room ==
client -> gateway: WS Connect
gateway -> sfu: HTTP POST /join
sfu -> redis: Create session
sfu --> gateway: { participant_id, ice_servers }
gateway --> client: JoinAccepted

== SDP Exchange ==
client -> gateway: WS: SdpOffer
gateway -> sfu: POST /offer
sfu -> sfu: Create PeerConnection
sfu -> router: Register participant
sfu --> gateway: SDP Answer
gateway --> client: WS: SdpAnswer

== ICE Candidates ==
client -> gateway: WS: IceCandidate
gateway -> sfu: POST /ice-candidate
sfu -> sfu: Add ICE candidate
note right: Repeat for each candidate

== Media Flowing ==
client -> sfu: WebRTC Media (UDP)
sfu -> router: RTP Packets
router -> sfu: Forward to subscribers
sfu -> client: WebRTC Media (UDP)

@enduml
```

## 4. Streaming Pipeline

```plantuml
@startuml Streaming_Pipeline
!theme plain

title Media Processing Pipeline

rectangle "Input Sources" {
  [WebRTC Track] as webrtc
  [RTMP Input] as rtmp
  [SRT Input] as srt
}

rectangle "SFU Service" {
  [Track Router] as router
  [Compositor] as compositor
}

rectangle "Stream Service" {
  [FFmpeg Manager] as ffmpeg
  [HLS Generator] as hls
  [RTMP Relay] as relay
}

rectangle "Outputs" {
  [HLS Segments] as segments
  [YouTube] as yt
  [Twitch] as tw
  [Recording] as rec
}

webrtc --> router : RTP
rtmp --> ffmpeg : RTMP
srt --> ffmpeg : SRT

router --> compositor : tracks
compositor --> ffmpeg : composed stream

ffmpeg --> hls : encode
ffmpeg --> relay : copy
ffmpeg --> rec : encode

hls --> segments : .ts files
relay --> yt : RTMP
relay --> tw : RTMP

@enduml
```

## 5. Data Flow

```plantuml
@startuml Data_Flow
!theme plain

title Data Flow Between Services

rectangle "Client Apps" as clients {
  [Web App]
  [Mobile App]
  [OBS/Encoder]
}

rectangle "Gateway" as gw {
  [REST API]
  [WebSocket]
}

rectangle "Services" as services {
  [Core] as core
  [SFU] as sfu
  [Stream] as stream
  [Storage] as storage
}

database "Databases" as dbs {
  [PostgreSQL] as pg
  [Redis] as redis
}

cloud "External" as ext {
  [R2/S3] as r2
  [CDN] as cdn
  [Platforms] as platforms
}

[Web App] --> [REST API] : HTTP
[Web App] --> [WebSocket] : WS
[OBS/Encoder] --> stream : RTMP/SRT

[REST API] --> core : room CRUD
[REST API] --> storage : recordings
[WebSocket] --> sfu : signaling

core --> pg : SQL
sfu --> redis : pub/sub
stream --> redis : state
storage --> r2 : files

stream --> cdn : HLS
stream --> platforms : RTMP

@enduml
```

## 6. Database Schema

```plantuml
@startuml Database_Schema
!theme plain

title Database Schema (Simplified)

package "core schema" {
  entity "users" {
    * id : UUID <<PK>>
    --
    email : VARCHAR
    display_name : VARCHAR
    plan : VARCHAR
  }

  entity "organizations" {
    * id : UUID <<PK>>
    --
    name : VARCHAR
    slug : VARCHAR
    billing_tier : VARCHAR
  }

  entity "rooms" {
    * id : UUID <<PK>>
    --
    organization_id : UUID <<FK>>
    owner_id : UUID
    name : VARCHAR
    mode : VARCHAR
    status : VARCHAR
  }

  entity "room_participants" {
    * id : UUID <<PK>>
    --
    room_id : UUID <<FK>>
    user_id : UUID <<FK>>
    display_name : VARCHAR
    role : VARCHAR
  }
}

package "stream schema" {
  entity "destinations" {
    * id : UUID <<PK>>
    --
    room_id : UUID
    platform : VARCHAR
    rtmp_url : TEXT
    enabled : BOOLEAN
  }

  entity "health_metrics" {
    * room_id : UUID <<PK>>
    --
    input_bitrate_kbps : INT
    destinations_connected : INT
  }
}

package "assets schema" {
  entity "recordings" {
    * id : UUID <<PK>>
    --
    room_id : UUID
    s3_key : VARCHAR
    status : VARCHAR
    duration_seconds : INT
  }

  entity "uploads" {
    * id : UUID <<PK>>
    --
    room_id : UUID
    asset_type : VARCHAR
    s3_key : VARCHAR
  }
}

users ||--o{ room_participants
rooms ||--o{ room_participants
organizations ||--o{ rooms
rooms ||--o{ destinations
rooms ||--o{ recordings

@enduml
```

## 7. Deployment Architecture

```plantuml
@startuml Deployment_Architecture
!theme plain

title Hybrid Deployment Architecture

cloud "Cloud Provider (AWS/GCP/CF)" as cloud {
  node "Load Balancer" as lb

  node "Cloud Services" as cloud_svc {
    [Gateway x3]
    [Core x2]
    [Storage x2]
  }

  database "PostgreSQL" as pg
  database "Redis Cluster" as redis
  storage "R2/S3" as r2
}

cloud "Edge Location 1" as edge1 {
  node "Edge Server" as es1 {
    [SFU]
    [Stream]
    storage "Local SSD" as ssd1
  }
}

cloud "Edge Location 2" as edge2 {
  node "Edge Server" as es2 {
    [SFU]
    [Stream]
    storage "Local SSD" as ssd2
  }
}

cloud "CDN (Cloudflare)" as cdn

actor "Users" as users

users --> cdn : HLS
users --> lb : API/WS
cdn --> es1 : origin pull
cdn --> es2 : origin pull

lb --> [Gateway x3]
[Gateway x3] --> [Core x2]
[Gateway x3] --> [Storage x2]
[Gateway x3] --> es1 : route
[Gateway x3] --> es2 : route

[Core x2] --> pg
[SFU] --> redis
[Stream] --> redis
[Storage x2] --> r2

es1 --> ssd1 : HLS segments
es2 --> ssd2 : HLS segments

@enduml
```

## Rendering Instructions

### Using PlantUML Online

1. Go to https://www.plantuml.com/plantuml/uml
2. Copy the PlantUML code block (including `@startuml` and `@enduml`)
3. Paste and view the rendered diagram

### Using VS Code

1. Install "PlantUML" extension
2. Open this file
3. Press `Alt+D` to preview diagrams

### Export as PNG/SVG

```bash
# Using PlantUML CLI
java -jar plantuml.jar docs/architecture/DIAGRAMS.md -o output/

# Using Docker
docker run -v $(pwd):/data plantuml/plantuml DIAGRAMS.md
```
