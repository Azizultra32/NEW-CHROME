const TAG = 'OFF';

let media = null;
let ctx = null;
let src = null;
let analyser = null;
let raf = 0;
let state = 'idle'; // idle | starting | running | stopping | error

let rec = null;
let ws = null;
let wsUrl = null;

let cfg = { wsUrl: null, headers: {} };
let suppressUntil = 0;

function post(status, extra = {}) {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_STATUS', status, ...extra }).catch(() => {});
}

function log(...args) { console.log('[OFF][WS]', ...args); }
function warn(...args) { console.warn('[OFF][WS]', ...args); }
function err(...args) { console.error('[OFF][WS]', ...args); }

async function start() {
  if (state === 'running' || state === 'starting') return;
  state = 'starting';
  post('starting');
  console.log(`[${TAG}][STARTING]`);
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    src = ctx.createMediaStreamSource(media);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);

    console.log(`[${TAG}][GUM] tracks=`, media?.getTracks()?.length ?? 0);

    rec = new MediaRecorder(media, { mimeType: 'audio/webm;codecs=opus' });
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        if (performance.now() < suppressUntil) return;
        ev.data.arrayBuffer().then((buf) => {
          try { ws.send(buf); } catch { /* ignore */ }
        });
      }
    };

    state = 'running';
    post('running');
    loop();

    // If we already have a wsUrl (from OFFSCREEN_CONFIG), connect now
    if (cfg.wsUrl) connectWs(cfg.wsUrl);
  } catch (err) {
    state = 'error';
    post('error', { code: err?.name || 'UNKNOWN', message: String(err) });
    safeStopTracks();
    await safeCloseCtx();
  }
}

function loop() {
  if (state !== 'running') return;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  raf = self.requestAnimationFrame(loop);
}

async function stop() {
  if (state === 'idle' || state === 'stopping') return;
  state = 'stopping';
  self.cancelAnimationFrame(raf);
  console.log(`[${TAG}][STOP]`);

  try { rec && rec.state !== 'inactive' && rec.stop(); } catch {}
  try { ws && ws.readyState === WebSocket.OPEN && ws.close(); } catch {}
  ws = null;
  wsUrl = null;
  rec = null;

  safeStopTracks();
  await safeCloseCtx();
  analyser = null;
  src = null;
  media = null;

  state = 'idle';
  post('idle');
}

function safeStopTracks() {
  try { media && media.getTracks().forEach((t) => t.stop()); } catch {}
}

async function safeCloseCtx() {
  try {
    if (ctx && ctx.state !== 'closed') await ctx.close();
  } catch {}
  ctx = null;
}

function connectWs(url) {
  if (!url) return;
  wsUrl = url;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  chrome.runtime.sendMessage({ type: 'ASR_WS_STATE', state: 'connecting' }).catch(() => {});
  console.log(`[${TAG}][WS][CONNECT]`, url);
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    console.log(`[${TAG}][WS][OPEN]`);
    chrome.runtime.sendMessage({ type: 'ASR_WS_STATE', state: 'open' }).catch(() => {});
    try {
      ws.send(JSON.stringify({ type: 'hello', codec: 'webm/opus', sr: 48000 }));
    } catch {}
    try {
      if (rec && rec.state === 'inactive') rec.start(800); // ~0.8s chunks
    } catch {}
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m?.type === 'partial' && m?.text) {
        console.log(`[${TAG}][WS][PARTIAL]`, m.text.slice(0, 60));
        chrome.runtime.sendMessage({ type: 'ASR_PARTIAL', text: m.text, t0: m.t0, t1: m.t1 }).catch(() => {});
      }
    } catch {
      // ignore binary frames
    }
  };
  ws.onerror = (ev) => {
    console.log(`[${TAG}][WS][ERROR]`, ev);
    chrome.runtime.sendMessage({ type: 'ASR_WS_STATE', state: 'error' }).catch(() => {});
    post('error', { code: 'WS_ERROR' });
  };
  ws.onclose = (ev) => {
    console.log(`[${TAG}][WS][CLOSE] code=`, ev.code, 'reason=', ev.reason);
    chrome.runtime.sendMessage({ type: 'ASR_WS_STATE', state: 'closed' }).catch(() => {});
    try { rec && rec.state !== 'inactive' && rec.stop(); } catch {}
  };
}

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === 'OFFSCREEN_START') {
    console.log('[OFF] START');
    start();
  }
  if (m?.type === 'OFFSCREEN_STOP') {
    console.log('[OFF] STOP');
    stop();
  }
  if (m?.type === 'ASR_CONNECT' && m.wssUrl) {
    const ensure = state === 'idle' ? start() : Promise.resolve();
    Promise.resolve(ensure).then(() => connectWs(m.wssUrl));
  }
  if (m?.type === 'ASR_DISCONNECT') {
    try { ws && ws.readyState === WebSocket.OPEN && ws.close(); } catch {}
    chrome.runtime.sendMessage({ type: 'ASR_WS_STATE', state: 'closed' }).catch(() => {});
  }
  if (m?.type === 'COMMAND_WINDOW' && typeof m.ms === 'number') {
    suppressUntil = performance.now() + Math.max(0, m.ms | 0);
  }
});
