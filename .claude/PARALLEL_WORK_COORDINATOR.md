# Parallel Work Coordinator - Multi-Agent Task Distribution

**Created**: 2025-10-02
**Status**: READY TO EXECUTE
**Total Agents**: 4 (+ you with Codex)
**Estimated Total Time**: 30-60 minutes (all working in parallel)

---

## 🎯 Mission Overview

Complete the ghost overlay, auto-pair, and compose note features by distributing work across multiple AI agents working simultaneously.

---

## 📋 Agent Assignments

### **Agent 1: Critical Fixes** ⚠️ **MUST GO FIRST**
- **File**: `.claude/TASK_AGENT_1_CRITICAL_FIXES.md`
- **Time**: 30-45 min
- **Priority**: CRITICAL
- **Dependencies**: None
- **Blocks**: Agent 2 (UI needs these fixes to compile)

**Tasks**:
1. Fix `autoPairOnAllowed` state variable
2. Fix `apiBase` variable
3. Verify build succeeds
4. Fix missing imports
5. Add `extractSectionText` function if missing

**Deliverable**: `.claude/AGENT_1_COMPLETE.md`

---

### **Agent 2: UI Buttons** 🎨
- **File**: `.claude/TASK_AGENT_2_UI_BUTTONS.md`
- **Time**: 30-45 min
- **Priority**: HIGH
- **Dependencies**: Agent 1 must finish first
- **Can Start**: After Agent 1 creates AGENT_1_COMPLETE.md

**Tasks**:
1. Add "Preview Insert (ghost)" button
2. Add "Clear Preview" button
3. Add "📝 Compose Note" button
4. Add composed note display UI (4 sections with insert buttons)

**Deliverable**: `.claude/AGENT_2_COMPLETE.md`

---

### **Agent 3: Ghost Overlay Polish** ✨
- **File**: `.claude/TASK_AGENT_3_GHOST_POLISH.md`
- **Time**: 45-60 min
- **Priority**: MEDIUM-HIGH
- **Dependencies**: None - works in parallel
- **Can Start**: IMMEDIATELY (works on different file than Agent 1)

**Tasks**:
1. Add confidence scores to badges
2. Improve ghost box styling (gradients, shadows)
3. Improve badge styling
4. Add fade-in animation
5. Add pulse effect for low confidence
6. Add character count indicator

**Deliverable**: `.claude/AGENT_3_COMPLETE.md`

---

### **Agent 4: Testing & Documentation** 📝
- **File**: `.claude/TASK_AGENT_4_TESTING.md`
- **Time**: 30-45 min
- **Priority**: MEDIUM
- **Dependencies**: Wait for Agents 1, 2, 3
- **Can Start**: After all other agents finish

**Tasks**:
1. Create MANUAL_TEST_PLAN.md
2. Update CHANGELOG.md with v0.2.2
3. Update README.md with new features
4. Create QUICK_START_GUIDE.md

**Deliverable**: `.claude/AGENT_4_COMPLETE.md`

---

## 🚀 Execution Order

### **Phase 1: Immediate Start** (Parallel)
```
Agent 1 (Critical Fixes) ──┐
                           │
Agent 3 (Ghost Polish) ────┼─→ Working in parallel
                           │   (different files)
```

### **Phase 2: After Agent 1**
```
Agent 1 Complete ──→ Agent 2 (UI Buttons)
```

### **Phase 3: After All**
```
Agent 1 ──┐
Agent 2 ──┼──→ Agent 4 (Testing & Docs)
Agent 3 ──┘
```

---

## 📊 Progress Tracking

### Current Status:
- [ ] Agent 1 started
- [ ] Agent 1 complete
- [ ] Agent 2 started
- [ ] Agent 2 complete
- [ ] Agent 3 started
- [ ] Agent 3 complete
- [ ] Agent 4 started
- [ ] Agent 4 complete

### Completion Files to Check:
```bash
ls -la .claude/AGENT_*_COMPLETE.md
```

**Expected when all done**:
```
AGENT_1_COMPLETE.md
AGENT_2_COMPLETE.md
AGENT_3_COMPLETE.md
AGENT_4_COMPLETE.md
```

---

## 🔧 For Each AI Agent

### When You Start:
1. Read your task file (`.claude/TASK_AGENT_X_*.md`)
2. Check dependencies (wait if needed)
3. Execute tasks in order
4. Create completion file when done

### If You Get Blocked:
1. Create `.claude/AGENT_X_BLOCKERS.md`
2. Document exact error, file, line number
3. Move to next independent task if possible
4. Report blocker for human/other agent to resolve

---

## 🎯 Final Deliverables

When all 4 agents complete:

