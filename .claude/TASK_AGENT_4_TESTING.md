# AGENT 4: Testing & Documentation (Independent Task)
**Estimated Time**: 30-45 minutes
**Priority**: MEDIUM
**Dependencies**: Wait for Agents 1, 2, 3 to finish

---

## Your Mission
Create comprehensive test plan and update documentation with what's been built.

---

## Pre-Check: Wait for Other Agents

```bash
# Check completion status:
ls -la .claude/AGENT_1_COMPLETE.md
ls -la .claude/AGENT_2_COMPLETE.md
ls -la .claude/AGENT_3_COMPLETE.md

# If any missing, work on what you can or wait
```

---

## Task 1: Create Manual Test Plan

**File**: `.claude/MANUAL_TEST_PLAN.md`

**Contents**:
```markdown
# Manual Test Plan - Ghost Overlay & Compose Features

## Pre-Requisites
- [ ] Extension built (`npm run build` succeeded)
- [ ] Extension loaded in Chrome (chrome://extensions/)
- [ ] EHR test page open (ehr-test.html or allowed host)
- [ ] Side panel open

---

## Test Suite 1: Ghost Preview (Hotkeys)

### Test 1.1: Show Ghost Preview
**Steps**:
1. Open EHR page with at least 2 mapped fields (HPI, Plan)
2. Press **Alt+G**

**Expected**:
- ✅ Ghost overlay appears
- ✅ Red dashed boxes over each mapped field
- ✅ Badges show section names + confidence (e.g., "Plan 90%")
- ✅ Text preview visible inside boxes
- ✅ Boxes fade in smoothly (animation)

**Screenshot**: Save as `.claude/test-screenshots/ghost-preview.png`

### Test 1.2: Clear Ghost Preview
**Steps**:
1. With ghost preview showing (from Test 1.1)
2. Press **Esc**

**Expected**:
- ✅ All ghost boxes disappear
- ✅ Badges disappear
- ✅ EHR page returns to normal

### Test 1.3: Execute Insert (Hotkey)
**Steps**:
1. Press **Alt+G** (show preview)
2. Press **Alt+Enter** (execute)

**Expected**:
- ✅ All mapped sections paste into EHR fields
- ✅ Patient guard triggers if patient mismatch (if enabled)
- ✅ Success toast appears
- ✅ Ghost preview clears automatically

---

## Test Suite 2: Ghost Preview (Buttons)

### Test 2.1: Show Ghost Preview (Button)
**Steps**:
1. Open side panel
2. Scroll to Controls section
3. Click "Preview Insert (ghost)" button

**Expected**:
- ✅ Ghost overlay appears on EHR page
- ✅ Same visual as Alt+G test

### Test 2.2: Clear Ghost Preview (Button)
**Steps**:
1. With ghost preview showing
2. Click "Clear Preview" button in side panel

**Expected**:
- ✅ Ghost overlay disappears

---

## Test Suite 3: Auto-Pair Setting

### Test 3.1: Enable Auto-Pair
**Steps**:
1. Open side panel → Settings → Window Management
2. Toggle "Auto-pair on allowed hosts" ON
3. Close all Chrome windows
4. Open new window with EHR site (e.g., ehr-test.html)

**Expected**:
- ✅ Assistant window auto-opens (magnetized)
- ✅ Floating purple dock shows "Pairing On"

### Test 3.2: Disable Auto-Pair
**Steps**:
1. Toggle "Auto-pair on allowed hosts" OFF
2. Close all Chrome windows
3. Open new window with EHR site

**Expected**:
- ✅ Assistant window does NOT auto-open
- ✅ Floating purple dock shows "Pairing Off"

---

## Test Suite 4: Compose Note

### Test 4.1: Compose Note (Happy Path)
**Steps**:
1. Start recording session (click mic button)
2. Speak some test transcript (e.g., "Patient presents with headache")
3. Stop recording
4. Click "📝 Compose Note (with PHI)" button

**Expected**:
- ✅ Loading indicator (or immediate response)
- ✅ Composed note appears below button
- ✅ 4 sections shown: Subjective, Objective, Assessment, Plan
- ✅ Each section has "Insert" button
- ✅ Close (✕) button works

**Screenshot**: Save as `.claude/test-screenshots/composed-note.png`

### Test 4.2: Insert Composed Section
**Steps**:
1. With composed note showing (from Test 4.1)
2. Click "Insert" button next to SUBJECTIVE section

**Expected**:
- ✅ SUBJECTIVE text pastes into mapped field
- ✅ Patient guard works (if enabled)
- ✅ Success toast

### Test 4.3: Compose Note (No Transcript)
**Steps**:
1. Clear transcript (if any)
2. Try clicking "📝 Compose Note" button

**Expected**:
- ✅ Button is DISABLED (grayed out)
- ✅ Cannot click

---

## Test Suite 5: Confidence Scores

### Test 5.1: High Confidence Badge
**Steps**:
1. Set mapping confidence to 0.90 (manually in storage if needed)
2. Press Alt+G

**Expected**:
- ✅ Badge shows "Plan 90%" (or section name with %)
- ✅ Badge color is normal (blue/green)
- ✅ No pulse animation

### Test 5.2: Low Confidence Badge
**Steps**:
1. Set mapping confidence to 0.75 (manually in storage)
2. Press Alt+G

**Expected**:
- ✅ Badge shows "Plan 75%"
- ✅ Badge color is WARNING RED
- ✅ Badge PULSES (animation)

---

## Test Suite 6: Frame-Aware Positioning

### Test 6.1: Ghost in Iframe
**Steps**:
1. Open EHR page with field inside iframe
2. Map field (framePath should be [0] or similar)
3. Press Alt+G

**Expected**:
- ✅ Ghost box positions correctly OVER iframe field
- ✅ Offset calculation accounts for iframe position

**Screenshot**: Save as `.claude/test-screenshots/iframe-ghost.png`

---

## Test Suite 7: Edge Cases

### Test 7.1: No Mappings Set
**Steps**:
1. Clear all mappings (delete MAP_{host} from storage)
2. Press Alt+G

**Expected**:
- ✅ No ghost boxes appear (or "No mappings" message)
- ✅ No errors in console

### Test 7.2: Scroll During Preview
**Steps**:
1. Press Alt+G (show ghost)
2. Scroll page down/up

**Expected**:
- ✅ Ghost boxes re-render to stay aligned with fields
- ✅ Smooth transition (no flashing)

### Test 7.3: Resize During Preview
**Steps**:
1. Press Alt+G
2. Resize browser window

**Expected**:
- ✅ Ghost boxes re-render to match new field positions

---

## Bug Tracking

**If any test fails, document here**:

### Bug 1: [Title]
- **Test**: Test X.Y
- **Expected**: ...
- **Actual**: ...
- **Console Error**: (paste error message)
- **Screenshot**: (path to screenshot)

---

## Summary

**Tests Passed**: X / Y
**Tests Failed**: Z
**Blockers**: (list critical failures)

**Ready for Production?**: YES / NO / NEEDS FIXES
```

