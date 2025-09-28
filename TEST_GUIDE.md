# Quick Test Guide - Voice Recognition Fixes

## Current Status
- **Branch**: `feat/allowlist-and-mapping-test`  
- **Voice Fixes**: Committed and pushed to GitHub
- **Build**: Successfully compiled to `dist/` folder

## Manual Testing (Recommended)

Since Playwright is having Chrome launch issues, here's how to manually test the voice fixes:

### 1. Load Extension in Chrome
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `dist/` folder from:
   ```
   /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project/dist
   ```

### 2. Test Voice Commands
1. Open any webpage (e.g., https://example.com)
2. Click the extension icon in toolbar
3. Open the side panel
4. Look for the **voice status indicator**:
   - 🟢 Green pulsing = Listening
   - 🟡 Yellow = Paused
   - 🔴 Red = Error
   - ⚪ Gray = Idle

### 3. Voice Command Tests
Try these commands multiple times:
- "assist plan" 
- "assist HPI"
- "assist exam"
- "assist review of systems"

**Expected**: Commands work every time, not just first attempt!

## Playwright Issues

The E2E tests are failing due to Chrome launch timeouts on macOS. Common fixes:

### Option 1: Use Regular Chrome
```bash
# Use system Chrome instead of Playwright's Chromium
RUN_EXTENSION_E2E=true npx playwright test --browser=chrome --headed
```

### Option 2: Increase Timeout
```bash
# Give Chrome more time to start
RUN_EXTENSION_E2E=true npx playwright test --headed --timeout=60000
```

### Option 3: Clean Playwright Cache
```bash
# Clear and reinstall browsers
npx playwright uninstall
npx playwright install chromium
```

## What Was Fixed

### Problem
- Voice commands only worked on first attempt
- Two speech recognition instances competed for microphone
- No error recovery mechanism

### Solution
- Created unified `SpeechRecognitionManager` 
- Single instance handles all voice recognition
- Automatic retry with exponential backoff
- Visual status indicators
- Proper cleanup between sessions

### Key Files Changed
- `src/sidepanel/lib/speechRecognition.ts` - New unified manager
- `src/sidepanel/App.tsx` - Replaced dual implementation
- `src/sidepanel/components/CommandStrip.tsx` - Added status indicator

## Voice Recognition Flow

```
User speaks → Microphone → SpeechRecognitionManager
                               ↓
                        Parse intent
                               ↓
                    Execute command (insert text)
                               ↓
                    Ready for next command ✅
```

The main improvement: No more "only works once" issue!