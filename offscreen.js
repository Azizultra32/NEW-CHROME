const TAG = 'OFF';

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 160; // 10ms
const VAD_CFG = { rmsOn: 0.018, rmsOff: 0.012, minSpeechMs: 180, hangMs: 350 };
const FRAME_MS = 10;
const MIN_SPEECH_FRAMES = Math.ceil(VAD_CFG.minSpeechMs / FRAME_MS);
const HANG_FRAMES = Math.ceil(VAD_CFG.hangMs / FRAME_MS);

class Ring {
  constructor(capSamples) {
    this.cap = capSamples | 0;
    this.q = [];
    this.len = 0;
  }
  push(pcm, t0) {
    this.q.push({ pcm, t0 });
    this.len += pcm.length;
    while (this.len > this.cap && this.q.length) {
      const head = this.q[0];
      if (this.len - head.pcm.length >= this.cap) {
        this.len -= head.pcm.length;
        this.q.shift();
      } else {
        break;
      }
    }
  }
  readLastMs(ms) {
    const need = Math.max(1, Math.floor((SAMPLE_RATE * ms) / 1000));
    const out = [];
    let acc = 0;
    for (let i = this.q.length - 1; i >= 0; i--) {
      const f = this.q[i];
      out.push(f);
      acc += f.pcm.length;
      if (acc >= need) break;
    }
    return out.reverse();
  }
}

class Staging {
  constructor(capSamples) {
    this.cap = capSamples | 0;
    this.frames = [];
    this.acc = 0;
  }
  push(pcm, t0) {
    this.frames.push({ pcm, t0 });
    this.acc += pcm.length;
    while (this.acc > this.cap && this.frames.length) {
      const head = this.frames.shift();
      if (!head) break;
      this.acc -= head.pcm.length;
    }
  }
  reset() {
    this.frames = [];
    this.acc = 0;
  }
  dump() {
    return this.frames.slice(0);
  }
}

let mediaStream = null;
let audioCtx = null;
let mediaSrc = null;
let workletNode = null;
let state = 'idle'; // idle | starting | running | stopping | error

let rec = null;
let ws = null;
let wsUrl = null;

let cfg = { wsUrl: null, headers: {} };
let suppressUntil = 0;

const ring = new Ring(SAMPLE_RATE * 10);
const stage = new Staging(SAMPLE_RATE * 3);

let speaking = false;
let speechFrames = 0;
let quietFrames = 0;
let dictationHangFrames = 0;

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
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

    mediaSrc = audioCtx.createMediaStreamSource(mediaStream);
    await audioCtx.audioWorklet.addModule(chrome.runtime.getURL('worklet.js'));
    workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture', { processorOptions: { frameSize: FRAME_SIZE } });
    mediaSrc.connect(workletNode);
    workletNode.port.onmessage = handleFrame;

    console.log(`[${TAG}][GUM] tracks=`, mediaStream?.getTracks()?.length ?? 0);

    rec = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
    rec.ondataavailable = (ev) => {
      if (performance.now() < suppressUntil) return;
      if (ws && ws.readyState === WebSocket.OPEN && ev.data && ev.data.size > 0) {
        if (!shouldStreamDictation()) return;
        ev.data.arrayBuffer().then((buf) => {
          try { ws.send(buf); } catch {}
        });
      }
    };

    try { rec.start(300); } catch {}

    speaking = false;
    speechFrames = 0;
    quietFrames = 0;
    dictationHangFrames = 0;
    stage.reset();

    state = 'running';
    post('running');

    if (cfg.wsUrl) connectWs(cfg.wsUrl);
  } catch (err) {
    state = 'error';
    post('error', { code: err?.name || 'UNKNOWN', message: String(err) });
    safeStopTracks();
    await safeCloseCtx();
  }
}

async function stop() {
  if (state === 'idle' || state === 'stopping') return;
  state = 'stopping';
  console.log(`[${TAG}][STOP]`);

  try { rec && rec.state !== 'inactive' && rec.stop(); } catch {}
  try { ws && ws.readyState === WebSocket.OPEN && ws.close(); } catch {}
  ws = null;
  wsUrl = null;
  rec = null;

  safeStopTracks();
  await safeCloseCtx();
  workletNode = null;
  mediaSrc = null;
  mediaStream = null;

  state = 'idle';
  post('idle');
}

function safeStopTracks() {
  try { mediaStream && mediaStream.getTracks().forEach((t) => t.stop()); } catch {}
}

async function safeCloseCtx() {
  try {
    if (workletNode) {
      try { workletNode.disconnect(); } catch {}
    }
    if (mediaSrc) {
      try { mediaSrc.disconnect(); } catch {}
    }
    if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close();
  } catch {}
  audioCtx = null;
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
      if (rec && rec.state === 'inactive') rec.start(300); // ~0.3s chunks
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

function handleFrame({ data }) {
  if (!data || data.type !== 'frame') return;
  const pcm = data.pcm;
  const t0 = data.t0;
  ring.push(pcm, t0);

  const rms = calcRms(pcm);
  const loud = rms >= VAD_CFG.rmsOn;
  const quiet = rms < VAD_CFG.rmsOff;

  if (!speaking) {
    if (loud) {
      speechFrames++;
      if (speechFrames >= MIN_SPEECH_FRAMES) {
        speaking = true;
        speechFrames = 0;
        quietFrames = 0;
        dictationHangFrames = HANG_FRAMES;
        chrome.runtime.sendMessage({ type: 'ASR_VAD', state: 'speaking' }).catch(() => {});
      }
    } else {
      speechFrames = 0;
    }
  } else {
    if (quiet) {
      quietFrames++;
      if (quietFrames >= HANG_FRAMES) {
        speaking = false;
        quietFrames = 0;
        dictationHangFrames = 0;
        chrome.runtime.sendMessage({ type: 'ASR_VAD', state: 'quiet' }).catch(() => {});
      }
    } else {
      quietFrames = 0;
      dictationHangFrames = HANG_FRAMES;
    }
  }

  if (!speaking && dictationHangFrames > 0) {
    dictationHangFrames = Math.max(0, dictationHangFrames - 1);
  }

  if (speaking) stage.push(pcm, t0);
}

function shouldStreamDictation() {
  return speaking || dictationHangFrames > 0;
}

function calcRms(pcm) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}