---

## Task 2: Update CHANGELOG.md

**File**: `CHANGELOG.md`
**Add new section**:

```markdown
## v0.2.2 (2025-10-02)

### New Features
- **Ghost Preview Overlay**: Press Alt+G to preview where text will insert
  - Visual red boxes over mapped EHR fields
  - Confidence score badges (e.g., "Plan 90%")
  - Alt+Enter to execute batch insert
  - Esc to clear preview
  - Panel buttons: "Preview Insert (ghost)" and "Clear Preview"

- **Auto-Pair on Allowed Hosts**: New setting to automatically enable window pairing
  - Settings → Window Management → "Auto-pair on allowed hosts"
  - Assistant window auto-opens when visiting EHR sites

- **Compose Note (with PHI)**: Generate complete SOAP note with patient information
  - "📝 Compose Note" button in side panel
  - Displays 4 sections: Subjective, Objective, Assessment, Plan
  - Individual "Insert" buttons per section
  - PHI re-hydration from encrypted storage

### Visual Improvements
- Enhanced ghost overlay styling (gradients, shadows, animations)
- Fade-in animation for ghost boxes (staggered)
- Pulse animation for low-confidence fields (<80%)
- Character count indicator for long text previews
- Improved badge styling with gradients

### Technical Changes
- Frame-aware positioning for ghost overlay (supports iframes)
- PHI encryption/decryption system (AES-GCM)
- Confidence scoring system for field mappings
- Multi-strategy paste verification

### Bug Fixes
- Fixed missing state variables (autoPairOnAllowed)
- Fixed missing apiBase configuration
- Added missing imports for PHI/compose features
```

---

## Task 3: Update README.md

**File**: `README.md`
**Add new section** (after Features section):

```markdown
## 🎯 Ghost Preview System

AssistMD now includes a visual preview system that shows exactly where text will be inserted before executing.

### How to Use:
1. **Show Preview**: Press `Alt+G` or click "Preview Insert (ghost)" button
2. **Review**: Red boxes appear over EHR fields showing what will paste
3. **Execute**: Press `Alt+Enter` or click individual Insert buttons
4. **Clear**: Press `Esc` or click "Clear Preview"

### Visual Indicators:
- **Blue badges**: High confidence (≥80%) - safe to insert
- **Red badges** (pulsing): Low confidence (<80%) - verify manually
- **Character count**: Shows on previews with >100 characters
- **Confidence score**: Displayed as percentage (e.g., "Plan 90%")

### Keyboard Shortcuts:
- `Alt+G` - Toggle ghost preview
- `Alt+Enter` - Execute batch insert (all sections)
- `Esc` - Clear ghost preview

---

## 🧠 Compose Note (PHI Re-hydration)

Generate complete SOAP notes with actual patient information restored.

### How to Use:
1. Record patient encounter (speak transcript)
2. Click "📝 Compose Note (with PHI)" button
3. Review generated note with real patient data
4. Click "Insert" on individual sections (S/O/A/P)

### Security:
- PHI encrypted with AES-GCM before storage
- Encryption keys tied to encounter ID
- Stored in browser IndexedDB (local only)
- Never sent to server in plain text
```

