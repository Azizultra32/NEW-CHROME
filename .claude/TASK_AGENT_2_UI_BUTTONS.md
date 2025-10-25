# AGENT 2: UI Buttons & Compose Panel Polish
Estimated Time: 30–45 minutes
Priority: HIGH
Dependencies: Agent 1 build must pass

Mission
Ensure the panel controls for Ghost Preview and Compose are present, robust, and user‑friendly. Add small polish and guardrails.

Pre‑check
- Confirm .claude/AGENT_1_COMPLETE.md exists (or proceed if build already passes locally).

Task 1 — Ghost Preview buttons (verify and harden)
- Files:
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2088
- Steps:
  - Ensure two buttons exist: “Preview Insert (ghost)” and “Clear Preview”
  - sendGhostPreview() should compute sections and message content tab with { type: 'GHOST_PREVIEW', sections }
  - Clear Preview button should send { type: 'GHOST_CLEAR' }
  - Add subtle disabled or error feedback if no active content tab found

Example (expected pattern)
```tsx
<button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={sendGhostPreview}>
  Preview Insert (ghost)
</button>
<button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={async () => {
  try { const tab = await getContentTab(); if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_CLEAR' }); } catch {}
}}>
  Clear Preview
</button>
```

Task 2 — Compose Note button (verify and improve UX)
- Files:
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2148
- Steps:
  - Ensure button exists and calls handleComposeNote()
  - Disable button while busy to avoid duplicate requests
  - Add short helper text under the button (“Generate sectioned note; local PHI re‑hydration”) 

Task 3 — Composed note display
- Files:
  - CascadeProjects/windsurf-project/src/sidepanel/App.tsx:2160
- Steps:
  - Ensure composed note sections render with per‑section Insert buttons
  - Add a small “Close”/“Clear” action to dismiss composed output (setComposedNote(null))
  - Trim very long section text to ~800 chars in preview; full text still inserted

Task 4 — Build and verify
- Commands:
  - npm run build
- Checks:
  - dist/assets/sidepanel.js exists and size updated
  - Load extension and verify buttons function without console errors

Deliverables
- .claude/AGENT_2_COMPLETE.md summarizing:
  - Buttons confirmed; added UX polish
  - Build status, sidepanel.js size
  - Any follow‑ups for Agent 3 (overlay polish) or Agent 4 (paste verification)

