# Playwright Backend Worker

Headless browser automation for complex EMR interactions. Handles field discovery, paste with verification, popup handling, and screenshot audit trails.

## Features

- **Semantic Field Discovery**: Finds EMR fields using ARIA labels, placeholders, headings, and heuristics
- **Paste with Verification**: Inserts text and verifies it was successfully placed
- **Popup Handling**: Automatically handles EMR confirmation dialogs
- **Screenshot Audit Trails**: Captures before/after screenshots for HIPAA compliance
- **Async Job Queue**: Non-blocking paste operations with status tracking

## Architecture

```
automation/
├── worker.js           # Main Playwright worker + job queue
├── fieldLocator.js     # Semantic field discovery (5 strategies)
├── pasteStrategies.js  # Paste methods with verification
├── screenshots.js      # Audit trail capture + HIPAA compliance
└── README.md          # This file
```

## Usage

### 1. Initialize Worker

```bash
curl -X POST http://localhost:8080/v1/automation/init \
  -H "Content-Type: application/json" \
  -d '{"headless": false}'
```

Response:
```json
{
  "success": true,
  "sessionId": "l1a2b3c4",
  "message": "Playwright worker initialized"
}
```

### 2. Navigate to EMR

```bash
curl -X POST http://localhost:8080/v1/automation/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example-emr.com/patient/12345"}'
```

### 3. Discover Fields

```bash
curl http://localhost:8080/v1/automation/discover
```

Response:
```json
{
  "success": true,
  "fields": [
    {
      "index": 0,
      "tagName": "TEXTAREA",
      "type": "textarea",
      "ariaLabel": "Chief Complaint",
      "placeholder": "Enter chief complaint...",
      "id": "cc-field",
      "rect": { "x": 100, "y": 200, "width": 600, "height": 80 }
    }
  ],
  "count": 13
}
```

### 4. Paste Single Section (Async)

```bash
curl -X POST http://localhost:8080/v1/automation/paste \
  -H "Content-Type: application/json" \
  -d '{
    "section": "chief_complaint",
    "text": "68 y/o male with chest pain",
    "mode": "replace"
  }'
```

Response:
```json
{
  "success": true,
  "jobId": "job_1_1234567890",
  "message": "Paste job submitted"
}
```

### 5. Check Job Status

```bash
curl http://localhost:8080/v1/automation/job/job_1_1234567890
```

Response:
```json
{
  "id": "job_1_1234567890",
  "type": "paste_single",
  "status": "completed",
  "result": {
    "success": true,
    "section": "chief_complaint",
    "confidence": 0.92,
    "strategy": "aria-label",
    "verification": {
      "success": true,
      "beforeLength": 0,
      "afterLength": 28,
      "mode": "replace"
    }
  }
}
```

### 6. Batch Paste

```bash
curl -X POST http://localhost:8080/v1/automation/paste-batch \
  -H "Content-Type: application/json" \
  -d '{
    "sections": [
      {
        "section": "chief_complaint",
        "text": "Chest pain",
        "mode": "replace"
      },
      {
        "section": "hpi",
        "text": "Patient reports...",
        "mode": "replace"
      },
      {
        "section": "assessment",
        "text": "1. ACS - STEMI\n2. HTN",
        "mode": "replace"
      }
    ]
  }'
```

### 7. Take Screenshot

```bash
curl -X POST http://localhost:8080/v1/automation/screenshot \
  -H "Content-Type: application/json" \
  -d '{"fullPage": true}'
```

Response:
```json
{
  "success": true,
  "screenshot": "iVBORw0KGgoAAAANS..." // base64-encoded PNG
}
```

### 8. Health Check

```bash
curl http://localhost:8080/v1/automation/health
```

Response:
```json
{
  "success": true,
  "initialized": true,
  "sessionId": "l1a2b3c4",
  "pageUrl": "https://example-emr.com/patient/12345",
  "contextPages": 1
}
```

### 9. Close Worker

```bash
curl -X POST http://localhost:8080/v1/automation/close
```

## Field Discovery Strategies

The worker uses 5 semantic strategies (highest confidence first):

### 1. ARIA Labels (0.92 confidence)
Searches for `aria-label` or `aria-labelledby` attributes matching section patterns.

### 2. Placeholder Text (0.88 confidence)
Matches `placeholder` attribute content.

### 3. Label Elements (0.85 confidence)
Finds `<label>` elements and traces to associated input via `for` attribute or nesting.

### 4. Heading Proximity (0.80 confidence)
Finds headings matching section name, then locates nearest editable field.

### 5. Textarea Fallback (0.70 confidence)
For large text sections (HPI, Assessment, Plan), finds largest visible textarea.

## Section Name Patterns

The worker recognizes these section names:

| Section Name       | Recognized Patterns                                      |
|--------------------|----------------------------------------------------------|
| `chief_complaint`  | "chief complaint", "cc", "presenting complaint"          |
| `hpi`              | "history of present illness", "hpi", "present illness"   |
| `ros`              | "review of systems", "ros", "systems review"             |
| `physical_exam`    | "physical exam", "physical examination", "exam", "pe"    |
| `assessment`       | "assessment", "diagnosis", "impression"                  |
| `plan`             | "plan", "treatment plan", "clinical plan"                |
| `orders`           | "orders", "clinical orders", "lab orders"                |
| `medications`      | "medications", "meds", "prescriptions", "drugs"          |
| `followup`         | "follow up", "followup", "follow-up", "next visit"       |