### Code Changes:
- `src/sidepanel/App.tsx` - State variables, UI buttons, compose logic
- `content.js` - Enhanced ghost overlay with polish
- `CHANGELOG.md` - Updated with v0.2.2
- `README.md` - New features documented

### Documentation:
- `.claude/MANUAL_TEST_PLAN.md` - Complete test suite
- `.claude/QUICK_START_GUIDE.md` - User guide

### Verification:
- Build succeeds (`npm run build`)
- No console errors
- All 4 completion files exist

---

## 🧪 Human Testing Checklist

After all agents complete:

### 1. Build & Load
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project
npm run build
```

Load extension in Chrome:
1. `chrome://extensions/`
2. Load unpacked → select `dist/` folder

### 2. Quick Smoke Test
- [ ] Extension loads without errors
- [ ] Side panel opens
- [ ] "Preview Insert (ghost)" button visible
- [ ] "📝 Compose Note" button visible
- [ ] Settings → "Auto-pair on allowed hosts" toggle visible

### 3. Ghost Preview Test
- [ ] Open EHR test page
- [ ] Press Alt+G
- [ ] Red boxes appear over fields
- [ ] Badges show confidence scores
- [ ] Press Esc to clear

### 4. Full Test
- [ ] Run through `.claude/MANUAL_TEST_PLAN.md`
- [ ] Document any failures

---

## 📞 Communication Between Agents

### Agent 1 → Agent 2:
**Message**: "Build succeeds, state variables fixed, ready for UI work"
**File**: `.claude/AGENT_1_COMPLETE.md`

### Agent 3 → All:
**Message**: "Ghost polish complete, visual enhancements ready"
**File**: `.claude/AGENT_3_COMPLETE.md`

### All → Agent 4:
**Message**: "Code complete, ready for documentation"
**Files**: All AGENT_X_COMPLETE.md files

---

## 🚨 Emergency Protocols

### If Build Breaks:
1. Agent who broke it: create `.claude/BUILD_BROKEN.md`
2. Revert last change: `git diff > last_change.patch && git checkout -- .`
3. Report issue, wait for fix

### If Merge Conflict:
1. Agents working on same file at same time
2. Later agent: create `.claude/MERGE_CONFLICT.md`
3. Human resolves manually

### If Agent Gets Stuck:
1. Document blocker clearly
2. Move to next independent task
3. Don't block other agents

---

## 📈 Success Metrics

**Definition of Done**:
- [x] All 4 agents create completion files
- [x] Build succeeds with no errors
- [x] Extension loads in Chrome
- [x] Alt+G shows ghost preview
- [x] Compose button generates note
- [x] Documentation updated

**Time Target**: 60 minutes (wall clock time, all agents parallel)

**Quality Gate**: Human runs at least 5 tests from MANUAL_TEST_PLAN.md successfully

---

## 🎓 Instructions for Human

### To Start Parallel Work:

**Option 1: Manual Assignment**
```bash
# Open 4 separate Claude Code instances
# Give each one their task file:

# Instance 1:
cat .claude/TASK_AGENT_1_CRITICAL_FIXES.md

# Instance 2 (after 10 min):
cat .claude/TASK_AGENT_2_UI_BUTTONS.md

# Instance 3 (immediately):
cat .claude/TASK_AGENT_3_GHOST_POLISH.md

# Instance 4 (after others finish):
cat .claude/TASK_AGENT_4_TESTING.md
```

**Option 2: Codex Assignment**
- Give Codex all 4 task files
- Ask it to execute Agent 1, 2, 3, 4 in sequence
- Codex can work faster than splitting

**Option 3: Hybrid**
- Codex does Agent 1 + 2 (sequential, same file)
- Claude Code 1 does Agent 3 (parallel, different file)
- Claude Code 2 does Agent 4 (after others)

---

## 📝 Notes

- **Agent 1 & 2 touch same file** (App.tsx) - must be sequential
- **Agent 3 touches different file** (content.js) - can be parallel
- **Agent 4 creates new files** (docs) - can be parallel with 3
- **Best parallelization**: Agent 1 → (Agent 2 + Agent 3) → Agent 4

---

## 🏁 When Complete

Human runs:
```bash
# Check all done:
ls -la .claude/AGENT_*_COMPLETE.md

# Build final:
npm run build

# Load in Chrome and test

# If all works:
git add .
git commit -m "feat: ghost preview, auto-pair, and compose note features

- Ghost overlay with confidence scores and animations
- Auto-pair on allowed hosts setting
- Compose note with PHI re-hydration
- Enhanced visual styling and UX

🤖 Generated with Claude Code (Multi-Agent Build)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

**Ready to execute!** Distribute task files to agents and start parallel work.
