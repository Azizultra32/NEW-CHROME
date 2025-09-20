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
import { insertTextInto, insertUsingMapping, verifyTarget, undoLastInsert } from './lib/insert';
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
  const lastFpRef = useRef<string | null>(null);
  const [liveWords, setLiveWords] = useState('');
  const [pttActive, setPttActive] = useState(false);
  const pttActiveRef = useRef(false);

  const defaultTemplates: Record<Section, string> = {
    PLAN: `Plan:\n- Medications: \n- Labs/Imaging: \n- Referrals: \n- Follow-up: \n`,
    HPI: `Chief Complaint: \nHistory of Present Illness: \n`,
    ROS: `Review of Systems: Negative except as noted above.`,
    EXAM: `Physical Exam:\n- General: \n- HEENT: \n- Heart: \n- Lungs: \n- Abdomen: \n- Extremities: \n- Neuro: \n`
  };

  // Feature flags to mitigate risk and allow quick disable
  const [features, setFeatures] = useState({ templates: true, undo: true, multi: true, preview: false, autoBackup: true, tplPerHost: true });
  useEffect(() => {
    (async () => {
      try {
        const bag = await chrome.storage.local.get(['FEAT_TEMPLATES','FEAT_UNDO','FEAT_MULTI','FEAT_PREVIEW','FEAT_AUTO_BACKUP','FEAT_TPL_PER_HOST']);
        setFeatures({
          templates: bag.FEA_TEMPLATES ?? bag.FEAT_TEMPLATES ?? true,
          undo: bag.FEA_UNDO ?? bag.FEAT_UNDO ?? true,
          multi: bag.FEA_MULTI ?? bag.FEAT_MULTI ?? true,
          preview: bag.FEA_PREVIEW ?? bag.FEAT_PREVIEW ?? false,
          autoBackup: bag.FEA_AUTO_BACKUP ?? bag.FEAT_AUTO_BACKUP ?? true,
          tplPerHost: bag.FEA_TPL_PER_HOST ?? bag.FEAT_TPL_PER_HOST ?? true
        });
      } catch {}
    })();
  }, []);
  const saveFeatures = useCallback(async (next: { templates: boolean; undo: boolean; multi: boolean; preview: boolean; autoBackup: boolean; tplPerHost: boolean }) => {
    try {
      await chrome.storage.local.set({ FEAT_TEMPLATES: next.templates, FEAT_UNDO: next.undo, FEAT_MULTI: next.multi, FEAT_PREVIEW: next.preview, FEAT_AUTO_BACKUP: next.autoBackup, FEAT_TPL_PER_HOST: next.tplPerHost });
      setFeatures(next);
      toast.push('Features updated');
    } catch { toast.push('Failed to update features'); }
  }, [toast]);

  // Local recovery snapshot to storage
  const backupTimerRef = useRef<number | null>(null);
  const scheduleBackup = useCallback(() => {
    if (!features.autoBackup) return;
    if (backupTimerRef.current) window.clearTimeout(backupTimerRef.current);
    backupTimerRef.current = window.setTimeout(async () => {
      try {
        const bag = await chrome.storage.local.get(null);
        const keep = Object.keys(bag).filter((k) => (
          k === 'API_BASE' ||
          k.startsWith('MAP_') ||
          k.startsWith('TPL_') ||
          k.startsWith('FEAT_') ||
          k === 'ASSIST_CONFIRMED_FP' ||
          k === 'ASSISTMD_LAST_TRANSCRIPT_V1'
        ));
        const snapshot: any = { ts: Date.now(), version: 1, data: {} };
        keep.forEach((k) => { snapshot.data[k] = (bag as any)[k]; });
        await chrome.storage.local.set({ ASSIST_BACKUP_SNAPSHOT_V1: snapshot });
      } catch {}
    }, 400);
  }, [features.autoBackup]);

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

  // Local audit helper (mock server)
  const audit = useCallback(async (type: string, extra?: any) => {
    try {
      const base = apiBase || 'http://localhost:8080';
      await fetch(`${base}/v1/audit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ts: Date.now(), extra })
      }).catch(() => {});
    } catch {}
  }, [apiBase]);

  const recordingRef = useRef(recording);
  const busyRef = useRef(busy);
  const onToggleRef = useRef(onToggleRecord);
  const toastRef = useRef(toast);
  const commandCooldownRef = useRef(0);
  const lastPartialIntentRef = useRef<{ name: string; until: number } | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const messageIdCleanupRef = useRef<number | null>(null);

  // Recovery snapshot state
  const [snapshotInfo, setSnapshotInfo] = useState<{ ts: number; keys: string[] } | null>(null);
  const [recoveryBanner, setRecoveryBanner] = useState(false);

  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onToggleRef.current = onToggleRecord; }, [onToggleRecord]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Ensure content script is present in active content tab when panel is open
  // (defined later, after getContentTab)
  let ensureContentScript: () => Promise<void>;

  // Load last transcript from storage on mount
  useEffect(() => {
    transcript.loadFromStorage().then((ok) => {
      if (ok) {
        try { toast.push('Loaded last transcript'); } catch {}
      }
    }).catch(() => {});
  }, []);

  // Detect recovery snapshot and surface banner if mappings missing
  useEffect(() => {
    (async () => {
      try {
        const all = await chrome.storage.local.get(null);
        const snap = all?.ASSIST_BACKUP_SNAPSHOT_V1 as { ts?: number; data?: Record<string, any> } | undefined;
        if (snap && snap.data && typeof snap.data === 'object') {
          const keys = Object.keys(snap.data);
          setSnapshotInfo({ ts: Number(snap.ts || 0), keys });
          const hasMappings = Object.keys(all).some((k) => k.startsWith('MAP_'));
          // If no mappings present locally but snapshot exists → show banner
          if (!hasMappings) setRecoveryBanner(true);
        }
      } catch {}
    })();
  }, []);

  const forceRestoreSnapshot = useCallback(async () => {
    try {
      const all = await chrome.storage.local.get(['ASSIST_BACKUP_SNAPSHOT_V1']);
      const snap = all?.ASSIST_BACKUP_SNAPSHOT_V1 as { data?: Record<string, any> } | undefined;
      if (!snap || !snap.data || typeof snap.data !== 'object') { toast.push('No snapshot to restore'); return; }
      await chrome.storage.local.set(snap.data);
      toast.push('Snapshot restored. Reload the EHR page.');
      setRecoveryBanner(false);
    } catch {
      toast.push('Snapshot restore failed');
    }
  }, [toast]);

  // Load templates (host-scoped if enabled), fallback to global
  useEffect(() => {
    (async () => {
      try {
        const keys = ['TPL_PLAN','TPL_HPI','TPL_ROS','TPL_EXAM'];
        if (features.tplPerHost && host) {
          keys.push(`TPL_${host}_PLAN`, `TPL_${host}_HPI`, `TPL_${host}_ROS`, `TPL_${host}_EXAM`);
        }
        const bag = await chrome.storage.local.get(keys);
        (defaultTemplates as any).PLAN = (features.tplPerHost && host && bag[`TPL_${host}_PLAN`]) || bag.TPL_PLAN || (defaultTemplates as any).PLAN;
        (defaultTemplates as any).HPI  = (features.tplPerHost && host && bag[`TPL_${host}_HPI`])  || bag.TPL_HPI || (defaultTemplates as any).HPI;
        (defaultTemplates as any).ROS  = (features.tplPerHost && host && bag[`TPL_${host}_ROS`])  || bag.TPL_ROS || (defaultTemplates as any).ROS;
        (defaultTemplates as any).EXAM = (features.tplPerHost && host && bag[`TPL_${host}_EXAM`]) || bag.TPL_EXAM || (defaultTemplates as any).EXAM;
      } catch {}
    })();
  }, [features.tplPerHost, host]);

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

  const [pendingInsert, setPendingInsert] = useState<null | { section: Section; payload: string }>(null);

  const [remapPrompt, setRemapPrompt] = useState<null | { section: Section }>(null);

  async function onInsert(section: Section, opts?: { bypassGuard?: boolean }) {
    if (!host) {
      toast.push('No host context for mapping');
      return;
    }
    const field = profile?.[section];
    if (!field?.selector) {
      toast.push(`Map ${section} field first`);
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
          audit('insert_blocked', { reason: guard.reason, section });
          return;
        }
        toast.push('Patient guard error. Try again.');
        setLastError('Confirm patient before inserting');
        return;
      }
    }
    // Verify target exists and editable
    const verify = await verifyTarget(field as any);
    if (!verify.ok) {
      const reason = verify.reason === 'missing' ? 'Field not found' : 'Not editable';
      setLastError(reason);
      setRemapPrompt({ section });
      return;
    }

    const text = transcript
      .get()
      .filter((x) => !x.text.startsWith('[MOCK]'))
      .map((x) => x.text)
      .join(' ')
      .trim();
    const payload = text || '(empty)';
    if (features.preview && !opts?.bypassGuard) {
      setPendingInsert({ section, payload });
      return;
    }
    const strategy = await insertUsingMapping(field as any, payload);
    toast.push(`Insert ${section} via ${strategy}`);
    pushWsEvent(`audit: ${section.toLowerCase()} inserted`);
    audit('insert_ok', { strategy, section });
    setLastError(null);
    scheduleBackup();
  }

  const COMMAND_COOLDOWN_MS = 1000;

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
    // Reflect in live word strip too
    setLiveWords(text);

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
    if (now < commandCooldownRef.current) {
      pushWsEvent('command: blocked (cooldown)');
      return;
    }

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
      case 'pause':
        if (recordingRef.current) {
          onToggleRef.current?.();
          speak('Recording paused');
          setCommandFeedback('Command: pause recording');
        }
        break;
      case 'resume':
        if (!recordingRef.current && !busyRef.current) {
          onToggleRef.current?.();
          speak('Recording resumed');
          setCommandFeedback('Command: resume recording');
        }
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
        if (intent.section === 'plan') await onInsert('PLAN');
        if (intent.section === 'hpi') { if (!features.multi) { toastRef.current?.push('Multi‑section insert disabled'); break; } await onInsert('HPI'); }
        if (intent.section === 'ros') { if (!features.multi) { toastRef.current?.push('Multi‑section insert disabled'); break; } await onInsert('ROS'); }
        if (intent.section === 'exam') { if (!features.multi) { toastRef.current?.push('Multi‑section insert disabled'); break; } await onInsert('EXAM'); }
        break;
      case 'template':
        if (!features.templates) { toastRef.current?.push('Templates disabled'); break; }
        speak(`${intent.section} template inserted`);
        setCommandFeedback(`Command: template ${intent.section}`);
        if (intent.section === 'plan') await onInsertTemplate('PLAN');
        if (intent.section === 'hpi') await onInsertTemplate('HPI');
        if (intent.section === 'ros') await onInsertTemplate('ROS');
        if (intent.section === 'exam') await onInsertTemplate('EXAM');
        break;
      case 'undo':
        if (!features.undo) { toastRef.current?.push('Undo disabled'); break; }
        setCommandFeedback('Command: undo');
        try {
          const ok = await undoLastInsert();
          toastRef.current?.push(ok ? 'Undo applied' : 'Nothing to undo');
        } catch {
          toastRef.current?.push('Undo failed');
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

  async function onInsertTemplate(section: Section) {
    const field = profile?.[section];
    if (!host || !field?.selector) { toast.push(`Map ${section} first`); return; }
    const verify = await verifyTarget(field as any);
    if (!verify.ok) { toast.push('Not editable or missing'); return; }
    const payload = defaultTemplates[section] || '(template)';
    const strategy = await insertUsingMapping(field as any, payload);
    toast.push(`Template ${section} via ${strategy}`);
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
    console.log('[AssistMD] SR supervisor starting');
    let restartTimer: any = null;
    let cooldownUntil = 0;
    const RESTART_MS = 600;

    const startSR = () => {
      console.log('[AssistMD] startSR called', { killed, live, wantOn, cooldown: Date.now() < cooldownUntil });
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
        console.log('[AssistMD] SR started successfully');
      } catch (err) {
        console.error('[AssistMD] SR start failed:', err);
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
          // Stop SR during dictation to avoid interference
          wantOn = false;
          if (live && rec) {
            try { rec.stop(); } catch {}
          }
          live = false;
        } else if (m.state === 'quiet') {
          // Resume SR when dictation stops
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
    
    // Chrome requires user gesture for speech recognition
    // Try multiple strategies to start as soon as possible
    
    // Strategy 1: Start when panel opens (may work in side panel context)
    wantOn = true;
    startSR();
    
    // Strategy 2: Start after any Chrome API interaction
    chrome.runtime.sendMessage({ type: 'PING' }).then(() => {
      if (!live) {
        console.log('[AssistMD] Starting SR after API interaction');
        wantOn = true;
        startSR();
      }
    }).catch(() => {});
    
    // Strategy 3: Auto-start when recording begins
    const watchRecording = setInterval(() => {
      if (recordingRef.current && !live) {
        console.log('[AssistMD] Auto-starting SR with recording');
        wantOn = true;
        startSR();
        clearInterval(watchRecording);
      }
    }, 100);
    setTimeout(() => clearInterval(watchRecording), 5000); // Give up after 5s
    
    // Keep the user gesture fallbacks
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });
    const idle = setTimeout(() => { 
      if (!live) {
        console.log('[AssistMD] Attempting idle SR start');
        wantOn = true; 
        startSR(); 
      }
    }, 800);

    return () => {
      killed = true;
      clearTimeout(idle);
      clearInterval(speakGuard);
      chrome.runtime.onMessage.removeListener(onMsg);
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      stopSR();
    };
  }, []);

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

  // Now that getContentTab is declared, define ensureContentScript and run once
  ensureContentScript = async () => {
    try {
      const tab = await getContentTab();
      if (tab?.id) {
        try { await chrome.tabs.sendMessage(tab.id, { type: 'PING' }); }
        catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); }
      }
    } catch {}
  };

  useEffect(() => { ensureContentScript?.(); }, [getContentTab]);

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

  const onBackupAll = useCallback(async () => {
    try {
      const bag = await chrome.storage.local.get(null);
      const keep = Object.keys(bag).filter((k) => (
        k === 'API_BASE' ||
        k.startsWith('MAP_') ||
        k.startsWith('TPL_') ||
        k.startsWith('FEAT_') ||
        k === 'ASSIST_CONFIRMED_FP' ||
        k === 'ASSISTMD_LAST_TRANSCRIPT_V1'
      ));
      const snapshot: any = { ts: Date.now(), version: 1, data: {} };
      keep.forEach((k) => { snapshot.data[k] = (bag as any)[k]; });
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'assistmd-backup.json'; a.click();
      URL.revokeObjectURL(url);
      toast.push('Backup downloaded');
    } catch {
      toast.push('Backup failed');
    }
  }, [toast]);

  const onRestoreAll = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text || '{}');
      const data = parsed?.data || parsed;
      if (!data || typeof data !== 'object') { toast.push('Invalid backup file'); return; }
      await chrome.storage.local.set(data);
      toast.push('Backup restored. Reload the EHR page.');
    } catch {
      toast.push('Restore failed');
    }
  }, [toast]);

  // Load API base on mount
  useEffect(() => {
    (async () => {
      try {
        const { API_BASE } = await chrome.storage.local.get(['API_BASE']);
        if (API_BASE) setApiBase(API_BASE);
      } catch {}
    })();
  }, []);

  // Mapping export/import (per hostname)
  const onExportMappings = useCallback(async () => {
    if (!host) { toast.push('No host detected'); return; }
    try {
      const data = await loadProfile(host);
      const blob = new Blob([JSON.stringify({ host, profile: data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `assistmd-mapping-${host}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.push('Mappings exported');
    } catch { toast.push('Export failed'); }
  }, [host, toast]);

  const onImportMappings = useCallback(async (file: File) => {
    if (!host) { toast.push('No host detected'); return; }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text || '{}');
      const profileIn = parsed?.profile || parsed;
      if (!profileIn || typeof profileIn !== 'object') { toast.push('Invalid mapping file'); return; }
      await saveProfile(host, profileIn);
      setProfile(profileIn);
      toast.push('Mappings imported');
    } catch { toast.push('Import failed'); }
  }, [host, toast]);

  // Keyboard shortcuts: focus toggle + record toggle (Alt+R) + Push‑to‑Talk (Alt+Space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      // Focus toggle: Cmd/Ctrl + `
      if ((mac ? e.metaKey : e.ctrlKey) && e.key === '`') {
        setFocusMode((f) => !f);
        e.preventDefault();
        return;
      }
      // Quick backup: Cmd/Ctrl + B
      if ((mac ? e.metaKey : e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        (async () => { try { await onBackupAll(); } catch {} })();
        return;
      }
      // Record toggle: Alt + r
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (!busyRef.current) {
          onToggleRef.current();
        }
        return;
      }
      // Push‑to‑Talk: hold Alt + Space to record only while held (panel must be focused)
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        if (!recordingRef.current && !busyRef.current && !pttActiveRef.current) {
          pttActiveRef.current = true;
          setPttActive(true);
          onToggleRef.current(); // start
        }
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Release Push‑to‑Talk on Space keyup
      if (e.code === 'Space' && pttActiveRef.current) {
        e.preventDefault();
        pttActiveRef.current = false;
        setPttActive(false);
        if (recordingRef.current && !busyRef.current) {
          onToggleRef.current(); // stop
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const onMapFields = useCallback(async () => {
    const activeTab = await getContentTab();
    if (!activeTab?.id) {
      toast.push('No active tab');
      return;
    }

    try {
      // Prompt for section to map (quick, non-blocking UI)
      const choice = window.prompt('Map which section? (PLAN, HPI, ROS, EXAM)', 'PLAN');
      const section = (String(choice || 'PLAN').toUpperCase() as Section);
      const valid = section === 'PLAN' || section === 'HPI' || section === 'ROS' || section === 'EXAM';
      const pick = valid ? section : 'PLAN';
      await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section: pick });
      toast.push(`Click a ${pick} field to map`);
      return;
    } catch (primaryErr) {
      console.warn('MAP_MODE initial send failed, attempting injection', primaryErr);
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      });
      const choice = window.prompt('Map which section? (PLAN, HPI, ROS, EXAM)', 'PLAN');
      const section = (String(choice || 'PLAN').toUpperCase() as Section);
      const valid = section === 'PLAN' || section === 'HPI' || section === 'ROS' || section === 'EXAM';
      const pick = valid ? section : 'PLAN';
      await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section: pick });
      toast.push(`Click a ${pick} field to map`);
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
        // Check for message ID to prevent duplicates
        if (m.id && processedMessageIds.current.has(m.id)) {
          console.log('[AssistMD] Skipping duplicate message:', m.id);
          return;
        }
        if (m.id) {
          processedMessageIds.current.add(m.id);
          // Clean up old IDs every 30 seconds
          if (messageIdCleanupRef.current) clearTimeout(messageIdCleanupRef.current);
          messageIdCleanupRef.current = window.setTimeout(() => {
            processedMessageIds.current.clear();
          }, 30000);
        }
        
        const txt = String(m.text || '');
        pushWsEvent(`partial: ${txt.slice(0, 30)}`);
        if (txt) {
          // Update live word feed (small UI strip)
          setLiveWords(txt);
          // Wake on "assist …" directly from partials
          const low = txt.toLowerCase();
          const idx = low.indexOf('assist ');
          if (idx !== -1) {
            const tail = low.slice(idx + 'assist '.length).trim();
            const intent = parseIntent('assist ' + tail);
            if (intent) {
              // De-duplicate repeated/overlapping partial triggers of the same intent
              const now = Date.now();
              const windowMs = 1800; // lockout window for identical intent names
              const last = lastPartialIntentRef.current;
              if (!last || last.name !== intent.name || now >= last.until) {
                lastPartialIntentRef.current = { name: intent.name, until: now + windowMs };
                // Run command and do not add this partial to transcript
                runCommand(intent);
              } else {
                pushWsEvent(`command: suppressed duplicate (${intent.name})`);
              }
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
        const target: 'page' | 'iframe' | 'popup' = (Array.isArray(m.framePath) && m.framePath.length > 0)
          ? 'iframe'
          : (m.isPopup ? 'popup' : 'page');
        // Derive a simple URL pattern for popups
        const href: string = typeof m.href === 'string' ? m.href : '';
        const urlPattern = href ? href.replace(/\?.*$/, '*') : undefined;
        const titleIncl: string | undefined = typeof m.title === 'string' && m.title.length ? m.title.slice(0, 48) : undefined;
        next[m.section as Section] = {
          section: m.section,
          selector: m.selector,
          strategy: 'value',
          verified: false,
          framePath: Array.isArray(m.framePath) ? m.framePath : undefined,
          target,
          popupUrlPattern: target === 'popup' ? urlPattern : undefined,
          popupTitleIncludes: target === 'popup' ? titleIncl : undefined
        } as any;
        setProfile(next);
        if (host) saveProfile(host, next);
        toast.push(`Mapped ${m.section} → ${m.selector}`);
      }
      if (m?.type === 'EHR_FP' && m.preview) {
        pushWsEvent(`fp: ${m.preview}`);
        const fp = String(m.fp || '');
        if (lastFpRef.current && lastFpRef.current !== fp) {
          transcript.addBoundary(`patient context changed → ${m.preview}`);
          try { audit('context_changed', { preview: m.preview, fp }); } catch {}
        }
        lastFpRef.current = fp || null;
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
      {recoveryBanner && snapshotInfo && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2 text-sm flex items-center justify-between">
          <div>
            <span className="font-medium">Recovery snapshot found</span>
            <span className="ml-2 text-emerald-800 text-[12px]">{new Date(snapshotInfo.ts || Date.now()).toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <button className="px-2 py-1 text-xs rounded-md border border-emerald-300" onClick={() => setRecoveryBanner(false)}>Dismiss</button>
            <button className="px-2 py-1 text-xs rounded-md bg-emerald-600 text-white" onClick={forceRestoreSnapshot}>Restore Now</button>
          </div>
        </div>
      )}
      {remapPrompt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm space-y-2">
          <div className="font-medium">{remapPrompt.section} field missing or not editable</div>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 text-xs rounded-md bg-amber-600 text-white"
              onClick={async () => {
                try {
                  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                  const tab = tabs[0];
                  if (tab?.id) {
                    try { await chrome.tabs.sendMessage(tab.id, { type: 'MAP_MODE', on: true, section: remapPrompt.section }); }
                    catch {
                      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
                      await chrome.tabs.sendMessage(tab.id, { type: 'MAP_MODE', on: true, section: remapPrompt.section });
                    }
                  }
                  toast.push(`Click a ${remapPrompt.section} field to map`);
                } catch {}
                setRemapPrompt(null);
              }}
            >
              Remap now
            </button>
            <button className="px-2 py-1 text-xs rounded-md border border-amber-400" onClick={() => setRemapPrompt(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {pendingInsert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 w-[420px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl p-3 space-y-2">
            <div className="text-sm font-medium">Confirm insert → {pendingInsert.section}</div>
            <div className="max-h-40 overflow-auto text-[12px] whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-2">
              {pendingInsert.payload.slice(0, 1200)}
              {pendingInsert.payload.length > 1200 ? '…' : ''}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-2 py-1 text-xs rounded-md border border-slate-300"
                onClick={() => setPendingInsert(null)}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white"
                onClick={async () => {
                  const field = profile?.[pendingInsert.section];
                  if (field?.selector) {
                    const strategy = await insertUsingMapping(field as any, pendingInsert.payload);
                    toast.push(`Insert ${pendingInsert.section} via ${strategy}`);
                    pushWsEvent(`audit: ${pendingInsert.section.toLowerCase()} inserted`);
                    audit('insert_ok', { strategy, section: pendingInsert.section });
                  }
                  setPendingInsert(null);
                }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
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
            {(recording || wsState !== 'disconnected') && (
              <div className="rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[12px] text-slate-700" style={{maxHeight: 56, overflow: 'hidden'}}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 align-middle" />
                {pttActive ? 'Push‑to‑talk active…' : (liveWords || 'Listening…')}
              </div>
            )}
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
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white"
                    onClick={saveApiBase}
                  >
                    Save
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={onExportMappings}
                  >
                    Export Mappings
                  </button>
                  <label className="px-2 py-1 text-xs rounded-md border border-slate-300 cursor-pointer">
                    Import
                    <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImportMappings(f);
                      e.currentTarget.value = '';
                    }} />
                  </label>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={onBackupAll}
                  >
                    Backup All Settings
                  </button>
                  <label className="px-2 py-1 text-xs rounded-md border border-slate-300 cursor-pointer">
                    Restore All
                    <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onRestoreAll(f);
                      e.currentTarget.value = '';
                    }} />
                  </label>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={async () => {
                      const ok = await transcript.loadFromStorage().catch(() => false);
                      toast.push(ok ? 'Transcript restored' : 'No saved transcript');
                    }}
                  >
                    Load Last Transcript
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={() => { transcript.clear(); toast.push('Transcript cleared'); }}
                  >
                    Clear Transcript
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="text-sm font-medium mt-3">Fallback Selectors</div>
                <div className="text-[12px] text-slate-600">Optional comma‑separated selectors used if the primary mapping is missing.</div>
                {(['PLAN','HPI','ROS','EXAM'] as Section[]).map((sec) => (
                  <div key={`fb-${sec}`} className="mt-1">
                    <label className="block text-[12px] text-slate-600">{sec}</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      placeholder="e.g. #altId, textarea[name=notes]"
                      defaultValue={(profile?.[sec] as any)?.fallbackSelectors?.join(', ') || ''}
                      onBlur={async (e) => {
                        try {
                          const raw = e.target.value || '';
                          const list = raw.split(',').map(s => s.trim()).filter(Boolean);
                          const next = { ...(profile || {}) } as any;
                          next[sec] = { ...(next[sec] || { section: sec }), fallbackSelectors: list };
                          setProfile(next);
                          if (host) await saveProfile(host, next);
                          toast.push(`${sec} fallbacks saved`);
                          scheduleBackup();
                        } catch { toast.push('Save failed'); }
                      }}
                    />
                  </div>
                ))}
                <div className="text-[12px] text-slate-500">After updating the API base, reload the EHR page and start again.</div>
                <div className="text-sm font-medium mt-3">Templates</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['PLAN','HPI','ROS','EXAM'] as Section[]).map((sec) => (
                    <button key={sec}
                      className="px-2 py-1 text-xs rounded-md border border-slate-300"
                      onClick={async () => {
                        const cur = defaultTemplates[sec];
                        const next = window.prompt(`Edit ${sec} template`, cur);
                        if (next === null) return;
                        try {
                          const key = (features.tplPerHost && host) ? `TPL_${host}_${sec}` : `TPL_${sec}`;
                          await chrome.storage.local.set({ [key]: next });
                          (defaultTemplates as any)[sec] = next;
                          toast.push(`${sec} template saved`);
                          scheduleBackup();
                        } catch { toast.push('Save failed'); }
                      }}
                    >
                      Edit {sec}
                    </button>
                  ))}
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300 col-span-2"
                    onClick={async () => {
                      try {
                        const keys = ['TPL_PLAN','TPL_HPI','TPL_ROS','TPL_EXAM'];
                        if (features.tplPerHost && host) keys.push(`TPL_${host}_PLAN`, `TPL_${host}_HPI`, `TPL_${host}_ROS`, `TPL_${host}_EXAM`);
                        const bag = await chrome.storage.local.get(keys);
                        (defaultTemplates as any).PLAN = (features.tplPerHost && host && bag[`TPL_${host}_PLAN`]) || bag.TPL_PLAN || (defaultTemplates as any).PLAN;
                        (defaultTemplates as any).HPI  = (features.tplPerHost && host && bag[`TPL_${host}_HPI`])  || bag.TPL_HPI || (defaultTemplates as any).HPI;
                        (defaultTemplates as any).ROS  = (features.tplPerHost && host && bag[`TPL_${host}_ROS`])  || bag.TPL_ROS || (defaultTemplates as any).ROS;
                        (defaultTemplates as any).EXAM = (features.tplPerHost && host && bag[`TPL_${host}_EXAM`]) || bag.TPL_EXAM || (defaultTemplates as any).EXAM;
                        toast.push('Templates loaded');
                      } catch { toast.push('Load failed'); }
                    }}
                  >
                    Load Saved Templates
                  </button>
                </div>
                <div className="text-sm font-medium mt-3">Recovery</div>
                <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-700">
                  <div className="col-span-2">Latest snapshot: {snapshotInfo ? new Date(snapshotInfo.ts || Date.now()).toLocaleString() : 'none'}</div>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={forceRestoreSnapshot}
                  >
                    Force Restore Snapshot
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={onBackupAll}
                  >
                    Download Latest Snapshot
                  </button>
                </div>
                <div className="text-sm font-medium mt-3">Feature Flags</div>
                <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.multi} onChange={(e) => saveFeatures({ ...features, multi: e.target.checked })} />
                    Multi‑section insert (HPI/ROS/EXAM)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.templates} onChange={(e) => saveFeatures({ ...features, templates: e.target.checked })} />
                    Templates
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.undo} onChange={(e) => saveFeatures({ ...features, undo: e.target.checked })} />
                    Undo last insert
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.preview} onChange={(e) => saveFeatures({ ...features, preview: e.target.checked })} />
                    Preview before insert
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.autoBackup} onChange={(e) => saveFeatures({ ...features, autoBackup: e.target.checked })} />
                    Auto backup settings (local snapshot)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={features.tplPerHost} onChange={(e) => saveFeatures({ ...features, tplPerHost: e.target.checked })} />
                    Templates per host
                  </label>
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
              onInsertPlan={() => onInsert('PLAN')}
              onInsertHPI={features.multi ? (() => onInsert('HPI')) : undefined}
              onInsertROS={features.multi ? (() => onInsert('ROS')) : undefined}
              onInsertEXAM={features.multi ? (() => onInsert('EXAM')) : undefined}
              onUndo={features.undo ? (async () => {
                const ok = await undoLastInsert();
                toast.push(ok ? 'Undo applied' : 'Nothing to undo');
              }) : undefined}
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
                      try { await audit('patient_confirmed', { preview: pendingGuard.preview, fp: pendingGuard.fp }); } catch {}
                      setPendingGuard(null);
                      toast.push('Patient confirmed');
                      await onInsert('PLAN', { bypassGuard: true });
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
