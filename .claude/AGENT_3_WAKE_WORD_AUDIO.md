# Agent 3 Task Assignment: Wake Word + Multi-Mic Pipeline
**Agent**: Claude Code Instance #3
**Timeline**: Days 1-10 (Full 2 weeks)
**Status**: Ready to start

---

## 🎯 Mission

**Enable hands-free activation and clean audio paths** - Implement "assist" wake word detection, eliminate command pollution from transcripts, and build AudioWorklet 3-way audio split.

**Success Definition**:
- Say "assist" → recording starts (no button click)
- Commands excluded from transcript (100% suppression)
- False positive rate < 5% (tested 100 utterances)
- AudioWorklet routing implemented (paths: wake/command/transcript)

---

## 📋 Task Breakdown

### **Task 3.1: Implement "Assist" Wake Word Detection** (Priority: 🔴 Critical)

**Goal**: Hands-free activation - say "assist" to start recording

**Current State**:
- App.tsx:1476 has partial-based wake logic (basic)
- [speechRecognition.ts](../src/sidepanel/lib/speechRecognition.ts) - Continuous listening
- Manual "Start Recording" button required

**Action**:
1. Create `src/sidepanel/lib/wakeword.ts`:
   ```typescript
   export class WakeWordDetector {
     private recognition: SpeechRecognition;
     private onWakeDetected?: () => void;
     private isArmed = false;

     constructor() {
       this.recognition = new webkitSpeechRecognition();
       this.recognition.continuous = true;
       this.recognition.interimResults = true;
       this.recognition.onresult = (e) => this.handleResult(e);
     }

     private handleResult(event: SpeechRecognitionEvent) {
       const transcript = Array.from(event.results)
         .map(r => r[0].transcript.toLowerCase())
         .join(' ');

       // Wake word detection
       if (transcript.includes('assist') && !this.isArmed) {
         this.isArmed = true;
         this.onWakeDetected?.();
       }
     }

     start() {
       this.recognition.start();
     }

     setWakeCallback(callback: () => void) {
       this.onWakeDetected = callback;
     }
   }
   ```

2. Add state machine to App.tsx:
   ```typescript
   enum RecordingState {
     IDLE,      // Not listening
     ARMED,     // Wake word detected, waiting for command
     RECORDING  // Active recording
   }
   ```

3. Integrate wake word with existing speech recognition:
   - IDLE: Wake word detector running (low CPU)
   - "assist" detected → ARMED state → visual indicator
   - Next utterance → RECORDING state → full transcript

4. Test false positive rate:
   - Say "assist" 20 times → should trigger 100%
   - Say similar words ("asthma", "history", "system") 100 times → should NOT trigger

**Files to Create**:
- `src/sidepanel/lib/wakeword.ts` - Wake word detector

**Files to Modify**:
- [speechRecognition.ts](../src/sidepanel/lib/speechRecognition.ts) - Add state machine
- [App.tsx:1476](../src/sidepanel/App.tsx) - Replace partial-based wake with dedicated detector

**Validation**:
- Open side panel (no recording yet)
- Say "assist" → State changes to ARMED
- Visual indicator shows "Listening..."
- Say next phrase → Recording starts
- False positive test: 100 non-wake utterances → < 5 false triggers

**Deliverable**: Wake word detection working, false positives < 5%

---

### **Task 3.2: Command Audio Suppression** (Priority: 🔴 Critical)

**Goal**: Commands don't appear in transcript ("assist insert plan" should NOT be in clinical note)

**Current State**:
- Commands currently pollute transcript
- No audio tagging mechanism

**Action**:
1. Create command audio tagger:
   ```typescript
   // src/sidepanel/lib/command-tagger.ts
   export class CommandTagger {
     private commandWindow = 300; // ms barge-in window

     tagAudio(audioChunk: ArrayBuffer, isCommand: boolean) {
       return {
         audio: audioChunk,
         timestamp: Date.now(),
         suppress: isCommand, // Flag for backend
       };
     }
   }
   ```

