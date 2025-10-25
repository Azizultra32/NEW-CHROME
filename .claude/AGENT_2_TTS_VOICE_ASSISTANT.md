# Agent 2 Task Assignment: TTS + Voice Assistant Features
**Agent**: Claude Code Instance #2
**Timeline**: Days 1-10 (Full 2 weeks)
**Status**: Ready to start

---

## 🎯 Mission

**Transform from passive transcriber to active AI assistant** - Make the AI talk back, answer queries, and provide conversational intelligence during clinical sessions.

**Success Definition**:
- AI speaks responses with < 1s latency
- "assist vitals?" → spoken answer from chart
- "assist compose note" → SOAP generation + spoken confirmation
- No TTS self-trigger loops
- Chat bubbles show assistant messages

---

## 📋 Task Breakdown

### **Task 2.1: Implement TTS Engine with Ducking** (Priority: 🔴 Critical)

**Goal**: Make AI speak back without triggering its own microphone

**Current State**:
- App.tsx:596,156 has COMMAND_WINDOW mute logic
- App.tsx:734 has TTS monitor pause/resume (skeleton)
- No actual TTS implementation

**Action**:
1. Create `src/sidepanel/lib/tts.ts`:
   ```typescript
   export class TTSEngine {
     private synth = window.speechSynthesis;
     private onSpeakStart?: () => void;
     private onSpeakEnd?: () => void;

     speak(text: string, options?: SpeechSynthesisUtterance) {
       this.onSpeakStart?.(); // Trigger ducking (pause mic)
       const utterance = new SpeechSynthesisUtterance(text);
       utterance.onend = () => this.onSpeakEnd?.(); // Resume mic
       this.synth.speak(utterance);
     }

     setDuckingCallbacks(onStart: () => void, onEnd: () => void) {
       this.onSpeakStart = onStart;
       this.onSpeakEnd = onEnd;
     }

     cancel() {
       this.synth.cancel();
     }
   }
   ```

2. Integrate with App.tsx:
   - Initialize TTS engine in component
   - Connect ducking to existing mute window logic
   - Add 2-second mute buffer after TTS ends (prevent echo)

3. Test self-trigger prevention:
   - AI speaks "Hello" → mic muted during speech
   - Mic resumes 2s after speech ends
   - "Hello" does NOT appear in transcript

**Files to Create**:
- `src/sidepanel/lib/tts.ts` - TTS engine

**Files to Modify**:
- [App.tsx:734](../src/sidepanel/App.tsx) - Integrate TTS with ducking
- [App.tsx:596](../src/sidepanel/App.tsx) - Extend mute window logic

**Validation**:
- AI speaks test phrase
- Check DevTools console: "Mic muted (TTS active)"
- Transcript does NOT include spoken text
- Mic resumes 2s after speech

**Deliverable**: TTS speaks without self-triggering

---

### **Task 2.2: Create Chat Bubble Component** (Priority: 🔴 Critical)

**Goal**: Visual assistant replies in side panel

**Action**:
1. Create `src/sidepanel/components/ChatBubble.tsx`:
   ```tsx
   interface ChatBubbleProps {
     message: string;
     type: 'user' | 'assistant';
     timestamp: Date;
   }

   export function ChatBubble({ message, type, timestamp }: ChatBubbleProps) {
     return (
       <div className={`chat-bubble ${type}`}>
         <div className="bubble-header">
           {type === 'assistant' ? '🤖 AssistMD' : '👤 You'}
           <span className="timestamp">{formatTime(timestamp)}</span>
         </div>
         <div className="bubble-content">{message}</div>
       </div>
     );
   }
   ```

2. Add chat log state to App.tsx:
   ```typescript
   const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
   ```

3. Render chat bubbles in side panel (below transcript)

4. Style with Tailwind:
   - User bubbles: gray background, right-aligned
   - Assistant bubbles: purple gradient, left-aligned
   - Auto-scroll to latest message

**Files to Create**:
- `src/sidepanel/components/ChatBubble.tsx` - Chat bubble component

**Files to Modify**:
- [App.tsx](../src/sidepanel/App.tsx) - Add chat log state and rendering

**Validation**:
- Add test message to chat log
- See bubble render with correct styling
- Auto-scroll works when new messages added

**Deliverable**: Chat bubbles display assistant replies

---

### **Task 2.3: Implement Knowledge Query Commands** (Priority: 🟡 High)

**Goal**: Answer queries about patient chart ("assist vitals?", "assist current meds?")

