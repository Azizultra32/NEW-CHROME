#!/bin/bash

# assistmd-orchestrator.sh - EMR automation monitoring dashboard for AssistMD
# Real-time monitoring of backend automation workers, job queue, and audit trail
# DOES NOT run workers - only monitors them

# Configuration
SESSION_NAME="assistmd-monitor"
CONFIG_DIR="$HOME/.claude/assistmd"
LOG_DIR="${CONFIG_DIR}/logs"
ARTIFACTS_DIR="${CONFIG_DIR}/artifacts"
QUEUE_DIR="${CONFIG_DIR}/queue"
BACKEND_DIR="$HOME/CODEX-AIEWEB+/CascadeProjects/windsurf-project/backend"

# Create necessary directories
mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$ARTIFACTS_DIR" "$QUEUE_DIR"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/orchestrator.log"
}

# Function to check dependencies
check_dependencies() {
    local missing=()

    command -v tmux &> /dev/null || missing+=("tmux")
    command -v node &> /dev/null || missing+=("node")
    command -v npm &> /dev/null || missing+=("npm")

    if [ ${#missing[@]} -gt 0 ]; then
        echo "❌ Missing dependencies: ${missing[*]}"
        echo "Install with: brew install tmux node"
        exit 1
    fi
}

# Function to count items in directories
count_items() {
    local dir="$1"
    find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '
}

# Function to create monitoring session
create_session() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "⚠️  Monitoring session already exists"
        echo "Use 'attach' to view or 'restart' to recreate"
        return 1
    fi

    echo "🚀 Creating AssistMD monitoring dashboard..."
    log_message "Creating monitoring session"

    # Create session with 6 monitoring panes
    tmux new-session -d -s "$SESSION_NAME" -n "monitor"

    # Split into 2x3 grid
    tmux split-window -t "$SESSION_NAME:monitor" -v -p 50
    tmux split-window -t "$SESSION_NAME:monitor.0" -h -p 66
    tmux split-window -t "$SESSION_NAME:monitor.0" -h -p 50
    tmux split-window -t "$SESSION_NAME:monitor.1" -h -p 66
    tmux split-window -t "$SESSION_NAME:monitor.1" -h -p 50

    # Pane 0: Job Queue Monitor
    tmux send-keys -t "$SESSION_NAME:monitor.0" "watch -n 2 'echo \"═══ JOB QUEUE ═══\" && echo \"\" && echo \"Pending: \$(ls $QUEUE_DIR/pending/*.json 2>/dev/null | wc -l | tr -d \" \")\" && echo \"Processing: \$(ls $QUEUE_DIR/processing/*.json 2>/dev/null | wc -l | tr -d \" \")\" && echo \"Completed: \$(ls $QUEUE_DIR/completed/*.json 2>/dev/null | wc -l | tr -d \" \")\" && echo \"Failed: \$(ls $QUEUE_DIR/failed/*.json 2>/dev/null | wc -l | tr -d \" \")\" && echo \"\" && echo \"Latest:\" && ls -t $QUEUE_DIR/pending/*.json 2>/dev/null | head -3 | xargs -I{} basename {}'" C-m

    # Pane 1: Backend Server Monitor
    tmux send-keys -t "$SESSION_NAME:monitor.1" "watch -n 3 'echo \"═══ BACKEND STATUS ═══\" && echo \"\" && if pgrep -f \"node.*backend/server.js\" > /dev/null; then echo \"🟢 Server: RUNNING (PID: \$(pgrep -f \"node.*backend/server.js\"))\"; else echo \"🔴 Server: STOPPED\"; fi && echo \"\" && if [ -f $LOG_DIR/backend.log ]; then echo \"Recent logs:\" && tail -8 $LOG_DIR/backend.log; else echo \"No logs\"; fi'" C-m

    # Pane 2: Screenshot Audit Monitor
    tmux send-keys -t "$SESSION_NAME:monitor.2" "watch -n 5 'echo \"═══ AUDIT TRAIL ═══\" && echo \"\" && echo \"Screenshots: \$(find $ARTIFACTS_DIR -name \"*.png\" 2>/dev/null | wc -l | tr -d \" \")\" && echo \"Manifests: \$(find $ARTIFACTS_DIR -name \"manifest.json\" 2>/dev/null | wc -l | tr -d \" \")\" && echo \"\" && echo \"Recent artifacts:\" && find $ARTIFACTS_DIR -type f -name \"*.png\" 2>/dev/null | head -5 | xargs -I{} basename {}'" C-m

    # Pane 3: System Health Monitor
    tmux send-keys -t "$SESSION_NAME:monitor.3" "watch -n 2 'echo \"═══ SYSTEM HEALTH ═══\" && echo \"\" && echo \"CPU: \$(top -l 1 | grep \"CPU usage\" | awk \"{print \\\$3}\" || echo \"N/A\")\" && echo \"Memory: \$(top -l 1 | grep PhysMem | awk \"{print \\\$2}\" || echo \"N/A\")\" && echo \"\" && echo \"Playwright processes:\" && pgrep -lf \"playwright|chromium\" | wc -l | xargs -I{} echo \"  {}\"; echo \"\" && echo \"Uptime: \$(uptime | awk -F\"up \" \"{print \\\$2}\" | awk -F\",\" \"{print \\\$1}\")\"'" C-m

    # Pane 4: PHI Protection Monitor
    tmux send-keys -t "$SESSION_NAME:monitor.4" "watch -n 4 'echo \"═══ PHI PROTECTION ═══\" && echo \"\" && if [ -f $LOG_DIR/phi-redactor.log ]; then echo \"Recent redactions:\" && tail -6 $LOG_DIR/phi-redactor.log | grep -E \"NAME|DATE|PHONE|EMAIL\" | sed \"s/^/  /\"; else echo \"No redaction logs\"; fi && echo \"\" && echo \"Validation:\" && if [ -f $LOG_DIR/phi-validation.log ]; then tail -3 $LOG_DIR/phi-validation.log | sed \"s/^/  /\"; else echo \"  No validation logs\"; fi'" C-m

    # Pane 5: Recent Activity Log
    tmux send-keys -t "$SESSION_NAME:monitor.5" "watch -n 2 'echo \"═══ RECENT ACTIVITY ═══\" && echo \"\" && if [ -f $LOG_DIR/orchestrator.log ]; then tail -12 $LOG_DIR/orchestrator.log | sed \"s/^/  /\"; else echo \"  No activity yet\"; fi'" C-m

    echo "✅ Monitoring dashboard created!"
    echo ""
    echo "📊 Dashboard layout:"
    echo "  ┌─────────────┬─────────────┬──────────────┐"
    echo "  │ Job Queue   │ Backend     │ Audit Trail  │"
    echo "  ├─────────────┼─────────────┼──────────────┤"
    echo "  │ System      │ PHI Guard   │ Activity Log │"
    echo "  └─────────────┴─────────────┴──────────────┘"
    echo ""
    echo "Attach with: ./scripts/assistmd-orchestrator.sh attach"
    echo ""
}

# Function to attach to session
attach_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "❌ Session '$SESSION_NAME' does not exist"
        echo "Create it first: ./scripts/assistmd-orchestrator.sh create"
        return 1
    fi

    echo "🔗 Attaching to session: $SESSION_NAME"
    tmux attach-session -t "$SESSION_NAME"
}