2. Modify offscreen.js WebSocket sender:
   - When command detected → tag next 300ms of audio with `suppress: true`
   - Backend should NOT send this audio to Whisper
   - Send tagged message to backend

3. Coordinate with Agent 1 for WS message format:
   ```typescript
   {
     type: 'COMMAND_AUDIO',
     audio: base64EncodedChunk,
     timestamp: Date.now(),
     suppress: true // Backend excludes from transcript
   }
   ```

4. Test suppression:
   - Say "assist insert plan"
   - Transcript should show: "" (nothing)
   - Insert action should execute

**Files to Create**:
- `src/sidepanel/lib/command-tagger.ts` - Audio tagging

**Files to Modify**:
- [offscreen.js](../offscreen.js) - Add tagging to WS sender
- Coordinate with Agent 1 for backend WS message handling

**Validation**:
- Record session with 10 commands
- Transcript contains 0 command phrases
- All commands execute correctly
- Suppression rate: 100%

**Deliverable**: Commands excluded from transcript (100% suppression)

---

### **Task 3.3: AudioWorklet 3-Way Audio Split** (Priority: 🟡 High)

**Goal**: One mic stream → 3 parallel pipelines (wake/command/transcript)

**Original Vision**:
```
One getUserMedia → AudioWorklet → fan-out:
  Path A: 16kHz downsample → MFCC → KWS (wake word)
  Path B: 1-2s rolling buffer + VAD → command recognizer
  Path C: 8-10s chunks → Whisper (clinical transcript)
```

**Current State**:
- Single audio path (offscreen.js + worklet.js)
- No multi-path routing

**Action**:
1. Create `public/audio-router-worklet.js`:
   ```javascript
   class AudioRouterProcessor extends AudioWorkletProcessor {
     process(inputs, outputs, parameters) {
       const input = inputs[0][0]; // Mono input

       // Path A: Wake word (16kHz downsample)
       const wakeBuffer = this.downsample16kHz(input);
       this.port.postMessage({ path: 'wake', audio: wakeBuffer });

       // Path B: Command (1-2s buffer)
       this.commandBuffer.push(...input);
       if (this.commandBuffer.length > this.sampleRate * 2) {
         this.port.postMessage({ path: 'command', audio: this.commandBuffer });
         this.commandBuffer = [];
       }

       // Path C: Transcript (8-10s chunks)
       this.transcriptBuffer.push(...input);
       if (this.transcriptBuffer.length > this.sampleRate * 8) {
         this.port.postMessage({ path: 'transcript', audio: this.transcriptBuffer });
         this.transcriptBuffer = [];
       }

       return true;
     }
   }
   ```

2. Modify offscreen.js to handle 3 paths:
   - Receive `{ path: 'wake' }` → Send to wake word detector
   - Receive `{ path: 'command' }` → Send to command recognizer
   - Receive `{ path: 'transcript' }` → Send to backend WS (Whisper)

3. Add VAD (Voice Activity Detection) for command path:
   - Detect speech start/end
   - Trigger command window (300ms barge-in)

4. Test routing:
   - Verify all 3 paths receive audio
   - No distortion or dropouts
   - Latency < 50ms per path

**Files to Create**:
- `public/audio-router-worklet.js` - 3-way audio router

**Files to Modify**:
- [offscreen.js](../offscreen.js) - Handle multi-path messages
- [worklet.js](../public/worklet.js) - Replace with audio-router-worklet

**Validation**:
- Start recording → Monitor DevTools console
- See messages: `{ path: 'wake' }`, `{ path: 'command' }`, `{ path: 'transcript' }`
- All paths active simultaneously
- No audio glitches

**Deliverable**: AudioWorklet 3-way routing implemented

---

