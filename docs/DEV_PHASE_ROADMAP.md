# Dev Phase Roadmap & Ritual

## Phase Index
Refer to openspec/specs/chrome-extension/roadmap.md for canonical descriptions of phases 0–7.

## tmux Checklist Pattern
- Open a tmux window per phase: `tmux new-session -s assistmd` then split panes for build, tests, and logs.
- Before coding, note the phase, command, and expected artifact in the pane title (e.g., `renamew phase4-consent`).
- After running each command, paste the output into your checklist and mark ✅/❌.

## Confession Guidance
- If you diverge from doctrine (e.g., temporary extra content script), append a Confession block with: deviation, rationale, mitigation, proof (command output link).
- Mirror the Confession into HOLY_BIBLE.md and MASTER_SPEC.md.

## Paste-Ready Helper
```md
### Phase <N> — <Name>
- Command: `<command run in tmux>`
- Artifact: `<expected file or behavior>`
- Result: ✅/❌ (link to log)
- Confession (if any): <details>
```

## No Legacy Injection Doctrine
All phases must respect the single `dist/content.js` rule; any legacy injection must be confessed and removed before release.
