# Lock Extension Architecture

## Requirement
- The AssistMD Chrome extension MUST load a single compiled content script from `dist/content.js`; no alternative injection paths are allowed.
- Background, offscreen, and side panel documents MUST reference assets emitted under `dist/` only; source paths are forbidden in production builds and tests.
- Test harnesses (Vitest/Playwright) MUST import the compiled entry points rather than referencing filesystem helpers such as `fs` or `path`.

## Architecture
- Build pipeline bundles UI and logic into `dist/` with `manifest.json`, `background.js`, `content.js`, `offscreen.html/js`, and `sidepanel.html` referencing `assets/sidepanel.js`.
- Content delivery is centralized: runtime injection uses `content.js` from the extension root after build; popups/overlays use the same compiled artifact and may not ship raw TS/JS variants.
- Documentation and doctrine (Holy Bible, MASTER_SPEC) track this locked architecture and forbid legacy or multi-file content injections.

## Validation
1) `openspec validate lock-extension-architecture --strict` succeeds.
2) Manifest and build scripts reference only `dist/content.js` for content injection paths.
3) Vitest suites import compiled modules (no `fs`/`path` fixture reads for popup/overlay) and are rooted under their scoped directories.
4) Holy Bible includes the architecture ritual and no-legacy-injection doctrine.
