#!/bin/bash
# AssistMD Extension Development Orchestration
# Creates a tmux session with 1 coordinator + 6 worker agents (3x2 layout)

PROJECT_DIR="$(pwd)"
SESSION_NAME="orchestration"

# Kill existing session if it exists
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create new session with main window
tmux new-session -d -s "$SESSION_NAME" -n main

# Create layout: 1 top pane (coordinator) + 6 bottom panes (3x2 workers)
# Split horizontally - coordinator gets 15%, workers get 85%
tmux split-window -t "$SESSION_NAME:main" -v -p 85

# Create the 3x2 grid for workers
# First row of workers
tmux split-window -t "$SESSION_NAME:main.1" -h -p 66
tmux split-window -t "$SESSION_NAME:main.1" -h -p 50

# Second row of workers
tmux select-pane -t "$SESSION_NAME:main.1"
tmux split-window -t "$SESSION_NAME:main.1" -v -p 50
tmux select-pane -t "$SESSION_NAME:main.2"
tmux split-window -t "$SESSION_NAME:main.2" -v -p 50
tmux select-pane -t "$SESSION_NAME:main.3"
tmux split-window -t "$SESSION_NAME:main.3" -v -p 50

# Set up coordinator pane
tmux send-keys -t "$SESSION_NAME:main.0" "clear && echo '╔══════════════════════════════════════╗' && echo '║    ORCHESTRATION COORDINATOR         ║' && echo '╚══════════════════════════════════════╝' && echo ''" C-m

# Label and navigate to project directory for all worker panes
for i in {1..6}; do
    tmux send-keys -t "$SESSION_NAME:main.$i" "cd '$PROJECT_DIR'" C-m
done

# Configure each agent
tmux send-keys -t "$SESSION_NAME:main.1" "echo '[AGENT 1: Build Monitor]' && echo '========================'" C-m
tmux send-keys -t "$SESSION_NAME:main.2" "echo '[AGENT 2: Test Runner]' && echo '====================='" C-m
tmux send-keys -t "$SESSION_NAME:main.3" "echo '[AGENT 3: Server Monitor]' && echo '========================'" C-m
tmux send-keys -t "$SESSION_NAME:main.4" "echo '[AGENT 4: File Watcher]' && echo '======================'" C-m
tmux send-keys -t "$SESSION_NAME:main.5" "echo '[AGENT 5: Git Status]' && echo '==================='" C-m
tmux send-keys -t "$SESSION_NAME:main.6" "echo '[AGENT 6: Logs Monitor]' && echo '======================'" C-m

# Start coordinator status dashboard
tmux send-keys -t "$SESSION_NAME:main.0" "watch -n 1 'echo \"=== ORCHESTRATION STATUS ===\"; echo \"\"; echo \"Workers:\"; echo \"1. Build Monitor - Running\"; echo \"2. Test Runner - Ready\"; echo \"3. Server Monitor - Running\"; echo \"4. File Watcher - Active\"; echo \"5. Git Status - Monitoring\"; echo \"6. Logs Monitor - Watching\"; echo \"\"; echo \"Project: '$PROJECT_DIR'\"; echo \"\"; date'" C-m

# Launch worker processes
# Agent 1: Build Monitor
tmux send-keys -t "$SESSION_NAME:main.1" "npm run build:clean && echo '✓ Build completed successfully!' || echo '✗ Build failed!'" C-m

# Agent 2: Test Runner (ready but not running)
tmux send-keys -t "$SESSION_NAME:main.2" "echo 'Ready to run tests. Execute:' && echo 'RUN_EXTENSION_E2E=true npx playwright test --headed'" C-m

# Agent 3: Mock Server
tmux send-keys -t "$SESSION_NAME:main.3" "npm run start" C-m

# Agent 4: File Watcher
tmux send-keys -t "$SESSION_NAME:main.4" "echo 'Watching src/ directory for changes...' && fswatch -r src/ | while read f; do echo \"[$(date +%H:%M:%S)] Changed: \${f#$PROJECT_DIR/}\"; done" C-m

# Agent 5: Git Status Monitor
tmux send-keys -t "$SESSION_NAME:main.5" "watch -n 2 'git status -s && echo \"\" && git diff --stat'" C-m

# Agent 6: Log Monitor
tmux send-keys -t "$SESSION_NAME:main.6" "echo 'Monitoring logs...' && tail -f supervisor-log.txt 2>/dev/null || (echo 'No log file yet. Will watch when created...' && while [ ! -f supervisor-log.txt ]; do sleep 1; done && tail -f supervisor-log.txt)" C-m

echo "✨ Orchestration session created: $SESSION_NAME"
echo ""
echo "📺 To view the orchestration:"
echo "   tmux attach-session -t $SESSION_NAME"
echo ""
echo "🎮 Navigation:"
echo "   • Ctrl+B then arrow keys - Switch between panes"
echo "   • Ctrl+B then z - Zoom in/out of current pane"
echo "   • Ctrl+B then d - Detach from session"
echo "   • Ctrl+B : kill-session - Stop all agents"
echo ""
echo "🚀 Agents are running:"
echo "   1. Building extension..."
echo "   2. Test runner ready"
echo "   3. Mock server starting..."
echo "   4. File watcher active"
echo "   5. Git status monitoring"
echo "   6. Log monitoring"