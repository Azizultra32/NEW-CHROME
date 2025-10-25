# AssistMD Automation & Monitoring Scripts

Two independent orchestration systems for the AssistMD project:

---

## 1. **Project Health Monitor** 🏥

**Purpose:** Monitor code quality, dependencies, build status, and errors

**File:** `project-health-monitor.sh`

### Quick Start

```bash
# Quick health check (no tmux)
./scripts/project-health-monitor.sh quick

# Start monitoring dashboard
./scripts/project-health-monitor.sh create

# Attach to dashboard
./scripts/project-health-monitor.sh attach

# Generate detailed report
./scripts/project-health-monitor.sh report
```

### Dashboard Layout

```
┌──────────────┬──────────────┬──────────────┐
│ Files        │ Dependencies │ TypeScript   │
│ - Critical   │ - npm        │ - Errors     │
│ - Recent     │ - Backend    │ - Warnings   │
├──────────────┼──────────────┼──────────────┤
│ Backend      │ Build Status │ PHI Leaks 🔒 │
│ - Server     │ - dist/      │ - HIPAA      │
│ - .env       │ - Outputs    │ - Git Status │
└──────────────┴──────────────┴──────────────┘
```

### What It Monitors

1. **File Integrity**
   - Critical files (package.json, tsconfig.json, manifest.json, server.js)
   - Missing directories
   - Recent file changes

2. **Dependencies**
   - node_modules existence
   - backend/node_modules
   - Outdated packages (npm outdated)

3. **TypeScript Errors**
   - Runs `tsc --noEmit` every 8 seconds
   - Shows type errors in real-time

4. **Backend Health**
   - Server process status (running/stopped)
   - .env file existence
   - Recent server logs

5. **Build Status**
   - dist/ directory
   - Critical build outputs (manifest.json, background.js, etc.)
   - Build script availability

6. **PHI Leak Detection** ⚠️ **NEW**
   - Scans logs for PHI patterns (SSN, patient names, DOB, MRN)
   - Real-time HIPAA compliance checking
   - Git status for uncommitted changes

---

## 2. **EMR Automation Orchestrator** 🤖

**Purpose:** Monitor backend automation workers (Playwright paste jobs)

**File:** `assistmd-orchestrator.sh`

### Quick Start

```bash
# Create monitoring dashboard
./scripts/assistmd-orchestrator.sh create

# Attach to dashboard
./scripts/assistmd-orchestrator.sh attach

# Submit a paste job
./scripts/assistmd-orchestrator.sh submit oscar ./jobs/enc_123.json

# Check status
./scripts/assistmd-orchestrator.sh status
```

### Dashboard Layout

```
┌─────────────┬─────────────┬──────────────┐
│ Job Queue   │ Backend     │ Audit Trail  │
│ - Pending   │ - Server    │ - Screenshots│
│ - Processing│ - Logs      │ - Manifests  │
├─────────────┼─────────────┼──────────────┤
│ System      │ PHI Guard   │ Activity Log │
│ - CPU/Mem   │ - Redaction │ - Recent     │
│ - Processes │ - Validation│ - Jobs       │
└─────────────┴─────────────┴──────────────┘
```

### What It Monitors

1. **Job Queue**
   - Pending jobs
   - Processing jobs
   - Completed/failed jobs
   - Latest job files

2. **Backend Server**
   - Server process status (PID)
   - Recent backend logs

3. **Screenshot Audit Trail**
   - Screenshot count
   - Manifest files
   - Recent artifacts

4. **System Health**
   - CPU/Memory usage
   - Playwright/Chromium processes
   - System uptime

5. **PHI Protection**
   - Recent redactions (NAME, DATE, PHONE, EMAIL)
   - Validation logs

6. **Activity Log**
   - Recent orchestrator events
   - Job submissions
   - Worker activity

---

## 3. **EMR Worker** (Backend Component)

**Purpose:** Process individual paste jobs for specific EMRs

**File:** `emr-worker.sh`

### Usage

```bash
# Process a single job
WORKER_NAME=worker-oscar EMR_TYPE=oscar \
  ./scripts/emr-worker.sh process ./jobs/enc_20251003_0930.json

# Watch queue continuously
WORKER_NAME=worker-oscar EMR_TYPE=oscar \
  ./scripts/emr-worker.sh watch

# Check worker status
WORKER_NAME=worker-oscar ./scripts/emr-worker.sh status
```

---

## Directory Structure

```
~/.claude/assistmd/
├── monitors/              # Health monitoring data
│   ├── logs/             # Monitor logs
│   └── reports/          # Health reports
├── queue/                # Job queue
│   ├── pending/          # Jobs waiting to run
│   ├── processing/       # Jobs currently running
│   ├── completed/        # Successful jobs
│   └── failed/           # Failed jobs
├── logs/                 # Backend logs
│   ├── orchestrator.log
│   ├── backend.log
│   ├── phi-redactor.log
│   └── phi-validation.log
└── artifacts/            # Audit trail
    └── screenshots/      # Step-by-step screenshots
```

---

## Workflow Example

### Development Workflow

```bash
# 1. Start health monitoring
./scripts/project-health-monitor.sh create

# 2. Work on code...
# (monitors will auto-detect issues)

# 3. Generate health report before committing
./scripts/project-health-monitor.sh report
```

### Automation Workflow

```bash
# 1. Start automation monitoring
./scripts/assistmd-orchestrator.sh create

# 2. Backend workers process jobs
# (submitted via extension or API)

# 3. Monitor in real-time
./scripts/assistmd-orchestrator.sh attach

# 4. Check status
./scripts/assistmd-orchestrator.sh status
```

---

## Key Features

### Independent Sessions

Both orchestrators run in **separate tmux sessions**:
- `assistmd-health` - Project health monitoring
- `assistmd-monitor` - Automation monitoring

They **do not interfere** with each other or any AI Codex orchestration.

### Auto-Refresh

All panes use `watch` to auto-refresh:
- Health monitors: 2-10 second intervals
- Automation monitors: 2-5 second intervals

### No Interference

- ✅ Read-only monitoring (no file changes)
- ✅ Independent tmux sessions
- ✅ Separate log files
- ✅ Won't conflict with AI Codex

---

## Stopping Monitors

```bash
# Stop health monitoring
./scripts/project-health-monitor.sh stop

# Stop automation monitoring
./scripts/assistmd-orchestrator.sh stop
```

---

## Dependencies

Required (install with Homebrew):
```bash
brew install tmux node jq
```

---

## Troubleshooting

### "Session already exists"
```bash
# Option 1: Attach to existing
./scripts/project-health-monitor.sh attach

# Option 2: Restart
tmux kill-session -t assistmd-health
./scripts/project-health-monitor.sh create
```

### "No such session"
```bash
# Create it first
./scripts/project-health-monitor.sh create
```

### Monitors not updating
- Press `Ctrl+C` in the pane, then reattach
- Or restart the session

---

## Integration with AssistMD

These scripts are designed to monitor:

1. **Extension Development**
   - TypeScript errors in src/
   - Build outputs in dist/
   - Missing dependencies

2. **Backend Health**
   - Server running status
   - PHI redaction working
   - Note composition functional

3. **Automation Jobs**
   - Paste job queue status
   - Playwright worker health
   - Screenshot audit trail

They work **alongside** the main AssistMD extension without modifying any code.

---

## Created By

AI-assisted monitoring system for AssistMD project health and automation workflows.
