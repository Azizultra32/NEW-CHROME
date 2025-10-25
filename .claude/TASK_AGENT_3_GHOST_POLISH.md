# AGENT 3: Ghost Overlay Polish
Estimated Time: 45–60 minutes
Priority: MEDIUM‑HIGH
Dependencies: None (can work in parallel)

Mission
Improve the ghost overlay’s visual clarity and add confidence signaling, while keeping the code lightweight and content‑script‑safe.

Scope
- All changes in CascadeProjects/windsurf-project/content.js (no new assets)

Task 1 — Confidence badges
- Add a confidence parameter to drawGhostFor(el, label, text, framePath, badgeColor, confidence = 0.90)
- Render badge text as: `${label} ${(confidence * 100).toFixed(0)}%`
- In renderGhostPreview(), read mapping.confidence || 0.90 and pass to drawGhostFor()
- Files:
  - content.js:235 (drawGhostFor)
  - content.js:262 (renderGhostPreview loop)

Task 2 — Styling upgrades
- Box: slightly thicker dashed border, subtle gradient, blur, shadow, transitions
- Badge: gradient from base to darker shade; thicker shadow; small border; bold text
- Add helper adjustColor(hex, amount) near overlay helpers for gradient end color

Suggested changes (inline styles)
```js
function adjustColor(color, amount) {
  const hex = color.replace('#','');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount));
  return `#${(r<<16|g<<8|b).toString(16).padStart(6,'0')}`;
}
```

Task 3 — Fade‑in animation
- After drawing all boxes in renderGhostPreview, use requestAnimationFrame to set initial opacity/scale, then transition to full
- Stagger 50ms between nodes for a subtle cascade

Task 4 — Pulse on low confidence
- If confidence < 0.80, set badge.style.animation = 'pulse-warning 2s ease-in-out infinite'
- Inject a single <style id="__assist_ghost_styles"> with @keyframes pulse-warning if not present
- Use warning red gradient for badge background in this case

Task 5 — Text preview enhancements
- Append ‘…’ to truncated text previews
- Add a small bottom‑right chip showing character count for previews over 100 chars

Constraints
- Do not add external CSS; keep styles inline and safe for arbitrary pages
- Preserve pointerEvents: 'none' on overlay nodes (non‑interactive)
- Keep overlay creation/removal idempotent (clearGhostOverlay())

Build and Validation
- npm run build → no errors
- Manual: load dist/, map fields, press Alt+G → verify:
  - Badges show confidence percent
  - Boxes look cleaner and fade‑in
  - Low confidence pulses
  - Character count chip renders on long text

Deliverables
- .claude/AGENT_3_COMPLETE.md with screenshots or notes and any edge cases found (iframes, scroll, zoom)

