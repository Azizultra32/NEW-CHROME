# Multi-Agent Orchestration Plan - AssistMD v0.2.1 → v0.5.0
**Date**: 2025-10-05
**Status**: Ready to execute
**Agents**: 3 Claude Code instances running in parallel

---

## Executive Summary

**Current State**: v0.2.1 - ~40% of vision complete
- ✅ Build passing, 0 TypeScript errors
- ✅ Backend production-ready but **dark** (not connected)
- ✅ Smart Paste V2 complete
- ❌ No wake word, no TTS, no backend integration

**Target State**: v0.5.0 - Transform from "transcriber" to "intelligent assistant"

**Critical Path** (Phase 1 - 2 weeks):
1. **Connect Backend** → Unlock SOAP generation, PHI protection, safety rails
2. **Add TTS Replies** → Transform UX from tool → assistant
3. **Implement Wake Word** → True hands-free workflow

**Parallel Workstreams**:
- **Agent 1 (CODEX)**: Backend integration + orchestration oversight
- **Agent 2**: TTS + voice assistant features
- **Agent 3**: Wake word + multi-mic pipeline

---

## 🎯 Success Criteria (Phase 1 Complete)

**Golden Path Test**:
1. Open side panel → speak "assist" → recording starts (hands-free) ✨
2. Speak patient history → transcript appears in real-time
3. Say "assist compose note" → AI generates SOAP note with safety warnings 🔥
4. AI speaks back: "Note ready. Should I insert HPI?" 🎤
5. Say "assist insert plan" → pastes to correct field < 500ms
6. Wrong patient guard triggers → AI warns: "Chart mismatch detected"

**Metrics**:
- Backend connection: 100% (WS stable, PHI map flow working)
- TTS latency: < 1s from trigger to speech
- Wake word detection: < 300ms, < 5% false positives
- Build remains passing, 0 TypeScript errors

---

## 📊 Workstream Breakdown

### **Agent 1: CODEX (Backend Integration + Orchestration Lead)**

**Primary Mission**: Connect production backend, enable SOAP generation

**Tasks**:
1. Wire offscreen.js WebSocket to production backend (`ws://localhost:8080/asr`)
2. Implement PHI map storage/decryption in browser
3. Test compose note flow end-to-end
4. Add safety warnings display in UI
5. Coordinate with Agent 2/3 on integration points
6. Monitor build health (ensure 0 errors maintained)

**Files to Modify**:
- [offscreen.js:196](../offscreen.js) - Change WS endpoint to production
- [App.tsx:236](../src/sidepanel/App.tsx) - PHI map handler
- [App.tsx:2148](../src/sidepanel/App.tsx) - Compose UI button
- [App.tsx:2160](../src/sidepanel/App.tsx) - Safety warnings display

**Dependencies**:
- None (can start immediately)
- Blocks: Agent 2's "assist compose note" voice command

**Deliverables**:
- Backend health check passing
- Compose note generates SOAP sections
- PHI tokens properly encrypted/decrypted
- Safety warnings visible in UI

**Success Metrics**:
- WS connection stable for 10+ minutes
- Compose API returns structured SOAP
- PHI map round-trip verified
- Audit logs capturing compose events

---

### **Agent 2: TTS + Voice Assistant Features**

**Primary Mission**: Make AI talk back, add conversational intelligence

**Tasks**:
1. Implement Web Speech TTS with ducking (pause mic while AI speaks)
2. Create chat bubble component for assistant replies
3. Add knowledge query commands ("assist vitals?", "assist current meds?")
4. Implement "assist compose note" voice trigger
5. Add contextual safety nudges (auto-detect contradictions)
6. Test TTS self-trigger prevention

**Files to Create**:
- `src/sidepanel/lib/tts.ts` - TTS engine with ducking
- `src/sidepanel/components/ChatBubble.tsx` - Visual assistant replies

**Files to Modify**:
- [App.tsx:1124](../src/sidepanel/App.tsx) - Add TTS command handlers
- [intent.ts](../src/sidepanel/lib/intent.ts) - Add query command parsing
- [App.tsx:596](../src/sidepanel/App.tsx) - Integrate ducking with existing mute window

**Dependencies**:
- Requires Agent 1's PHI map flow for "assist current meds?" queries
- Requires Agent 1's compose endpoint for "assist compose note"

**Deliverables**:
- AI speaks responses with < 1s latency
- Chat bubbles show assistant messages
- "assist vitals?" → spoken answer from DOM
- "assist compose note" → triggers SOAP generation + speaks confirmation

**Success Metrics**:
- TTS latency < 1s
- No self-trigger loops
- Ducking prevents echo
- Knowledge queries 80%+ accuracy

---

### **Agent 3: Wake Word + Multi-Mic Pipeline**

**Primary Mission**: Hands-free activation, clean audio paths

**Tasks**:
1. Implement "assist" keyword detection (Web Speech hack initially)
2. Add state machine: IDLE → ARMED → RECORDING
3. Design AudioWorklet fan-out for 3-way split (wake/command/transcript)
4. Implement command audio suppression (exclude from transcript)
5. Add 300ms barge-in window for full command capture
6. Test wake word false positive rate

**Files to Create**:
- `src/sidepanel/lib/wakeword.ts` - Wake word detector (Web Speech + heuristics)
- `public/audio-router-worklet.js` - AudioWorklet 3-way fan-out

**Files to Modify**:
- [speechRecognition.ts](../src/sidepanel/lib/speechRecognition.ts) - Integrate wake word states
- [offscreen.js:1](../offscreen.js) - Add AudioWorklet routing
- [App.tsx:1476](../src/sidepanel/App.tsx) - Update partial-based wake logic

