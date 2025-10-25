# AssistMD API Reference

**Version:** 0.2.1
**Base URL:** `http://localhost:8080`

Quick reference for all backend API endpoints.

---

## Table of Contents

1. [Core Endpoints](#core-endpoints)
2. [Note Composition](#note-composition)
3. [Automation](#automation)
4. [Audit & Logging](#audit--logging)
5. [WebSocket Protocol](#websocket-protocol)

---

## Core Endpoints

### Health Check

```http
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

---

## Note Composition

### Presign WebSocket URL

```http
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

### Compose Clinical Note

```http
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
    "Subjective": "Patient reports chest pain x2 days [00:23]...",
    "Objective": "HR 88 [02:05], BP 128/78 [02:08]...",
    "Assessment": "Likely musculoskeletal chest pain",
    "Plan": "NSAIDs for pain, follow-up in 1 week"
  },
  "provenance": [
    {
      "sentence": "Patient reports chest pain for two days",
      "timestamp": "00:01:23",
      "speaker": "patient",
      "section": "Subjective"
    }
  ],
  "billing": {
    "icd10": [
      {
        "code": "R07.9",
        "description": "Chest pain, unspecified",
        "confidence": "high"
      }
    ],
    "cpt": [
      {
        "code": "99213",
        "description": "Office visit, level 3",
        "confidence": "medium"
      }
    ]
  },
  "flags": [
    {
      "type": "uncertainty",
      "severity": "low",
      "text": "possibly stress-related",
      "location": "Assessment",
      "recommendation": "Clarify or document stress assessment"
    }
  ],
  "metadata": {
    "model": "gpt-4o",
    "noteFormat": "SOAP",
    "specialty": "family_medicine",
    "generatedAt": "2025-10-25T12:34:56.789Z"
  }
}
```

### Get Section Template

```http
GET /v1/templates/:section?specialty=family_medicine
```

**Parameters:**
- `section`: PLAN | HPI | ROS | EXAM | SUBJECTIVE | OBJECTIVE | ASSESSMENT
- `specialty`: family_medicine | emergency | internal_medicine | pediatrics | psychiatry

**Response:**
```json
{
  "section": "PLAN",
  "specialty": "family_medicine",
  "template": "Plan:\n- Medications: \n- Labs/Imaging: \n- Referrals: \n- Follow-up: \n"
}
```

---

## Automation

### Initialize Browser

```http
POST /v1/automation/init
Content-Type: application/json
```

**Request:**
```json
{
  "headless": true,
  "viewport": { "width": 1920, "height": 1080 }
}
```

**Response:**
```json
{
  "ok": true,
  "workerId": "worker_1",
  "status": "ready"
}
```

### Navigate to URL

```http
POST /v1/automation/navigate
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://oscar-emr.com/patient/12345",
  "waitUntil": "networkidle"
}
```

**Response:**
```json
{
  "ok": true,
  "title": "Patient Chart - John Doe",
  "url": "https://oscar-emr.com/patient/12345"
}
```

### Discover Fields

```http
GET /v1/automation/discover?section=PLAN
```

**Response:**
```json
{
  "ok": true,
  "candidates": [
    {
      "selector": "textarea#plan",
      "framePath": [],
      "confidence": 0.95,
      "strategy": "aria-label"
    },
    {
      "selector": "div[contenteditable][data-section='plan']",
      "framePath": [0],
      "confidence": 0.80,
      "strategy": "heading-context"
    }
  ]
}
```

### Paste with Verification

```http
POST /v1/automation/paste
Content-Type: application/json
```

**Request:**
```json
{
  "selector": "textarea#plan",
  "framePath": [],
  "text": "NSAIDs for pain, follow-up in 1 week",
  "mode": "append",
  "verify": true
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "job_xyz789",
  "status": "completed",
  "beforeScreenshot": "base64...",
  "afterScreenshot": "base64...",
  "verified": true
}
```

### Batch Paste

```http
POST /v1/automation/paste-batch
Content-Type: application/json
```

**Request:**
```json
{
  "operations": [
    {
      "selector": "textarea#hpi",
      "text": "Patient reports...",
      "mode": "append"
    },
    {
      "selector": "textarea#plan",
      "text": "NSAIDs...",
      "mode": "append"
    }
  ],
  "verify": true
}
```

**Response:**
```json
{
  "ok": true,
  "results": [
    { "ok": true, "verified": true },
    { "ok": true, "verified": true }
  ]
}
```

### Capture Screenshot

```http
POST /v1/automation/screenshot
Content-Type: application/json
```

**Request:**
```json
{
  "fullPage": false,
  "selector": "div.patient-chart",
  "format": "png"
}
```

**Response:**
```json
{
  "ok": true,
  "screenshot": "base64-encoded-png..."
}
```

### Automation Health

```http
GET /v1/automation/health
```

**Response:**
```json
{
  "ok": true,
  "status": "ready",
  "browserVersion": "Chromium 118.0.0.0",
  "queueLength": 0
}
```

### Close Browser

```http
POST /v1/automation/close
```

**Response:**
```json
{
  "ok": true,
  "status": "closed"
}
```

---

## Audit & Logging

### Query Audit Logs

```http
GET /v1/audit/logs?encounterId=enc_123&limit=100&offset=0
```

**Query Parameters:**
- `encounterId` (optional): Filter by encounter
- `limit` (optional): Max results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-10-25T12:34:56.789Z",
      "event": "encounter_start",
      "encounterId": "enc_123",
      "userId": "user_456",
      "metadata": {},
      "signature": "hmac-sha256:abc123..."
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

### Upload Audit Screenshot

```http
POST /v1/audit/screenshot
Content-Type: application/json
```

**Request:**
```json
{
  "encounterId": "enc_123",
  "eventType": "post_insert",
  "section": "PLAN",
  "payload": "base64-encoded-encrypted-screenshot",
  "mimeType": "image/png",
  "timestamp": 1729265400000
}
```

**Response:**
```json
{
  "ok": true,
  "screenshotId": "screenshot_789",
  "path": "audit_screenshots/enc_123/screenshot_789.png.enc"
}
```

### Create Audit Entry

```http
POST /v1/audit
Content-Type: application/json
```

**Request:**
```json
{
  "event": "field_insert",
  "encounterId": "enc_123",
  "metadata": {
    "section": "PLAN",
    "selector": "textarea#plan",
    "framePath": [0, 1],
    "success": true
  }
}
```

**Response:**
```json
{
  "ok": true,
  "logId": "log_abc123"
}
```

---

## WebSocket Protocol

### Connection

**URL Format:**
```
ws://localhost:8080/asr?encounterId={enc_123}
```

### Client → Server Messages

**Hello (Handshake):**
```json
{
  "type": "hello",
  "codec": "webm/opus",
  "sr": 48000
}
```
- Sent immediately on connection open
- Codec: WebM container with Opus compression
- Sample rate: 48000 Hz

**Audio Data:**
- Binary frames: WebM/Opus encoded chunks
- Sent on 300ms intervals from MediaRecorder
- Only sent when voice activity detected

**Heartbeat:**
```json
{
  "type": "ping",
  "ts": 1729265400000
}
```
- Sent every 10 seconds
- Keeps connection alive

**Commit Audio:**
```json
{
  "type": "commit"
}
```
- Trigger transcription of buffered audio

**Clear Buffer:**
```json
{
  "type": "clear"
}
```
- Clear audio buffer on server

### Server → Client Messages

**Partial Transcript:**
```json
{
  "type": "partial",
  "text": "Patient reports chest pain",
  "t0": 1.23,
  "t1": 3.45
}
```
- Real-time partial transcription
- `t0`, `t1`: Timing metadata (seconds)

**Voice Command:**
```json
{
  "type": "voice_command",
  "command": "insert_section",
  "arguments": {
    "section": "PLAN",
    "text": "..."
  }
}
```
- Detected voice command from OpenAI function calling

**Connection Status:**
```json
{
  "type": "connection_status",
  "status": "connected"
}
```
- WebSocket connection state updates

**Error:**
```json
{
  "type": "error",
  "message": "OpenAI connection failed",
  "code": "OPENAI_ERROR"
}
```

### Reconnection Logic

- **Exponential Backoff:** 1s → 2s → 4s → 8s → 10s (max)
- **Trigger:** WebSocket close or error
- **Process:**
  1. Background worker calls `PRESIGN_WS`
  2. Receives new `wssUrl`
  3. Sends `ASR_CONNECT` to offscreen
  4. Offscreen establishes new WebSocket

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `OPENAI_ERROR` | 500 | OpenAI API error |
| `PHI_REDACTION_ERROR` | 500 | PHI tokenization failed |
| `INVALID_TRANSCRIPT` | 400 | Empty or invalid transcript |
| `MISSING_PHI_MAP` | 400 | PHI map required but missing |
| `AUTOMATION_ERROR` | 500 | Playwright automation failed |
| `INVALID_SELECTOR` | 400 | CSS selector invalid |
| `TARGET_NOT_FOUND` | 404 | Field not found on page |
| `VERIFICATION_FAILED` | 500 | Post-paste verification failed |

---

## Rate Limits

**Current:** No rate limiting implemented (v0.2.1)

**Recommended for Production:**
- `/v1/encounters/*/compose`: 10 requests/minute per user
- `/v1/automation/*`: 5 requests/minute per user
- WebSocket connections: 1 concurrent per encounter

---

## Authentication

**Current:** No authentication (v0.2.1)

**Planned:** OAuth 2.0 / JWT
- Header: `Authorization: Bearer {token}`
- Token expiry: 1 hour
- Refresh token: 30 days

---

## Common Workflows

### 1. Basic Transcription Flow

```javascript
// 1. Presign WebSocket
const presignRes = await fetch(`${API_BASE}/v1/encounters/enc_123/presign`, {
  method: 'POST'
});
const { wssUrl } = await presignRes.json();

// 2. Connect WebSocket
const ws = new WebSocket(wssUrl);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'hello', codec: 'webm/opus', sr: 48000 }));
};

// 3. Stream audio
ws.send(audioChunk);  // Binary WebM/Opus

// 4. Receive partial transcripts
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'partial') {
    console.log('Transcript:', data.text);
  }
};
```

### 2. Note Composition Flow

```javascript
// 1. Compose note
const composeRes = await fetch(`${API_BASE}/v1/encounters/enc_123/compose`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcript: '[NAME:1] reports chest pain',
    phiMap: { 'NAME:1': 'John Doe' },
    noteFormat: 'SOAP',
    specialty: 'family_medicine'
  })
});
const note = await composeRes.json();

// 2. Use composed note
console.log(note.sections.Plan);
```

### 3. Automation Flow

```javascript
// 1. Initialize browser
await fetch(`${API_BASE}/v1/automation/init`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ headless: true })
});

// 2. Navigate to EMR
await fetch(`${API_BASE}/v1/automation/navigate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://oscar-emr.com/patient/123' })
});

// 3. Discover fields
const discoverRes = await fetch(`${API_BASE}/v1/automation/discover?section=PLAN`);
const { candidates } = await discoverRes.json();

// 4. Paste text
await fetch(`${API_BASE}/v1/automation/paste`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    selector: candidates[0].selector,
    text: 'Plan text here',
    mode: 'append',
    verify: true
  })
});

// 5. Close browser
await fetch(`${API_BASE}/v1/automation/close`, { method: 'POST' });
```

---

## See Also

- [Technical Specification](TECHNICAL_SPECIFICATION.md) - Complete system documentation
- [Backend README](../backend/README.md) - Backend implementation details
- [Quick Start Guide](../QUICK_START.md) - Getting started

---

**Document Version:** 1.0
**Last Updated:** 2025-10-25
**Maintained by:** AssistMD Development Team
