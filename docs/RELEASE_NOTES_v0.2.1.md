# AssistMD Extension — Release Notes v0.2.1

## Highlights
- **Granular permissions**: optional host permissions trimmed to HTTPS + localhost and content script injection now respects the mapping allowlist before loading.
- **Window pairing UX**: toggle pairing from the header, track status in real time, and emit telemetry so magnetized windows are easy to monitor.
- **ASR feedback loop**: command strip reflects WebSocket reconnect states, with telemetry for every state change.
- **E2E harness stability**: `npm run test:e2e:chrome` runs the system Chrome channel, keeping Smart Paste and guard scenarios ready for local smoke checks.

## Validation
- `npm run test:unit`
- `npm run test:e2e -- --list`
- `npm run test:e2e:chrome -- --grep "dist build"`
- `npm run build`
- `npm run release:zip`

## Upgrade Notes
- Reinstall the unpacked extension from `dist/` or use the regenerated `assistmd-dist.zip` when loading in Chrome.
- Clear stale optional host permissions in chrome://settings if window pairing fails after updating.
