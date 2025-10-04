#!/bin/bash

# project-health-monitor.sh - AssistMD Project Health Monitoring Orchestrator
# Monitors code quality, dependencies, errors, and missing files
# Runs in its own tmux session, separate from any other orchestration

# Configuration
SESSION_NAME="assistmd-health"
PROJECT_ROOT="$HOME/CODEX-AIEWEB+/CascadeProjects/windsurf-project"
MONITOR_DIR="$HOME/.claude/assistmd/monitors"
LOG_DIR="$MONITOR_DIR/logs"
REPORT_DIR="$MONITOR_DIR/reports"

# Create directories
mkdir -p "$MONITOR_DIR" "$LOG_DIR" "$REPORT_DIR"

# Function to check dependencies
check_dependencies() {
    local missing=()

    command -v tmux &> /dev/null || missing+=("tmux")
    command -v node &> /dev/null || missing+=("node")
    command -v jq &> /dev/null || missing+=("jq")

    if [ ${#missing[@]} -gt 0 ]; then
        echo "❌ Missing dependencies: ${missing[*]}"
        echo "Install with: brew install tmux node jq"
        exit 1
    fi
}

# Function to create monitoring session
create_session() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "⚠️  Health monitoring session already exists"
        echo "Use 'attach' to view or 'restart' to recreate"
        return 1
    fi

    echo "🏥 Creating AssistMD health monitoring dashboard..."
    echo ""

    # Create session with 6 monitoring panes (2x3 grid)
    tmux new-session -d -s "$SESSION_NAME" -n "health"

    # Split into 2x3 grid
    tmux split-window -t "$SESSION_NAME:health" -v -p 50
    tmux split-window -t "$SESSION_NAME:health.0" -h -p 66
    tmux split-window -t "$SESSION_NAME:health.0" -h -p 50
    tmux split-window -t "$SESSION_NAME:health.1" -h -p 66
    tmux split-window -t "$SESSION_NAME:health.1" -h -p 50

    # Pane 0: File Watcher - monitors for missing/broken files
    tmux send-keys -t "$SESSION_NAME:health.0" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.0" "watch -n 5 'echo \"═══ FILE INTEGRITY ═══\" && echo \"\" && echo \"📁 Critical files:\" && for f in package.json tsconfig.json manifest.json backend/server.js; do if [ -f \$f ]; then echo \"  ✅ \$f\"; else echo \"  ❌ MISSING: \$f\"; fi; done && echo \"\" && echo \"📂 Directories:\" && for d in src backend dist; do if [ -d \$d ]; then echo \"  ✅ \$d/\"; else echo \"  ❌ MISSING: \$d/\"; fi; done && echo \"\" && echo \"🔍 Recent changes:\" && find . -name \"*.js\" -o -name \"*.ts\" -o -name \"*.json\" | grep -v node_modules | xargs ls -t | head -5 | sed \"s|./|  |\"'" C-m

    # Pane 1: Dependency Checker - monitors npm/node dependencies
    tmux send-keys -t "$SESSION_NAME:health.1" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.1" "watch -n 10 'echo \"═══ DEPENDENCIES ═══\" && echo \"\" && if [ -f package.json ]; then echo \"📦 package.json: ✅\"; else echo \"📦 package.json: ❌ MISSING\"; fi && echo \"\" && if [ -d node_modules ]; then echo \"📚 node_modules: ✅ (Installed: \$(ls -1 node_modules | wc -l | tr -d \" \"))\"; else echo \"📚 node_modules: ❌ MISSING - Run: npm install\"; fi && echo \"\" && echo \"🔧 Backend deps:\"; if [ -d backend/node_modules ]; then echo \"  ✅ backend/node_modules\"; else echo \"  ❌ backend/node_modules missing\"; fi && echo \"\" && if command -v npm &> /dev/null && [ -f package.json ]; then echo \"⚠️  Outdated packages:\"; npm outdated 2>/dev/null | head -5 | sed \"s/^/  /\" || echo \"  None\"; fi'" C-m

    # Pane 2: TypeScript Error Monitor
    tmux send-keys -t "$SESSION_NAME:health.2" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.2" "watch -n 8 'echo \"═══ TYPE ERRORS ═══\" && echo \"\" && if [ -f tsconfig.json ]; then echo \"Running tsc --noEmit...\" && npx tsc --noEmit 2>&1 | head -15 | sed \"s/^/  /\" || echo \"  ✅ No type errors\"; else echo \"❌ tsconfig.json not found\"; fi'" C-m

    # Pane 3: Backend Health Monitor
    tmux send-keys -t "$SESSION_NAME:health.3" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.3" "watch -n 5 'echo \"═══ BACKEND HEALTH ═══\" && echo \"\" && if pgrep -f \"node.*backend/server.js\" > /dev/null; then echo \"🟢 Server: RUNNING (PID: \$(pgrep -f \"node.*backend/server.js\"))\"; else echo \"🔴 Server: STOPPED\"; fi && echo \"\" && if [ -f backend/.env ]; then echo \"🔐 .env: ✅\"; else echo \"🔐 .env: ❌ MISSING\"; fi && echo \"\" && if [ -f backend/package.json ]; then echo \"📦 Backend modules:\"; if [ -d backend/node_modules ]; then echo \"  ✅ Installed\"; else echo \"  ❌ Run: cd backend && npm install\"; fi; fi && echo \"\" && echo \"📝 Recent backend logs:\"; if [ -f backend/server.log ]; then tail -4 backend/server.log | sed \"s/^/  /\"; else echo \"  No logs\"; fi'" C-m

    # Pane 4: Build Status Monitor
    tmux send-keys -t "$SESSION_NAME:health.4" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.4" "watch -n 10 'echo \"═══ BUILD STATUS ═══\" && echo \"\" && if [ -d dist ]; then echo \"📦 dist/: ✅\"; echo \"  Files: \$(find dist -type f | wc -l | tr -d \" \")\"; echo \"  Size: \$(du -sh dist 2>/dev/null | awk \"{print \\\$1}\")\"; else echo \"📦 dist/: ❌ MISSING - Run: npm run build\"; fi && echo \"\" && echo \"🔧 Critical build outputs:\"; for f in dist/manifest.json dist/background.js dist/content.js dist/sidepanel.html; do if [ -f \$f ]; then echo \"  ✅ \$(basename \$f)\"; else echo \"  ❌ \$(basename \$f)\"; fi; done && echo \"\" && if [ -f package.json ]; then echo \"🏗️  Build script:\"; cat package.json | jq -r \".scripts.build // \\\"❌ No build script\\\"\"; fi'" C-m

    # Pane 5: PHI Leak & Security Monitor
    tmux send-keys -t "$SESSION_NAME:health.5" "cd \"$PROJECT_ROOT\"" C-m
    tmux send-keys -t "$SESSION_NAME:health.5" "watch -n 8 'echo \"═══ PHI LEAK DETECTOR ═══\" && echo \"\" && echo \"🔍 Scanning logs for PHI patterns...\"; LEAKS=0; for pattern in \"SSN\" \"social.security\" \"patient.name\" \"DOB\" \"date.of.birth\" \"MRN.*[0-9]\" \"\\\\b[0-9]{3}-[0-9]{2}-[0-9]{4}\\\\b\"; do COUNT=\$(find . -name \"*.log\" -o -name \"*.txt\" 2>/dev/null | xargs grep -i \"\$pattern\" 2>/dev/null | wc -l | tr -d \" \"); if [ \$COUNT -gt 0 ]; then echo \"  ⚠️  \$pattern: \$COUNT matches\"; LEAKS=\$((LEAKS + COUNT)); fi; done; if [ \$LEAKS -eq 0 ]; then echo \"  ✅ No PHI leaks detected\"; else echo \"\" && echo \"  🚨 TOTAL: \$LEAKS potential PHI leaks\"; fi && echo \"\" && echo \"📊 Git status:\"; git status -s 2>/dev/null | head -5 | sed \"s/^/  /\" || echo \"  Not a git repo\"'" C-m

    echo "✅ Health monitoring dashboard created!"
    echo ""
    echo "📊 Dashboard layout:"
    echo "  ┌──────────────┬──────────────┬──────────────┐"
    echo "  │ Files        │ Dependencies │ TypeScript   │"
    echo "  ├──────────────┼──────────────┼──────────────┤"
    echo "  │ Backend      │ Build Status │ PHI Leaks    │"
    echo "  └──────────────┴──────────────┴──────────────┘"
    echo ""
    echo "🔗 Attach with: $0 attach"
    echo ""
}

# Function to attach to session
attach_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "❌ Health monitoring session not running"
        echo "Create it first: $0 create"
        return 1
    fi

    echo "🔗 Attaching to health monitoring dashboard..."
    tmux attach-session -t "$SESSION_NAME"
}

