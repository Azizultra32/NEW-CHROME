# Changelog

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
