# Quick Start Guide - AssistMD with OpenAI Realtime API

## 🚀 Get Running in 5 Minutes

### Step 1: Start the Backend

```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project/backend
npm start
```

You should see:
```
============================================================
🚀 Armada Backend - Production Ready
============================================================

📡 Server: http://localhost:8080
🔌 WebSocket: ws://localhost:8080/asr

✨ Ready to receive connections from extension
```

### Step 2: Build the Extension

```bash
cd /Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project
npm run build
```

### Step 3: Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `/Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project/dist`

### Step 4: Test It!

1. Click the AssistMD icon in Chrome toolbar
2. Side panel opens
3. Click "Start Recording"
4. Speak: "Patient reports chest pain for two days, possibly related to stress"
5. Watch the transcript appear in real-time! 🎉

---

## What's Working Right Now

✅ **Backend Ready:**
- OpenAI Realtime API connected
- PHI pseudonymization active
- Note composer ready (call `/v1/encounters/:id/compose`)
- Safety rails checking transcripts
- Audit logging to `backend/audit.log`

✅ **Extension Integration Points Ready:**
- `src/sidepanel/lib/phi-rehydration.ts` - PHI utilities
- `src/sidepanel/lib/note-composer-client.ts` - API client

---

## Test the Backend Directly

### Test 1: Health Check

```bash
curl http://localhost:8080/health
```

Expected:
```json
{
  "status": "healthy",
  "features": {
    "phi_redaction": true,
    "safety_rails": true,
    "note_composition": true
  }
}
```

### Test 2: Note Composition

```bash
curl -X POST http://localhost:8080/v1/encounters/test_123/compose \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Patient reports chest pain for two days. Heart rate 110, BP 160/95. Assessment: Likely musculoskeletal. Plan: EKG today, follow up in one week.",
    "phiMap": {},
    "noteFormat": "SOAP",
    "specialty": "family_medicine"
  }'
```

You'll get back a structured SOAP note with provenance and safety warnings!

### Test 3: Get Template

```bash
curl "http://localhost:8080/v1/templates/PLAN?specialty=family_medicine"
```

---

## Next Steps for Full Integration

### 1. Update Offscreen Document

File: `/Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project/offscreen.js`

Change WebSocket URL from mock to production:

```javascript
// Line ~196: Change this
ws = new WebSocket('ws://localhost:8080/asr'); // Old mock server

// To this:
const encounterId = cfg.encounterId || `enc_${Date.now()}`;
ws = new WebSocket(`ws://localhost:8080/asr?encounterId=${encounterId}`);
```

Add PHI map handling:

```javascript
// In ws.onmessage handler, add:
if (m?.type === 'partial' && m?.phiMap) {
  // Store PHI map for later re-hydration
  chrome.runtime.sendMessage({
    type: 'PHI_MAP_UPDATE',
    encounterId: encounterId,
    phiMap: m.phiMap
  });
}
```

### 2. Add "Compose Note" Button to Side Panel

File: `/Users/ali/CODEX-AIEWEB+/CascadeProjects/windsurf-project/src/sidepanel/App.tsx`

Add button in UI:

```tsx
import { composeNote } from './lib/note-composer-client';

// In component:
<button onClick={handleComposeNote}>
  Compose SOAP Note
</button>

// Handler:
async function handleComposeNote() {
  const transcript = transcript.get(); // Your current transcript

  const note = await composeNote({
    encounterId: 'enc_123',
    transcript,
    phiMap: {}, // Will come from PHI map storage
    noteFormat: 'SOAP',
    specialty: 'family_medicine'
  });

  console.log('Composed note:', note);
  // Display in UI
}
```

### 3. Display Composed Note

Create new component or add to existing UI:

```tsx
{composedNote && (
  <div className="composed-note">
    <h2>Composed SOAP Note</h2>

    {Object.entries(composedNote.sections).map(([section, text]) => (
      <div key={section}>
        <h3>{section}</h3>
        <p>{text}</p>
        <button onClick={() => onInsert(section)}>
          Insert {section} to EHR
        </button>
      </div>
    ))}

    {/* Safety warnings */}
    {composedNote.flags.map((flag, idx) => (
      <div key={idx} className={`alert-${flag.severity}`}>
        ⚠️ {flag.text}
      </div>
    ))}
  </div>
)}
```

---

## Common Issues & Fixes

### Issue: "Failed to connect to OpenAI"

**Fix:**
1. Check API key: `cat backend/.env | grep OPENAI_API_KEY`
2. Verify access to Realtime API in your OpenAI account
3. Check internet connection

### Issue: "PHI still visible in logs"

**Fix:**
Check that `ENABLE_LOCAL_PHI_REDACTION=true` in `backend/.env`

### Issue: "WebSocket connection refused"

**Fix:**
Make sure backend is running: `npm run start:backend`

### Issue: "Note composition returns error"

**Fix:**
Check that transcript is not empty and OpenAI API key is valid

---

## Useful Commands

```bash
# Start backend (production)
npm run start:backend

# Start backend (dev mode with auto-reload)
npm run dev:backend

# Build extension
npm run build

# Run tests
npm run test:unit

# Check backend health
curl http://localhost:8080/health

# View audit logs
tail -f backend/audit.log

# Test PHI redactor
cd backend && node phi-redactor.js

# Test encryption
cd backend && node encryption.js

# Test safety rails
cd backend && node safety-rails.js
```

---

## Architecture At-a-Glance

```
Extension (Offscreen)
    ↓ Audio chunks via WebSocket
Backend (server.js)
    ↓ Audio forwarded
OpenAI Realtime API
    ↓ Transcript returned
Backend (PHI Redactor)
    ↓ Tokenized transcript + PHI map
Extension (Side Panel)
    ↓ Re-hydrate locally
Display to User
```

---

## Configuration Files

- **Backend config:** `backend/.env`
- **Extension manifest:** `manifest.json`
- **Server port:** Default 8080 (change in `backend/.env`)

---

## Success Indicators

✅ Backend starts with no errors
✅ Health endpoint returns 200
✅ Extension loads in Chrome
✅ Side panel opens
✅ "Start Recording" button works
✅ Transcripts appear in real-time
✅ PHI is tokenized (`[NAME:1]` format)
✅ Compose endpoint returns structured notes

---

## Need Help?

1. Check logs: `backend/audit.log`
2. Read docs: `backend/README.md`
3. Review implementation: `IMPLEMENTATION_COMPLETE.md`

---

🎉 **You're all set!** Start dictating and watch the magic happen.
## Doctrine Reminder
If you must diverge from the locked architecture (e.g., temporary extra content script), log a Confession in HOLY_BIBLE.md and MASTER_SPEC.md, and include links to the commands run. Onboarding changes should always cite the Holy Bible when doctrine is bent.