# Function to generate health report
generate_report() {
    local report_file="$REPORT_DIR/health_$(date +%Y%m%d_%H%M%S).txt"

    echo "📋 Generating health report..."
    echo ""

    cd "$PROJECT_ROOT" || exit 1

    {
        echo "═══════════════════════════════════════════════"
        echo "  AssistMD Project Health Report"
        echo "  Generated: $(date)"
        echo "═══════════════════════════════════════════════"
        echo ""

        echo "1. FILE INTEGRITY"
        echo "   ---------------"
        local missing_files=0
        for f in package.json tsconfig.json dist/manifest.json backend/server.js; do
            if [ -f "$f" ]; then
                echo "   ✅ $f"
            else
                echo "   ❌ MISSING: $f"
                ((missing_files++))
            fi
        done
        echo "   Missing: $missing_files files"
        echo ""

        echo "2. DEPENDENCIES"
        echo "   -------------"
        if [ -d node_modules ]; then
            echo "   ✅ node_modules ($(ls -1 node_modules | wc -l | tr -d ' ') packages)"
        else
            echo "   ❌ node_modules missing"
        fi

        if [ -d backend/node_modules ]; then
            echo "   ✅ backend/node_modules"
        else
            echo "   ❌ backend/node_modules missing"
        fi
        echo ""

        echo "3. BUILD STATUS"
        echo "   -------------"
        if [ -d dist ]; then
            echo "   ✅ dist/ exists ($(find dist -type f | wc -l | tr -d ' ') files)"
        else
            echo "   ❌ dist/ missing - build required"
        fi
        echo ""

        echo "4. BACKEND STATUS"
        echo "   ---------------"
        if pgrep -f "node.*backend/server.js" > /dev/null; then
            echo "   🟢 Server RUNNING (PID: $(pgrep -f 'node.*backend/server.js'))"
        else
            echo "   🔴 Server STOPPED"
        fi

        if [ -f backend/.env ]; then
            echo "   ✅ backend/.env exists"
        else
            echo "   ❌ backend/.env missing"
        fi
        echo ""

        echo "5. TYPE ERRORS"
        echo "   ------------"
        if command -v npx &> /dev/null && [ -f tsconfig.json ]; then
            npx tsc --noEmit 2>&1 | head -10 | sed 's/^/   /'
        else
            echo "   ⚠️  Cannot check (tsc not available)"
        fi
        echo ""

        echo "6. GIT STATUS"
        echo "   -----------"
        git status -s | head -10 | sed 's/^/   /' || echo "   Not a git repo"
        echo ""

        echo "═══════════════════════════════════════════════"
        echo "  End of Report"
        echo "═══════════════════════════════════════════════"

    } | tee "$report_file"

    echo ""
    echo "✅ Report saved to: $report_file"
}