### **Task 3.4: Integrate TTS Ducking from Agent 2** (Priority: 🟡 High)

**Goal**: Pause wake word detector when AI speaks (prevent AI voice from triggering wake word)

**Dependencies**: Requires Agent 2's Task 2.1 (TTS ducking API)

**Action**:
1. Receive ducking API from Agent 2:
   ```typescript
   ttsEngine.setDuckingCallbacks(
     () => pauseWakeWord(), // On AI speak start
     () => resumeWakeWord() // On AI speak end
   );
   ```

2. Add pause/resume to WakeWordDetector:
   ```typescript
   pause() {
     this.recognition.stop();
   }

   resume() {
     this.recognition.start();
   }
   ```

3. Test TTS + wake word interaction:
   - AI speaks "Note ready"
   - Wake word detector paused during speech
   - Resumes 2s after speech ends
   - AI voice does NOT trigger "assist" detection

**Files to Modify**:
- `src/sidepanel/lib/wakeword.ts` - Add pause/resume methods
- Coordinate with Agent 2 for ducking callback integration

**Validation**:
- Trigger AI speech (e.g., "assist vitals?")
- Check DevTools: "Wake word paused (TTS active)"
- AI says "assist" in response → does NOT trigger wake word
- Wake word resumes after 2s buffer

**Deliverable**: Wake word detector integrates with TTS ducking

---

### **Task 3.5: Visual Indicators for Wake Word States** (Priority: 🟢 Medium)

**Goal**: User knows when wake word is active/armed/recording

**Action**:
1. Add state indicator component:
   ```tsx
   function WakeWordIndicator({ state }: { state: RecordingState }) {
     const icons = {
       IDLE: '😴 Sleeping',
       ARMED: '👂 Listening',
       RECORDING: '🔴 Recording',
     };
     return <div className="wake-indicator">{icons[state]}</div>;
   }
   ```

2. Add to side panel header

3. Test visibility:
   - IDLE → Gray "Sleeping" icon
   - "assist" → Yellow "Listening" icon (pulsing)
   - Start speaking → Red "Recording" icon

**Files to Create**:
- `src/sidepanel/components/WakeWordIndicator.tsx` - Visual indicator

**Files to Modify**:
- [App.tsx](../src/sidepanel/App.tsx) - Add indicator to header

**Validation**:
- Visual state matches actual state
- Transitions smooth (no flicker)
- Icons clear and intuitive

**Deliverable**: Visual indicators for wake word states

---

## 🔗 Integration Points

### **Handoff to Agent 1** (Backend Integration):
**When**: Task 3.2 complete (Command suppression)
**Deliver**: WS message format for tagged audio
**Action**: Agent 1 implements backend handling of `suppress: true` audio

**Deliverable to Agent 1**:
```typescript
// WS message format
{
  type: 'COMMAND_AUDIO',
  audio: base64EncodedChunk,
  timestamp: Date.now(),
  suppress: true // Backend should NOT send to Whisper
}
```

### **Handoff from Agent 2** (TTS):
**When**: Agent 2 completes Task 2.1 (TTS ducking)
**Receive**: Ducking API for pause/resume
**Action**: Integrate with Task 3.4 (TTS + wake word interaction)

**Expected Handoff**:
```typescript
ttsEngine.setDuckingCallbacks(
  () => pauseWakeWord(),
  () => resumeWakeWord()
);
```

---

## 📊 Success Metrics

**Day 5 Checkpoint (End of Week 1)**:
- [ ] Wake word detection working (false positives < 5%)
- [ ] Command audio tagging implemented
- [ ] State machine (IDLE/ARMED/RECORDING) functional
- [ ] Visual indicators showing states

**Day 10 Checkpoint (End of Week 2)**:
- [ ] AudioWorklet 3-way routing implemented
- [ ] Command suppression 100% (tested with 20 commands)
- [ ] TTS ducking integrated (wake word pauses during AI speech)
- [ ] Golden Path: "assist" → ARMED → speak → RECORDING → commands excluded