# Function to submit automation job
submit_job() {
    local emr="$1"
    local job_file="$2"

    if [ -z "$emr" ] || [ -z "$job_file" ]; then
        echo "Usage: submit <emr> <job-file>"
        echo ""
        echo "Example: submit oscar ./jobs/paste-note.json"
        return 1
    fi

    if [ ! -f "$job_file" ]; then
        echo "❌ Job file not found: $job_file"
        return 1
    fi

    # Determine which worker to use
    local worker="worker-${emr,,}"  # lowercase EMR name

    # Check if worker exists
    if ! tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" 2>/dev/null | grep -q "^${worker}$"; then
        echo "⚠️  Worker '$worker' not found, using coordinator"
        worker="coordinator"
    fi

    local job_id="job_$(date +%Y%m%d_%H%M%S)_${emr}"

    echo "📤 Submitting job: $job_id"
    echo "  EMR: $emr"
    echo "  Worker: $worker"
    echo "  Job file: $job_file"

    log_message "Submitting job $job_id to $worker"

    # Send job to worker (example - adjust based on actual implementation)
    tmux send-keys -t "$SESSION_NAME:$worker" "echo '📥 Received job: $job_id'" C-m
    tmux send-keys -t "$SESSION_NAME:$worker" "node worker.js --job '$job_file' --id '$job_id' --emr '$emr'" C-m

    echo "✅ Job submitted"
}

