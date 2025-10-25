# Armada Backend

Production-ready backend for AssistMD Chrome extension with OpenAI Realtime API integration, PHI protection, and clinical safety rails.

## Features

### 🔐 HIPAA/PIPEDA Compliance
- **PHI Pseudonymization**: Automatic tokenization of names, dates, phone numbers, addresses, health numbers
- **AES-GCM Encryption**: PHI mapping tables encrypted at rest and in transit
- **Audit Logging**: Comprehensive tamper-proof logs for all PHI access and system events
- **Zero-PHI Cloud Policy**: Only tokenized data sent to OpenAI

### 🤖 AI-Powered
- **OpenAI Realtime API**: Low-latency (~300ms) speech-to-text with built-in VAD
- **GPT-4o Note Composer**: Generates structured SOAP/APSO notes from transcripts
- **Provenance Tracking**: Every sentence linked to timestamp in original audio
- **Voice Commands**: Natural language commands ("assist insert plan")

### ⚕️ Clinical Safety
- **Contradiction Detection**: Flags mismatches between subjective/objective findings
- **Uncertainty Highlighting**: Identifies phrases needing clarification
- **Upcoding Warnings**: Detects potential billing documentation issues
- **Missing Information Alerts**: Ensures critical data is documented

## Quick Start

### Prerequisites
- Node.js >= 18
- OpenAI API key with Realtime API access

### Installation

```bash
cd backend
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
OPENAI_API_KEY=your_key_here
PORT=8080
NODE_ENV=development

ENABLE_LOCAL_PHI_REDACTION=true
ENABLE_SAFETY_RAILS=true
ENABLE_NOTE_COMPOSITION=true
```

### Run

```bash
npm start
```

Server will be available at `http://localhost:8080`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ WebSocket (audio chunks)
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                    ARMADA BACKEND                           │
├─────────────────────────────────────────────────────────────┤
│ server.js          → WebSocket relay + HTTP API            │
│ openai-realtime.js → OpenAI Realtime API client            │
│ phi-redactor.js    → Pseudonymization engine                │
│ note-composer.js   → GPT-4o SOAP/APSO generator             │
│ safety-rails.js    → Clinical checks                        │
│ encryption.js      → AES-GCM crypto utilities               │
│ audit-logger.js    → Compliance logging                     │
└──────────────────┬──────────────────────────────────────────┘
                   │ WebSocket
                   ↓
           ┌───────────────────┐
           │  OpenAI Realtime  │
           │  API (GPT-4o)     │
           └───────────────────┘
```

## API Endpoints

### POST /v1/encounters/:id/presign
Generate presigned WebSocket URL for audio streaming.

**Request:**
```http
POST /v1/encounters/enc_123/presign
```

**Response:**
```json
{
  "wssUrl": "ws://localhost:8080/asr?encounterId=enc_123",
  "headers": {},
  "encounterId": "enc_123"
}
```

### POST /v1/encounters/:id/compose
Compose clinical note from transcript.

**Request:**
```json
{
  "transcript": "tokenized transcript with [NAME:1] placeholders",
  "phiMap": { "NAME:1": "John Doe", "DATE:1": "2024-03-15" },
  "noteFormat": "SOAP",
  "specialty": "family_medicine"
}
```

**Response:**
```json
{
  "sections": {
    "Subjective": "Patient reports...",
    "Objective": "Vitals: ...",
    "Assessment": "...",
    "Plan": "..."
  },
  "provenance": [
    {
      "sentence": "Patient reports chest pain",
      "timestamp": "00:01:23",
      "speaker": "patient"
    }
  ],
  "flags": [
    {
      "type": "uncertainty",
      "text": "possibly related to stress",
      "severity": "low"
    }
  ],
  "metadata": {
    "model": "gpt-4o",
    "noteFormat": "SOAP",
    "generatedAt": "2024-03-15T10:30:00Z"
  }
}
```

### GET /v1/templates/:section
Get section template.

**Request:**
```http
GET /v1/templates/PLAN?specialty=family_medicine
```

**Response:**
```json
{
  "section": "PLAN",
  "template": "Plan:\n1. Diagnostics:\n   -\n\n2. Medications:\n   ..."
}
```

### GET /v1/audit/logs
Query audit logs.

**Request:**
```http
GET /v1/audit/logs?encounterId=enc_123&limit=50
```

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2024-03-15T10:00:00Z",
      "eventType": "encounter_started",
      "encounterId": "enc_123",
      "ipAddress": "192.168.1.1"
    }
  ],
  "count": 5
}
```

