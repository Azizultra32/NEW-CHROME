# AssistMD — Oriented TODOs (Short List)

Phase 1 — Quick Wins (Do Now)
- Paste verification in insert.ts
  - After successful insert, read value/innerText; require ≥ 90% of payload length; else escalate or fail.
  - Log lengths only; no PHI; toast clear errors; record telemetry.
- Panel polish already in place (Ghost Preview, Clear Preview, Compose Note). Leave as is.

Phase 2 — Near‑Term
- Semantic discovery scaffolding (fieldDiscovery.ts)
  - Implement discoverByARIA first; then placeholders and headings.
  - Integrate as fallback when mapping is missing or verify fails.
- Optional: Screenshot audit toggle
  - Settings flag; captureVisibleTab → encrypt → POST to backend; 30‑day retention.

Phase 3 — Later (Only if Needed)
- Backend worker (Playwright) for complex popups/multi‑page flows; small job schema + artifacts.
- EMR adapter YAML system after >3 sites.

Compliance/Guardrails
- Keep ENABLE_LOCAL_PHI_REDACTION=true in production (server enforces).
- Use Redacted Mode (Alt+R) for overlays during screen share/demos.
- Never log raw PHI; development logs should be length/preview‑only.