**Dependencies**:
- Independent (can start immediately)
- Integrates with Agent 2's command handlers

**Deliverables**:
- "assist" triggers recording without clicking
- Commands don't appear in transcript
- False positive rate < 5%
- AudioWorklet routing implemented (future: upgrade to WASM KWS)

**Success Metrics**:
- Wake word detection < 300ms
- False positives < 5% (tested 100 utterances)
- Command suppression 100% (no "assist insert" in transcript)
- AudioWorklet handles 3 paths without distortion

---

## 🔄 Integration Points & Handoffs

### **Agent 1 → Agent 2 Handoff**:
**Trigger**: Backend compose endpoint tested and working
**Deliverable**: Agent 1 provides PHI map structure, compose response format
**Action**: Agent 2 implements "assist compose note" voice trigger

### **Agent 2 → Agent 3 Handoff**:
**Trigger**: TTS ducking implemented
**Deliverable**: Agent 2 provides ducking API (pause/resume mic)
**Action**: Agent 3 integrates ducking with wake word states

### **Agent 3 → Agent 1 Handoff**:
**Trigger**: AudioWorklet routing ready
**Deliverable**: Agent 3 provides command audio stream (tagged)
**Action**: Agent 1 excludes command audio from backend WS

---

## 📅 Timeline (2-Week Sprint)

### **Week 1: Core Features**
**Days 1-3**: All agents work in parallel
- Agent 1: Backend WS connection + PHI map flow
- Agent 2: TTS engine + chat bubbles
- Agent 3: Wake word detection (Web Speech hack)

**Days 4-5**: First integration checkpoint
- Test: "assist" → recording starts (Agent 3)
- Test: Compose → SOAP generation (Agent 1)
- Test: AI speaks confirmation (Agent 2)

**End of Week 1 Deliverable**:
- Golden Path partially working (wake word + compose + TTS)

### **Week 2: Polish & Multi-Mic**
**Days 6-8**: Advanced features
- Agent 1: Safety warnings UI, audit logging polish
- Agent 2: Knowledge queries ("assist vitals?")
- Agent 3: AudioWorklet 3-way split, command suppression

**Days 9-10**: Integration testing
- Test Golden Path end-to-end
- Measure latencies, false positives
- Fix integration bugs

**End of Week 2 Deliverable**:
- v0.5.0 shipped: Intelligent assistant with hands-free activation

---

## 🚨 Risk Mitigation

### **Risk 1: Backend Connection Instability**
- **Mitigation**: Agent 1 implements exponential backoff reconnect
- **Fallback**: Graceful degradation to mock server

### **Risk 2: TTS Self-Trigger Loops**
- **Mitigation**: Agent 2 implements 2s mute window during TTS playback
- **Fallback**: Manual toggle to disable TTS

### **Risk 3: Wake Word False Positives**
- **Mitigation**: Agent 3 adds confirmation mode (visual indicator before arming)
- **Fallback**: Push-to-talk hotkey (existing Alt+R)

### **Risk 4: AudioWorklet Complexity**
- **Mitigation**: Agent 3 starts with simple 3-way split, defers advanced VAD
- **Fallback**: Keep single-path audio, tag commands in transcript metadata

---

## 📂 Shared Resources

### **Documentation**:
- [VISION_GAP_ANALYSIS.md](VISION_GAP_ANALYSIS.md) - Feature gaps
- [MASTER_IMPLEMENTATION_CHECKLIST.md](MASTER_IMPLEMENTATION_CHECKLIST.md) - Detailed checklist
- [AGENTS.md](../AGENTS.md) - Acceptance criteria

### **Communication**:
- **Git Commits**: Each agent commits with detailed messages, file paths, line numbers
- **Status Updates**: Update `ORCHESTRATION_STATUS.md` daily
- **Blockers**: Post in `BLOCKERS.md` immediately

### **Build Health**:
- **Command**: `npm run build && npx tsc --noEmit`
- **SLA**: 0 TypeScript errors maintained at all times
- **Owner**: Agent 1 monitors, all agents responsible

---

## 🎯 Phase 2 Preview (Weeks 3-4)

**After Phase 1 success**, prioritize:
1. **Glass UI Redesign** (glassmorphism, peek/focus modes)
2. **Advanced Voice Commands** (contextual suggestions, safety nudges)
3. **Screen Augmentation** (vision model + overlay mapping)
4. **Draggable Panels** (drag-snap, layout persistence)

**Target**: v1.0 - "Ultra-modern intelligent clinical assistant"

---

## ✅ Pre-Flight Checklist

Before starting:
- [ ] All 3 agents have access to this plan
- [ ] Backend running: `cd backend && node server.js`
- [ ] Build passing: `npm run build` (0 errors)
- [ ] Git status clean (commit any WIP)
- [ ] `ORCHESTRATION_STATUS.md` created (daily updates)
- [ ] `BLOCKERS.md` created (real-time issue tracking)

**Ready to launch agents in parallel.**

---

## 🚀 Execution Command

**Agent 1 (CODEX)**: Read `AGENT_1_BACKEND_INTEGRATION.md`
**Agent 2**: Read `AGENT_2_TTS_VOICE_ASSISTANT.md`
**Agent 3**: Read `AGENT_3_WAKE_WORD_AUDIO.md`

All agents: Commit early, commit often. Update `ORCHESTRATION_STATUS.md` daily.

**Let's ship v0.5.0 in 2 weeks.** 🔥
