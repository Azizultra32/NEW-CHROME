# Chrome Extension Architecture — Canonical

## Requirement
- Ship a single Chrome extension package where all runtime scripts resolve from `dist/` outputs.
- Restrict content injection to the compiled `dist/content.js` artifact; legacy overlays or multiple content entries are disallowed.
- Testing harnesses reference compiled entry points and keep popup/overlay coverage under dedicated folders without filesystem hacks.

## Architecture
- Build emits `dist/manifest.json`, `background.js`, `content.js`, `offscreen.html`, `offscreen.js`, and `sidepanel.html` that pulls `assets/sidepanel.js`.
- Runtime injection uses `chrome.scripting.executeScript` targeting `content.js` inside the built extension package; no `<all_urls>` persistent registration.
- Documentation stack (Holy Bible, MASTER_SPEC, redundant doctrine) records this locked architecture and the no-legacy-injection ritual.

## Validation
- `openspec validate chrome-extension/spec --strict` passes.
- Manifest/static copy list is constrained to `dist/content.js` as the sole content script export.
- Vitest specs avoid `fs/path` imports for popup/overlay fixtures and import compiled entry modules when needed.
- Holy Bible references the architecture ritual and enforces the doctrine.
