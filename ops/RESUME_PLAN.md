# AssistMD — Recovery & Resume Plan

This document captures the current state, decisions, and next actions so work can resume after a crash or handoff.

## State Snapshot
- Branch: `main` (PR #8 merged)
- Build: `npm run build` produces `dist/`
- Packaged: `assistmd-dist.zip` in project root under `dist/../`

## Features Completed
- Insert reliability: caret-aware inputs/textarea; robust contenteditable; strict disabled/readonly detection
- verifyTarget: detects not_editable for disabled/readonly/aria-readonly
- Multi‑section insert: PLAN/HPI/ROS/EXAM (voice + UI)
- Map any section; popup/page/iframe
- Fallback selectors (mapping.fallbackSelectors[])
- Guard confirm UI + `patient_confirmed` audit
- Transcript persistence; Load/Clear controls
- Templates: editable per section; voice: `template <section>`
- Undo last insert (voice + UI) for value/CE paths
- Feature flags in Settings: Multi/Templates/Undo/Preview-before-insert
- Preview-before-insert dialog (optional)

## How To Validate Quickly
1) `npm start` (mock server on :8080)
2) Load `dist/` in Chrome (Developer mode)
3) Open `dist/ehr-test.html`; test page/iframe; open Plan Popup
4) Try: `assist insert plan`, `assist template plan`, `assist undo`
5) Toggle flags / edit templates / add fallback selectors in Settings

## Disaster Recovery — Settings Backup
- In Side Panel Settings:
  - Use “Backup All Settings” to download `assistmd-backup.json`
  - Use “Restore All” to restore mappings, templates, flags, API base

## Next Actions (Backlog)
- Per-host templates (keyed by host)
- “Remap now” CTA on verify failure flows
- Narrow content script scope (reduce `<all_urls>` usage)
- Acceptance automation for panel actions (playwright + extension harness)

## Commands
```
npm ci
npm run build
npm start   # mock server
```

## Contact Notes
- Mock server logs presign/audit and scripted ASR when `MOCK_SCRIPTED=1`

