# Playwright Test Expectations After Voice Recognition Fixes

## Summary of Changes
The voice recognition system has been completely refactored to fix the issue where voice commands only worked on the first attempt.

## What to Expect in Playwright Tests

### 1. Voice Command Tests Should Pass
- Voice commands should now work repeatedly, not just on first attempt
- The unified speech recognition manager prevents microphone conflicts
- Automatic retry logic handles transient errors

### 2. Visual Indicators
You'll see in the Chrome extension side panel:
- **Green pulsing dot**: Voice recognition is actively listening
- **Yellow dot**: Recognition is paused (during TTS or dictation)
- **Red dot**: Error state (with automatic recovery)
- **Gray dot**: Idle/inactive state

### 3. Test Flow
When Playwright runs with `--headed` flag, you'll see:

1. **Extension Installation**
   - Chrome opens with the extension loaded
   - Side panel automatically opens

2. **Mock Server Connection**
   - Extension connects to localhost:8080
   - WebSocket establishes for real-time updates

3. **Voice Command Testing**
   - Tests will simulate voice commands
   - Watch for the green indicator showing active listening
   - Commands like "assist plan" should work repeatedly
   - No more "only works first time" failures

4. **Expected Test Results**
   - `extension.spec.ts` - Voice command tests should PASS
   - `ui.spec.ts` - UI state indicators should show correctly
   - `extension_latency.spec.ts` - Performance should be consistent

### 4. Common Test Scenarios

**Successful Voice Flow:**
1. Green dot appears (listening)
2. User says "assist plan" 
3. Command recognized and processed
4. User can immediately say another command
5. It works! (This was broken before)

**During TTS Playback:**
1. Yellow dot appears
2. Recognition paused to prevent feedback
3. Automatically resumes when TTS finishes

**Error Recovery:**
1. Red dot briefly appears on error
2. Automatic retry with exponential backoff
3. Returns to green when recovered

## Running the Tests

**Terminal 1 - Mock Server:**
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project
npm run start
# Leave this running
```

**Terminal 2 - Playwright Tests:**
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project
RUN_EXTENSION_E2E=true npx playwright test --headed

# Or run specific test:
RUN_EXTENSION_E2E=true npx playwright test extension.spec.ts --headed
```

## Debugging Tips

1. **Check Console Logs**
   - Look for `[AssistMD]` prefixed messages
   - `[SpeechRecognition]` messages show state changes

2. **Watch the Status Indicator**
   - Should be green when ready for commands
   - If stuck on gray, check browser permissions

3. **Microphone Permissions**
   - Chrome may prompt for microphone access
   - Accept to enable voice commands

## Expected Improvements
- Voice commands work consistently on every attempt
- No more microphone resource conflicts
- Better error messages and recovery
- Visual feedback for recognition state
- Cleaner architecture with single recognition instance

The main fix addresses the root cause: two speech recognition instances were competing for the microphone. Now there's only one unified manager that handles everything properly.