# Function to show session status
show_status() {
    echo "═══════════════════════════════════════════════"
    echo "  AssistMD Automation Orchestrator Status"
    echo "═══════════════════════════════════════════════"
    echo ""

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "🔴 Status: STOPPED"
        echo ""
        echo "Start with: ./scripts/assistmd-orchestrator.sh create"
        return 1
    fi

    echo "🟢 Status: RUNNING"
    echo "📅 Session: $SESSION_NAME"
    echo ""

    # Show active workers
    echo "👷 Active Workers:"
    tmux list-windows -t "$SESSION_NAME" -F "  #{window_index}: #{window_name} (#{?window_active,ACTIVE,idle})" | sed 's/^/  /'
    echo ""

    # Show recent job activity (last 10 log entries)
    if [ -f "$LOG_DIR/orchestrator.log" ]; then
        echo "📋 Recent Activity:"
        tail -10 "$LOG_DIR/orchestrator.log" | sed 's/^/  /'
        echo ""
    fi

    # Show artifact count
    local artifact_count=$(find "$ARTIFACTS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "📸 Audit artifacts stored: $artifact_count"
    echo ""
}

# Function to monitor specific worker
monitor_worker() {
    local worker="${1:-coordinator}"

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "❌ Session not running"
        return 1
    fi

    if ! tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" | grep -q "^${worker}$"; then
        echo "❌ Worker '$worker' not found"
        return 1
    fi

    echo "🔍 Monitoring worker: $worker (Ctrl+C to stop)"
    echo ""

    while true; do
        clear
        echo "═══════════════════════════════════════════════"
        echo "  Worker Monitor: $worker"
        echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "═══════════════════════════════════════════════"
        echo ""

        # Show last 20 lines of worker output
        tmux capture-pane -t "$SESSION_NAME:$worker" -p | tail -20

        sleep 5
    done
}

# Function to stop session
stop_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "⚠️  Session not running"
        return 0
    fi

    echo -n "⚠️  Stop all automation workers? (y/N): "
    read -r confirm

    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo "🛑 Stopping session..."
        log_message "Stopping orchestration session"

        # Send shutdown message to all workers
        tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" | while read -r worker; do
            tmux send-keys -t "$SESSION_NAME:$worker" "echo '[SHUTDOWN] Graceful shutdown initiated'" C-m
            tmux send-keys -t "$SESSION_NAME:$worker" C-c
        done

        sleep 2
        tmux kill-session -t "$SESSION_NAME"

        echo "✅ Session stopped"
    else
        echo "Cancelled"
    fi
}

# Function to capture all worker outputs (for debugging)
capture_outputs() {
    local output_dir="$ARTIFACTS_DIR/captures/$(date +%Y%m%d_%H%M%S)"

    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "❌ Session not running"
        return 1
    fi

    mkdir -p "$output_dir"
    echo "📸 Capturing worker outputs to: $output_dir"

    tmux list-windows -t "$SESSION_NAME" -F "#{window_name}" | while read -r worker; do
        local output_file="$output_dir/${worker}.txt"
        tmux capture-pane -t "$SESSION_NAME:$worker" -p > "$output_file"
        echo "  ✅ Captured: $worker"
    done

    echo ""
    echo "✅ Capture complete: $output_dir"
}

# Function to show help
show_help() {
    cat << EOF
AssistMD Automation Orchestrator

USAGE:
  $0 <command> [options]

COMMANDS:
  create              Create new orchestration session
  attach              Attach to running session
  status              Show session status
  submit <emr> <file> Submit automation job
  monitor [worker]    Monitor worker output
  stop                Stop orchestration session
  capture             Capture all worker outputs
  help                Show this help

EXAMPLES:
  # Start orchestration
  $0 create

  # Submit a job to paste notes into OSCAR
  $0 submit oscar ./jobs/enc_20251003_0930.json

  # Monitor the OSCAR worker
  $0 monitor worker-oscar

  # Check overall status
  $0 status

CONFIGURATION:
  Workers config: $AGENTS_CONFIG
  Logs:          $LOG_DIR
  Artifacts:     $ARTIFACTS_DIR

EOF
}

# Main script logic
check_dependencies
create_default_config

case "$1" in
    create)
        create_session
        ;;

    attach|a)
        attach_session
        ;;

    status|st)
        show_status
        ;;

    submit)
        submit_job "$2" "$3"
        ;;

    monitor|mon)
        monitor_worker "$2"
        ;;

    stop|kill)
        stop_session
        ;;

    capture|cap)
        capture_outputs
        ;;

    help|--help|-h)
        show_help
        ;;

    *)
        show_help
        exit 1
        ;;
esac