**Action**:
1. Add query command parsing to [intent.ts](../src/sidepanel/lib/intent.ts):
   ```typescript
   if (text.includes('vitals')) {
     return { action: 'QUERY_VITALS' };
   }
   if (text.includes('current meds') || text.includes('medications')) {
     return { action: 'QUERY_MEDS' };
   }
   ```

2. Create DOM scraper for chart data:
   ```typescript
   // src/sidepanel/lib/chart-scraper.ts
   export async function scrapeVitals(): Promise<string> {
     // Query DOM for BP, pulse, SpO2, temp
     // Return formatted string: "BP 120/80, pulse 72, SpO2 98%"
   }
   ```

3. Add query handlers in App.tsx:
   ```typescript
   case 'QUERY_VITALS':
     const vitals = await scrapeVitals();
     speakAndLog(`Vitals: ${vitals}`);
     break;
   ```

4. Test with common queries:
   - "assist vitals?" → "BP 120/80, pulse 72, SpO2 98%"
   - "assist current meds?" → "Lisinopril 10mg, Metformin 500mg"

**Files to Create**:
- `src/sidepanel/lib/chart-scraper.ts` - DOM scraping utilities

**Files to Modify**:
- [intent.ts](../src/sidepanel/lib/intent.ts) - Add query parsing
- [App.tsx:1124](../src/sidepanel/App.tsx) - Add query handlers

**Validation**:
- Open EMR with vitals visible
- Say "assist vitals?"
- AI speaks vitals + chat bubble shows response
- Accuracy: 80%+ (test on 10 charts)

**Deliverable**: Knowledge queries working for vitals, meds

---

### **Task 2.4: "Assist Compose Note" Voice Trigger** (Priority: 🔴 Critical)

**Goal**: Voice command to generate SOAP note

**Dependencies**: Requires Agent 1's Task 1.3 (Compose UI integration) complete

**Action**:
1. Add compose command to intent.ts:
   ```typescript
   if (text.includes('compose note') || text.includes('generate note')) {
     return { action: 'COMPOSE_NOTE' };
   }
   ```

2. Add handler in App.tsx:
   ```typescript
   case 'COMPOSE_NOTE':
     setChatLog(prev => [...prev, { type: 'assistant', message: 'Composing note...' }]);
     speak('Composing clinical note');
     const note = await composeNote(transcript);
     speak('Note ready. Review before inserting.');
     break;
   ```

3. Coordinate with Agent 1 for compose response structure

4. Test flow:
   - Record transcript → Say "assist compose note"
   - AI speaks "Composing note..."
   - SOAP appears in UI
   - AI speaks "Note ready"

**Files to Modify**:
- [intent.ts](../src/sidepanel/lib/intent.ts) - Add compose command
- [App.tsx:1124](../src/sidepanel/App.tsx) - Add compose handler

**Validation**:
- Voice command triggers compose
- AI speaks confirmation
- SOAP note appears
- Chat bubble shows status

**Deliverable**: "assist compose note" fully functional

---

### **Task 2.5: Contextual Safety Nudges** (Priority: 🟢 Medium)

**Goal**: Auto-detect contradictions and warn user

**Action**:
1. Create contradiction detector:
   ```typescript
   // src/sidepanel/lib/contradiction-detector.ts
   export function detectContradictions(transcript: string): string[] {
     // Pattern matching: "denies X" + "reports X"
     // Example: "denies chest pain" + "severe chest pain"
     return contradictions;
   }
   ```

2. Add real-time nudges:
   - Run detector every 30s during recording
   - If contradiction found → speak warning
   - Add visual indicator in UI

3. Test cases:
   - "Patient denies dyspnea... experiencing shortness of breath" → Warning
   - "No allergies... allergic to penicillin" → Warning

**Files to Create**:
- `src/sidepanel/lib/contradiction-detector.ts` - Pattern matching

**Files to Modify**:
- [App.tsx](../src/sidepanel/App.tsx) - Add periodic contradiction checks

**Validation**:
- Create contradictory transcript
- AI speaks warning within 30s
- Warning shows in chat bubble

**Deliverable**: Safety nudges for contradictions

---

## 🔗 Integration Points

### **Handoff from Agent 1** (Backend Integration):
**When**: Agent 1 completes Task 1.3 (Compose UI)
**Receive**: Compose response structure, PHI map format
**Action**: Implement Task 2.4 ("assist compose note" trigger)

