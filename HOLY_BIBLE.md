# AssistMD Holy Bible — Chrome Extension Doctrine

## Locked Architecture Ritual
- Use exactly one content script: the compiled `dist/content.js` shipped with the build. No alternate overlays or raw TS/JS assets may be injected.
- Runtime injection is dynamic (`chrome.scripting.executeScript`) against the built package; persistent `<all_urls>` registration is forbidden.
- Manifest, build scripts, and tests must reference built assets under `dist/` only.
- Vitest coverage for popup/overlay flows must import compiled entry points instead of reading source via `fs`/`path`.

## Verification
- Run `openspec validate lock-extension-architecture --strict` and `openspec validate chrome-extension/spec --strict` after architecture edits.
- Execute `npm test` before shipping to ensure 14 files / 112 tests pass; popup coverage stays under `src/popup/_tests_/popup.impl.test.ts` when added.
- Capture a `#assistmd-root` screenshot on `https://example.com` whenever content behavior changes.

## Confession Protocol
- If doctrine is violated, append a Confession describing the deviation, mitigation, and the command output proving guardrails passed.
- Mirror Confessions into MASTER_SPEC.md and onboarding notes so deviations are discoverable.
