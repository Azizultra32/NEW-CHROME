# Changelog

## v0.2.2 (2025-10-02)

### New Features
- **Ghost Preview Overlay**: Press Alt+G to preview where text will insert
  - Visual red boxes over mapped EHR fields with text preview
  - Confidence score badges (e.g., "Plan 90%")
  - Alt+Enter to execute batch insert (all sections at once)
  - Esc to clear preview
  - Panel buttons: "Preview Insert (ghost)" and "Clear Preview"

- **Auto-Pair on Allowed Hosts**: New setting to automatically enable window pairing
  - Settings → Window Management → "Auto-pair on allowed hosts"
  - Assistant window auto-opens when visiting EHR sites

- **Compose Note (with PHI)**: Generate complete SOAP note with patient information
  - "📝 Compose Note" button in side panel
  - Displays 4 sections: Subjective, Objective, Assessment, Plan
  - Individual "Insert" buttons per section
  - PHI re-hydration from encrypted storage

### Visual Improvements
- Enhanced ghost overlay styling (gradients, shadows, animations)
- Fade-in animation for ghost boxes (staggered 50ms per box)
- Pulse animation for low-confidence fields (<80%)
- Character count indicator for long text previews (>100 chars)
- Improved badge styling with gradients and confidence percentages

### Technical Changes
- Frame-aware positioning for ghost overlay (supports nested iframes)
- PHI encryption/decryption system (AES-256-GCM)
- Confidence scoring system for field mappings
- Multi-strategy paste with verification
- Session-scoped PHI keys (in-memory only)

### Bug Fixes
- Fixed missing state variables (autoPairOnAllowed, apiBase)
- Fixed missing imports for PHI/compose features
- Improved ghost overlay scroll/resize re-rendering

## v0.2.1
- Tightened Chrome optional permissions and gated content script injection to mapped hosts only
- Added window pairing controls, status telemetry, and ASR command-strip feedback
- Stabilized Playwright harness with Chrome channel launch helper and Smart Paste coverage

## v0.2.0
- Multi‑section insert (PLAN/HPI/ROS/EXAM) via voice and UI
- Templates per section + Undo last insert
- Fallback selectors in mappings; unified insert path (page/iframe/popup)
- Guard confirm UX with `patient_confirmed` audit
- Transcript persistence with Load/Clear
- Recovery: auto‑backup snapshot, startup recovery banner, Force Restore
- Safer permissions: programmatic content script injection; trimmed manifest
- Settings: feature flags, template editor, fallback selectors editor

## v0.1.0
- Initial MV3 extension scaffold (panel, background, content, offscreen)
