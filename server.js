import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/presign', (_req, res) => {
  res.json({ wssUrl: 'ws://localhost:8080/asr' });
});

// Align with background.js expectation for local testing
// POST /v1/encounters/:id/presign -> { wssUrl, headers }
app.post('/v1/encounters/:id/presign', (req, res) => {
  const { id } = req.params || {};
  console.log('[ASR][PRESIGN] encounter=', id);
  res.json({ wssUrl: 'ws://localhost:8080/asr', headers: {} });
});

// Minimal audit endpoint for local testing
// POST /v1/audit { type, encounterId, fp, ts }
app.post('/v1/audit', (req, res) => {
  try {
    const { type, encounterId, fp, extra } = req.body || {};
    console.log('[AUDIT]', new Date().toISOString(), type, encounterId, fp, extra || '');
    return res.json({ ok: true });
  } catch (e) {
    console.warn('[AUDIT][ERR]', e);
    return res.status(500).json({ ok: false });
  }
});

const server = app.listen(8080, () => {
  console.log('ASR mock listening on http://localhost:8080');
});

const wss = new WebSocketServer({ server, path: '/asr' });

// Track connections to prevent duplicate messages
const activeConnections = new Set();
let connectionId = 0;

wss.on('connection', (ws) => {
  const id = ++connectionId;
  activeConnections.add(id);
  console.log(`[ASR][WS] client connected (id: ${id}, total: ${activeConnections.size})`);
  
  // Assign ID to this websocket for tracking
  ws.connectionId = id;
  
  ws.on('message', () => {});
  ws.on('close', (code, reason) => {
    activeConnections.delete(id);
    console.log(`[ASR][WS] close ${code} ${reason?.toString() || ''} (id: ${id}, remaining: ${activeConnections.size})`);
  });

  const scripted = process.env.MOCK_SCRIPTED === '1';
  // Default: low-noise partials only; Optional: scripted commands if MOCK_SCRIPTED=1
  const messages = scripted ? [
    { t: 400,  text: 'patient reports mild headache since yesterday' },
    { t: 1400, text: 'assist insert plan' },
    { t: 2600, text: 'assist bookmark' },
    { t: 3800, text: 'assist newline' },
    { t: 5000, text: 'assist timestamp' },
    { t: 6200, text: 'assist pause' },
    { t: 7600, text: 'assist resume' },
    { t: 9000, text: 'assist stop' },
    { t: 10500, final: true, text: 'mock final result' }
  ] : Array.from({ length: 10 }).map((_, i) => ({ t: 600 + 600 * i, text: `mock partial ${i + 1}` }));

  // Send unique messages per partial to avoid client-side duplication
  const timers = [];
  let messageIndex = 0;
  
  for (const m of messages) {
    timers.push(setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;
      const msgId = `${id}-${++messageIndex}`;
      if (m.final) {
        ws.send(JSON.stringify({ type: 'final', text: m.text, id: msgId }));
      } else {
        ws.send(JSON.stringify({ type: 'partial', text: m.text, id: msgId }));
      }
      console.log(`[ASR][WS] Sent message ${msgId}: "${m.text.substring(0, 20)}..."`);
    }, m.t));
  }

  ws.on('close', () => timers.forEach((tid) => clearTimeout(tid)));
});
