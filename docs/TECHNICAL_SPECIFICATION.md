# AssistMD - Complete Technical Specification

**Version:** 0.2.1
**Document Date:** 2025-10-25
**Status:** Production-Ready (75-80% Complete)
**Author:** Technical Documentation Team

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Application State Management](#2-application-state-management)
3. [Audio & Voice Subsystem](#3-audio--voice-subsystem)
4. [Backend API Specification](#4-backend-api-specification)
5. [EHR Integration](#5-ehr-integration)
6. [Security & PHI Protection](#6-security--phi-protection)
7. [Data Structures](#7-data-structures)
8. [User Workflows](#8-user-workflows)
9. [Configuration & Feature Flags](#9-configuration--feature-flags)
10. [Testing & Quality Assurance](#10-testing--quality-assurance)

---

## Document Overview

This technical specification provides comprehensive documentation of the AssistMD Chrome Extension, including architecture, implementation details, API contracts, and operational procedures. It serves as the authoritative reference for developers, stakeholders, and future enhancements.

**Related Documentation:**
- [Quick Start Guide](../QUICK_START.md) - Setup and installation
- [Backend README](../backend/README.md) - Backend API details
- [Implementation Status](../IMPLEMENTATION_COMPLETE.md) - Feature completion
- [Security Compliance](SECURITY_COMPLIANCE.md) - HIPAA/PIPEDA compliance

---

## 1. System Architecture

### 1.1 Component Topology

```
┌──────────────────────── CHROME EXTENSION (MV3) ────────────────────────┐
│                                                                         │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Background.js  │  │  Offscreen.js    │  │   Content.js        │  │
│  │  (Orchestrator) │  │  (Audio I/O)     │  │   (EHR Injection)   │  │
│  │  - WebSocket    │  │  - getUserMedia  │  │   - Field Discovery │  │
│  │  - Presign      │  │  - VAD           │  │   - Ghost Preview   │  │
│  │  - Window Pair  │  │  - MediaRecorder │  │   - Click-to-Map    │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
│           │                    │                        │              │
│           └────────────────────┴────────────────────────┘              │
│                              chrome.runtime.sendMessage                │
│                                       │                                │
│  ┌────────────────────────────────────▼────────────────────────────┐  │
│  │              Side Panel (React App - 3,334 lines)               │  │
│  │  ┌────────────┬──────────┬───────────┬────────────┬──────────┐ │  │
│  │  │   Header   │ Controls │ Transcript│ ChatBubble │ Settings │ │  │
│  │  │  (Status)  │(Rec/Ins) │   (Live)  │  (AI Msg)  │  (Modal) │ │  │
│  │  └────────────┴──────────┴───────────┴────────────┴──────────┘ │  │
│  │                                                                  │  │
│  │  State: 40+ useState hooks (auth, recording, ws, profile, etc.) │  │
│  │  Effects: 50+ useEffect hooks (initialization, persistence)     │  │
│  │  Handlers: 30+ message listeners (chrome.runtime.onMessage)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ WSS/HTTPS
                                ▼
┌─────────────────────── ARMADA BACKEND (Node.js) ───────────────────────┐
│                                                                         │
│  Express 5.1.0 (HTTP) + ws 8.18.3 (WebSocket) on Port 8080            │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  REST API Endpoints (17 routes)                                │   │
│  │  - /health                    - /v1/audit/logs                 │   │
│  │  - /v1/encounters/:id/presign - /v1/automation/paste           │   │
│  │  - /v1/encounters/:id/compose - /v1/automation/discover        │   │
│  │  - /v1/templates/:section     - /v1/automation/screenshot      │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  WebSocket Server: /asr?encounterId={id}                       │   │
│  │  - Audio streaming (WebM/Opus)                                 │   │
│  │  - Partial transcriptions                                      │   │
│  │  - Heartbeat (10s intervals)                                   │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────┬──────────────┬───────────────┬─────────────────┐  │
│  │ OpenAI Client │ PHI Redactor │ Note Composer │ Safety Rails    │  │
│  │ (Realtime API)│ (9 patterns) │ (GPT-4o SOAP) │ (6 check types) │  │
│  └───────────────┴──────────────┴───────────────┴─────────────────┘  │
│                                                                         │
│  ┌───────────────┬──────────────┬──────────────┬──────────────────┐  │
│  │ Audit Logger  │ Encryption   │ Playwright   │ Field Locator    │  │
│  │ (HMAC-signed) │ (AES-GCM)    │ Worker       │ (6 strategies)   │  │
│  └───────────────┴──────────────┴──────────────┴──────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ WSS (TLS)
                                ▼
                 ┌────────────────────────────────┐
                 │   OpenAI Realtime API (GPT-4o) │
                 │   - Speech-to-Text (<300ms)     │
                 │   - Server-side VAD             │
                 │   - Function Calling            │
                 └────────────────────────────────┘
```

### 1.2 File Structure

```
windsurf-project/
├── manifest.json                # MV3 extension manifest
├── background.js                # Service worker (382 lines)
├── offscreen.js                 # Audio capture (387 lines)
├── offscreen.html               # Offscreen document HTML
├── content.js                   # EHR injection (657 lines)
├── sidepanel.html               # Side panel entry
├── package.json                 # Extension dependencies
├── tsconfig.json                # TypeScript config
├── tailwind.config.js           # Tailwind CSS config
├── playwright.config.ts         # E2E test config
├── scripts/
│   ├── build.mjs                # esbuild bundler
│   └── dev.mjs                  # Development watcher
├── src/
│   ├── background/              # Background worker modules
│   │   ├── windowPairing.js
│   │   └── windowTracking.js
│   ├── sidepanel/               # React side panel app
│   │   ├── App.tsx              # Main app (3,334 lines)
│   │   ├── index.tsx            # React entry point
│   │   ├── intent.ts            # Voice command parser
│   │   ├── components/          # 14 React components
│   │   ├── hooks/               # Custom hooks
│   │   └── lib/                 # 21 utility libraries
│   ├── content/                 # Content script modules
│   └── styles/                  # CSS files
├── backend/                     # Node.js backend
│   ├── server.js                # Main server (500+ lines)
│   ├── openai-realtime.js       # OpenAI client
│   ├── phi-redactor.js          # PHI tokenization
│   ├── note-composer.js         # SOAP generator
│   ├── safety-rails.js          # Clinical checks
│   ├── encryption.js            # AES-GCM utilities
│   ├── audit-logger.js          # HIPAA logging
│   └── automation/              # Playwright (4 files)
├── public/                      # Static assets
│   ├── audio-router-worklet.js  # AudioWorklet VAD
│   └── icons/                   # Extension icons
├── dist/                        # Build output
├── TESTS/                       # Test suite
└── docs/                        # Documentation
```

---

## 2. Application State Management

### 2.1 State Variables (App.tsx - 3,334 lines)

**Total State Variables: 40+**

The main App.tsx component manages all application state using React hooks. Each state variable is documented with its location, type, and purpose.

#### Authentication State (Lines 42-46)

```typescript
const [authState, setAuthState] = useState<{
  status: 'loading' | 'signed_out' | 'authenticated';
  email?: string | null;
  expiresAt?: number | null;
}>({ status: 'loading' });

const [authEmail, setAuthEmail] = useState('');        // Email input field
const [authPending, setAuthPending] = useState(false);  // Magic link request loading
const [authMessage, setAuthMessage] = useState<string | null>(null);  // Error/success message
const [authCountdown, setAuthCountdown] = useState<string | null>(null);  // Session expiry countdown
```

**Purpose:** Manages Supabase authentication state, email input, magic link flow, and session expiration countdown.

#### Recording & Audio State (Lines 47-50, 57-58, 257-258)

```typescript
const [recording, setRecording] = useState(false);     // Microphone active
const [mode, setMode] = useState<'idle' | 'mock' | 'live'>('idle');  // ASR mode
const [wsState, setWsState] = useState<'disconnected' | 'connecting' | 'open' | 'error'>('disconnected');
const [lastError, setLastError] = useState<string | null>(null);
const [liveWords, setLiveWords] = useState('');        // Real-time partial transcripts
const [pttActive, setPttActive] = useState(false);     // Push-to-talk state
```

**Purpose:** Tracks recording status, WebSocket connection state, and real-time transcription partials.

#### UI State (Lines 48-49, 62-63)

```typescript
const [focusMode, setFocusMode] = useState(false);     // Full-screen overlay mode
const [opacity, setOpacity] = useState(80);            // Opacity (0-100)
const [settingsOpen, setSettingsOpen] = useState(false);
const [helpOpen, setHelpOpen] = useState(false);
```

**Purpose:** Controls UI visibility and presentation modes.

#### EHR Integration (Lines 60-61, 260-264)

```typescript
const [host, setHost] = useState<string>('');          // Current EHR hostname
const [profile, setProfile] = useState<Record<Section, FieldMapping>>({} as any);  // Field mappings
const [pairingState, setPairingState] = useState<{
  enabled: boolean;
  pairs: Array<{ host?: string; title?: string; url?: string }>;
}>({ enabled: false, pairs: [] });
const [pairingBusy, setPairingBusy] = useState(false);
const [windowTrackState, setWindowTrackState] = useState<{
  sidepanelWindowId: number | null;
  lastKnown: { title?: string; url?: string } | null;
}>({ sidepanelWindowId: null, lastKnown: null });
const [autoPairOnAllowed, setAutoPairOnAllowed] = useState(false);
```

**Purpose:** Manages EHR field mappings, window pairing, and multi-window coordination.

#### Feature Flags (Lines 64-68, 71-72, 280)

```typescript
const [redactedOverlay, setRedactedOverlay] = useState(false);     // Privacy shield
const [auditScreenshots, setAuditScreenshots] = useState(false);   // Screenshot capture
const [voiceQueriesEnabled, setVoiceQueriesEnabled] = useState(true);  // "assist vitals?"
const [useRouterVad, setUseRouterVad] = useState(false);           // Router VAD vs legacy
const [showCommandHud, setShowCommandHud] = useState(true);        // Command status
const [showCitations, setShowCitations] = useState(false);         // Provenance timestamps
const [singleFieldMode, setSingleFieldMode] = useState(false);     // Single-field insertion
const [features, setFeatures] = useState({
  templates: true,      // Section templates
  undo: true,           // Undo last insert
  multi: true,          // Multi-section batch insert
  preview: false,       // Ghost preview overlay
  autoBackup: true,     // Auto settings backup
  tplPerHost: true      // Templates per EMR host
});
```

**Purpose:** Feature toggles for experimental and optional functionality.

#### Insertion & Mapping (Lines 69-70, 670-682)

```typescript
const [insertModes, setInsertModes] = useState<Record<Section, 'append' | 'replace'>>({
  PLAN: 'append',
  HPI: 'append',
  ROS: 'append',
  EXAM: 'append'
});
const [metrics, setMetrics] = useState<{
  verifyFail: number;
  inserts: number;
  p50: number;
  p95: number;
}>({ verifyFail: 0, inserts: 0, p50: 0, p95: 0 });
const [pendingInsert, setPendingInsert] = useState<null | {
  section: Section;
  payload: string;
  selector: string;
  bypassGuard?: boolean;
}>(null);
const [pendingInsertDraft, setPendingInsertDraft] = useState('');  // User edit
const [pendingInsertExisting, setPendingInsertExisting] = useState<string | null>(null);
const [pendingInsertLoading, setPendingInsertLoading] = useState(false);
const [pendingInsertMeta, setPendingInsertMeta] = useState<null | {
  selector: string;
  strict: boolean;
}>(null);
const [remapPrompt, setRemapPrompt] = useState<null | { section: Section }>(null);
const [permBanner, setPermBanner] = useState(false);  // Permission request banner
const [targetChooser, setTargetChooser] = useState<null | {
  section: Section;
  candidates: { selector: string; framePath?: number[]; confidence?: number }[];
  payload: string;
  bypassGuard?: boolean;
}>(null);
const [targetSelection, setTargetSelection] = useState<number>(0);
const [ghostPreview, setGhostPreview] = useState<Partial<Record<Section, string>> | null>(null);
```

**Purpose:** Manages field insertion flow, preview, target selection, and metrics tracking.

#### Patient Safety (Lines 255, 682-684)

```typescript
const [pendingGuard, setPendingGuard] = useState<GuardStatus | null>(null);  // Wrong-chart dialog
const [encounterId, setEncounterId] = useState<string | null>(null);
const [composedNote, setComposedNote] = useState<ComposedNote | null>(null);
```

**Purpose:** Patient safety guard and note composition state.

#### Voice & Commands (Lines 248-253, 267, 270)

```typescript
const [apiBase, setApiBase] = useState('');
const [allowedHosts, setAllowedHosts] = useState<string[]>([]);
const [wsEvents, setWsEvents] = useState<string[]>([]);            // WebSocket event log
const [commandLog, setCommandLog] = useState<string[]>([]);        // Voice command history
const [transcriptFormat, setTranscriptFormat] = useState<'RAW' | 'SOAP' | 'APSO'>('RAW');
const [commandMessage, setCommandMessage] = useState('Ready for "assist …" commands');
const [chatLog, setChatLog] = useState<ChatMessage[]>([]);         // AI messages
const [wakeWordState, setWakeWordState] = useState<RecordingState>(RecordingState.IDLE);
```

**Purpose:** Voice command state, API configuration, and AI chat messages.

#### Recovery & Snapshots (Lines 401-403)

```typescript
const [snapshotInfo, setSnapshotInfo] = useState<{
  ts: number;
  keys: string[];
} | null>(null);
const [recoveryBanner, setRecoveryBanner] = useState(false);
const [speechRecognitionState, setSpeechRecognitionState] = useState<SpeechRecognitionState>('idle');
```

**Purpose:** Settings backup/restore and speech recognition state.

### 2.2 Key Effects & Lifecycle

**Total useEffect Hooks: 50+**

#### Initialization Effects

1. **Bootstrap Auth (Lines 88-114)**
   - Fetches Supabase session on mount
   - Listens for `AUTH_STATE` messages
   - Sets initial authentication status

2. **Load Persistent Settings (Lines 281-298)**
   - Loads feature flags from `chrome.storage.local`
   - Sets defaults for missing flags

3. **Load API Base URL (Lines 416-426)**
   - Reads `API_BASE` from storage
   - Defaults to `http://localhost:8080`

4. **Initialize Encounter ID (Lines 1854-1858)**
   - Generates unique ID: `enc_${Date.now()}`

#### Auth Lifecycle

5. **Handle OAuth Redirect (Lines 129-153)**
   - Processes `access_token` in URL hash
   - Calls `SUPABASE_HANDLE_REDIRECT`

6. **Auth Countdown Timer (Lines 155-182)**
   - Updates expiry countdown every 30s
   - Formats as "Xh Ym" or "Xm"

7. **Auto-Refresh Token (Lines 184-192)**
   - Schedules refresh 5min before expiry
   - Sends `SUPABASE_REFRESH_SESSION`

#### WebSocket & Recording

8. **Message Listener Registration (Lines 1373-1745)**
   - Massive `chrome.runtime.onMessage` listener
   - Handles 30+ message types

9. **Recording State Sync (Lines 1747-1768)**
   - Sends `START_CAPTURE` / `STOP_CAPTURE`
   - Posts `OFFSCREEN_STATUS` messages

#### Persistence

10-20. **Feature Flag Persistence (Multiple hooks)**
    - Persists all feature flags to `chrome.storage.local`
    - Debounced writes to prevent excessive I/O

### 2.3 Message Handlers

**Total Message Types: 30+**

#### From background/offscreen/content → App:

| Message Type | Source | Purpose | Handler Location |
|--------------|--------|---------|------------------|
| `AUTH_STATE` | Background | Auth state changed | Lines 104-108 |
| `ASR_PARTIAL` | Offscreen | Partial transcript | Lines 1400-1415 |
| `ASR_VAD` | Offscreen | Voice activity state | Lines 1416-1425 |
| `ASR_WS_STATE` | Offscreen | WebSocket state | Lines 1426-1435 |
| `OFFSCREEN_STATUS` | Offscreen | Offscreen status | Lines 1436-1445 |
| `COMMAND_WINDOW` | Background | Command suppression | Lines 1450-1460 |
| `WINDOW_PAIR_STATE` | Background | Pairing status | Lines 1500-1510 |
| `PATIENT_DEMOGRAPHICS` | Content | Scraped demographics | Lines 1550-1560 |
| `GHOST_PREVIEW_READY` | Content | Ghost rendered | Lines 1570-1580 |
| `INSERT_RESULT` | Content | Insertion result | Lines 1600-1620 |
| `VERIFY_TARGET_RESULT` | Content | Target verification | Lines 1630-1640 |
| `MAP_PICK_RESULT` | Content | Click-to-map result | Lines 1660-1670 |

#### From App → background/offscreen/content:

| Message Type | Target | Purpose | Invocation Location |
|--------------|--------|---------|---------------------|
| `START_CAPTURE` | Offscreen | Begin audio capture | Lines 1750-1760 |
| `STOP_CAPTURE` | Offscreen | End audio capture | Lines 1761-1770 |
| `PRESIGN_WS` | Background | Request WebSocket URL | Lines 1800-1810 |
| `ASR_CONNECT` | Offscreen | Connect WebSocket | Lines 1811-1820 |
| `SUPABASE_SESSION_GET` | Background | Fetch session | Lines 90-95 |
| `SUPABASE_HANDLE_REDIRECT` | Background | OAuth redirect | Lines 134-140 |
| `SUPABASE_REFRESH_SESSION` | Background | Refresh token | Lines 189 |
| `COMMAND_INSERT_TEXT` | Content | Insert text | Lines 2100-2120 |
| `COMMAND_VERIFY_TARGET` | Content | Verify field | Lines 2130-2140 |
| `COMMAND_MAP_PICK` | Content | Start click-to-map | Lines 2200-2210 |
| `COMMAND_GHOST_PREVIEW` | Content | Show ghost overlay | Lines 2250-2260 |
| `EHR_SCRAPE_DEMOGRAPHICS` | Content | Extract demographics | Lines 2300-2310 |
| `SET_VAD_MODE` | Offscreen | Switch VAD mode | Lines 147-149 |

---

## 3. Audio & Voice Subsystem

### 3.1 Audio Capture Pipeline

**Complete Flow:**

```
Microphone
    ↓
getUserMedia() → AudioContext (16kHz)
    ↓
AudioWorkletNode (PCM Capture) → Int16Array frames (160 samples = 10ms)
    ↓
┌─────────────────────────────────────────┐
│  VAD Processing (Dual Implementation)   │
│  ├─ Legacy VAD (offscreen.js:339-395)   │
│  │  - RMS: 0.018 on / 0.012 off         │
│  │  - Min speech: 180ms                 │
│  │  - Hang: 350ms                       │
│  └─ Router VAD (audio-router-worklet.js)│
│     - RMS: 0.015 on / 0.010 off         │
│     - Same timing parameters            │
└─────────────────────────────────────────┘
    ↓
Ring Buffer (10s) + Staging Buffer (3s)
    ↓
MediaRecorder (WebM/Opus, 300ms chunks)
    ↓
WebSocket Stream (when shouldStreamDictation())
    ↓
Backend ASR Server (OpenAI Realtime API)
    ↓
Partial Transcriptions → App.tsx → Display
```

### 3.2 VAD Configuration

**Legacy VAD Constants (offscreen.js:3-8):**

```javascript
SAMPLE_RATE = 16000        // Hz
FRAME_SIZE = 160           // samples (10ms @ 16kHz)
VAD_CFG = {
  rmsOn: 0.018,            // Activation threshold
  rmsOff: 0.012,           // Deactivation threshold (0.006 hysteresis)
  minSpeechMs: 180,        // Min 180ms to trigger "speaking"
  hangMs: 350              // 350ms grace period after quiet
}
MIN_SPEECH_FRAMES = 18     // (180ms / 10ms)
HANG_FRAMES = 35           // (350ms / 10ms)
```

**Router VAD Constants (audio-router-worklet.js:8-9):**

```javascript
rmsOn: 0.015               // 0.003 lower (more sensitive)
rmsOff: 0.010              // 0.002 lower (stricter deactivation)
```

**RMS Calculation:**

```javascript
function calcRms(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;  // Normalize Int16 to [-1, 1]
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}
```

**State Machine:**

```
QUIET state:
  - RMS >= rmsOn → increment speechFrames
  - speechFrames >= 18 → transition to SPEAKING, emit "speaking"

SPEAKING state:
  - RMS < rmsOff → increment quietFrames
  - quietFrames >= 35 → transition to QUIET, emit "quiet"
  - RMS >= rmsOff → reset quietFrames to 0
```

### 3.3 WebSocket Protocol

**Connection URL:**
```
ws://localhost:8080/asr?encounterId={enc_123}
```

**Hello Message (Client → Server):**
```json
{
  "type": "hello",
  "codec": "webm/opus",
  "sr": 48000
}
```

**Audio Data (Client → Server):**
- Binary WebM/Opus chunks (300ms timeslice)
- Sent only when `shouldStreamDictation() == true`

**Heartbeat (Client → Server):**
```json
{
  "type": "ping",
  "ts": 1729265400000
}
```
- Interval: 10 seconds

**Partial Transcript (Server → Client):**
```json
{
  "type": "partial",
  "text": "Patient reports chest pain",
  "t0": 1.23,
  "t1": 3.45
}
```

**Reconnection Logic:**
- Exponential backoff: 1s, 2s, 4s, 8s, 10s (max)
- Background worker calls `PRESIGN_WS` → `ASR_CONNECT`

### 3.4 Wake Word Detection

**Implementation:** Web Speech Recognition API (wakeword.ts)

**Configuration:**

```typescript
keyword: "assist"
sensitivity: 0.8           // Confidence threshold (0-1)
confirmationMode: false    // Auto-start after 1s
continuous: true
interimResults: true
lang: 'en-US'
```

**State Transitions:**

```
IDLE → (keyword detected AND confidence >= 0.8) → ARMED
ARMED → (auto-start after 1s OR manual trigger) → RECORDING
RECORDING → (stop command OR timeout) → IDLE
```

**TTS Ducking:**
- `pause()` - Stop listening during TTS
- `resume()` - Restart after 500ms delay

### 3.5 Text-to-Speech

**Implementation (tts.ts:13-105):**

```typescript
class TTSEngine {
  speak(text: string, options?: {
    voice?: SpeechSynthesisVoice;
    rate?: number;      // Default: 1.0
    pitch?: number;     // Default: 1.0
    volume?: number;    // Default: 1.0
  }): Promise<void>;

  setDuckingCallbacks(
    onStart: () => void,  // Pause microphone
    onEnd: () => void     // Resume after muteBuffer
  ): void;

  setMuteBuffer(ms: number): void;  // Default: 2000ms
}
```

**Ducking Flow:**
1. TTS starts → Call `onSpeakStart()` → Pause mic
2. TTS ends → Wait 2000ms → Call `onSpeakEnd()` → Resume mic
3. Integration with `isTtsSpeaking()` check

---

## 4. Backend API Specification

**See:** [API_REFERENCE.md](API_REFERENCE.md) for detailed endpoint documentation.

**Base URL:** `http://localhost:8080`

### 4.1 Core Endpoints

#### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T12:34:56.789Z",
  "features": {
    "phi_redaction": true,
    "safety_rails": true,
    "note_composition": true
  },
  "audit": {
    "dirSizeBytes": 12345678,
    "lastCleanupTs": 1729265400000
  }
}
```

#### Presign WebSocket URL
```
POST /v1/encounters/:id/presign
```

**Response:**
```json
{
  "wssUrl": "ws://localhost:8080/asr?encounterId=enc_123",
  "headers": {},
  "encounterId": "enc_123"
}
```

#### Compose Clinical Note
```
POST /v1/encounters/:id/compose
Content-Type: application/json
```

**Request:**
```json
{
  "transcript": "[NAME:1] reports chest pain [DATE:1]",
  "phiMap": {
    "NAME:1": "John Doe",
    "DATE:1": "2024-10-15"
  },
  "noteFormat": "SOAP",
  "specialty": "family_medicine"
}
```

**Response:**
```json
{
  "sections": {
    "Subjective": "Patient reports chest pain...",
    "Objective": "HR 88, BP 128/78...",
    "Assessment": "Likely musculoskeletal",
    "Plan": "NSAIDs, follow-up 1 week"
  },
  "provenance": [...],
  "billing": {
    "icd10": [...],
    "cpt": [...]
  },
  "flags": [...],
  "metadata": {...}
}
```

### 4.2 Automation Endpoints

See full documentation: [backend/automation/README.md](../backend/automation/README.md)

- `POST /v1/automation/init` - Initialize browser
- `POST /v1/automation/navigate` - Navigate to URL
- `GET /v1/automation/discover` - Discover fields
- `POST /v1/automation/paste` - Paste with verification
- `POST /v1/automation/paste-batch` - Batch operations
- `POST /v1/automation/screenshot` - Capture screenshot
- `GET /v1/automation/health` - Health check
- `POST /v1/automation/close` - Close browser

---

## 5. EHR Integration

### 5.1 Field Discovery Strategies

**Priority Order (6 tiers):**

1. **ARIA Labels**
   ```javascript
   [aria-label*="plan" i],
   [aria-labelledby*="plan" i]
   ```

2. **Placeholder Text**
   ```javascript
   input[placeholder*="plan" i],
   textarea[placeholder*="plan" i]
   ```

3. **Associated Labels**
   ```javascript
   label:contains("Plan") + input,
   label:contains("Plan") + textarea
   ```

4. **Heading Context**
   ```javascript
   h1:contains("Plan"),
   h2:contains("Plan"),
   h3:contains("Plan")
   // Then find nearest editable field
   ```

5. **Role Attributes**
   ```javascript
   [role="textbox"][data-section*="plan"]
   ```

6. **Generic Discovery**
   ```javascript
   textarea, input[type="text"], [contenteditable="true"]
   ```

### 5.2 Insertion Methods

**Strategy Selection:**

1. **Direct DOM (insert.ts):**
   ```javascript
   textarea.value += text;  // append
   textarea.value = text;   // replace
   element.dispatchEvent(new Event('input', { bubbles: true }));
   ```

2. **ContentEditable:**
   ```javascript
   element.innerText += text;
   ```

3. **Iframe Navigation (content.js):**
   - Traverse `window.frames[]` with `framePath: [0, 1, 2]`
   - Same-origin only

4. **Playwright Automation (backend/automation):**
   - Headless Chrome
   - Screenshot verification

### 5.3 Patient Safety Guard

**Fingerprint Generation (guard.ts):**

```typescript
function fingerprint(demographics: {
  name?: string;
  dob?: string;
  mrn?: string;
}): string {
  const parts = [];
  if (demographics.name) {
    const lastName = demographics.name.split(/\s+/).pop() || '';
    parts.push(lastName.toLowerCase());
  }
  if (demographics.dob) {
    const month = demographics.dob.match(/\d{2}/)?.[0] || '';
    parts.push(month);
  }
  if (demographics.mrn) {
    const lastDigits = demographics.mrn.slice(-4);
    parts.push(lastDigits);
  }
  return parts.join(':');  // e.g., "doe:06:5678"
}
```

**Verification Flow:**
1. Extract demographics from EHR page
2. Generate fingerprint
3. Before insert, compare with session fingerprint
4. If mismatch → Block + confirmation dialog
5. Log audit event

### 5.4 Ghost Preview System

**Visual Overlay (content.js):**

```javascript
// For each section:
1. Find target element
2. Create dashed border:
   - border: 2px dashed #7C3AED
   - animation: dash-scroll 1s linear infinite
3. Create badge:
   - position: top-right
   - text: "PLAN (95%)"
```

**Confidence Scoring:**
- ARIA label: 95%
- Placeholder: 85%
- Label association: 80%
- Heading context: 70%
- Role attribute: 60%
- Generic: 40%

---

## 6. Security & PHI Protection

### 6.1 Tokenization Flow

**PHI Detection Patterns (phi-redactor.js):**

1. **Names** - `[NAME:1]`
2. **Dates** - `[DATE:1]`
3. **Phone Numbers** - `[PHONE:1]`
4. **Email Addresses** - `[EMAIL:1]`
5. **Addresses** - `[ADDRESS:1]`
6. **Health Card Numbers** - `[HCN:1]`
7. **Medical Record Numbers** - `[MRN:1]`
8. **Social Insurance Numbers** - `[SIN:1]`
9. **Generic Identifiers** - `[ID:1]`

**Example:**

```
Input:
"Dr. Smith with patient John Doe, DOB 1985-06-10, phone 416-555-1234"

Output:
"Dr. Smith with patient [NAME:1], DOB [DATE:1], phone [PHONE:1]"

PHI Map:
{
  "NAME:1": "John Doe",
  "DATE:1": "1985-06-10",
  "PHONE:1": "416-555-1234"
}
```

### 6.2 Encryption

**Algorithm:** AES-GCM (256-bit)

**Key Management (phi-rehydration.ts):**

```typescript
class PHIKeyManager {
  async getOrCreateKey(encounterId: string): Promise<CryptoKey> {
    // Check in-memory cache
    if (this.keys.has(encounterId)) {
      return this.keys.get(encounterId)!;
    }

    // Generate new AES-GCM key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.keys.set(encounterId, key);
    return key;
  }

  async deleteKey(encounterId: string): Promise<void> {
    this.keys.delete(encounterId);
  }
}
```

**Storage:**
- Encrypted in `chrome.storage.local`
- Key: `PHI_MAP_{encounterId}`
- Value: `{ ciphertext: base64, iv: base64 }`

### 6.3 Audit Logging

**HMAC Signatures (audit-logger.js):**

```javascript
function hmac(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex');
}
```

**Log Entry Format:**

```json
{
  "timestamp": "2025-10-25T12:34:56.789Z",
  "event": "field_insert",
  "encounterId": "enc_123",
  "userId": "user_456",
  "metadata": {
    "section": "PLAN",
    "selector": "textarea#plan",
    "success": true
  },
  "signature": "hmac-sha256:abc123..."
}
```

**Integrity Verification:**

```javascript
function verifyLogIntegrity(logEntry, secret) {
  const { signature, ...data } = logEntry;
  const expectedSig = hmac(data, secret);
  return signature === `hmac-sha256:${expectedSig}`;
}
```

---

## 7. Data Structures

### 7.1 Core Types

**Section Enum:**
```typescript
type Section = 'PLAN' | 'HPI' | 'ROS' | 'EXAM';
```

**Field Mapping:**
```typescript
interface FieldMapping {
  selector: string;           // CSS selector
  framePath?: number[];       // Iframe path
  strict?: boolean;           // Exact match required
  fallbacks?: string[];       // Fallback selectors
  confidence?: number;        // 0-1
  strategy?: 'aria-label' | 'placeholder' | 'label' | 'heading' | 'role' | 'generic';
}
```

**Profile:**
```typescript
type Profile = Record<Section, FieldMapping>;
// Storage key: MAP_{hostname}
```

**Composed Note:**
```typescript
interface ComposedNote {
  sections: Record<string, string>;
  provenance: Array<{
    sentence: string;
    timestamp: string;        // "MM:SS"
    speaker: 'patient' | 'doctor' | 'unknown';
    section: string;
  }>;
  billing?: {
    icd10: Array<{ code: string; description: string; confidence: string }>;
    cpt: Array<{ code: string; description: string; confidence: string }>;
  };
  flags: Array<{
    type: 'contradiction' | 'uncertainty' | 'upcoding' | 'missing_info';
    severity: 'high' | 'medium' | 'low';
    text: string;
    location?: string;
    recommendation?: string;
  }>;
  metadata: {
    model: string;
    noteFormat: string;
    specialty?: string;
    generatedAt: string;
  };
}
```

**PHI Map:**
```typescript
type PHIMap = Record<string, string>;
// Example: { "NAME:1": "John Doe", "DATE:1": "2024-10-15" }
```

**Guard Status:**
```typescript
interface GuardStatus {
  allowed: boolean;
  reason?: string;
  currentFingerprint?: string;
  sessionFingerprint?: string;
  action: 'block' | 'confirm' | 'allow';
}
```

**Chat Message:**
```typescript
interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
  metadata?: {
    confidence?: number;
    citations?: string[];
  };
}
```

### 7.2 Chrome Storage Keys

**Persistent Settings:**
- `API_BASE` - Backend URL
- `SHOW_COMMAND_HUD` - Command HUD visibility
- `FEAT_VOICE_QUERIES` - Voice queries enabled
- `FEAT_ROUTER_VAD` - Router VAD mode
- `REDACTED_OVERLAY` - Privacy shield
- `AUDIT_SCREENSHOTS` - Screenshot capture
- `SINGLE_FIELD_MODE` - Single-field insertion
- `FEAT_TEMPLATES` - Templates enabled
- `FEAT_UNDO` - Undo enabled
- `FEAT_MULTI` - Multi-section enabled
- `FEAT_PREVIEW` - Ghost preview enabled
- `FEAT_AUTO_BACKUP` - Auto-backup enabled
- `FEAT_TPL_PER_HOST` - Per-host templates

**Dynamic Data:**
- `MAP_{hostname}` - Field mappings
- `PHI_MAP_{encounterId}` - Encrypted PHI
- `PATIENT_FINGERPRINT_{encounterId}` - Patient fingerprint
- `AUDIT_SCREENSHOT_QUEUE` - Pending uploads
- `WINDOW_PAIR_AUTO` - Auto-pair enabled
- `RECOVERY_SNAPSHOT` - Settings snapshot

---

## 8. User Workflows

### 8.1 First-Time Setup

1. Install extension → Side panel opens
2. Quick Start Guide (6 steps)
3. Sign in → Magic link
4. Navigate to EMR
5. Map fields (PLAN, HPI, ROS, EXAM)
6. Grant microphone permission

### 8.2 Daily Clinical Workflow

**Phase 1: Pre-Visit**
1. Open patient chart
2. AssistMD auto-opens (if paired)
3. Demographics auto-scraped

**Phase 2: Interview**
4. Start recording
5. Patient interview transcribed
6. Real-time display (PHI tokenized)

**Phase 3: Exam**
7. Dictate vitals
8. Dictate physical exam findings

**Phase 4: Composition**
9. Compose SOAP note
10. Review with provenance
11. Check safety flags

**Phase 5: Insert**
12. Insert sections to EHR
13. Patient guard verifies
14. Screenshot audit
15. Review billing codes

**Phase 6: End Session**
16. Stop recording
17. PHI deleted
18. Sign out

### 8.3 Voice Command Workflow

**Commands:**
- "assist bookmark" - Mark timestamp
- "assist vitals?" - Read vitals
- "assist insert plan" - Insert PLAN
- "assist undo" - Rollback insert
- "assist newline" - Add line break
- "assist timestamp" - Add time

### 8.4 Error Recovery

**WebSocket Disconnect:**
1. Connection drops
2. Exponential backoff (1-10s)
3. Auto-reconnect
4. Resume recording

**Wrong Chart:**
1. Chart switch detected
2. Insert blocked
3. Confirmation dialog
4. User cancels or confirms

---

## 9. Configuration & Feature Flags

### 9.1 Environment Variables (Backend)

**File:** `backend/.env`

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Server
PORT=8080
HOST=localhost
NODE_ENV=development

# Features
ENABLE_LOCAL_PHI_REDACTION=true
ENABLE_SAFETY_RAILS=true
ENABLE_NOTE_COMPOSITION=true

# Logging
PHI_AUDIT_LOG=./audit.log
AUDIT_SCREENSHOT_DIR=./audit_screenshots

# Security
ENCRYPTION_KEY=base64-encoded-key
```

### 9.2 Feature Flags (Extension)

**Location:** App.tsx:280, persisted in chrome.storage.local

| Flag | Key | Default | Purpose |
|------|-----|---------|---------|
| Templates | `FEAT_TEMPLATES` | true | Section templates |
| Undo | `FEAT_UNDO` | true | Undo insert |
| Multi | `FEAT_MULTI` | true | Batch insert |
| Preview | `FEAT_PREVIEW` | false | Ghost preview |
| Auto Backup | `FEAT_AUTO_BACKUP` | true | Settings backup |
| Template Per Host | `FEAT_TPL_PER_HOST` | true | Per-EMR templates |
| Voice Queries | `FEAT_VOICE_QUERIES` | true | Knowledge queries |
| Router VAD | `FEAT_ROUTER_VAD` | false | Router VAD mode |

### 9.3 Build Configuration

**esbuild (scripts/build.mjs):**

```javascript
await build({
  entryPoints: ['src/sidepanel/index.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/assets/sidepanel.js',
  sourcemap: true,
  minify: true,
  target: ['chrome120'],
  define: {
    'process.env.NODE_ENV': '"production"',
    '__ASSIST_CONFIG__': JSON.stringify({
      API_BASE: 'http://localhost:8080',
      WS_BASE: 'ws://localhost:8080'
    })
  }
});
```

---

## 10. Testing & Quality Assurance

### 10.1 Test Structure

**Unit Tests (Vitest):**
- Location: Colocated with source
- Command: `npm run test:unit`

**E2E Tests (Playwright):**
- Location: `TESTS/e2e/`
- Command: `npm run test:e2e`
- Extension: `npm run test:e2e:chrome`

**Config (playwright.config.ts):**

```typescript
export default defineConfig({
  testDir: './TESTS/e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 1,  // Serial for extension
  use: {
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 1024 }
  }
});
```

### 10.2 Key Test Scenarios

**Smoke Tests:**
1. Backend health check
2. Extension loads
3. Side panel opens
4. Recording toggles
5. Transcript displays

**Integration Tests:**
6. WebSocket reconnection
7. PHI tokenization
8. Voice commands
9. Patient guard
10. Field insertion

**E2E Tests:**
11. Full workflow
12. Batch insert
13. Undo
14. Settings persistence
15. Window pairing

---

## Appendix A: Version History

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.

**Current Version:** 0.2.1
- OpenAI Realtime API integration
- PHI protection
- Note composition
- Smart Paste V2
- Voice commands
- Window pairing

---

## Appendix B: Related Documentation

- [Quick Start Guide](../QUICK_START.md)
- [Backend README](../backend/README.md)
- [Implementation Complete](../IMPLEMENTATION_COMPLETE.md)
- [Security Compliance](SECURITY_COMPLIANCE.md)
- [Test Guide](../TEST_GUIDE.md)
- [API Reference](API_REFERENCE.md) (to be created)

---

## Appendix C: Contributing

### Code Organization

- **Extension Code:** `src/`
- **Backend Code:** `backend/`
- **Documentation:** `docs/` and root-level `.md` files
- **Tests:** `TESTS/`
- **Build Scripts:** `scripts/`

### Development Workflow

1. Install dependencies: `npm install`
2. Start backend: `cd backend && npm start`
3. Build extension: `npm run build`
4. Load in Chrome: `chrome://extensions` → Load unpacked → `dist/`

### Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Reference issue numbers
- Keep commits atomic

---

**Document End**

*This specification is maintained by the AssistMD development team. For questions or updates, contact: azizultra32*
