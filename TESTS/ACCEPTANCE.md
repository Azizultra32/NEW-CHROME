# Acceptance Checklist — AssistMD Extension

Golden path
- Toolbar click opens Side Panel; no console errors.
- Start Recording → mic prompt → live partials < 1 s.
- Voice: say "assist insert plan" → action ≤ 500 ms; no command text in transcript.
- Switch chart mid‑session → insert blocked until confirm → confirm → allowed; boundary marker appears.
 - Voice: say "assist template plan" → template inserted; then "assist undo" → reverts last insert.

Smart Paste V2
- Map PLAN on page (textarea) → Insert succeeds; reports strategy.
- Map PLAN in same‑origin iframe → Insert succeeds into iframe.
- Map PLAN in popup editor → Insert succeeds; if multiple popups open, chooser appears and selection works.
 - Map HPI/ROS/EXAM → Insert succeeds into mapped target for each.

Verify / Remap
- If mapped field missing/not editable → verify blocks insert and prompts to remap.
 - If primary selector missing, fallbackSelectors are tried before failing.
 - "Remap now" CTA opens Map Mode for the requested section.

Export / Import
- Export mappings JSON; clear and Import restores mappings.

Templates
 - Settings → Edit PLAN/HPI/ROS/EXAM template → save; "Load Saved Templates" restores values after reload.
 - Voice: "assist template ros" inserts ROS template; undo reverts.
 - Templates per host: when enabled, keys `TPL_<HOST>_<SECTION>` override global.

Recovery
 - Auto‑backup writes `ASSIST_BACKUP_SNAPSHOT_V1` on changes; transcript included.
 - On fresh profile with snapshot present → banner "Recovery snapshot found" → Restore Now applies settings and transcript.
 - Settings → Recovery → Force Restore Snapshot + Download Latest Snapshot. Cmd/Ctrl+B downloads snapshot.

Safety / Permissions
 - Content script is injected programmatically as needed; no persistent `<all_urls>` content script.
 - Command window suppression prevents command phrases from entering transcript; WS monitor: "partial: suppressed (command window)".

Mock backend
- `node server.js` logs: presign requests, ASR WS messages, audit events `insert_ok`, `insert_blocked`, `context_changed`, `patient_confirmed`.

Quick setup
1) `npm ci && npm run build`
2) Load `dist/` in chrome://extensions (Developer Mode).
3) `node server.js`
4) Open `dist/ehr-test.html` and validate page/iframe; open "Plan Popup" and validate popup flow.
