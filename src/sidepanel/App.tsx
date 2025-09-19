import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { CommandStrip } from './components/CommandStrip';
import { TranscriptList } from './components/TranscriptList';
import { Controls } from './components/Controls';
import { ToastProvider, useToast } from './components/Toast';
import { UI } from './lib/ui-tokens';
import { transcript } from './lib/transcript';
import { parseIntent } from './intent';
import { verifyPatientBeforeInsert, confirmPatientFingerprint, GuardStatus } from './lib/guard';
import { loadProfile, saveProfile, FieldMapping, Section } from './lib/mapping';
import { insertTextInto } from './lib/insert';
import { isDevelopmentBuild } from './lib/env';
const BASE_COMMAND_MESSAGE = 'Ready for “assist …” commands';

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [opacity, setOpacity] = useState(80);
  const [mode, setMode] = useState<'idle' | 'mock' | 'live'>('idle');
  const [wsState, setWsState] = useState<'disconnected' | 'connecting' | 'open' | 'error'>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState<string>('');
  const [profile, setProfile] = useState<Record<Section, FieldMapping>>({} as any);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiBase, setApiBase] = useState('');
  const [wsEvents, setWsEvents] = useState<string[]>([]);
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [transcriptFormat, setTranscriptFormat] = useState<'RAW' | 'SOAP' | 'APSO'>('RAW');
  const [commandMessage, setCommandMessage] = useState(BASE_COMMAND_MESSAGE);
  const commandMessageResetRef = useRef<number | null>(null);
  const [pendingGuard, setPendingGuard] = useState<GuardStatus | null>(null);

  const setCommandFeedback = (msg: string, persist = false) => {
    if (commandMessageResetRef.current) {
      window.clearTimeout(commandMessageResetRef.current);
      commandMessageResetRef.current = null;
    }
    setCommandMessage(msg);
    if (!persist) {
      commandMessageResetRef.current = window.setTimeout(() => {
        setCommandMessage(BASE_COMMAND_MESSAGE);
        commandMessageResetRef.current = null;
      }, 2000);
    }
  };

  const pushWsEvent = (msg: string) => {
    setWsEvents((prev) => [msg, ...prev].slice(0, 5));
  };

  const recordingRef = useRef(recording);
  const busyRef = useRef(busy);
  const onToggleRef = useRef(onToggleRecord);
  const toastRef = useRef(toast);
  const commandCooldownRef = useRef(0);

  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onToggleRef.current = onToggleRecord; }, [onToggleRecord]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  function sendInsert(text: string) {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', text }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  function speak(text: string) {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis?.speak(utterance);
    } catch {}
  }

  async function onInsertPlan(opts?: { bypassGuard?: boolean }) {
    if (!host) {
      toast.push('No host context for mapping');
      return;
    }
    const planField = profile?.PLAN;
    if (!planField?.selector) {
      toast.push('Map PLAN field first');
      return;
    }
    if (!opts?.bypassGuard) {
      const guard = await verifyPatientBeforeInsert();
      if (!guard.ok) {
        if (guard.reason === 'missing') {
          toast.push('No patient detected. View the chart before inserting.');
          setLastError('Confirm patient before inserting');
          return;
        }
        if (guard.reason === 'unconfirmed' || guard.reason === 'mismatch') {
          setPendingGuard(guard);
          toast.push('Confirm patient before inserting');
          setLastError('Confirm patient before inserting');
          pushWsEvent('guard: insert blocked');
          return;
        }
        toast.push('Patient guard error. Try again.');
        setLastError('Confirm patient before inserting');
        return;
      }
    }
    const text = transcript
      .get()
      .filter((x) => !x.text.startsWith('[MOCK]'))
      .map((x) => x.text)
      .join(' ')
      .trim();
    const strategy = await insertTextInto(planField.selector, text || '(empty)');
    toast.push(`Insert via ${strategy}`);
    pushWsEvent('audit: plan inserted');
    setLastError(null);
  }

  const COMMAND_COOLDOWN_MS = 1800;

  // Web Speech result path (hybrid fallback) — parses intent and runs command
  async function handleSRResult(event: any) {
    // Use only the latest result to avoid accumulating previous phrases
    const idx = typeof event.resultIndex === 'number' ? event.resultIndex : event.results.length - 1;
    const res = event.results[idx] || event.results[event.results.length - 1];
    const text = Array.from(res)
      .map((r: any) => r?.transcript || '')
      .join(' ')
      .trim();
    if (!text) return;
    console.log('[AssistMD][SR] heard:', text);

    if ((window as any).speechSynthesis?.speaking) {
      try { await chrome.runtime.sendMessage({ type: 'COMMAND_WINDOW', ms: 800 }); } catch {}
      return;
    }

    const intent = parseIntent(text);
    console.log('[AssistMD][SR] intent:', intent);
    if (!intent) return;

    await runCommand(intent);
  }

  async function runCommand(intent: ReturnType<typeof parseIntent>) {
    if (!intent) return;
    const now = Date.now();
    if (now < commandCooldownRef.current) return;

    try {
      await chrome.runtime.sendMessage({ type: 'COMMAND_WINDOW', ms: COMMAND_COOLDOWN_MS });
    } catch (err) {
      console.warn('[AssistMD] COMMAND_WINDOW dispatch failed', err);
    }

    switch (intent.name) {
      case 'start':
        if (!recordingRef.current && !busyRef.current) {
          onToggleRef.current?.();
          speak('Recording started');
          setCommandFeedback('Command: start recording');
        }
        break;
      case 'stop':
        if (recordingRef.current) {
          onToggleRef.current?.();
          speak('Recording stopped');
          setCommandFeedback('Command: stop recording');
        }
        break;
      case 'bookmark':
        transcript.addPartial('[bookmark]');
        speak('Bookmarked');
        setCommandFeedback('Command: bookmark');
        break;
      case 'newline':
        sendInsert('\n');
        speak('New line');
        setCommandFeedback('Command: new line');
        break;
      case 'timestamp':
        sendInsert(new Date().toLocaleTimeString());
        speak('Timestamp');
        setCommandFeedback('Command: timestamp');
        break;
      case 'insert':
        speak(`${intent.section} noted`);
        setCommandFeedback(`Command: insert ${intent.section}`);
        if (intent.section === 'plan') {
          await onInsertPlan();
        } else {
          toastRef.current?.push(`Insert ${intent.section.toUpperCase()} not wired yet`);
        }
        break;
      default:
        // No-op
        break;
    }

    pushWsEvent(`command: ${intent.name}`);
    setCommandLog((prev) => [`${new Date().toLocaleTimeString()} · ${intent.name}`, ...prev].slice(0, 5));
    commandCooldownRef.current = now + COMMAND_COOLDOWN_MS;
  }

  useEffect(() => () => {
    if (commandMessageResetRef.current) {
      window.clearTimeout(commandMessageResetRef.current);
      commandMessageResetRef.current = null;
    }
  }, []);

  // Web Speech supervisor (hybrid): kept paused during dictation; resumes on quiet
  useEffect(() => {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      console.warn('[AssistMD] Web Speech not supported');
      return;
    }

    let rec: any = null;
    let live = false;
    let killed = false;
    let wantOn = true;
    let restartTimer: any = null;
    let cooldownUntil = 0;
    const RESTART_MS = 600;

    const startSR = () => {
      if (killed || live || !wantOn) return;
      if (Date.now() < cooldownUntil) return;
      try {
        rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = handleSRResult;
        rec.onerror = (e: any) => {
          const err = e?.error || e;
          const benign = err === 'no-speech' || err === 'aborted' || err === 'network';
          if (!benign) console.warn('[AssistMD] SpeechRecognition error', err);
          cooldownUntil = Date.now() + 800;
        };
        rec.onend = () => {
          live = false;
          if (killed) return;
          if (wantOn) {
            clearTimeout(restartTimer);
            restartTimer = setTimeout(startSR, RESTART_MS);
          }
        };

        rec.start();
        live = true;
      } catch {
        live = false;
        cooldownUntil = Date.now() + 800;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startSR, RESTART_MS);
      }
    };

    const stopSR = () => {
      wantOn = false;
      clearTimeout(restartTimer);
      if (live && rec) {
        try { rec.stop(); } catch {}
      }
      live = false;
    };

    const speakGuard = setInterval(() => {
      const talking = (window as any).speechSynthesis?.speaking;
      if (talking) {
        if (live && rec) {
          try { rec.stop(); } catch {}
        }
        live = false;
      } else if (wantOn && !live) {
        startSR();
      }
    }, 200);

    const onMsg = (m: any) => {
      if (m?.type === 'ASR_VAD') {
        if (m.state === 'speaking') {
          wantOn = false;
          if (live && rec) {
            try { rec.stop(); } catch {}
          }
          live = false;
        } else if (m.state === 'quiet') {
          wantOn = true;
          startSR();
        }
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);

    const kick = () => {
      wantOn = true;
      startSR();
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
    const idle = setTimeout(() => { wantOn = true; startSR(); }, 800);

    startSR();

    return () => {
      killed = true;
      clearTimeout(idle);
      clearInterval(speakGuard);
      chrome.runtime.onMessage.removeListener(onMsg);
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      stopSR();
    };
  }, [handleSRResult]);

  const getContentTab = useCallback(async () => {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const acceptable = (url?: string | undefined) => {
      if (!url) return false;
      return !url.startsWith('chrome://') &&
        !url.startsWith('edge://') &&
        !url.startsWith('about:') &&
        !url.startsWith('chrome-extension://');
    };

    const active = tabs.find((tab) => tab.active && acceptable(tab.url));
    if (active) return active;

    const first = tabs.find((tab) => acceptable(tab.url));
    return first ?? null;
  }, []);

  // Capture active tab host & load mapping profile
  useEffect(() => {
    (async () => {
      try {
        const tab = await getContentTab();
        if (tab?.url) {
          const url = new URL(tab.url);
          setHost(url.hostname);
          setProfile(await loadProfile(url.hostname));
        }
      } catch {}
    })();
  }, [getContentTab]);

  useEffect(() => {
    (async () => {
      const fallback = (window as any).__ASSIST_CONFIG__?.API_BASE || 'http://localhost:8080';
      try {
        const { API_BASE } = await chrome.storage.local.get(['API_BASE']);
        setApiBase(API_BASE || fallback);
      } catch {
        setApiBase(fallback);
      }
    })();
  }, []);

  const saveApiBase = useCallback(async () => {
    try {
      await chrome.storage.local.set({ API_BASE: apiBase.trim() });
      toast.push('API base saved. Reload the EHR page.');
    } catch {
      toast.push('Failed to save API base');
    }
  }, [apiBase, toast]);

  // Keyboard toggle for focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      if ((mac ? e.metaKey : e.ctrlKey) && e.key === '`') {
        setFocusMode((f) => !f);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onMapFields = useCallback(async () => {
    const activeTab = await getContentTab();
    if (!activeTab?.id) {
      toast.push('No active tab');
      return;
    }

    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section: 'PLAN' });
      toast.push('Click a PLAN field to map');
      return;
    } catch (primaryErr) {
      console.warn('MAP_MODE initial send failed, attempting injection', primaryErr);
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      });

      await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section: 'PLAN' });
      toast.push('Click a PLAN field to map');
    } catch (fallbackErr) {
      console.error('MAP_MODE fallback failed', fallbackErr);
      toast.push('Unable to enter map mode — reload the EHR tab and try again.');
    }
  }, [toast, getContentTab]);

  const formatTranscript = useCallback(() => {
    const items = transcript
      .get()
      .filter((x) => !x.text.startsWith('['));
    const lines = items.map((x) => x.text.trim()).filter(Boolean);
    const rawBlock = lines.join('\n').trim();
    const rawText = lines.join(' ');
    if (!rawText) return '(empty)';
    if (transcriptFormat === 'RAW') return rawBlock;

    const sentences = rawText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const buckets: Record<'S' | 'O' | 'A' | 'P', string[]> = {
      S: [], O: [], A: [], P: []
    };
    const pushTo = (key: 'S' | 'O' | 'A' | 'P', sentence: string) => {
      buckets[key].push(sentence);
    };
    sentences.forEach((sentence) => {
      const lower = sentence.toLowerCase();
      if (/(assessment|diagnosis|impression|problem)/.test(lower)) {
        pushTo('A', sentence);
        return;
      }
      if (/(plan|recommend|follow up|follow-up|will |start |increase|prescrib|schedule|refer)/.test(lower)) {
        pushTo('P', sentence);
        return;
      }
      if (/(exam|physical|vital|blood pressure|heart rate|lungs|labs?|objective|findings?)/.test(lower)) {
        pushTo('O', sentence);
        return;
      }
      if (/(report|reports|denies|complain|history|symptom|pain|subjective)/.test(lower)) {
        pushTo('S', sentence);
        return;
      }
      if (buckets.S.length === 0) {
        pushTo('S', sentence);
      } else {
        pushTo('O', sentence);
      }
    });

    const order = transcriptFormat === 'SOAP' ? ['S', 'O', 'A', 'P'] : ['A', 'P', 'S', 'O'];
    const headers: Record<'S' | 'O' | 'A' | 'P', string> = {
      S: 'Subjective',
      O: 'Objective',
      A: 'Assessment',
      P: 'Plan'
    };

    const sections = order
      .map((key) => {
        const section = buckets[key as 'S' | 'O' | 'A' | 'P'];
        if (!section.length) return null;
        return `${headers[key as 'S' | 'O' | 'A' | 'P']}
${section.join(' ')}`;
      })
      .filter(Boolean);

    return sections.length ? sections.join('\n\n') : rawBlock;
  }, [transcriptFormat]);

  const onCopyTranscript = useCallback(async () => {
    const payload = formatTranscript();
    try {
      await navigator.clipboard.writeText(payload);
      toast.push('Transcript copied');
    } catch (err) {
      console.warn('[AssistMD] copy transcript failed', err);
      toast.push('Unable to copy transcript');
    }
  }, [formatTranscript, toast]);

  async function onToggleRecord() {
    console.log('[AssistMD] onToggleRecord called');
    if (!recording && busy) return;
    setBusy(true);
    try {
      if (!recording) {
        setRecording(true);
        setMode('mock');
        setWsState('connecting');
        setLastError(null);

        try {
          const s = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          s.getTracks().forEach((t) => t.stop());
        } catch (e: any) {
          const name = e?.name || 'PermissionError';
          setRecording(false);
          setMode('idle');
          setWsState('disconnected');
          const message = name === 'NotFoundError'
            ? 'No microphone detected. Check your input device and reload the tab.'
            : name === 'NotAllowedError'
              ? 'Microphone blocked. Allow access in the prompt or Chrome settings.'
              : name === 'AbortError'
                ? 'Temporary mic error. Try again.'
                : name;
          setLastError(message);
          toast.push(message);
          return;
        }

        transcript.clear();

        try {
          const res = await chrome.runtime.sendMessage({ type: 'START_CAPTURE' });
          console.log('[AssistMD] START_CAPTURE reply:', res);
        } catch (e) {
          console.warn('[AssistMD] START_CAPTURE failed; staying in mock mode', e);
        }

        try {
          const encId = crypto.randomUUID();
          const presign = await chrome.runtime.sendMessage({ type: 'PRESIGN_WS', encounterId: encId });
          if (presign?.ok && presign.wssUrl) {
            await chrome.runtime.sendMessage({ type: 'ASR_CONNECT', wssUrl: presign.wssUrl });
          } else {
            transcript.addPartial('[ws] presign failed — staying in mock mode');
            setMode('mock');
            setWsState('error');
            const msg = `Presign failed (${presign?.status ?? 'n/a'})`;
            setLastError(msg);
            toast.push(msg);
          }
        } catch {
          transcript.addPartial('[ws] request failed — staying in mock mode');
          setMode('mock');
          setWsState('error');
          const msg = 'Presign request failed';
          setLastError(msg);
          toast.push(msg);
        }
      } else {
        await chrome.runtime.sendMessage({ type: 'ASR_DISCONNECT' }).catch(() => {});
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
        setRecording(false);
        setMode('idle');
        setWsState('disconnected');
        transcript.clear();
      }
    } finally {
      setBusy(false);
    }
  }

  // Listen for status + data from background/offscreen
  useEffect(() => {
    const handler = (m: any) => {
      if (m?.type === 'OFFSCREEN_STATUS') {
        pushWsEvent(`status: ${m.status}${m.code ? ` (${m.code})` : ''}`);
        if (m.status === 'running') {
          setRecording(true);
          setLastError(null);
          setWsState('connecting');
          if (mode !== 'live') {
            const items = transcript.get();
            if (!items.length || !items[items.length - 1].text.startsWith('[MOCK]')) {
            transcript.addPartial('[MOCK] …listening');
            }
            setMode('mock');
          }
        }
        if (m.status === 'idle') {
          setRecording(false);
          setWsState('disconnected');
          setMode('idle');
          transcript.clear();
        }
        if (m.status === 'error') {
          setRecording(false);
          setMode('mock');
          setWsState('error');
          const code = m.code || 'Streaming error';
          setLastError(code);
          transcript.addPartial(`[error] ${m.code ?? 'unknown'}`);
          toast.push(code);
        }
      }
      if (m?.type === 'ASR_WS_STATE') {
        pushWsEvent(`ws: ${m.state}`);
        if (m.state === 'open') {
          setWsState('open');
          setMode('live');
          setLastError(null);
        }
        if (m.state === 'connecting') setWsState('connecting');
        if (m.state === 'closed') {
          setWsState(recording ? 'connecting' : 'disconnected');
          if (!recording) setMode('idle');
        }
        if (m.state === 'error') {
          setWsState('error');
          setMode('mock');
          setLastError('WebSocket error');
        }
      }
      if (m?.type === 'ASR_PARTIAL') {
        const txt = String(m.text || '');
        pushWsEvent(`partial: ${txt.slice(0, 30)}`);
        if (txt) {
          // Wake on "assist …" directly from partials
          const low = txt.toLowerCase();
          const idx = low.indexOf('assist ');
          if (idx !== -1) {
            const tail = low.slice(idx + 'assist '.length).trim();
            const intent = parseIntent('assist ' + tail);
            if (intent) {
              // Run command and do not add this partial to transcript
              runCommand(intent);
              return;
            }
          }

          setMode('live');
          setWsState('open');
          setLastError(null);
          transcript.addPartial(txt, m.t0, m.t1);
        }
      }
      if (m?.type === 'MAP_PICK' && m.selector && m.section) {
        const next = { ...(profile || {}) };
        next[m.section as Section] = {
          section: m.section,
          selector: m.selector,
          strategy: 'value',
          verified: false
        };
        setProfile(next);
        if (host) saveProfile(host, next);
        toast.push(`Mapped ${m.section} → ${m.selector}`);
      }
      if (m?.type === 'EHR_FP' && m.preview) {
        pushWsEvent(`fp: ${m.preview}`);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [mode, recording, profile, host, toast, pushWsEvent]);

  // Disconnect ASR capture if the panel unmounts mid-session
  useEffect(() => {
    if (!recording) return;
    return () => {
      chrome.runtime.sendMessage({ type: 'ASR_DISCONNECT' }).catch(() => {});
      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
    };
  }, [recording]);

  const panelStyle = useMemo(() => ({
    minHeight: '100vh',
    width: UI.panel.width + 'px',
    maxWidth: UI.panel.width + 'px',
    borderRadius: UI.panel.radius,
    backdropFilter: 'blur(14px)',
    background: focusMode ? UI.colors.panelBgFocus : `rgba(255,255,255,${opacity / 100})`,
    color: UI.colors.text
  }), [focusMode, opacity]);

  const wsMonitor = isDevelopmentBuild && (
    <div className="text-[11px] text-slate-500 space-y-1">
      {wsEvents.map((e, i) => (<div key={i}>• {e}</div>))}
    </div>
  );

  return (
    <div className="relative">
      {focusMode && <div aria-hidden className="fixed inset-0" style={{ background: 'rgba(10,14,22,0.28)', pointerEvents: 'none' }} />}
      <div className="min-h-screen" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <main className="shadow-2xl border border-slate-200" style={panelStyle}>
          <div className="p-4 space-y-4">
            <Header
              recording={recording}
              focusMode={focusMode}
              opacity={opacity}
              mode={mode}
              wsState={wsState}
              onToggleFocus={() => setFocusMode((v) => !v)}
              onOpacity={setOpacity}
              onOpenSettings={() => setSettingsOpen((v) => !v)}
            />
            {settingsOpen && (
              <div className="rounded-lg border border-slate-200 bg-white/95 p-3 space-y-2">
                <div className="text-sm font-medium">Settings</div>
                <label className="block text-[12px] text-slate-600">API Base</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="https://api.your-domain.com"
                />
                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white"
                    onClick={saveApiBase}
                  >
                    Save
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="text-[12px] text-slate-500">
                  After updating the API base, reload the EHR page and start again.
                </div>
              </div>
            )}
            {wsState === 'connecting' && (
              <div className="text-xs text-slate-500">Connecting to ASR…</div>
            )}
            {lastError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 text-sm flex items-center justify-between">
                <span>{lastError}</span>
                <button
                  className="px-2 py-1 text-xs rounded-md bg-rose-600 text-white"
                  onClick={async () => {
                    setLastError(null);
                    await onToggleRecord();
                  }}
                  disabled={busy}
                >
                  Retry
                </button>
              </div>
            )}
            <CommandStrip message={commandMessage} />
            <TranscriptList />
            {wsMonitor}
            {commandLog.length > 0 && (
              <div className="text-[11px] text-slate-500 space-y-1 border border-slate-200 bg-white/80 rounded-lg px-3 py-2">
                {commandLog.map((entry, idx) => (
                  <div key={idx}>• {entry}</div>
                ))}
              </div>
            )}
            <Controls
              recording={recording}
              busy={busy}
              onToggleRecord={onToggleRecord}
              onInsertPlan={onInsertPlan}
              onCopyTranscript={onCopyTranscript}
              transcriptFormat={transcriptFormat}
              onFormatChange={setTranscriptFormat}
              onMapFields={onMapFields}
            />
            {pendingGuard && !pendingGuard.ok && pendingGuard.fp && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm space-y-2">
                <div className="font-medium">Confirm patient before inserting</div>
                {pendingGuard.preview && <div className="text-xs text-amber-700">Current chart: {pendingGuard.preview}</div>}
                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded-md bg-amber-600 text-white"
                    onClick={async () => {
                      await confirmPatientFingerprint(pendingGuard.fp!, pendingGuard.preview);
                      pushWsEvent('guard: patient confirmed');
                      setPendingGuard(null);
                      toast.push('Patient confirmed');
                      await onInsertPlan({ bypassGuard: true });
                    }}
                  >
                    Confirm patient
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-amber-400"
                    onClick={() => {
                      setPendingGuard(null);
                      toast.push('Insert cancelled');
                      pushWsEvent('guard: insert cancelled');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