---

## Task 4: Create Quick Start Guide

**File**: `.claude/QUICK_START_GUIDE.md`

```markdown
# Quick Start Guide - New Features

## For Physicians Using AssistMD

### 1. Ghost Preview (Confidence Builder)

**Problem**: "How do I know it's pasting to the right field?"

**Solution**: Ghost Preview shows you BEFORE pasting!

**Steps**:
1. After recording encounter, press `Alt+G`
2. Look at your EHR screen - red boxes appear over fields
3. Check the labels: "HPI", "Plan", "Assessment", etc.
4. Verify text preview looks correct
5. Press `Alt+Enter` to paste everything at once
6. OR press `Esc` and paste manually if unsure

**Visual**:
```
Your EHR Screen:
┌────────────────────────────────┐
│ [HPI 90%]  ← Blue badge        │
│ Patient presents with...       │ ← Preview text
│ (red dashed box)               │
└────────────────────────────────┘
```

---

### 2. Auto-Pair Setting

**Problem**: "I forget to open the assistant window"

**Solution**: Auto-pair opens it automatically!

**Steps**:
1. Open AssistMD side panel
2. Go to Settings → Window Management
3. Toggle ON "Auto-pair on allowed hosts"
4. Next time you open your EHR, assistant window appears automatically

---

### 3. Compose Note

**Problem**: "I want to review the full note with real patient names before pasting"

**Solution**: Compose Note shows complete SOAP note with PHI!

**Steps**:
1. After recording encounter
2. Click "📝 Compose Note (with PHI)"
3. Review all 4 sections:
   - **S**ubjective (what patient said)
   - **O**bjective (vitals, exam findings)
   - **A**ssessment (diagnosis)
   - **P**lan (treatment)
4. Click "Insert" next to each section you want to use
5. OR close and paste manually

---

## For Administrators Configuring AssistMD

### Setting Up Allowed Hosts

**File**: Settings → Allowed Hosts

**Add your EHR domain**:
```
yourehrsystem.hospital.com
```

**Supported EHRs** (auto-detected):
- Epic (epic.com)
- Cerner (cerner.com)
- Athena (athenahealth.com)

---

### Confidence Thresholds

**Recommended Settings**:
- **High confidence** (≥85%): Auto-insert allowed
- **Medium confidence** (70-84%): Require ghost preview
- **Low confidence** (<70%): Require manual paste

**To adjust**: Edit mapping profile in storage, set `confidence` field

---

## Troubleshooting

### Ghost preview doesn't appear
1. Check if mappings are set (Settings → Field Mappings)
2. Try clicking "Preview Insert" button instead of Alt+G
3. Check browser console for errors (F12)

### Assistant window doesn't auto-open
1. Verify "Auto-pair on allowed hosts" is ON
2. Check if EHR domain is in Allowed Hosts list
3. Reload extension (chrome://extensions → reload)

### Compose button is grayed out
- **Cause**: No transcript recorded yet
- **Fix**: Start recording, speak something, then try again

### Low confidence badges (red, pulsing)
- **Cause**: Field mapping is uncertain
- **Fix**: Click field manually to remap with higher confidence
```

---

## Completion Checklist

- [ ] Created MANUAL_TEST_PLAN.md
- [ ] Updated CHANGELOG.md with v0.2.2
- [ ] Updated README.md with new features
- [ ] Created QUICK_START_GUIDE.md
- [ ] All markdown files build correctly (no syntax errors)

---

## Handoff

Create: `.claude/AGENT_4_COMPLETE.md`

**Contents**:
```markdown
# Agent 4 Complete - Testing & Documentation

## Documentation Created:
1. ✅ MANUAL_TEST_PLAN.md (7 test suites, 15+ tests)
2. ✅ Updated CHANGELOG.md (v0.2.2)
3. ✅ Updated README.md (Ghost Preview + Compose sections)
4. ✅ QUICK_START_GUIDE.md (for physicians and admins)

## Test Plan Includes:
- Ghost preview (hotkeys + buttons)
- Auto-pair setting
- Compose note
- Confidence scores
- Frame-aware positioning
- Edge cases (no mappings, scroll, resize)

## Ready for Human Testing:
Human should run through MANUAL_TEST_PLAN.md and report results
```
