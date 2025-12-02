# Chrome Extension Phase Roadmap

## Phases
- **Phase 0 — Build & Static Audit:** manifest hygiene, dist asset verification, and linting.
- **Phase 1 — Panel Runtime:** side panel mount, Tailwind skin, toolbar action wiring.
- **Phase 2 — Capture:** offscreen audio capture, VAD chunking, mic permission flows.
- **Phase 3 — Streaming:** WebSocket handshake, partial transcript latency < 1s, suppression window for commands.
- **Phase 4 — Safety:** patient guardrails, wrong-chart prevention, consent gating.
- **Phase 5 — Smart Paste V2:** mapping, iframe/popup coverage, template and undo flows.
- **Phase 6 — Observability:** audit logs, telemetry export, health checks.
- **Phase 7 — LLM Integration:** E2E transcript enrichment, consent-aware tasks, helper mocks for ASR/LLM.

## Verification Ritual
1) Run `openspec validate chrome-extension/roadmap --strict` to verify scope coverage.
2) For each phase, record the tmux pane, command, and expected artifact in a checklist before coding.
3) Execute the matching test suite (unit/Vitest for phase work; Playwright for Smart Paste) and log the command next to the checklist item.
4) Capture and archive one `#assistmd-root` screenshot per release when content script behavior changes.

## Confession Block
- If deviation from doctrine is required, append a "Confession" note detailing what was changed, why it was unavoidable, and which test or tmux pane proves mitigation.
- Confessions must be mirrored in the Holy Bible and MASTER_SPEC and linked from the onboarding doc.
