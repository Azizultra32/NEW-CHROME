# Master Implementation Checklist - AssistMD Complete Feature Roadmap
Date Created: 2025-10-02
Last Updated: 2025-10-02
Project: AssistMD Chrome Extension (MV3)

Purpose
- Single source of truth to resume work after crashes or context loss
- Aligns multiple agents (Claude x2 + Codex) on scope, status, and next actions
- Mirrors acceptance criteria from AGENTS.md and integrates current code state

Quick Legend
- ✅ Built — implemented and validated
- ⚠️ Partial — implemented but needs testing or polish
- ❌ Missing — not implemented
- 🚫 Blocked — platform limitation

Acceptance Criteria (Golden Path)
- Toolbar icon opens Side Panel without console errors (side panel or popup fallback)
- Start Recording → mic permission → WS partials within 1s
- “assist insert plan” → paste ≤ 500 ms; command audio excluded from transcript
- Wrong-chart guard: block → confirm → allow → audit entry
- Smart Paste V2: click‑to‑map + multi‑strategy insert (textarea + CE + iframe)
Refs: CascadeProjects/windsurf-project/AGENTS.md:1

----------------------------------------------------------------------
Part 1 — Anchor Browser (Window Pairing)
----------------------------------------------------------------------
Core
- Window magnetization: ✅ Built
  - CascadeProjects/windsurf-project/src/background/windowPairing.js:1
- Floating dock on pages (purple): ✅ Built
  - CascadeProjects/windsurf-project/content.js:320
- Auto‑detect EHR sites (Epic/Cerner/Athena + allowlist): ✅ Built
  - CascadeProjects/windsurf-project/src/background/windowPairing.js:118
- Multi‑window pairing: ✅ Built
  - CascadeProjects/windsurf-project/src/background/windowPairing.js:40
- Allowlist of custom hosts (settings): ✅ Built
  - Storage key: ALLOWED_HOSTS
  - UI: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:1728
- Auto‑pair on allowed hosts: ✅ Built (state fixed)
  - App state: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:60
  - Background enable on allowlist: CascadeProjects/windsurf-project/src/background/windowPairing.js:16,60,168
- Peek/Focus visual modes: ⚠️ Partial (CSS overlay)
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:1736
- True always‑on‑top: 🚫 Blocked (native app required)

Validation
- Settings → toggle “Auto‑pair on allowed hosts”, add host to allowlist, open EHR → dock shows, assistant magnetizes.

----------------------------------------------------------------------
Part 2 — Ghost Overlay & Insert System
----------------------------------------------------------------------
Overlay and Hotkeys
- Ghost preview overlay: ✅ Built
  - CascadeProjects/windsurf-project/content.js:172
- Alt+G show preview: ✅ Built
  - CascadeProjects/windsurf-project/content.js:288
- Alt+Enter execute all: ✅ Built
  - CascadeProjects/windsurf-project/content.js:290
- Esc clear preview: ✅ Built
  - CascadeProjects/windsurf-project/content.js:292
- Frame‑aware positioning (iframe offsets): ✅ Built
  - CascadeProjects/windsurf-project/content.js:214
- Visual highlight and labels: ✅ Built
  - CascadeProjects/windsurf-project/content.js:235,240
- Panel ghost buttons: ✅ Built (Preview/Clear)
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2088

Insert Engine
- Multi‑strategy insert (value / execCommand / clipboard): ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/insert.ts:24
- Undo last insert (snapshot): ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/insert.ts:360
- Verify target editable (dry run): ⚠️ Partial
  - CascadeProjects/windsurf-project/src/sidepanel/lib/insert.ts:388

Planned polish
- Confidence badges on overlay: ❌ Missing
- Element‑anchored quick actions: ❌ Missing
- Paste verification (length/echo): ❌ Missing

----------------------------------------------------------------------
Part 3 — PHI Re‑hydration & Compose
----------------------------------------------------------------------
PHI & Compose
- PHI encryption/storage utilities: ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/phi-rehydration.ts:1
- PHI map from backend (message handler): ✅ Built
  - Receive/store: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:236
  - Offscreen sender: CascadeProjects/windsurf-project/offscreen.js:221
- Compose note client: ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/note-composer-client.ts:51
- Compose Note UI button: ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2148
- Local note preview (sections + flags + insert buttons): ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2160
- SOAP/APSO/HPO support (client): ✅ Built (default SOAP)
  - CascadeProjects/windsurf-project/src/sidepanel/lib/note-composer-client.ts:26

Validation
- Start session, speak, click “Compose Note” → sections render, per‑section Insert available; flags visible.

----------------------------------------------------------------------
Part 4 — Field Discovery & Mapping
----------------------------------------------------------------------
Mapping Tools
- Click‑to‑map: ✅ Built (content overlay pick)
  - CascadeProjects/windsurf-project/content.js:92
- Per‑host profiles + fallbacks: ✅ Built
  - UI for fallback selectors: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:1884
- Iframe traversal (framePath): ⚠️ Partial
  - Mapping + insert traverse: content.js:130, insert.ts:241

Planned discovery
- Heuristic discovery (ARIA/placeholder/heading/role): ❌ Missing
- Confidence scoring: ❌ Missing
- Popup auto‑discovery: ❌ Missing