### GET /health
Health check.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-03-15T10:00:00Z",
  "features": {
    "phi_redaction": true,
    "safety_rails": true,
    "note_composition": true
  }
}
```

## WebSocket Protocol

### Connection
```
ws://localhost:8080/asr?encounterId=enc_123
```

### Messages: Browser → Server

**Audio chunks (binary):**
```
[Binary audio data - WebM/Opus or PCM16]
```

**Commit audio buffer:**
```json
{ "type": "commit" }
```

**Clear buffer:**
```json
{ "type": "clear" }
```

**Heartbeat:**
```json
{ "type": "ping" }
```

### Messages: Server → Browser

**Partial transcript:**
```json
{
  "type": "partial",
  "text": "[NAME:1] reports chest pain",
  "t0": 1234567890,
  "t1": 1234567891,
  "phiMap": { "NAME:1": "..." }
}
```

**Connection status:**
```json
{
  "type": "connection_status",
  "status": "connected"
}
```

**Voice command:**
```json
{
  "type": "voice_command",
  "command": "insert_section",
  "arguments": { "section": "PLAN" }
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Transcription service error"
}
```

## PHI Protection

### Tokenization Example

**Before (original transcript):**
```
Doctor: Good morning, this is Dr. Emily Smith with patient John Doe,
DOB 1985-06-10, PHN 9876543210.

Patient: I've had chest pain since March 15, 2024.
```

**After (tokenized):**
```
Doctor: Good morning, this is Dr. Emily Smith with patient [NAME:1],
DOB [DATE:1], PHN [HCN:1].

Patient: I've had chest pain since [DATE:2].
```

**PHI Map (encrypted in backend, sent to browser):**
```json
{
  "NAME:1": "John Doe",
  "DATE:1": "1985-06-10",
  "DATE:2": "March 15, 2024",
  "HCN:1": "9876543210"
}
```

### Re-hydration (in browser only)
Browser receives tokenized transcript + encrypted PHI map, decrypts locally, and replaces tokens with original values for display and note composition.

## Safety Rails

### Contradiction Detection
- Normal exam vs abnormal vitals
- Pain reported vs non-tender exam
- Fever reported vs normal temperature

### Uncertainty Highlighting
- Phrases: "possibly", "likely", "may be", "unclear"
- Flags for clinician review

### Upcoding Warnings
- Comprehensive exam claims with limited findings
- Time-based coding without duration
- Cloned text detection

### Missing Information
- Medications without allergy status
- Chest pain without cardiac exam

## Testing

### Test Modules Individually

```bash
# PHI Redactor
node phi-redactor.js

# Encryption
node encryption.js

# Audit Logger
node audit-logger.js

# Safety Rails
node safety-rails.js
```

### Test Server

```bash
npm start

# In another terminal:
curl http://localhost:8080/health
```

## Development

### Watch Mode

```bash
npm run dev
```

Uses `node --watch` to restart on file changes.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | **Required** OpenAI API key |
| `PORT` | 8080 | Server port |
| `HOST` | localhost | Server host |
| `NODE_ENV` | development | Environment |
| `ENABLE_LOCAL_PHI_REDACTION` | true | Enable PHI tokenization |
| `ENABLE_SAFETY_RAILS` | true | Enable clinical checks |
| `ENABLE_NOTE_COMPOSITION` | true | Enable note composer |
| `PHI_AUDIT_LOG` | ./audit.log | Audit log file path |

## Security Considerations

### Production Deployment

1. **Use HTTPS/WSS**: Enable TLS for all connections
2. **Rotate Keys**: Implement key rotation for encryption
3. **Network Isolation**: Deploy in private VPC
4. **Rate Limiting**: Add rate limits to prevent abuse
5. **Authentication**: Implement OAuth/JWT for API endpoints
6. **Audit Retention**: Configure log retention policy (7+ years for HIPAA)
7. **Backup**: Regular encrypted backups of audit logs

### HIPAA Compliance Checklist

- [x] PHI encrypted in transit (TLS)
- [x] PHI encrypted at rest (AES-GCM)
- [x] Audit logging for all PHI access
- [x] Access controls (ready for authentication)
- [x] Data minimization (tokenization)
- [x] Patient consent tracking (ready to implement)
- [ ] BAA with OpenAI (required before production)
- [ ] Penetration testing
- [ ] Security training for users

## Troubleshooting

### OpenAI Connection Issues

**Error:** `Failed to connect to OpenAI Realtime API`

**Solutions:**
1. Check API key is valid: `echo $OPENAI_API_KEY`
2. Verify Realtime API access in OpenAI account
3. Check network connectivity
4. Review logs: `tail -f server.log`

### PHI Redaction Not Working

**Issue:** PHI visible in logs

**Solutions:**
1. Ensure `ENABLE_LOCAL_PHI_REDACTION=true` in `.env`
2. Test redactor: `node phi-redactor.js`
3. Check patterns match your PHI format

### Audit Log Integrity Failures

**Issue:** `verifyAuditLogIntegrity()` shows invalid entries

**Cause:** Audit logs may have been tampered with or `AUDIT_HMAC_SECRET` changed

**Solution:**
- Never change `AUDIT_HMAC_SECRET` after deployment
- Investigate security breach if tampering suspected

## License

Copyright © 2024 Armada MD. All rights reserved.

## Support

For issues or questions:
- GitHub Issues: [Link to repo]
- Email: support@armadamd.com
- Slack: #assistmd-dev