## Audit Trail

All paste operations generate audit logs:

### Logs
Located in `backend/audit-logs/audit-YYYY-MM-DD.jsonl`:

```json
{
  "timestamp": "2025-10-05T12:34:56.789Z",
  "operation": "paste_section",
  "metadata": {
    "section": "chief_complaint",
    "success": true,
    "confidence": 0.92,
    "strategy": "aria-label",
    "mode": "replace",
    "sessionId": "l1a2b3c4"
  },
  "user": "system",
  "success": true
}
```

### Screenshots
Located in `backend/audit-screenshots/`:

- `{sessionId}_{section}_{timestamp}_before.png` - Before paste
- `{sessionId}_{section}_{timestamp}_after.png` - After paste
- `{sessionId}_{section}_{timestamp}_fullpage.png` - Full page context

### Retention
- Logs and screenshots are retained for **90 days** (HIPAA compliance)
- Cleanup runs automatically via `cleanupOldAudits()`

## Testing

### Test on Mock EHR
```bash
node backend/test-automation.js
```

This will:
1. Initialize worker (non-headless - you can watch)
2. Navigate to `dist/mock-ehr.html`
3. Discover all fields
4. Paste to 4 sections (Chief Complaint, HPI, Assessment, Plan)
5. Take screenshot
6. Keep browser open for 30s for inspection
7. Close worker

### Test via API
```bash
# Start backend
cd backend
npm start

# In another terminal, run tests
curl -X POST http://localhost:8080/v1/automation/init -d '{"headless":false}'
curl -X POST http://localhost:8080/v1/automation/navigate -d '{"url":"file:///path/to/dist/mock-ehr.html"}'
curl http://localhost:8080/v1/automation/discover | jq
curl -X POST http://localhost:8080/v1/automation/paste -d '{"section":"hpi","text":"Test text","mode":"replace"}'
```

## Integration with Extension

### From Content Script:
```typescript
async function pasteViaBackend(section: string, text: string) {
  // Submit job
  const submitRes = await fetch('http://localhost:8080/v1/automation/paste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, text, mode: 'replace' })
  });
  const { jobId } = await submitRes.json();

  // Poll for completion
  while (true) {
    const statusRes = await fetch(`http://localhost:8080/v1/automation/job/${jobId}`);
    const status = await statusRes.json();

    if (status.status === 'completed') {
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error(status.error);
    }

    await new Promise(r => setTimeout(r, 500)); // Poll every 500ms
  }
}
```

### From Backend (Server-to-Server):
```javascript
import { worker } from './automation/worker.js';

// Direct worker access (synchronous)
const result = await worker.pasteSingleSection('hpi', 'Patient reports...', 'replace');
console.log(result);
```

## Troubleshooting

### "Worker not initialized"
Call `/v1/automation/init` before other operations.

### "No field found for section: X"
- Check section name spelling
- Use `/v1/automation/discover` to see available fields
- EMR page may use custom labels - update patterns in `fieldLocator.js`

### Paste verification failed
- EMR may have JavaScript that modifies content after paste
- Try increasing wait time in `pasteWithVerification()`
- Check console for JavaScript errors on EMR page

### Popup dialogs blocking paste
- `handlePastePopups()` should auto-accept common dialogs
- If EMR has custom modals, update selectors in `pasteStrategies.js:handlePastePopups()`

### Screenshots missing
- Check `backend/audit-screenshots/` directory exists
- Verify write permissions
- Check disk space

## Security Considerations

### HIPAA Compliance
- All screenshots are encrypted at rest (extension encrypts before sending)
- Audit logs contain NO PHI (only metadata)
- 90-day retention with automatic cleanup
- Access logs track all operations

### Browser Automation Detection
- Worker uses stealth mode: `--disable-blink-features=AutomationControlled`
- Custom user agent to mimic real browser
- May still be detected by advanced anti-bot systems

### Network Security
- Worker runs on backend (not exposed to internet)
- API endpoints should be behind VPN/firewall in production
- No PHI should be sent in API requests (use pseudonymized tokens)

## Performance

### Benchmarks (Mock EHR)
- Field discovery: ~200ms (13 fields)
- Single paste: ~300ms (with verification)
- Batch paste (4 sections): ~1.2s
- Screenshot: ~150ms (full page)

### Optimization Tips
- Use batch paste for multiple sections (reduces overhead)
- Disable verification in dev (`verify: false`)
- Use headless mode in production (`headless: true`)
- Reuse worker session across multiple operations (don't init/close per request)

## Future Enhancements

- [ ] Advanced VAD integration for command audio suppression
- [ ] WASM-based keyword spotting for wake word detection
- [ ] Multi-tab support (multiple patients/charts simultaneously)
- [ ] Smart paste retry with fallback strategies
- [ ] Visual diff generation (before/after comparison)
- [ ] OCR for screenshot verification (detect paste failures visually)
- [ ] Browser cookie/session persistence (stay logged into EMR)

## License

Proprietary - AssistMD Internal Use Only