----------------------------------------------------------------------
Part 5 — Insert Verification & Safety
----------------------------------------------------------------------
Guards & Audits
- Wrong‑chart guard flow: ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/guard.ts:1
- Undo last insert: ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/lib/insert.ts:360
- Audit events (mock): ✅ Built
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:137

Planned
- Paste verification (pre/post length): ❌ Missing
- Screenshot audit trail: ❌ Missing
- Element‑anchored insert buttons: ❌ Missing

----------------------------------------------------------------------
Part 6 — Voice & Commands
----------------------------------------------------------------------
Runtime
- “assist …” commands via SR + partial wake: ✅ Built
  - SR: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:1124
  - Partial‑based wake: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:1476
- TTS ducking and self‑trigger prevention: ⚠️ Partial
  - COMMAND_WINDOW mute window: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:596,156
  - TTS monitor pause/resume: CascadeProjects/windsurf-project/src/sidepanel/App.tsx:734

Planned
- Wake word activation: ❌ Missing
- AI voice replies: ❌ Missing
- Conversational queries: ❌ Missing

----------------------------------------------------------------------
Part 7 — Backend & Offscreen
----------------------------------------------------------------------
Offscreen audio capture & WS
- Offscreen mic capture + VAD + chunk streaming: ✅ Built
  - CascadeProjects/windsurf-project/offscreen.js:1
  - Worklet: CascadeProjects/windsurf-project/public/worklet.js:1
- Background presign + reconnect orchestration: ✅ Built
  - CascadeProjects/windsurf-project/background.js:120,176

Backend integration
- Local backend (Armada): ✅ Built
  - CascadeProjects/windsurf-project/backend/server.js:1
  - OpenAI realtime client: CascadeProjects/windsurf-project/backend/openai-realtime.js:1
- Compose endpoint + safety rails + audit: ✅ Built
  - CascadeProjects/windsurf-project/backend/note-composer.js:1
  - CascadeProjects/windsurf-project/backend/safety-rails.js:1

----------------------------------------------------------------------
Critical Items (Do Now)
----------------------------------------------------------------------
1) Verify auto‑pair on allowed hosts end‑to‑end
- Confirm UI toggle persists to storage and background enables pairing automatically
- Files: App.tsx:1860, windowPairing.js:16,60,168

2) Ghost overlay QA (hotkeys + buttons)
- Alt+G/Alt+Enter/Esc flow on EHR + iframe pages
- Buttons in panel: App.tsx:2088

3) Compose integration smoke
- Handle PHI map flow, compose round‑trip, per‑section insert
- Files: App.tsx:510, 2148, 2160

----------------------------------------------------------------------
High Priority (This Week)
----------------------------------------------------------------------
- Confidence score badges on ghost overlay (read from mapping or heuristics)
- Paste verification (length/echo and rollback)
- Element‑anchored quick actions (overlay Insert buttons)
- Peek/Focus mode refinements (opacity presets, keyboard toggle)
- Multi‑iframe/popup traversal QA

----------------------------------------------------------------------
Medium (Next 2 Weeks)
----------------------------------------------------------------------
- Heuristic field discovery (ARIA/placeholder/heading/role) with scoring
- SOAP/APSO/HPO format selector in UI and mapping schemas
- Patient Summary format (optional)

----------------------------------------------------------------------
Low / Future
----------------------------------------------------------------------
- Wake word activation; AI voice replies; conversational queries
- Native companion app for true always‑on‑top
- EMR adapter YAML system if supporting 5+ EHRs

----------------------------------------------------------------------
Testing Checklist
----------------------------------------------------------------------
Build & load
- npm run build → load dist/ in chrome://extensions → no console errors

Pairing
- Add host to allowlist, enable auto‑pair → magnetized assistant appears; dock shows status

Ghost overlay
- Alt+G preview → boxes align, labels visible; Alt+Enter executes; Esc clears
- Panel buttons Preview/Clear work and respect iframes

Compose
- Compose returns sections + flags; per‑section Insert works; guard respected

Paste verification (when implemented)
- Insert mismatch triggers warning/rollback

----------------------------------------------------------------------
Operational Pointers
----------------------------------------------------------------------
- Backend start: backend/server.js → npm start (http://localhost:8080)
- Build extension: npm run build
- Health: curl http://localhost:8080/health
- WS: ws://localhost:8080/asr

----------------------------------------------------------------------
Agent Task Hand‑Off
----------------------------------------------------------------------
Agent 1 — Critical Fixes & Build Confidence
- Verify auto‑pair state & storage round‑trip
- Ensure apiBase loaded/saved in Settings; compose call succeeds
- Run build; document any build errors

Agent 2 — UI Buttons & Compose Panel Polish
- Ensure Ghost Preview and Clear buttons present and robust
- Ensure Compose Note button and composed note panel behave; add close action

Agent 3 — Ghost Overlay Polish
- Confidence badges; improved styling; fade‑in; pulse for low confidence
- Character count indicator; minor layout polish

----------------------------------------------------------------------
Known Issues / Watchlist
----------------------------------------------------------------------
- Optional host permissions are broad in manifest; scope down before release
- Consider additional debounce/guard in content.js for mutation storms
- Add paste verification before GA

----------------------------------------------------------------------
Changelog (Today)
----------------------------------------------------------------------
- Added auto‑pair state in App.tsx
- Authored FEATURE_INVENTORY.md and this master checklist
- Identified polish items for overlay and paste verification

