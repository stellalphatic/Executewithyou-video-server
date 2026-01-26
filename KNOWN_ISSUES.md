# Known Issues & Backlog

This document tracks non-critical issues that can be fixed later.

---

## Fixed Issues

### Guest Duplicate Bug (FIXED - Jan 25, 2026)
- **Status**: Fixed
- **Description**: When a guest's audio/video track changed (mute/unmute), they would reappear in the waiting room despite being already admitted. This caused hosts to re-admit them, creating duplicate entries on stage.
- **Root Cause**: Event handlers (TrackMuted, TrackUnmuted) had stale closure of `admittedParticipants` state. When `updateParticipants()` was called, it used outdated admitted status.
- **Fix Applied**: 
  1. Added `admittedParticipantsRef` ref to always access current admitted participants set
  2. Updated `convertParticipant` to use ref instead of state closure
  3. Added duplicate check in `handleStageToggle` before adding participants
- **Files Fixed**:
  - `frontend-next/src/hooks/useAllstrmLiveKit.ts`
  - `frontend-next/src/components/Studio.tsx`

---

## Video Processing

### Virtual Background / Blur Not Segmenting Properly
- **Status**: Not Working
- **Description**: Blur and virtual background effects are not properly segmenting the person from the background. Instead of blurring only the background while keeping the person visible, it affects the entire frame.
- **Root Cause**: MediaPipe SelfieSegmentation model may not be loading/initializing correctly, or the segmentation mask is not being applied properly in the WebGL shader.
- **Files Involved**:
  - `frontend-next/src/utils/VideoProcessor.ts`
- **Priority**: Low (can be fixed later)
- **Notes**: 
  - Script loading for MediaPipe was added but segmentation still not working
  - May need to verify CDN is accessible and model files are loading
  - Consider using TensorFlow.js BodyPix as alternative

---

## Branding System

### Branding Features Need Polish
- **Status**: Partially Working
- **Description**: The branding system (logo upload, watermark, overlays, tickers) is functional but needs UI/UX polish and robustness improvements.
- **Root Cause**: Initial implementation focused on structure; edge cases not fully handled.
- **Files Involved**:
  - `frontend-next/src/components/studio/BrandingPanel.tsx`
  - `frontend-next/src/components/studio/OverlayPanel.tsx`
  - `frontend-next/src/components/studio/AllstrmWatermark.tsx`
  - `frontend-next/src/components/studio/DraggableOverlay.tsx`
- **Priority**: Low (cosmetic improvements)
- **Notes**: 
  - Ticker animation may need smoothing
  - Logo upload should support cloud storage integration
  - Overlay positioning could use snap-to-grid

---

## Guest System

### Guests Require User Signup
- **Status**: By Design (Temporary)
- **Description**: Currently, guests must have an ALLSTRM account to join a studio session. Anonymous guest join is not supported yet.
- **Root Cause**: Authentication system only supports registered users. Guest token generation not implemented.
- **Files Involved**:
  - `services/core/src/routes/auth.rs`
  - `frontend-next/src/app/join/[roomId]/page.tsx`
- **Priority**: Medium (impacts user experience)
- **Notes**: 
  - Future: Generate temporary guest tokens with limited permissions
  - Future: Email-based guest verification without full signup
  - For now, share link requires recipient to sign up first

---

## Video Mirroring

### Camera Mirror Inconsistency Between Host and Guest
- **Status**: Needs Investigation
- **Description**: When running host and guest on the same machine, the camera appears mirrored differently on each side. The intent is for local preview to be mirrored (like a mirror) while remote views are un-mirrored. 
- **Root Cause**: CSS transform `scaleX(-1)` combined with inline style zoom was overwriting the mirror. Fixed, but on same-machine testing both see the same physical camera which creates confusing visual.
- **Files Involved**:
  - `frontend-next/src/components/studio/VideoFeed.tsx`
  - `frontend-next/src/components/Studio.tsx`
  - `frontend-next/src/components/GreenRoom/GreenRoom.tsx`
- **Priority**: Low (expected behavior when both are same physical camera)
- **Notes**: 
  - Fixed: inline style now includes both zoom and scaleX(-1) for local feeds
  - This is mostly a "same machine testing" artifact - in production each user has their own camera
  - Local preview should always be mirrored; remote feeds should not be mirrored

---

## Template

### [Issue Title]
- **Status**: Not Working / Partially Working / Needs Investigation
- **Description**: 
- **Root Cause**: 
- **Files Involved**:
- **Priority**: Low / Medium / High
- **Notes**: 

---

---

## Recently Fixed (v4.1.0 - Jan 26, 2026)

### Schema Consolidation
- **Status**: Fixed
- **Description**: Removed duplicate `core.oauth_connections` table, consolidated to `public.oauth_connections` with enhanced security (encrypted tokens)
- **Files Fixed**: `migrations/003_consolidated_all.sql`

### Stream Destinations Schema
- **Status**: Fixed
- **Description**: Removed duplicate `enabled`/`is_enabled` column, added proper FK constraints to `room_id`, `user_id`, `organization_id`
- **Files Fixed**: `migrations/003_consolidated_all.sql`

### Tier Naming Mismatch
- **Status**: Fixed
- **Description**: Added `broadcast` tier to DB schema to match TypeScript `Tier.BROADCAST`
- **Files Fixed**: `migrations/003_consolidated_all.sql`, `frontend-next/src/types/index.ts`

### API Rate Limiting
- **Status**: Implemented
- **Description**: Added in-memory rate limiting to all API routes (token, egress, destinations, rooms)
- **Files Added**: `frontend-next/src/lib/rateLimit.ts`
- **Files Modified**: Token, egress, destinations, rooms API routes

### Error Boundaries
- **Status**: Implemented
- **Description**: Added React Error Boundary component wrapping the entire app
- **Files Added**: `frontend-next/src/components/ErrorBoundary.tsx`
- **Files Modified**: `frontend-next/src/app/providers.tsx`

---

*Last Updated: January 26, 2026*