**Expected Handoff**:
```typescript
interface ComposeResponse {
  sections: { subjective: string; objective: string; assessment: string; plan: string; };
  warnings: Array<{severity: 'caution'|'critical', message: string}>;
  phiTokens: string[];
}
```

### **Handoff to Agent 3** (Wake Word + Audio):
**When**: Task 2.1 complete (TTS ducking)
**Deliver**: Ducking API for mic pause/resume
**Action**: Agent 3 integrates ducking with wake word states

**Deliverable to Agent 3**:
```typescript
// TTS ducking API
ttsEngine.setDuckingCallbacks(
  () => pauseMic(), // On speak start
  () => resumeMic() // On speak end (with 2s buffer)
);
```

---

## 📊 Success Metrics

**Day 5 Checkpoint (End of Week 1)**:
- [ ] TTS speaks without self-triggering
- [ ] Chat bubbles render correctly
- [ ] "assist compose note" triggers SOAP generation
- [ ] At least 1 knowledge query working (vitals or meds)

**Day 10 Checkpoint (End of Week 2)**:
- [ ] All knowledge queries working (vitals, meds, allergies)
- [ ] Contradiction detector active
- [ ] TTS latency < 1s
- [ ] Golden Path: "assist compose note" → AI speaks confirmation → SOAP appears

---

## 🚨 Known Risks & Mitigation

### **Risk 1: TTS Self-Trigger Loops**
- **Mitigation**: 2-second mute buffer after speech, test extensively
- **Fallback**: Manual toggle to disable TTS

### **Risk 2: Chart Scraper Fails on Different EMRs**
- **Mitigation**: Start with known EMRs (Oscar, Epic), add fallback selectors
- **Fallback**: Return "Unable to locate vitals" message

### **Risk 3: TTS Voice Quality Poor**
- **Mitigation**: Test multiple voices, allow user to select preferred voice
- **Fallback**: Use default system voice

---

## 🛠️ Development Workflow

### **Setup**:
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project

# Build extension
npm run build

# Test TTS in console
speechSynthesis.speak(new SpeechSynthesisUtterance('Test'));
```

### **Testing TTS**:
1. Open side panel
2. Trigger AI response (e.g., "assist vitals?")
3. Verify:
   - AI speaks within 1s
   - Mic icon shows "muted" during speech
   - Transcript does NOT include spoken text
   - Mic resumes after 2s buffer

### **Debugging**:
- TTS queue: `speechSynthesis.getVoices()` (check available voices)
- Ducking state: Add console.log in pause/resume callbacks
- Chat log: Inspect React state in DevTools

---

## 📂 File Reference

### **Key Files**:
- `src/sidepanel/lib/tts.ts` - TTS engine (create)
- `src/sidepanel/components/ChatBubble.tsx` - Chat bubbles (create)
- `src/sidepanel/lib/chart-scraper.ts` - DOM scraping (create)
- `src/sidepanel/lib/contradiction-detector.ts` - Safety nudges (create)
- [App.tsx:734](../src/sidepanel/App.tsx) - TTS integration
- [App.tsx:1124](../src/sidepanel/App.tsx) - Command handlers
- [intent.ts](../src/sidepanel/lib/intent.ts) - Command parsing

### **Documentation**:
- [MULTI_AGENT_ORCHESTRATION_PLAN.md](MULTI_AGENT_ORCHESTRATION_PLAN.md) - Overall plan
- [VISION_GAP_ANALYSIS.md](VISION_GAP_ANALYSIS.md) - Feature gaps (TTS is #2 priority)

---

## ✅ Daily Status Updates

Update [ORCHESTRATION_STATUS.md](ORCHESTRATION_STATUS.md) daily:

**Template**:
```markdown
### Agent 2 (TTS + Voice Assistant) - [Date]
**Tasks Completed**:
- Task 2.1: TTS engine - DONE ✅
- Task 2.2: Chat bubbles - IN PROGRESS ⏳

**Blockers**:
- Waiting for Agent 1's compose response structure

**Next**:
- Complete Task 2.2 (Chat bubbles)
- Start Task 2.3 (Knowledge queries)

**Handoffs**:
- Delivered ducking API to Agent 3
```

---

## 🚀 Ready to Start

**First Action**: Create `src/sidepanel/lib/tts.ts` with basic Web Speech TTS wrapper

**Reminder**: Test TTS extensively to prevent self-trigger loops (this is critical!)

**Let's make the AI talk back.** 🎤
