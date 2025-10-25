# Automation Integration Analysis — ChatGPT Patterns vs. AssistMD
Date: 2025-10-02

Summary
- “Anchor Browser” covers two distinct ideas:
  1) Window pairing/magnetization in the client UI (Assistant window anchors to EHR) — already implemented.
  2) Backend automation (headless browser) with semantic discovery, verification, and audit — not part of the current extension; optional future.

This doc maps what we have, what’s valuable to adopt from the automation patterns, and a practical, HIPAA‑aware path to integrate them.

--------------------------------------------------------------------------------
Current State (AssistMD)
- Extension (MV3): Side Panel (React + Tailwind), content scripts, background + offscreen audio.
- Voice → WS streaming → backend → tokenized partials → panel transcript.
- Smart Paste V2: click‑to‑map, multi‑strategy insert, iframe traversal, undo, preview.
- Patient guard: chart fingerprint, confirm before insert; audit hooks.
- PHI controls: backend pseudonymization, rehydrate locally, no raw PHI in logs.

Key files
- Side panel: src/sidepanel/App.tsx
- Insert engine: src/sidepanel/lib/insert.ts
- Content/overlay: content.js
- Background/pairing: src/background/windowPairing.js
- Backend: backend/server.js, backend/openai-realtime.js, backend/phi-redactor.js, backend/audit-logger.js

Recent additions
- Ghost overlay preview and styling polish (frame‑aware, badges, fade‑in)
- Redacted Mode toggle (Alt+R) — hides overlay text previews (demo/screen‑share safe)
- Compose Note UI and per‑section insert
- Auto‑pair state fixed in panel; background respects allowlist auto‑enable
- PHI-safe logging (length/preview only in development)

--------------------------------------------------------------------------------
What “Anchor Browser” Adds (ChatGPT code)
1) Semantic field discovery (labels/ARIA/headings/roles/size) with confidence scoring
2) Ghost overlay previews with confidence badges, hotkeys, and batch execution
3) Paste verification after insert; escalation across strategies; failure evidence
4) Screenshot audit trail (before/after/failed) for compliance and debugging
5) Backend worker (Playwright) for complex flows (popups, multi‑step)
6) EMR adapter YAMLs to encode site‑specific rules; console for ops visibility

--------------------------------------------------------------------------------
Value For Our Use Case (Physician Workflow)
- Immediate patient‑facing value:
  - Ghost overlay preview: trust and safety; confirms mapping before paste.
  - Paste verification: reliability; no silent failures; better UX.
  - Confidence badges: quick signal to verify or remap.

- Medium‑term value:
  - Semantic discovery: reduces initial setup; self‑healing for minor UI changes.
  - Screenshot audit: compliance win and faster debugging.

- Later/conditional value:
  - Backend worker: only when extension can’t handle edge cases (popup‑heavy flows, multi‑page sequences). Adds infra and HIPAA surface area.

--------------------------------------------------------------------------------
HIPAA/Compliance Guardrails (Must Keep)
- Pseudonymize before cloud; rehydrate only in browser.
- No PHI in logs, URLs, or plaintext storage.
- Redacted overlay during screen share or demos (now available via Alt+R or message).
- If adopting workers: self‑host, BAA with cloud provider, encrypt screenshots, retention policy, access logging.

--------------------------------------------------------------------------------
Delta Map — What To Adopt Now vs Later

Adopt Now (Phase 1 — 1–2 weeks)
- Ghost overlay: Already implemented (polish, Alt+G/Enter/Esc; Alt+R redacted mode).
- Paste verification: Add length‑based check + retry/escalation + clean error paths.
- Minor UX polish: preview/clear buttons, target chooser prompts, error toasts.

Adopt Next (Phase 2 — 2–3 weeks)
- Semantic discovery: Heuristics (ARIA/placeholder/headings/role/size) with confidence.
- Screenshot audit (optional): encrypted capture + short retention; gate behind setting.

Adopt Later (Phase 3 — 3–6+ weeks)
- Backend worker: Playwright fallback for complex sites; job queue; artifact storage; minimal ops console.
- EMR adapter YAML: codify site rules; load on host; useful once >3 EHRs supported.

--------------------------------------------------------------------------------
Implementation Sketches

Paste Verification (Phase 1)
- Where: src/sidepanel/lib/insert.ts (after a successful strategy path)
- Verify: read value/innerText; require ≥ 90% of payload length; else escalate strategy → clipboard → fail with reason.
- Logging: no PHI; log lengths and selector only.
- Audit: record verification result; optional screenshot if enabled.

Semantic Discovery (Phase 2)
- Add `src/sidepanel/lib/fieldDiscovery.ts` with:
  - discoverByARIA(label)
  - discoverByPlaceholder(text)
  - discoverByHeading(heading)
  - discoverByRoleSize(role="textbox")
  - traverseIframes breadth‑first; return { selector, framePath, confidence }
- Integrate: on missing/low‑confidence mapping, invoke discovery and show target chooser with ranked candidates.

Screenshot Audit (Phase 2 optional)
- Add `src/background/auditCapture.ts`
- Use `chrome.tabs.captureVisibleTab({format: 'png'})`, encrypt blob client‑side (session key), POST to backend with encounterId.
- Backend: store encrypted; retention 30 days; access logs; redaction pipeline recommended.

Backend Worker (Phase 3)
- Minimal: one endpoint `/automation/jobs`, job schema (steps), single worker process, local artifacts dir.
- Only invoked when extension declares “unreachable” (e.g., modal behind shadow DOM; navigation‑gated flows).

--------------------------------------------------------------------------------
Risks & Mitigations
- PHI exposure via overlay or screenshots → Redacted Mode, encryption, short retention, access logs.
- Heuristic false positives → confidence threshold + visual preview + verify/undo.
- Worker complexity → defer until real‑world blockers appear; start with extension‑only depth.

--------------------------------------------------------------------------------
Concrete Next Steps
1) Paste Verification (extension)
  - Implement verify step after insert, with 90% threshold and strategy escalation.
  - Telemetry: record strategy, selector, latency, verify_success.

2) Discovery Scaffolding
  - Create fieldDiscovery.ts with stubs and one method (discoverByARIA) to begin.
  - Wire into target prompt when field missing or verify fails.

3) Optional Audit Capture Toggle
  - Add Settings toggle (off by default) and stub background receiver.
  - Define simple POST `/v1/audit/screenshot` in backend (store encrypted file).

4) Documentation & Ops
  - Update FEATURE_INVENTORY.md and MASTER_IMPLEMENTATION_CHECKLIST.md statuses as features land.
  - Keep SECURITY_COMPLIANCE.md updated; add screen‑share detection idea backlog item.

--------------------------------------------------------------------------------
Status Snapshot (Today)
- Window pairing: ✅ Built
- Ghost overlay + hotkeys: ✅ Built (polished)
- Redacted Mode: ✅ Built (Alt+R)
- Paste verification: ❌ Missing (next)
- Semantic discovery: ❌ Missing (next)
- Screenshot audit: ❌ Missing (optional next)
- Backend worker: ❌ Missing (defer)