---

## 🚨 Known Risks & Mitigation

### **Risk 1: Wake Word False Positives**
- **Mitigation**: Add confirmation mode (visual indicator, 1s delay before arming)
- **Fallback**: User can disable wake word, use manual button

### **Risk 2: AudioWorklet Complexity**
- **Mitigation**: Start with simple 3-way split, defer advanced VAD to future
- **Fallback**: Keep single-path audio, tag commands in metadata only

### **Risk 3: Command Suppression Fails**
- **Mitigation**: Tag 300ms + 500ms buffer to catch full command phrase
- **Fallback**: Manual "Clear Command" button to remove from transcript

### **Risk 4: Wake Word Detection Latency**
- **Mitigation**: Optimize Web Speech recognition settings (interimResults: true)
- **Fallback**: Reduce wake word to single syllable ("go" instead of "assist")

---

## 🛠️ Development Workflow

### **Setup**:
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project

# Build extension
npm run build

# Test Web Speech in console
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.onresult = (e) => console.log(e.results);
recognition.start();
```

### **Testing Wake Word**:
1. Open side panel (IDLE state)
2. Say "assist" → State changes to ARMED (yellow icon)
3. Say next phrase → RECORDING starts (red icon)
4. Check transcript: Should NOT include "assist"

### **Testing False Positives**:
```bash
# Say these 100 times, wake word should NOT trigger:
"asthma", "history", "system", "patient", "assessment"
"vitals", "allergies", "medications", "chest", "respiratory"

# Target: < 5 false positives (5% FP rate)
```

### **Debugging**:
- Wake word state: Add console.log in `handleResult()`
- Audio routing: Monitor worklet messages in offscreen.js console
- Command suppression: Check Network tab for WS messages with `suppress: true`

---

## 📂 File Reference

### **Key Files**:
- `src/sidepanel/lib/wakeword.ts` - Wake word detector (create)
- `src/sidepanel/lib/command-tagger.ts` - Audio tagging (create)
- `public/audio-router-worklet.js` - 3-way audio router (create)
- `src/sidepanel/components/WakeWordIndicator.tsx` - Visual indicator (create)
- [speechRecognition.ts](../src/sidepanel/lib/speechRecognition.ts) - Speech recognition
- [offscreen.js](../offscreen.js) - Audio capture + WS sender
- [worklet.js](../public/worklet.js) - Current audio worklet
- [App.tsx:1476](../src/sidepanel/App.tsx) - Partial-based wake logic

### **Documentation**:
- [MULTI_AGENT_ORCHESTRATION_PLAN.md](MULTI_AGENT_ORCHESTRATION_PLAN.md) - Overall plan
- [VISION_GAP_ANALYSIS.md](VISION_GAP_ANALYSIS.md) - Wake word is #1 priority

---

## ✅ Daily Status Updates

Update [ORCHESTRATION_STATUS.md](ORCHESTRATION_STATUS.md) daily:

**Template**:
```markdown
### Agent 3 (Wake Word + Audio) - [Date]
**Tasks Completed**:
- Task 3.1: Wake word detector - DONE ✅
- Task 3.2: Command suppression - IN PROGRESS ⏳

**Blockers**:
- Waiting for Agent 1's WS message format confirmation

**Next**:
- Complete Task 3.2 (Command suppression)
- Start Task 3.3 (AudioWorklet routing)

**Handoffs**:
- Delivered WS message format to Agent 1
```

---

## 🚀 Ready to Start

**First Action**: Create `src/sidepanel/lib/wakeword.ts` with Web Speech-based wake word detector

**Reminder**: Test false positive rate extensively (target < 5%)

**Future Upgrade Path**: Replace Web Speech hack with WASM KWS model (TensorFlow.js + MFCC)

**Let's enable hands-free activation.** 👂
