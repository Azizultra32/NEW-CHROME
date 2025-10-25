#!/bin/bash
# Claude Code Development Orchestration Template
# Creates a tmux session with 1 coordinator + 6 worker agents (3x2 layout)
# 
# This script can be adapted for any project by modifying the agent commands

# Configuration
PROJECT_DIR="${1:-$(pwd)}"  # Pass project dir as first argument or use current dir
SESSION_NAME="${2:-orchestration}"  # Pass session name as second argument
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# Kill existing session if it exists
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create new session with main window
tmux new-session -d -s "$SESSION_NAME" -n main

# Create layout: 1 top pane (coordinator) + 6 bottom panes (3x2 workers)
tmux split-window -t "$SESSION_NAME:main" -v -p 85

# Create the 3x2 grid for workers
tmux split-window -t "$SESSION_NAME:main.1" -h -p 66
tmux split-window -t "$SESSION_NAME:main.1" -h -p 50
tmux select-pane -t "$SESSION_NAME:main.1"
tmux split-window -t "$SESSION_NAME:main.1" -v -p 50
tmux select-pane -t "$SESSION_NAME:main.2"
tmux split-window -t "$SESSION_NAME:main.2" -v -p 50
tmux select-pane -t "$SESSION_NAME:main.3"
tmux split-window -t "$SESSION_NAME:main.3" -v -p 50

# Function to configure an agent
configure_agent() {
    local pane=$1
    local label=$2
    local command=$3
    
    tmux send-keys -t "$SESSION_NAME:main.$pane" "cd '$PROJECT_DIR'" C-m
    tmux send-keys -t "$SESSION_NAME:main.$pane" "echo -e '\\033[1;36m[$label]\\033[0m'" C-m
    tmux send-keys -t "$SESSION_NAME:main.$pane" "echo '$(printf '=%.0s' {1..40})'" C-m
    if [ -n "$command" ]; then
        tmux send-keys -t "$SESSION_NAME:main.$pane" "$command" C-m
    fi
}

# Set up coordinator
tmux send-keys -t "$SESSION_NAME:main.0" "clear" C-m
tmux send-keys -t "$SESSION_NAME:main.0" "cat << 'EOF'
╔════════════════════════════════════════╗
║      CLAUDE CODE ORCHESTRATION         ║
║          Development Hub               ║
╚════════════════════════════════════════╝
EOF" C-m

# Start coordinator dashboard
tmux send-keys -t "$SESSION_NAME:main.0" "
watch -n 1 -t 'echo -e \"\\033[1;33m=== ORCHESTRATION STATUS ===\\033[0m\"
echo \"\"
echo -e \"\\033[1;32mProject:\\033[0m $PROJECT_NAME\"
echo -e \"\\033[1;32mPath:\\033[0m $PROJECT_DIR\"
echo \"\"
echo -e \"\\033[1;36mActive Agents:\\033[0m\"
echo \"  1. 🔨 Build/Compile Monitor\"
echo \"  2. 🧪 Test Runner\"
echo \"  3. 🌐 Server/Service Monitor\"
echo \"  4. 👁️  File Watcher\"
echo \"  5. 📊 Git Status Tracker\"
echo \"  6. 📜 Log Monitor\"
echo \"\"
echo -e \"\\033[1;35m$(date)\\033[0m\"'" C-m

# Configure agents based on common development patterns
# These commands can be customized per project

# Detect project type and set appropriate commands
if [ -f "$PROJECT_DIR/package.json" ]; then
    # Node.js project detected
    BUILD_CMD="npm run build 2>&1 || npm run compile 2>&1 || echo 'No build script found'"
    TEST_CMD="npm test 2>&1 || echo 'No test script found'"
    SERVER_CMD="npm start 2>&1 || npm run dev 2>&1 || echo 'No start script found'"
    WATCH_CMD="find . -name '*.js' -o -name '*.ts' -o -name '*.jsx' -o -name '*.tsx' | grep -v node_modules | entr -c echo 'Files changed at:' date"
elif [ -f "$PROJECT_DIR/Cargo.toml" ]; then
    # Rust project detected
    BUILD_CMD="cargo build 2>&1"
    TEST_CMD="cargo test 2>&1"
    SERVER_CMD="cargo run 2>&1"
    WATCH_CMD="find . -name '*.rs' | entr -c echo 'Files changed at:' date"
elif [ -f "$PROJECT_DIR/go.mod" ]; then
    # Go project detected
    BUILD_CMD="go build ./... 2>&1"
    TEST_CMD="go test ./... 2>&1"
    SERVER_CMD="go run . 2>&1"
    WATCH_CMD="find . -name '*.go' | entr -c echo 'Files changed at:' date"
else
    # Generic commands
    BUILD_CMD="echo 'Configure build command for your project'"
    TEST_CMD="echo 'Configure test command for your project'"
    SERVER_CMD="echo 'Configure server command for your project'"
    WATCH_CMD="find . -type f -name '*' | grep -v -E '\\.(git|node_modules|target|dist|build)' | head -100 | entr -c echo 'Files changed at:' date"
fi

# Configure each agent
configure_agent 1 "AGENT 1: Build Monitor" "$BUILD_CMD"
configure_agent 2 "AGENT 2: Test Runner" "$TEST_CMD"
configure_agent 3 "AGENT 3: Server Monitor" "$SERVER_CMD"
configure_agent 4 "AGENT 4: File Watcher" "$WATCH_CMD"
configure_agent 5 "AGENT 5: Git Status" "watch -n 2 'git status -s 2>/dev/null || echo \"Not a git repository\"; echo \"\"; git diff --stat 2>/dev/null'"
configure_agent 6 "AGENT 6: Log Monitor" "tail -f *.log 2>/dev/null || echo 'Waiting for log files...'"

# Success message
cat << EOF

✨ Claude Code Orchestration Created Successfully!

📺 To view the orchestration:
   tmux attach-session -t $SESSION_NAME

🎮 Controls:
   • Ctrl+B → arrows     Navigate between panes
   • Ctrl+B → z          Zoom current pane
   • Ctrl+B → d          Detach (keeps running)
   • Ctrl+B → [          Scroll mode (q to exit)
   • Ctrl+B → :          Command mode

💡 Tips:
   • Agents will auto-detect project type (Node/Rust/Go)
   • Customize commands in the script for your project
   • Each agent runs independently
   • Detached sessions persist across terminal closes

🛑 To stop:
   tmux kill-session -t $SESSION_NAME

EOF