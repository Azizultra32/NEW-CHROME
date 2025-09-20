# Acceptance Checklist — AssistMD Extension

Golden path
- Toolbar click opens Side Panel; no console errors.
- Start Recording → mic prompt → live partials < 1 s.
- Voice: say "assist insert plan" → action ≤ 500 ms; no command text in transcript.
- Switch chart mid‑session → insert blocked until confirm → confirm → allowed; boundary marker appears.

Smart Paste V2
- Map PLAN on page (textarea) → Insert succeeds; reports strategy.
- Map PLAN in same‑origin iframe → Insert succeeds into iframe.
- Map PLAN in popup editor → Insert succeeds; if multiple popups open, chooser appears and selection works.

Verify / Remap
- If mapped field missing/not editable → verify blocks insert and prompts to remap.

Export / Import
- Export mappings JSON; clear and Import restores mappings.

Mock backend
- `node server.js` logs: presign requests, ASR WS messages, audit events `insert_ok`, `insert_blocked`, `context_changed`, `patient_confirmed`.

Quick setup
1) `npm ci && npm run build`
2) Load `dist/` in chrome://extensions (Developer Mode).
3) `node server.js`
4) Open `dist/ehr-test.html` and validate page/iframe; open "Plan Popup" and validate popup flow.