# Function to run quick health check (without tmux)
quick_check() {
    echo "🏥 Running quick health check..."
    echo ""

    cd "$PROJECT_ROOT" || exit 1

    local issues=0

    # Check critical files
    echo "📁 Critical files:"
    for f in package.json tsconfig.json dist/manifest.json backend/server.js; do
        if [ -f "$f" ]; then
            echo "  ✅ $f"
        else
            echo "  ❌ MISSING: $f"
            ((issues++))
        fi
    done
    echo ""

    # Check dependencies
    echo "📦 Dependencies:"
    if [ -d node_modules ]; then
        echo "  ✅ node_modules"
    else
        echo "  ❌ node_modules missing"
        ((issues++))
    fi

    if [ -d backend/node_modules ]; then
        echo "  ✅ backend/node_modules"
    else
        echo "  ❌ backend/node_modules missing"
        ((issues++))
    fi
    echo ""

    # Check backend
    echo "🔧 Backend:"
    if pgrep -f "node.*backend/server.js" > /dev/null; then
        echo "  🟢 Server RUNNING"
    else
        echo "  🔴 Server STOPPED"
    fi

    if [ -f backend/.env ]; then
        echo "  ✅ .env exists"
    else
        echo "  ❌ .env missing"
        ((issues++))
    fi
    echo ""

    # Summary
    echo "═══════════════════════════════════════════════"
    if [ $issues -eq 0 ]; then
        echo "✅ All checks passed!"
    else
        echo "⚠️  Found $issues issue(s)"
    fi
    echo "═══════════════════════════════════════════════"
}

# Function to stop monitoring
stop_session() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "⚠️  Monitoring session not running"
        return 0
    fi

    echo -n "⚠️  Stop health monitoring? (y/N): "
    read -r confirm

    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo "🛑 Stopping health monitoring..."
        tmux kill-session -t "$SESSION_NAME"
        echo "✅ Stopped"
    else
        echo "Cancelled"
    fi
}

# Function to show help
show_help() {
    cat << EOF
AssistMD Project Health Monitor

DESCRIPTION:
  Monitors the AssistMD project for:
  - Missing or broken files
  - Dependency issues
  - TypeScript errors
  - Backend health
  - Build status
  - Git changes

USAGE:
  $0 <command>

COMMANDS:
  create      Create monitoring dashboard (tmux session)
  attach      Attach to running dashboard
  quick       Run quick health check (no tmux)
  report      Generate detailed health report
  stop        Stop monitoring dashboard
  help        Show this help

EXAMPLES:
  # Start monitoring dashboard
  $0 create

  # Quick health check
  $0 quick

  # Generate report
  $0 report

CONFIGURATION:
  Project root:  $PROJECT_ROOT
  Monitor dir:   $MONITOR_DIR
  Reports:       $REPORT_DIR

EOF
}

# Main script logic
check_dependencies

case "$1" in
    create)
        create_session
        ;;

    attach|a)
        attach_session
        ;;

    quick|q)
        quick_check
        ;;

    report|r)
        generate_report
        ;;

    stop|kill)
        stop_session
        ;;

    help|--help|-h|"")
        show_help
        ;;

    *)
        echo "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
