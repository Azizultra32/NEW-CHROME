# Agent 1 Task Assignment: Backend Integration
**Agent**: CODEX (Orchestration Lead)
**Timeline**: Days 1-5 (Week 1)
**Status**: Ready to start

---

## 🎯 Mission

**Transform backend from "dark" to "live"** - Connect production backend to extension, enable SOAP generation, PHI protection, and safety rails.

**Success Definition**:
- Backend WS connection stable (10+ minutes)
- "Compose Note" generates SOAP sections with safety warnings
- PHI tokens encrypted/decrypted correctly
- Audit logs capturing all compose events

---

## 📋 Task Breakdown

### **Task 1.1: Wire Production Backend WebSocket** (Priority: 🔴 Critical)

**Current State**:
- Extension uses mock server
- Backend running at `http://localhost:8080`, WS at `ws://localhost:8080/asr`
- Offscreen.js has WS client code but pointed at wrong endpoint

**Action**:
1. Open [offscreen.js:196](../offscreen.js)
2. Find WebSocket connection URL (likely mock server URL)
3. Change to: `ws://localhost:8080/asr`
4. Test connection: Start recording, verify WS messages in Network tab
5. Implement exponential backoff reconnect logic (if WS drops)

**Files to Modify**:
- [offscreen.js:196](../offscreen.js) - WS endpoint URL
- Possibly [background.js:120](../background.js) - Presign orchestration

**Validation**:
- Open DevTools → Network → WS tab
- Start recording → see WS connection to `localhost:8080`
- Speak test phrase → see audio chunks flowing
- Check backend logs: Should show "WebSocket client connected"

**Deliverable**: WS connection stable, audio streaming to production backend

---

### **Task 1.2: PHI Map Storage & Decryption** (Priority: 🔴 Critical)

**Current State**:
- Backend sends PHI map via WS (tokens like `[NAME:1]` → `John Doe`)
- App.tsx:236 has PHI map message handler (skeleton)
- [phi-rehydration.ts](../src/sidepanel/lib/phi-rehydration.ts) has encryption utils

**Action**:
1. Read [App.tsx:236](../src/sidepanel/App.tsx) - PHI map handler
2. Implement storage logic:
   ```typescript
   case 'PHI_MAP':
     const encryptedMap = await encryptPHIMap(message.phiMap);
     sessionStorage.setItem('assistmd.phiMap', encryptedMap);
     break;
   ```
3. Add decryption helper in [phi-rehydration.ts](../src/sidepanel/lib/phi-rehydration.ts)
4. Test: Start session, check `sessionStorage` for encrypted PHI map

**Files to Modify**:
- [App.tsx:236](../src/sidepanel/App.tsx) - PHI map handler
- [phi-rehydration.ts:30](../src/sidepanel/lib/phi-rehydration.ts) - Decryption helper

**Validation**:
- Speak patient name → Check sessionStorage for `[NAME:1]` mapping
- Verify encryption (map should not be plaintext)
- Test decryption: Retrieve and decrypt map successfully

**Deliverable**: PHI map stored encrypted, retrievable for compose

---

### **Task 1.3: Compose Note UI Integration** (Priority: 🔴 Critical)

**Current State**:
- Compose button exists at [App.tsx:2148](../src/sidepanel/App.tsx)
- Backend has compose endpoint: `POST /v1/encounters/:id/compose`
- [note-composer-client.ts:51](../src/sidepanel/lib/note-composer-client.ts) - Client code

**Action**:
1. Read [note-composer-client.ts:51](../src/sidepanel/lib/note-composer-client.ts)
2. Verify compose API call points to `http://localhost:8080/v1/encounters/...`
3. Test compose flow:
   - Click "Compose Note" → API call fires
   - Backend returns SOAP sections (Subjective, Objective, Assessment, Plan)
   - Display sections in UI at [App.tsx:2160](../src/sidepanel/App.tsx)
4. Add error handling (network failures, API errors)

**Files to Modify**:
- [note-composer-client.ts:51](../src/sidepanel/lib/note-composer-client.ts) - API endpoint
- [App.tsx:2160](../src/sidepanel/App.tsx) - Render composed note sections

**Validation**:
- Record transcript → Click "Compose Note"
- See SOAP sections rendered (S/O/A/P headings)
- Check Network tab: POST to `/v1/encounters/.../compose` succeeds
- Verify sections have correct content

**Deliverable**: Compose note generates SOAP, displays in UI

---

### **Task 1.4: Safety Warnings Display** (Priority: 🟡 High)

**Current State**:
- Backend returns safety warnings (contradictions, missing critical info)
- App.tsx:2160 - Composed note panel (needs warning badges)

**Action**:
1. Read backend response structure (check [backend/safety-rails.js](../backend/safety-rails.js))
2. Add safety warning badges to composed note UI:
   ```tsx
   {composedNote.warnings.map(warning => (
     <div className="warning-badge">⚠️ {warning.message}</div>
   ))}
   ```
3. Style warnings with yellow/red colors based on severity
4. Test with contradictory transcript: "Patient denies chest pain... severe chest pain noted"

**Files to Modify**:
- [App.tsx:2160](../src/sidepanel/App.tsx) - Add warning rendering
- Possibly CSS for warning badges

**Validation**:
- Create contradictory transcript
- Compose note → See safety warning: "Contradiction detected: chest pain"
- Warnings color-coded (yellow = caution, red = critical)

**Deliverable**: Safety warnings visible in composed note UI

---

### **Task 1.5: Audit Logging Integration** (Priority: 🟢 Medium)

