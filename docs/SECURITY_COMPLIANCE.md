# AssistMD Security & Compliance Guidelines

This document summarizes mandatory controls and safe patterns for handling PHI under HIPAA/PIPEDA.

## Core Principles
- Minimize PHI exposure. Keep PHI strictly within your controlled infrastructure.
- Never log raw PHI (server or browser). Prefer counts/lengths or pseudonymized previews during development only.
- No PHI in URLs, analytics, third‑party tools, or unencrypted storage.
- Prefer pseudonymization before cloud API calls. Re‑hydrate only in the clinician’s browser.

## Mandatory Controls
- Transport encryption: TLS for all network paths to backend and providers.
- PHI pseudonymization: `ENABLE_LOCAL_PHI_REDACTION=true` so only tokenized text leaves your backend.
- PHI map encryption: Encrypt mapping tables at rest; store keys safely; re‑hydrate only locally.
- Audit logging: Tamper‑evident logs (HMAC). Retention policy ≥ 7 years (HIPAA).
- Access controls: Per‑user authN/Z. No shared credentials.
- Data lifecycle: Define retention and automated deletion for logs, screenshots, artifacts.

## Prohibited Patterns (and Safe Alternatives)
1) Raw PHI to third‑party APIs
- Don’t: Send patient names, MRNs, DOB, etc. to any vendor without BAA.
- Do: Tokenize on backend; send only tokenized transcripts. Keep PHI map internal.

2) PHI in logs or screenshots
- Don’t: `console.log('transcript:', text)`; store screenshots unencrypted.
- Do: Log only counts/lengths in development; encrypt screenshots before upload; short lifecycle.

3) PHI in URLs or query parameters
- Don’t: `/note?patient=John+Doe&mrn=12345`.
- Do: Use POST with opaque IDs; resolve PHI server‑side under auth.

4) Browser storage of PHI
- Don’t: Persist PHI in `chrome.storage` or `localStorage`.
- Do: Keep PHI in memory only; if persistence needed, encrypt and limit lifetime.

## OpenAI / LLM Providers
- Require BAA before production use.
- Enforce zero‑retention/no training.
- Even tokenized data may include sensitive clinical content; treat as regulated unless de‑identified under HIPAA safe harbor or expert determination.

## Extension‑Specific Guidance
- Ghost overlay runs locally; avoid exposing PHI during screen sharing. Consider redacted overlay mode when screen sharing or conferencing is detected.
- Do not log dictation/transcripts in browser console. Development logs should print lengths only.
- Avoid storing re‑hydrated PHI in `chrome.storage`. Keep PHI map keys in memory.

## Backend‑Specific Guidance
- Avoid logging raw transcripts. Log pseudonymized previews only in development, or lengths.
- Keep pseudonymization enabled by default in production. Fail‑closed if misconfigured.
- No PHI in server access logs, reverse proxy logs, or APM.

## Compliance Checklist (Quick)
- [ ] TLS everywhere
- [ ] ENABLE_LOCAL_PHI_REDACTION=true
- [ ] No PHI in logs (server/browser)
- [ ] No PHI in URLs
- [ ] Audit logs HMAC + retention policy
- [ ] BAA with OpenAI (or keep models on‑prem)
- [ ] PHI map encrypted at rest; browser re‑hydrate only
- [ ] Screen‑sharing redaction plan for overlays

## Ops — Retention & Integrity Cron

Add daily jobs on the backend host to enforce retention and check audit integrity.

Example crontab:

```
# Cleanup encrypted audit screenshots older than 30 days
0 2 * * * npm --prefix /path/to/CascadeProjects/windsurf-project/backend run cleanup:audit

# Verify audit log integrity (alerts on nonzero exit)
30 2 * * * npm --prefix /path/to/CascadeProjects/windsurf-project/backend run verify:audit || echo 'ALERT: audit integrity failed' | logger
```

Environment:
- `AUDIT_RETENTION_DAYS` (optional) to override 30-day default for cleanup.

## Notes
- Pseudonymization is reversible; treat tokenized text as PHI unless assured recipient cannot re‑identify and content is de‑identified per HIPAA.
