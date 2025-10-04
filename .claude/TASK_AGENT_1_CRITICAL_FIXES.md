# AGENT 1: Critical Fixes and Build Confidence
Estimated Time: 30–45 minutes
Priority: CRITICAL — unblocks parallel work
Dependencies: None

Mission
Verify and harden the foundations so other agents can iterate safely. Focus on pairing state, compose API base, and build health.

Checklist
1) Auto‑pair on allowed hosts — verify end‑to‑end
- Files: 
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:60, 1860
  - CascadeProjects/windsurf-project/src/background/windowPairing.js:16,60,168
- Steps:
  - Open side panel → Settings → toggle “Auto‑pair on allowed hosts”
  - Add current host to allowlist
  - Activate an EHR tab; confirm assistant window auto‑opens + dock shows status
  - Confirm storage keys in chrome.storage.local: WINDOW_PAIR_AUTO, ALLOWED_HOSTS

2) Compose apiBase — verify load/save and usage
- Files:
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:949, 961, 1771
  - CascadeProjects/windsurf-project/src/sidepanel/lib/note-composer-client.ts:51
- Steps:
  - In Settings, set API Base (e.g., http://localhost:8080)
  - Save and verify stored value (chrome.storage.local.API_BASE)
  - Trigger “Compose Note” and confirm successful POST to /v1/encounters/:id/compose

3) Build and static checks
- Commands:
  - npm run build
  - Inspect dist/ for assets present: manifest.json, background.js, content.js, offscreen.html, offscreen.js, sidepanel.html, assets/sidepanel.js, styles/sidepanel.css, worklet.js
- If errors:
  - Create .claude/BUILD_ERRORS.md with stack, file:line, and proposed fix

4) Types and imports sanity
- Files:
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:18
  - CascadeProjects/windsurf-project/src/sidepanel/lib/note-composer-client.ts:1
- Verify:
  - App imports: composeNote, ComposedNote, extractSectionText; phi utilities
  - ComposedNote interface present and contains sections/flags/metadata
  - extractSectionText present and returns section text (PLAN/HPI/ROS/EXAM; also SOAP mapping if needed)

5) Optional: paste verification scaffold
- Add TODO marker where paste verification will slot in: insert.ts finalize path
- Do not change behavior yet; just leave a comment hook for Agent 3/4

Validation
- Auto‑pair toggle persisted and effective
- Compose success with configured apiBase
- Build succeeds with no errors
- No console errors on side panel open

Deliverables
- .claude/AGENT_1_COMPLETE.md with:
  - Results for auto‑pair verification (on/off, storage values)
  - API base saved and compose tested
  - Build status and sidepanel.js size
  - Any blockers in BUILD_ERRORS.md (if applicable)

