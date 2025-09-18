const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/presign', (_req, res) => {
  res.json({ wssUrl: 'ws://localhost:8080/asr' });
});

const server = app.listen(8080, () => {
  console.log('ASR mock listening on http://localhost:8080');
});

const wss = new WebSocketServer({ server, path: '/asr' });
wss.on('connection', (ws) => {
  console.log('[ASR][WS] client connected');
  ws.on('message', () => {});
  ws.on('close', (code, reason) => console.log('[ASR][WS] close', code, reason?.toString()));
  let i = 0;
  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return clearInterval(timer);
    ws.send(JSON.stringify({ type: 'partial', text: `mock partial ${++i}` }));
    if (i >= 5) {
      ws.send(JSON.stringify({ type: 'final', text: 'mock final result' }));
      clearInterval(timer);
    }
  }, 800);
});