**Current State**:
- Backend has audit logger ([backend/audit-logger.js](../backend/audit-logger.js))
- App.tsx:137 - Mock audit events

**Action**:
1. Replace mock audit with real backend calls
2. Log events:
   - Recording started/stopped
   - Compose triggered
   - Insert executed (with field target)
   - Wrong-chart guard triggered
3. Add audit log viewer UI (optional - can be backend-only for now)

**Files to Modify**:
- [App.tsx:137](../src/sidepanel/App.tsx) - Replace mock audit
- Add API calls to backend audit endpoints

**Validation**:
- Perform actions (record, compose, insert)
- Check backend audit.log: Events logged with timestamps
- Verify PHI is redacted in logs

**Deliverable**: Audit events captured in backend logs

---

## 🔗 Integration Points

### **Coordinate with Agent 2** (TTS + Voice Assistant):
**When**: Task 1.3 complete (Compose working)
**Handoff**: Provide compose response structure, PHI map format
**Action**: Agent 2 implements "assist compose note" voice trigger

**Deliverable to Agent 2**:
```typescript
// Compose response structure
interface ComposeResponse {
  sections: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  warnings: Array<{severity: 'caution'|'critical', message: string}>;
  phiTokens: string[]; // e.g., ["[NAME:1]", "[DATE:2]"]
}
```

### **Coordinate with Agent 3** (Wake Word + Audio):
**When**: Task 1.1 complete (WS connected)
**Handoff**: Provide WS message format for command audio tagging
**Action**: Agent 3 sends tagged command audio (exclude from transcript)

**Deliverable to Agent 3**:
```typescript
// WS message format for command audio
{
  type: 'COMMAND_AUDIO',
  audio: base64EncodedChunk,
  timestamp: Date.now(),
  suppress: true // Don't include in transcript
}
```

---

## 📊 Success Metrics

**Day 3 Checkpoint**:
- [ ] WS connection stable (10+ min uptime)
- [ ] PHI map encrypted in sessionStorage
- [ ] Compose API returns SOAP sections

**Day 5 Checkpoint (End of Week 1)**:
- [ ] Golden Path partially working: Record → Compose → SOAP displayed
- [ ] Safety warnings visible in UI
- [ ] Audit logs capturing events
- [ ] Build passing, 0 TypeScript errors

---

## 🚨 Known Risks & Mitigation

### **Risk 1: WS Connection Drops**
- **Mitigation**: Implement exponential backoff reconnect
- **Fallback**: Show "Backend disconnected" banner, allow retry

### **Risk 2: PHI Map Encryption Breaks**
- **Mitigation**: Add encryption tests, verify round-trip
- **Fallback**: Store unencrypted in memory (sessionStorage only)

### **Risk 3: Compose API Slow (>3s)**
- **Mitigation**: Add loading spinner, timeout after 10s
- **Fallback**: Show error, allow retry

---

## 🛠️ Development Workflow

### **Setup**:
```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project

# Start backend
cd backend && node server.js &

# Build extension
npm run build

# Check health
curl http://localhost:8080/health
```

### **Testing**:
1. Load extension in Chrome: `chrome://extensions` → Load unpacked → `dist/`
2. Open side panel → Start recording
3. Speak test transcript: "Patient is a 45-year-old male with chest pain"
4. Click "Compose Note"
5. Verify SOAP sections appear

### **Debugging**:
- Backend logs: `tail -f backend/audit.log`
- WS messages: DevTools → Network → WS tab
- PHI map: `sessionStorage.getItem('assistmd.phiMap')`

---

## 📂 File Reference

### **Key Files**:
- [offscreen.js:196](../offscreen.js) - WS connection
- [App.tsx:236](../src/sidepanel/App.tsx) - PHI map handler
- [App.tsx:2148](../src/sidepanel/App.tsx) - Compose button
- [App.tsx:2160](../src/sidepanel/App.tsx) - Composed note display
- [note-composer-client.ts:51](../src/sidepanel/lib/note-composer-client.ts) - API client
- [phi-rehydration.ts](../src/sidepanel/lib/phi-rehydration.ts) - Encryption utils
- [backend/server.js](../backend/server.js) - Backend entry point
- [backend/note-composer.js](../backend/note-composer.js) - Compose logic
- [backend/safety-rails.js](../backend/safety-rails.js) - Safety checks

### **Documentation**:
- [MULTI_AGENT_ORCHESTRATION_PLAN.md](MULTI_AGENT_ORCHESTRATION_PLAN.md) - Overall plan
- [VISION_GAP_ANALYSIS.md](VISION_GAP_ANALYSIS.md) - Feature gaps
- [MASTER_IMPLEMENTATION_CHECKLIST.md](MASTER_IMPLEMENTATION_CHECKLIST.md) - Detailed checklist

---

## ✅ Daily Status Updates

Update [ORCHESTRATION_STATUS.md](ORCHESTRATION_STATUS.md) daily:

**Template**:
```markdown
### Agent 1 (CODEX) - [Date]
**Tasks Completed**:
- Task 1.1: WS connection - DONE ✅
- Task 1.2: PHI map storage - IN PROGRESS ⏳

**Blockers**:
- None

**Next**:
- Complete Task 1.2 (PHI decryption)
- Start Task 1.3 (Compose UI)

**Handoffs**:
- None yet
```

---

## 🚀 Ready to Start

**First Action**: Read [offscreen.js:196](../offscreen.js) and change WS endpoint to `ws://localhost:8080/asr`

**Reminder**: Commit early, commit often with detailed messages including file paths and line numbers.

**Let's connect the backend and unlock SOAP generation.** 🔥
