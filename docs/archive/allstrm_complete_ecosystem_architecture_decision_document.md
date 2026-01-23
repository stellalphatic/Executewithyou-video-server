# ALLSTRM – COMPLETE ECOSYSTEM ARCHITECTURE & DECISION DOCUMENT

> **Status:** Canonical Source of Truth
>
> **Purpose:** This document defines the *entire system*, *all architectural decisions*, *edge cases*, *trade-offs*, and *non-goals* for building the ALLSTRM ecosystem. Any implementation, backend, frontend, AI, or infra work MUST align with this document.

---

## 0. CORE PHILOSOPHY (NON-NEGOTIABLE)

### 0.1 The Prime Law
**Media is created once, then reused infinitely.**

Live → Recording → Clips → Distribution → Analytics

No re-ingestion. No re-sync. No parallel truths.

### 0.2 Authority Rule
There is exactly **one authority per layer**.

If two systems think they are authoritative → architecture is broken.

---

## 1. SYSTEM DECOMPOSITION (WHAT WE ARE BUILDING)

ALLSTRM is **NOT a single app**. It is **6 tightly-coupled systems** with hard boundaries.

| System | Purpose |
|------|-------|
| S1 | Realtime Communication (Zoom-lite) |
| S2 | Live Production Engine (StreamYard++) |
| S3 | Recording & Media Graph |
| S4 | Post-Production (Manual first, AI later) |
| S5 | Visual Identity System |
| S6 | Distribution & Growth |

---

## 2. SYSTEM 1 – REALTIME COMMUNICATION (S1)

### 2.1 Purpose
Human conversation, coordination, prep, backstage.

### 2.2 Characteristics
- Ultra-low latency (<200ms)
- Audio-first
- Ephemeral
- No compositing
- No branding

### 2.3 Authority
**Participants collectively** (no single output authority)

### 2.4 What S1 MUST NOT DO
- Produce public stream
- Record authoritative program
- Apply layouts or branding

### 2.5 Edge Cases
- Participant drops → room continues
- Host disconnects → room persists
- Network jitter → audio prioritized, video degraded

---

## 3. SYSTEM 2 – LIVE PRODUCTION ENGINE (S2)

### 3.1 Purpose
Create the **authoritative program feed**.

### 3.2 Authority Model
**HOST IS KING**

What host sees = what viewers get (WYSIWYG)

### 3.3 Latency Model
- 10–20s acceptable
- Reliability > speed

### 3.4 Responsibilities
- Layout selection
- Scene switching
- Audio mixing
- Overlay application
- Final encoding

### 3.5 Output
- ONE program stream
- ONE recording source
- MANY destinations

### 3.6 Critical Decision
**Audio mixing happens at the HOST (client)** for phase 1.

**Why:**
- Predictability
- WYSIWYG guarantee
- Lower backend complexity

### 3.7 Edge Cases
- Host CPU overload → auto downgrade participant video
- Host bandwidth drop → audio-only fallback
- Scene change mid-sentence → no resync, continuous audio

---

## 4. SYSTEM 3 – RECORDING & MEDIA GRAPH (S3)

### 4.1 Purpose
Persist media and make it reusable.

### 4.2 Recording Types
- Program Recording (mandatory)
- ISO Tracks (optional, tier-based)

### 4.3 Media Graph Model
Every asset references:
- Session ID
- Timeline
- Source

### 4.4 Edge Cases
- Stream crash → partial recording preserved
- Host disconnect → recording finalized

---

## 5. SYSTEM 4 – POST-PRODUCTION (S4)

### 5.1 Phase 1 (NO AI)
- Manual clip selection
- Timeline trimming
- Aspect ratio transforms

### 5.2 Phase 2 (AI – FUTURE)
- Highlights
- Captions
- Titles

### 5.3 Rule
S4 **NEVER** affects live systems.

---

## 6. SYSTEM 5 – VISUAL IDENTITY SYSTEM (S5)

### 6.1 Purpose
Design-as-data.

### 6.2 Assets
- Color palettes
- Fonts
- Lower thirds
- Motion presets

### 6.3 Application Targets
- Live overlays
- Clips
- Thumbnails

### 6.4 Edge Cases
- Missing brand config → fallback theme
- Unsupported font → system default

---

## 7. SYSTEM 6 – DISTRIBUTION & GROWTH (S6)

### 7.1 Purpose
Reach audiences.

### 7.2 Functions
- OAuth platform connections
- Scheduling
- Publishing
- Analytics ingestion

### 7.3 Rule
S6 never touches raw media.

---

## 8. CLIENT vs SERVER RESPONSIBILITY (FINAL)

### Client
- Capture
- Preview
- Layout intent
- Audio mixing (phase 1)
- Encoding (phase 1)

### Server
- State
- Session lifecycle
- Asset storage
- Async processing

### CDN
- Viewer delivery

---

## 9. BANDWIDTH & PERFORMANCE DECISIONS

### Host Limits
| Download | Safe Participants |
|-------|-----------------|
| 20 Mbps | 8–10 |
| 40 Mbps | 15–20 |
| 80 Mbps | 30–40 |

### Safeguards
- Adaptive participant quality
- Audio-first priority
- Hard tier caps

---

## 10. FAILURE MODES & HANDLING

- Participant drop → silent removal
- Host crash → stream ends cleanly
- Destination failure → retry / notify
- Recording failure → partial asset retained

---

## 11. SECURITY & ABUSE

- Invite links with roles
- Host-only destructive actions
- Rate limits on joins

---

## 12. NON-GOALS (IMPORTANT)

Explicitly out of scope:
- Mobile apps (v1)
- Massive scale guarantees
- Edge SFU optimization
- Fully autonomous AI

---

## 13. FUTURE MIGRATIONS (PLANNED)

- Move audio mixing to server
- Move encoding to backend
- Introduce AI post layer
- Add enterprise controls

---

## 14. FINAL STATEMENT (DO NOT DELETE)

> **Live production is authoritative; everything else is derivative.**

Any violation of this rule invalidates the architecture.

