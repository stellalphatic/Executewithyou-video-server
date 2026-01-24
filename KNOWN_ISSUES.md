# Known Issues & Backlog

This document tracks non-critical issues that can be fixed later.

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

## Template

### [Issue Title]
- **Status**: Not Working / Partially Working / Needs Investigation
- **Description**: 
- **Root Cause**: 
- **Files Involved**:
- **Priority**: Low / Medium / High
- **Notes**: 

---

*Last Updated: January 24, 2026*
