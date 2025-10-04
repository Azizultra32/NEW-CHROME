# Toolkit Adaptation Plan — Using claude-automation-toolkit Selectively

Path: /Users/ali/Desktop/claude-automation-toolkit
Scope: Shell scripts for agent orchestration, session management, and scheduling.
Intent: Borrow lightweight orchestration where it helps parallel agents; avoid invasive install flows or any changes to extension build/runtime.

What We’ll Use (Safe + Helpful)
- scripts/agent-protocols.sh: Conveniences for running multiple agents with consistent environment variables.
- scripts/schedule_with_note.sh: Cron-like scheduling to capture snapshots/notes for long runs.
- setup-auto-accept.sh (optional): Only if you explicitly want auto-accept flows for scripted prompts; keep disabled by default.

What We Won’t Use (For Now)
- install.sh and package.sh as-is: No global install or PATH pollution in this repo.
- Any script that attempts to modify system-wide shell profiles without review.

How It Fits Our Workflow
- Parallel agents: We already split work into TASK_AGENT_* files. Use the toolkit’s tmux or shell helpers to launch two Claude instances plus Codex in separate panes, each pointed at a task file.
- Session hygiene: Use schedule_with_note.sh or our existing snapshot scripts to append progress notes + timestamps to docs/assistant-transcript/log.jsonl and back up labels.
- Guardrails: No interaction with PHI, backend secrets, or browser storage. These scripts run outside the extension and do not touch runtime code.

Lightweight Commands (Suggested)
- Launch three agents in tmux (example):
  - pane 1: Agent 1 → .claude/TASK_AGENT_1_CRITICAL_FIXES.md
  - pane 2: Agent 2 → .claude/TASK_AGENT_2_UI_BUTTONS.md
  - pane 3: Agent 3 → .claude/TASK_AGENT_3_GHOST_POLISH.md

- Hourly progress snapshot (we already have):
  - node scripts/hourly-snapshot.mjs --anytime
  - Optionally call from schedule_with_note.sh with a brief note

Operational Notes
- Keep toolkit local in Desktop; do not vendor or symlink into this repo.
- If a script needs slight edits, duplicate the snippet into .claude/local-scripts/ to keep provenance clear.
- Avoid auto-accept in production; keep it opt-in for dev-only.

Next Steps
- If you’d like, I can add a tiny .claude/local-scripts/launcher.sh with tmux commands to spin up all three agents pointed at the task files. It won’t require installing anything from the toolkit.
