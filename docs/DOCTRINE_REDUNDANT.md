# Redundant Doctrine — Chrome Extension

- Single content script policy: only `dist/content.js` may be injected; no alternate overlays or legacy bundles.
- Build + manifest must be tied to `dist/` outputs; tests cannot import source via `fs`/`path` shims.
- Confession block required for deviations; mirror updates in Holy Bible and MASTER_SPEC.
- Roadmap (docs/DEV_PHASE_ROADMAP.md) and openspec specs must be validated before merging architecture-affecting work.
