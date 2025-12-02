# MASTER_SPEC — AssistMD Extension

## Architecture Doctrine
- Canonical content script is `dist/content.js`; background and offscreen documents reference only `dist/` assets.
- Injection is dynamic via `chrome.scripting.executeScript` to avoid legacy `<all_urls>` registrations.
- See Holy Bible (Locked Architecture Ritual) for enforcement steps and Confession protocol.

## Roadmap Link
- Phases 0–7 are defined in `openspec/specs/chrome-extension/roadmap.md` and docs/DEV_PHASE_ROADMAP.md.
- Each phase requires a verification ritual: openspec strict validation, tmux logging, phase-appropriate tests, and screenshot capture when content changes.
- No-legacy-injection doctrine applies across all phases; deviations must be confessed in both Holy Bible and onboarding docs.
