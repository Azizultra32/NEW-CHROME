import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { CommandStrip } from './components/CommandStrip';
import { TranscriptList } from './components/TranscriptList';
import { Controls } from './components/Controls';
import { ToastProvider, useToast } from './components/Toast';
import { QuickStartGuide } from './components/QuickStartGuide';
import { UI } from './lib/ui-tokens';
import { transcript } from './lib/transcript';
import { parseIntent } from './intent';
import { verifyPatientBeforeInsert, confirmPatientFingerprint, GuardStatus } from './lib/guard';
import { loadProfile, saveProfile, FieldMapping, Section } from './lib/mapping';
import { insertTextInto, insertUsingMapping, verifyTarget, undoLastInsert, getFieldContent, listMatchingSelectors, verifyInsertion } from './lib/insert';
import { discoverCandidatesForSection } from './lib/fieldDiscovery';
import * as telemetry from './lib/telemetry';
import { isDevelopmentBuild } from './lib/env';
import { SpeechRecognitionManager, SpeechRecognitionState } from './lib/speechRecognition';
import { WindowIndicator } from './components/WindowIndicator';
import { phiKeyManager, storePHIMap, loadPHIMap, PHIMap, deletePHIMap } from './lib/phi-rehydration';
import { composeNote, ComposedNote, extractSectionText, formatProvenanceTime, getNoteSummary } from './lib/note-composer-client';
import { captureAndSendScreenshot, flushAuditQueue } from './lib/auditCapture';
import { tts } from './lib/tts';
import { wakeWord, RecordingState } from './lib/wakeword';
import { ChatMessage, ChatLog } from './components/ChatBubble';
import { commandTagger } from './lib/command-tagger';
import { scrapeVitals, formatVitals, scrapeMedications, formatMedications, scrapeAllergies, formatAllergies } from './lib/chart-scraper';
const BASE_COMMAND_MESSAGE = 'Ready for "assist …" commands';

export default function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [opacity, setOpacity] = useState(80);
  const [mode, setMode] = useState<'idle' | 'mock' | 'live'>('idle');
  
  // Detect if running in iframe mode
  const isIframeMode = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mode') === 'overlay' || window.parent !== window;
  }, []);
  const [wsState, setWsState] = useState<'disconnected' | 'connecting' | 'open' | 'error'>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState<string>('');
  const [profile, setProfile] = useState<Record<Section, FieldMapping>>({} as any);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [redactedOverlay, setRedactedOverlay] = useState(false);
  const [auditScreenshots, setAuditScreenshots] = useState(false);
  const [voiceQueriesEnabled, setVoiceQueriesEnabled] = useState(true);
  const [useRouterVad, setUseRouterVad] = useState(false);
  const [showCommandHud, setShowCommandHud] = useState(true);
  const [insertModes, setInsertModes] = useState<Record<Section, 'append' | 'replace'>>({ PLAN: 'append', HPI: 'append', ROS: 'append', EXAM: 'append' });
  const [metrics, setMetrics] = useState<{ verifyFail: number; inserts: number; p50: number; p95: number }>({ verifyFail: 0, inserts: 0, p50: 0, p95: 0 });
  const [showCitations, setShowCitations] = useState(false);
  const [singleFieldMode, setSingleFieldMode] = useState(false);

  const refreshMetrics = useCallback(async () => {
    try {
      const items: any[] = await (telemetry as any).getRecent?.(200);
      const fails = items.filter(i => i?.name === 'insert_verify_fail').length;
      const inserts = items.filter(i => i?.name === 'insert_selector').length;
      const latencies = items.filter(i => i?.name === 'insert_latency' && typeof i?.data?.ms === 'number').map(i => Number(i.data.ms)).sort((a,b) => a-b);
      const pct = (arr: number[], q: number) => arr.length ? arr[Math.min(arr.length-1, Math.max(0, Math.floor(q * (arr.length-1))))] : 0;
      setMetrics({ verifyFail: fails, inserts, p50: pct(latencies, 0.5), p95: pct(latencies, 0.95) });
    } catch {}
  }, []);
  const [apiBase, setApiBase] = useState('');
  const [allowedHosts, setAllowedHosts] = useState<string[]>([]);
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
  const [pairingState, setPairingState] = useState<{ enabled: boolean; pairs: Array<{ host?: string; title?: string; url?: string }> }>({ enabled: false, pairs: [] });
  const [pairingBusy, setPairingBusy] = useState(false);
  const [windowTrackState, setWindowTrackState] = useState<{ sidepanelWindowId: number | null; lastKnown: { title?: string; url?: string } | null }>({ sidepanelWindowId: null, lastKnown: null });
  // Auto-pair on allowed hosts (persisted in chrome.storage.local as WINDOW_PAIR_AUTO)
  const [autoPairOnAllowed, setAutoPairOnAllowed] = useState(false);

  // Chat log for assistant messages
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);

  // Wake word state
  const [wakeWordState, setWakeWordState] = useState<RecordingState>(RecordingState.IDLE);

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

  // Load and persist Command HUD preference
  useEffect(() => {
    (async () => {
      try {
        const bag = await chrome.storage.local.get(['SHOW_COMMAND_HUD','FEAT_VOICE_QUERIES','FEAT_ROUTER_VAD']).catch(() => ({} as any));
        if (typeof bag?.SHOW_COMMAND_HUD === 'boolean') setShowCommandHud(bag.SHOW_COMMAND_HUD);
        if (typeof bag?.FEAT_VOICE_QUERIES === 'boolean') setVoiceQueriesEnabled(bag.FEAT_VOICE_QUERIES);
        if (typeof bag?.FEAT_ROUTER_VAD === 'boolean') setUseRouterVad(bag.FEAT_ROUTER_VAD);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    try { chrome.storage.local.set({ SHOW_COMMAND_HUD: showCommandHud }); } catch {}
  }, [showCommandHud]);
  useEffect(() => {
    try { chrome.storage.local.set({ FEAT_VOICE_QUERIES: voiceQueriesEnabled }); } catch {}
  }, [voiceQueriesEnabled]);
  useEffect(() => {
    try {
      chrome.storage.local.set({ FEAT_ROUTER_VAD: useRouterVad });
      chrome.runtime.sendMessage({ type: 'SET_VAD_MODE', mode: useRouterVad ? 'router' : 'legacy' }).catch(() => {});
    } catch {}
  }, [useRouterVad]);

  async function dispatchCommandWindow(ms: number, label?: string) {
    const payload: any = { type: 'COMMAND_WINDOW', ms };
    if (showCommandHud && label) payload.text = label;
    try { await chrome.runtime.sendMessage(payload); } catch {}
  }
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
  const notifyError = useCallback((msg: string) => {
    try { toast.push(msg); } catch {}
    setLastError(msg);
  }, [toast]);
  const commandCooldownRef = useRef(0);
  const commandMuteUntilRef = useRef(0);
  const lastPartialIntentRef = useRef<{ name: string; until: number } | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const messageIdCleanupRef = useRef<number | null>(null);

  // Recovery snapshot state
  const [snapshotInfo, setSnapshotInfo] = useState<{ ts: number; keys: string[] } | null>(null);
  const [recoveryBanner, setRecoveryBanner] = useState(false);
  const [speechRecognitionState, setSpeechRecognitionState] = useState<SpeechRecognitionState>('idle');
  const speechManagerRef = useRef<SpeechRecognitionManager | null>(null);

  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onToggleRef.current = onToggleRecord; }, [onToggleRecord]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Request tabs permission on mount to enable window detection
  useEffect(() => {
    (async () => {
      try {
        const permissions = chrome.permissions as any;
        if (permissions?.request) {
          const hasTabsPermission = await permissions.contains({ permissions: ['tabs'] }).catch(() => false);
          if (!hasTabsPermission) {
            await permissions.request({ permissions: ['tabs'] }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('Failed to request tabs permission:', e);
      }
    })();
  }, []);

  // Initialize TTS ducking and wake word on mount
  useEffect(() => {
    console.log('[App] Initializing TTS and Wake Word');

    // Set up TTS ducking callbacks (pause mic during AI speech)
    tts.setDuckingCallbacks(
      () => {
        // On speak start: pause wake word detector
        console.log('[App] TTS started - pausing wake word');
        wakeWord.pause();
        commandMuteUntilRef.current = Date.now() + 3000; // 3s mute window
      },
      () => {
        // On speak end: resume wake word detector
        console.log('[App] TTS ended - resuming wake word');
        wakeWord.resume();
      }
    );

    // Set up wake word callbacks
    wakeWord.setWakeCallback(() => {
      console.log('[App] Wake word detected - ARMED');
      speakAndLog('Listening', 'assist');
      // Tag command audio for suppression
      commandTagger.markCommandDetected();
    });

    wakeWord.setStateChangeCallback((state) => {
      console.log('[App] Wake word state:', state);
      setWakeWordState(state);

      if (state === RecordingState.ARMED) {
        setCommandFeedback('🎤 Listening... (say your command)');
      } else if (state === RecordingState.RECORDING) {
        setCommandFeedback('🔴 Recording...');
        // Auto-start recording if not already
        if (!recordingRef.current && !busyRef.current) {
          onToggleRef.current?.();
        }
      } else if (state === RecordingState.IDLE) {
        setCommandFeedback(BASE_COMMAND_MESSAGE);
      }
    });

    // Start wake word detector
    wakeWord.start();

    return () => {
      wakeWord.stop();
      tts.cancel();
    };
  }, []);

  useEffect(() => {
    if (wsState === 'connecting') {
      setCommandFeedback('Connecting to transcriber…', true);
    } else if (wsState === 'error') {
      setCommandFeedback('Transcriber connection lost', true);
    } else if (wsState === 'open') {
      setCommandFeedback(BASE_COMMAND_MESSAGE);
    }
  }, [wsState]);

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

  useEffect(() => {
    let mounted = true;
    const syncStatuses = async () => {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'WINDOW_PAIR_STATUS' }).catch(() => null);
        if (mounted && res && typeof res.enabled === 'boolean') {
          const enabled = res.enabled;
          const pairs = Array.isArray(res.pairs) ? res.pairs : [];
          setPairingState({ enabled, pairs });
          telemetry.recordEvent('window_pair_status', { enabled, pairs: pairs.length, source: 'sync' }).catch(() => {});
        }
      } catch {}
      try {
        const track = await chrome.runtime.sendMessage({ type: 'WINDOW_TRACK_STATUS' }).catch(() => null);
        if (mounted && track) {
          setWindowTrackState({
            sidepanelWindowId: typeof track.sidepanelWindowId === 'number' ? track.sidepanelWindowId : null,
            lastKnown: track.lastKnown || null
          });
        }
      } catch {}
    };
    syncStatuses();

    const handler = (message: any) => {
      if (!mounted) return;
      if (message?.type === 'WINDOW_PAIR_STATUS_EVENT') {
        const enabled = !!message.enabled;
        const pairs = Array.isArray(message.pairs) ? message.pairs : [];
        setPairingState({ enabled, pairs });
        telemetry.recordEvent('window_pair_status', { enabled, pairs: pairs.length }).catch(() => {});
      }
      if (message?.type === 'WINDOW_TRACK_STATUS_EVENT') {
        setWindowTrackState({
          sidepanelWindowId: typeof message.sidepanelWindowId === 'number' ? message.sidepanelWindowId : null,
          lastKnown: message.lastKnown || null
        });
      }
      if (message?.type === 'PHI_MAP_UPDATE' && message.encounterId && message.phiMap) {
        (async () => {
          try {
            const encId = message.encounterId as string;
            // Keep our encounter id in sync if not set
            if (!encounterIdRef.current) { encounterIdRef.current = encId; setEncounterId(encId); }
            const key = await phiKeyManager.getOrCreateKey(encId);
            await storePHIMap(encId, message.phiMap as PHIMap, key);
          } catch (e) {
            console.warn('[AssistMD] PHI_MAP_UPDATE store failed', e);
          }
        })();
      }
      if (message?.type === 'REQUEST_GHOST_PREVIEW') {
        (async () => {
          const sections = computeGhostSections();
          setGhostPreview(sections);
          try {
            const tab = await getContentTab();
            if (tab?.id) {
              await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_PREVIEW', sections });
            }
          } catch {}
        })();
      }
      if (message?.type === 'REQUEST_EXECUTE_INSERT') {
        (async () => {
          const sections = ghostPreview || computeGhostSections();
          if (sections.PLAN) { await onInsert('PLAN'); }
          if (sections.HPI)  { await onInsert('HPI'); }
          if (sections.ROS)  { await onInsert('ROS'); }
          if (sections.EXAM) { await onInsert('EXAM'); }
        })();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      mounted = false;
      chrome.runtime.onMessage.removeListener(handler);
    };
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
      // Add to chat log
      setChatLog(prev => [...prev, {
        message: text,
        type: 'assistant',
        timestamp: new Date()
      }]);

      // Speak with TTS engine (handles ducking automatically)
      tts.speak(text).catch(console.error);

      // Legacy mute window for compatibility
      try { commandMuteUntilRef.current = Math.max(commandMuteUntilRef.current, Date.now() + 800); } catch {}
    } catch {}
  }

  function speakAndLog(text: string, userMessage?: string) {
    if (userMessage) {
      setChatLog(prev => [...prev, {
        message: userMessage,
        type: 'user',
        timestamp: new Date()
      }]);
    }
    speak(text);
  }

  const [pendingInsert, setPendingInsert] = useState<null | { section: Section; payload: string; selector: string; bypassGuard?: boolean }>(null);
  const lastCandidateRef = useRef<null | { section: Section; selector: string; framePath?: number[] }>(null);
  const [pendingInsertDraft, setPendingInsertDraft] = useState('');
  const [pendingInsertExisting, setPendingInsertExisting] = useState<string | null>(null);
  const [pendingInsertLoading, setPendingInsertLoading] = useState(false);
  const [pendingInsertMeta, setPendingInsertMeta] = useState<null | { selector: string; strict: boolean }>(null);

  const [remapPrompt, setRemapPrompt] = useState<null | { section: Section }>(null);
  const [permBanner, setPermBanner] = useState(false);
  const [targetChooser, setTargetChooser] = useState<null | { section: Section; candidates: { selector: string; framePath?: number[]; confidence?: number }[]; payload: string; bypassGuard?: boolean }>(null);
  const [targetSelection, setTargetSelection] = useState<number>(0);
  const [ghostPreview, setGhostPreview] = useState<Partial<Record<Section, string>> | null>(null);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const encounterIdRef = useRef<string | null>(null);
  const [composedNote, setComposedNote] = useState<ComposedNote | null>(null);

  type InsertOpts = {
    bypassGuard?: boolean;
    preferredSelector?: string;
    payloadOverride?: string;
    skipTargetPrompt?: boolean;
    strictSelector?: boolean;
  };

  useEffect(() => {
    if (!pendingInsert) {
      setPendingInsertDraft('');
      setPendingInsertExisting(null);
      setPendingInsertLoading(false);
      setPendingInsertMeta(null);
      return;
    }
    setPendingInsertDraft(pendingInsert.payload);
    setPendingInsertExisting(null);
    setPendingInsertLoading(true);
    (async () => {
      try {
        const field = profile?.[pendingInsert.section];
        if (field) {
          const snapshot = await getFieldContent(field as any, { preferredSelector: pendingInsert.selector, strict: true });
          setPendingInsertExisting(snapshot?.content ?? '');
        } else {
          setPendingInsertExisting(null);
        }
      } catch {
        setPendingInsertExisting(null);
      } finally {
        setPendingInsertLoading(false);
      }
    })();
  }, [pendingInsert, profile]);

  // Request on‑demand permissions for scripting/tabs and current origin when needed (defined after getContentTab)
  let ensurePerms: () => Promise<boolean>;

  async function onInsert(section: Section, opts: InsertOpts = {}) {
    if (!host) { notifyError('No host context for mapping'); return; }
    const field = profile?.[section];
    if (!field?.selector) {
      toast.push(`Map ${section} field first`);
      return;
    }
    if (!opts?.bypassGuard) {
      const guard = await verifyPatientBeforeInsert();
      if (!guard.ok) {
        if (guard.reason === 'missing') { notifyError('No patient detected. View the chart before inserting.'); return; }
        if (guard.reason === 'unconfirmed' || guard.reason === 'mismatch') {
          setPendingGuard(guard);
          notifyError('Confirm patient before inserting');
          pushWsEvent('guard: insert blocked');
          audit('insert_blocked', { reason: guard.reason, section });
          telemetry.recordEvent('guard_blocked', { reason: guard.reason, section }).catch(() => {});
          return;
        }
        notifyError('Patient guard error. Try again.');
        return;
      }
    }
    // Verify target exists and editable
    // Ensure we can execute in the target tab
    await ensurePerms();
    const selectors = Array.from(new Set([field.selector].concat(Array.isArray(field.fallbackSelectors) ? field.fallbackSelectors : []).filter(Boolean)));
    const availableSelectors = await listMatchingSelectors(field as FieldMapping);
    const shouldPrompt = !opts.skipTargetPrompt && selectors.length > 1 && availableSelectors.length > 1 && !opts.preferredSelector;
    if (shouldPrompt) {
      const options = availableSelectors.length ? availableSelectors : selectors;
      const cands = options.map((s) => ({ selector: s, confidence: 0.8 }));
      setTargetChooser({ section, candidates: cands, payload: opts.payloadOverride ?? getTranscriptPayload(), bypassGuard: opts.bypassGuard ?? true });
      setTargetSelection(0);
      telemetry.recordEvent('target_prompt_shown', { section, selectors: selectors.length }).catch(() => {});
      return;
    }

    const chosen = opts.preferredSelector && selectors.includes(opts.preferredSelector) ? opts.preferredSelector : (availableSelectors[0] || selectors[0]);
    const strict = opts.strictSelector ?? !!opts.preferredSelector;

    const verify = await verifyTarget(field as any, { preferredSelector: chosen, strict });
    if (!verify.ok) {
      const reason = verify.reason === 'missing' ? 'Field not found' : 'Not editable';
      notifyError(reason);
      telemetry.recordEvent('verify_fail', { section, reason, selector: chosen }).catch(() => {});
      // Try semantic discovery and offer suggestions inline
      try {
        const suggestions = await discoverCandidatesForSection(section);
        if (suggestions && suggestions.length) {
          setTargetChooser({ section, candidates: suggestions.map(s => ({ selector: s.selector, framePath: s.framePath, confidence: s.confidence })), payload: getTranscriptPayload(), bypassGuard: true });
          setTargetSelection(0);
          pushWsEvent('discovery: suggested targets (verify failed)');
          return;
        }
      } catch {}
      // Fallback to explicit remap prompt
      setRemapPrompt({ section });
      return;
    }

    const payload = opts.payloadOverride ?? getTranscriptPayload();
    if (features.preview && !opts?.bypassGuard) {
      setPendingInsert({ section, payload, selector: chosen, bypassGuard: opts.bypassGuard });
      setPendingInsertMeta({ selector: chosen, strict });
      return;
    }

    await finalizeInsert(section, field as FieldMapping, payload, { selector: chosen, strict });
  }

  function getTranscriptPayload() {
    const text = transcript
      .get()
      .filter((x) => !x.text.startsWith('[MOCK]'))
      .map((x) => x.text)
      .join(' ')
      .trim();
    return text || '(empty)';
  }

  function computeGhostSections(): Partial<Record<Section, string>> {
    // Prefer composed note's Plan if available; otherwise use live transcript payload
    let planText = getTranscriptPayload();
    try {
      if (composedNote && composedNote.sections) {
        planText = composedNote.sections['Plan'] || composedNote.sections['PLAN'] || planText;
      }
    } catch {}
    const out: Partial<Record<Section, string>> = { PLAN: planText };
    try {
      if (features.multi) {
        // Optional fill for other legacy sections if you want a multi‑section preview
        // These remain placeholders unless you add explicit mapping from composedNote
        out.HPI = out.HPI || '';
        out.ROS = out.ROS || '';
        out.EXAM = out.EXAM || '';
      }
    } catch {}
    return out;
  }

  async function sendGhostPreview() {
    try {
      const sections = computeGhostSections();
      setGhostPreview(sections);
      const tab = await getContentTab();
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_PREVIEW', sections });
      }
    } catch {
      toast.push('Unable to show preview');
    }
  }

  async function handleComposeNote() {
    try {
      try { await audit('compose_start'); } catch {}
      const encId = encounterIdRef.current || `enc_${Date.now()}`;
      const key = await phiKeyManager.getOrCreateKey(encId);
      const phi = (await loadPHIMap(encId, key)) || {};
      // Use tokenized transcript (as displayed; backend will rehydrate with phi)
      const tokenized = getTranscriptPayload();
      const note = await composeNote({
        encounterId: encId,
        transcript: tokenized,
        phiMap: phi,
        noteFormat: 'SOAP',
        specialty: 'family_medicine',
        apiBase
      });
      // Normalize backend warnings -> UI flags
      const flags = Array.isArray((note as any).warnings)
        ? (note as any).warnings.map((w: any) => ({
            severity: w.severity === 'critical' ? 'high' : w.severity === 'caution' ? 'medium' : (w.severity || 'low'),
            text: w.message || w.text || ''
          }))
        : (note as any).flags;
      const normalized = flags ? ({ ...(note as any), flags }) : note;
      setComposedNote(normalized as any);
      toast.push('Note composed');
      try { await audit('compose_ok', { flags: (flags||[]).length, sections: Object.keys((note as any).sections||{}).length }); } catch {}
    } catch (e: any) {
      console.warn('[AssistMD] compose failed', e);
      toast.push(`Compose failed: ${e?.message || 'error'}`);
      try { await audit('compose_err', { message: String(e?.message||e) }); } catch {}
    }
  }

  async function insertComposed(section: string) {
    if (!composedNote) return;
    const text = extractSectionText(composedNote, section) || '';
    if (!text) { toast.push(`No ${section} section`); return; }
    // Bypass guard remains false; normal guard applies
    await onInsert(section as Section, { payloadOverride: text });
  }

  async function finalizeInsert(section: Section, field: FieldMapping, payload: string, target: { selector: string; strict: boolean }) {
    // Basic rate limit to avoid duplicate pastes
    const now = Date.now();
    if ((busyRef.current)) { notifyError('Insert in progress'); return; }
    const t0 = now;
    setBusy(true);
    const result = await insertUsingMapping(field, payload, { preferredSelector: target.selector, strict: target.strict, mode: insertModes[section] || 'append' });
    if (!result.ok) {
      notifyError('Insert failed');
      telemetry.recordEvent('insert_failed', { section, selector: target.selector }).catch(() => {});
      setBusy(false); return;
    }
    // Verify insertion (no PHI logged: only lengths)
    try {
      const verify = await verifyInsertion(field, result.selector, payload);
      if (!verify.ok) {
        notifyError('Insert verification failed');
        telemetry.recordEvent('insert_verify_fail', { section, selector: result.selector, expectedLength: verify.expectedLength, actualLength: verify.actualLength }).catch(() => {});
        try { await audit('insert_verify_fail', { section, selector: result.selector, expectedLength: verify.expectedLength, actualLength: verify.actualLength }); } catch {}
        if (auditScreenshots && encounterIdRef.current) {
          try { await captureAndSendScreenshot(encounterIdRef.current, apiBase, 'verify_fail'); } catch {}
        }
        // Attempt semantic discovery to suggest better targets
        try {
          const cands = await discoverCandidatesForSection(section);
          if (cands && cands.length) {
            setTargetChooser({ section, candidates: cands.map(c => ({ selector: c.selector, framePath: c.framePath })), payload, bypassGuard: true });
            setTargetSelection(0);
            pushWsEvent('discovery: suggested alternative targets');
          }
        } catch {}
      } else {
        toast.push(`Insert ${section} via ${result.strategy}`);
        // Offer to save as mapping if this came from a candidate
        try {
          const lc = lastCandidateRef.current;
          if (lc && lc.section === section && lc.selector === target.selector) {
            const ok = confirm('Save this target as the mapping for this section?');
            if (ok && host) {
              const prof = await loadProfile(host);
              const prev = prof[section];
              const fallback = Array.from(new Set([...(prev?.fallbackSelectors || []), prev?.selector].filter(Boolean)));
              prof[section] = {
                section,
                selector: lc.selector,
                strategy: 'value',
                verified: true,
                framePath: lc.framePath,
                target: (lc.framePath && lc.framePath.length) ? 'iframe' : 'page',
                fallbackSelectors: fallback
              } as any;
              await saveProfile(host, prof as any);
              toast.push('Mapping saved');
            }
            lastCandidateRef.current = null;
          }
        } catch {}
        if (auditScreenshots && encounterIdRef.current) {
          try { await captureAndSendScreenshot(encounterIdRef.current, apiBase, 'post_insert'); } catch {}
        }
      }
    } catch {
      // Non-fatal; still report success path to user without leaking PHI
      toast.push(`Insert ${section} via ${result.strategy}`);
    }
    pushWsEvent(`audit: ${section.toLowerCase()} inserted (${result.selector})`);
    audit('insert_ok', { strategy: result.strategy, section, selector: result.selector, length: payload.length });
    setLastError(null);
    scheduleBackup();
    const latency = Date.now() - t0;
    telemetry.recordLatency('insert_latency', latency, { section, strategy: result.strategy, selector: result.selector }).catch(() => {});
    telemetry.recordEvent('insert_selector', { section, selector: result.selector, strategy: result.strategy, latency }).catch(() => {});
    setBusy(false);
  }

  const COMMAND_COOLDOWN_MS = 1200;

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
    // Avoid logging raw dictation to console (may contain PHI). Use length-only in development.
    if (isDevelopmentBuild) {
      try { console.log('[AssistMD][SR] heard (len):', text.length); } catch {}
    }
    // Reflect in live word strip too
    setLiveWords(text);

    if ((window as any).speechSynthesis?.speaking) {
      await dispatchCommandWindow(1200, 'Command mode');
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
      commandMuteUntilRef.current = Date.now() + COMMAND_COOLDOWN_MS + 400; // add small padding
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
      case 'template_edit': {
        if (!features.templates) { toastRef.current?.push('Templates disabled'); break; }
        const section = intent.section.toUpperCase() as Section;
        setCommandFeedback(`Command: edit template ${intent.section}`);
        await editTemplate(section);
        break;
      }
      case 'map': {
        const section = intent.section.toUpperCase() as Section;
        setCommandFeedback(`Command: map ${intent.section}`);
        await activateMapMode(section);
        break;
      }
      case 'query_vitals': {
        setCommandFeedback('Command: query vitals');
        commandTagger.markCommandDetected();
        await dispatchCommandWindow(1200, 'Querying vitals…');
        try {
          const activeTab = await getContentTab();
          if (!activeTab?.id) {
            speak('No active tab found');
            break;
          }

          // Inject content script if needed
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: scrapeVitals
            }).then(async (results) => {
              const vitals = results[0]?.result;
              const response = formatVitals(vitals || {});
              speakAndLog(response, 'vitals?');
            });
          } catch (error) {
            console.error('[App] Error scraping vitals:', error);
            speak('Unable to access chart data');
          }
        } catch (error) {
          console.error('[App] Error in query_vitals:', error);
          speak('Error querying vitals');
        }
        break;
      }

      case 'query_meds': {
        setCommandFeedback('Command: query medications');
        commandTagger.markCommandDetected();
        await dispatchCommandWindow(1200, 'Listing medications…');
        try {
          const activeTab = await getContentTab();
          if (!activeTab?.id) {
            speak('No active tab found');
            break;
          }

          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: scrapeMedications
            }).then(async (results) => {
              const meds = results[0]?.result;
              const response = formatMedications(meds || []);
              speakAndLog(response, 'current meds?');
            });
          } catch (error) {
            console.error('[App] Error scraping meds:', error);
            speak('Unable to access chart data');
          }
        } catch (error) {
          console.error('[App] Error in query_meds:', error);
          speak('Error querying medications');
        }
        break;
      }

      case 'query_allergies': {
        setCommandFeedback('Command: query allergies');
        commandTagger.markCommandDetected();
        await dispatchCommandWindow(1200, 'Checking allergies…');
        try {
          const activeTab = await getContentTab();
          if (!activeTab?.id) {
            speak('No active tab found');
            break;
          }

          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: scrapeAllergies
            }).then(async (results) => {
              const allergies = results[0]?.result;
              const response = formatAllergies(allergies || []);
              speakAndLog(response, 'allergies?');
            });
          } catch (error) {
            console.error('[App] Error scraping allergies:', error);
            speak('Unable to access chart data');
          }
        } catch (error) {
          console.error('[App] Error in query_allergies:', error);
          speak('Error querying allergies');
        }
        break;
      }

      case 'compose_note': {
        setCommandFeedback('Command: compose note');
        commandTagger.markCommandDetected();
        speak('Composing clinical note');

        try {
          if (!encounterIdRef.current) {
            speak('No encounter ID set. Please start a session first.');
            break;
          }

          const encId = encounterIdRef.current;
          const phi = {}; // PHI map handled by backend
          const tokenized = transcript.get().map(t => t.text).join('\n');

          setBusy(true);
          const note = await composeNote({
            encounterId: encId,
            transcript: tokenized,
            phiMap: phi,
            apiBase
          });
          const flags = Array.isArray((note as any).warnings)
            ? (note as any).warnings.map((w: any) => ({
                severity: w.severity === 'critical' ? 'high' : w.severity === 'caution' ? 'medium' : (w.severity || 'low'),
                text: w.message || w.text || ''
              }))
            : (note as any).flags;
          const normalized = flags ? ({ ...(note as any), flags }) : note;
          setComposedNote(normalized as any);
          setBusy(false);

          const sectionCount = Object.keys(note.sections || {}).length;
          speak(`Note ready with ${sectionCount} sections. Review before inserting.`);
        } catch (error) {
          console.error('[App] Error composing note:', error);
          setBusy(false);
          speak('Error composing note. Check the backend connection.');
        }
        break;
      }

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
    const payload = defaultTemplates[section] || '(template)';
    await onInsert(section, { payloadOverride: payload });
  }

  useEffect(() => () => {
    if (commandMessageResetRef.current) {
      window.clearTimeout(commandMessageResetRef.current);
      commandMessageResetRef.current = null;
    }
  }, []);

  // Unified Speech Recognition Manager
  useEffect(() => {
    // Only create speech manager if we don't have one
    if (!speechManagerRef.current) {
      console.log('[AssistMD] Initializing unified speech recognition');
      
      speechManagerRef.current = new SpeechRecognitionManager({
        onResult: async (transcript) => {
          // Update live words display
          setLiveWords(transcript);
          
          // Check if TTS is speaking
          if ((window as any).speechSynthesis?.speaking) {
            console.log('[AssistMD] Ignoring result - TTS is speaking');
            await dispatchCommandWindow(1200, 'Composing note…');
            return;
          }
          
          // Process the result through existing intent handler
          await handleSRResult({
            results: [[{ transcript }]],
            resultIndex: 0
          });
        },
        onStateChange: (state) => {
          console.log('[AssistMD] Speech recognition state:', state);
          setSpeechRecognitionState(state);
        },
        onError: async (error) => {
          if ((window as any).__ASSIST_DEBUG) console.error('[AssistMD] Speech recognition error:', error);
          // Permission denied: try to nudge permission once, then retry
          if (error === 'Microphone permission denied') {
            try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              setTimeout(() => { try { speechManagerRef.current?.start(); } catch {} }, 300);
              toast.push('Mic permission granted. Resuming voice.');
              return;
            } catch {
              toast.push('Voice error: Microphone permission denied');
              return;
            }
          }
          // Minor errors: let SR manager auto-retry silently
        },
        continuous: true,
        interimResults: false
      });
    }

    // Handle TTS speaking - pause recognition during speech synthesis
    const ttsMonitor = setInterval(() => {
      if (!speechManagerRef.current) return;
      
      const speaking = (window as any).speechSynthesis?.speaking;
      if (speaking && speechManagerRef.current.isListening()) {
        console.log('[AssistMD] Pausing for TTS');
        speechManagerRef.current.pause();
      } else if (!speaking && speechManagerRef.current.getState() === 'paused') {
        console.log('[AssistMD] Resuming after TTS');
        speechManagerRef.current.resume();
      }
    }, 200);

    // Cleanup function
    return () => {
      clearInterval(ttsMonitor);
      if (speechManagerRef.current) {
        console.log('[AssistMD] Cleaning up speech recognition');
        speechManagerRef.current.destroy();
        speechManagerRef.current = null;
      }
    };
  }, [toast]);

  // Handle ASR_VAD messages (pause during dictation)
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (!speechManagerRef.current) return;
      
      if (message?.type === 'ASR_VAD') {
        if (message.state === 'speaking') {
          // Pause recognition during dictation
          console.log('[AssistMD] Pausing recognition - dictation active');
          speechManagerRef.current.pause();
        } else if (message.state === 'quiet') {
          // Resume recognition when dictation stops
          console.log('[AssistMD] Resuming recognition - dictation stopped');
          speechManagerRef.current.resume();
        }
      }
      if (message?.type === 'ASR_WS_STATE') {
        telemetry.recordEvent('ws_state_change', { state: message.state }).catch(() => {});
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Start speech recognition on user interaction or when recording starts
  useEffect(() => {
    const startRecognition = () => {
      if (speechManagerRef.current && speechRecognitionState === 'idle') {
        console.log('[AssistMD] Starting speech recognition');
        speechManagerRef.current.start();
      }
    };

    // Try to start immediately (may work in side panel)
    const startTimer = setTimeout(() => {
      startRecognition();
    }, 100);

    // Start when recording begins
    if (recording && speechManagerRef.current && speechRecognitionState === 'idle') {
      startRecognition();
    }

    // Strategy 2: Start after Chrome API interaction
    chrome.runtime.sendMessage({ type: 'PING' }).then(() => {
      startRecognition();
    }).catch(() => {});

    // Fallback: start on first interaction
    const interactionHandler = () => {
      startRecognition();
      document.removeEventListener('click', interactionHandler);
      document.removeEventListener('keydown', interactionHandler);
      window.removeEventListener('focus', interactionHandler);
    };
    
    document.addEventListener('click', interactionHandler, { once: true });
    document.addEventListener('keydown', interactionHandler, { once: true });
    window.addEventListener('focus', interactionHandler, { once: true });

    return () => {
      clearTimeout(startTimer);
      document.removeEventListener('click', interactionHandler);
      document.removeEventListener('keydown', interactionHandler);
      window.removeEventListener('focus', interactionHandler);
    };
  }, [speechRecognitionState, recording]);

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

  // Define ensurePerms now that getContentTab exists
  ensurePerms = async () => {
    try {
      const tab = await getContentTab();
      const url = tab?.url || '';
      if (!url) return true;
      const origin = (() => { try { return new URL(url).origin + '/*'; } catch { return ''; } })();
      // Enforce host allowlist first
      if (host && allowedHosts && allowedHosts.length && !allowedHosts.includes(host)) {
        setPermBanner(true);
        notifyError('Host not allowed. Add it in Settings to enable mapping/insert.');
        telemetry.recordEvent('permission_host_blocked', { host, origin }).catch(() => {});
        return false;
      }
      const contains = (chrome.permissions as any).contains?.bind(chrome.permissions) || (async () => false);
      const request = (chrome.permissions as any).request?.bind(chrome.permissions) || (async () => false);
      const has = await contains({ permissions: ['scripting', 'tabs'], origins: origin ? [origin] : [] as any }).catch(() => false);
      if (has) {
        await ensureContentScript?.();
        return true;
      }
      const ok = await request({ permissions: ['scripting', 'tabs'], origins: origin ? [origin] : [] as any }).catch(() => false);
      if (!ok) {
        notifyError('Permissions denied. Enable permissions to map/insert.');
        setPermBanner(true);
        telemetry.recordEvent('permission_denied', { origin, host }).catch(() => {});
        return false;
      }
      setPermBanner(false);
      telemetry.recordEvent('permission_granted', { origin, host }).catch(() => {});
      await ensureContentScript?.();
      return true;
    } catch {
      return true;
    }
  };

  // Now that getContentTab is declared, define ensureContentScript and run once
  ensureContentScript = async () => {
    try {
      const tab = await getContentTab();
      if (!tab?.id || !tab.url) return;

      let origin = '';
      let hostname = '';
      try {
        const parsed = new URL(tab.url);
        origin = `${parsed.origin}/*`;
        hostname = parsed.hostname;
      } catch {}

      const allowlist = Array.isArray(allowedHosts) ? allowedHosts : [];
      if (hostname && allowlist.length && !allowlist.includes(hostname)) {
        return;
      }

      if (origin) {
        const contains = (chrome.permissions as any).contains?.bind(chrome.permissions);
        if (typeof contains === 'function') {
          const has = await contains({ permissions: ['scripting', 'tabs'], origins: [origin] }).catch(() => false);
          if (!has) return;
        }
      }

      try { await chrome.tabs.sendMessage(tab.id, { type: 'PING' }); }
      catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); }
    } catch {}
  };

  useEffect(() => { ensureContentScript?.(); }, [getContentTab, allowedHosts]);
  useEffect(() => { refreshMetrics().catch(() => {}); }, [recording, wsState]);
  // Keyboard navigation for Target Chooser
  useEffect(() => {
    if (!targetChooser) return;
    const onKey = async (e: KeyboardEvent) => {
      try {
        if (e.key === 'ArrowDown') { e.preventDefault(); setTargetSelection((i) => Math.min(i + 1, (targetChooser?.candidates.length || 1) - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setTargetSelection((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const cand = targetChooser.candidates[targetSelection] || targetChooser.candidates[0];
          setTargetChooser(null);
          setTargetSelection(0);
          const temp: FieldMapping = {
            section: targetChooser.section,
            selector: cand.selector,
            strategy: 'value',
            verified: false,
            framePath: cand.framePath,
            target: (cand.framePath && cand.framePath.length) ? 'iframe' : 'page'
          } as any;
          lastCandidateRef.current = { section: targetChooser.section, selector: cand.selector, framePath: cand.framePath };
          await finalizeInsert(targetChooser.section, temp as FieldMapping, targetChooser.payload, { selector: cand.selector, strict: true });
        }
      } catch {}
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [targetChooser, targetSelection]);

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

  const addCurrentHostToAllowlist = useCallback(async () => {
    if (!host) { toast.push('No active host'); return; }
    const next = Array.from(new Set([...(allowedHosts || []), host])).sort();
    try {
      await chrome.storage.local.set({ ALLOWED_HOSTS: next });
      setAllowedHosts(next);
      toast.push(`Allowed ${host}`);
    } catch { toast.push('Failed to update allowlist'); }
  }, [host, allowedHosts, toast]);

  const removeHostFromAllowlist = useCallback(async (h: string) => {
    const next = (allowedHosts || []).filter((x) => x !== h);
    try {
      await chrome.storage.local.set({ ALLOWED_HOSTS: next });
      setAllowedHosts(next);
      toast.push(`Removed ${h}`);
    } catch { toast.push('Failed to update allowlist'); }
  }, [allowedHosts, toast]);

  const onTogglePairing = useCallback(async (next: boolean) => {
    if (pairingBusy) return;
    setPairingBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'WINDOW_PAIR_SET', enabled: next }).catch(() => null);
      if (!res) throw new Error('no-response');
      if (res?.ok === false) throw new Error(res.error || 'request failed');
      const enabled = typeof res.enabled === 'boolean' ? res.enabled : next;
      setPairingState((prev) => ({ ...prev, enabled }));
      telemetry.recordEvent('window_pair_toggle', { enabled }).catch(() => {});
      toast.push(enabled ? 'Window pairing enabled' : 'Window pairing disabled');
    } catch {
      toast.push('Pairing toggle failed');
    } finally {
      setPairingBusy(false);
    }
  }, [pairingBusy, toast]);

  const onTestMappings = useCallback(async () => {
    if (!host) { toast.push('No host detected'); return; }
    const sections: Section[] = ['PLAN','HPI','ROS','EXAM'];
    for (const s of sections) {
      const field = profile?.[s];
      if (!field?.selector) continue;
      const res = await verifyTarget(field as any);
      toast.push(`${s}: ${res.ok ? 'OK' : res.reason === 'missing' ? 'Missing' : 'Not editable'}`);
    }
  }, [host, profile, toast]);

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

  // Quick action: pair to the current tab (grant perms, allowlist host, enable pairing)
  const pairToThisTab = useCallback(async () => {
    try {
      const tab = await getContentTab();
      if (!tab?.url) { toast.push('No active tab'); return; }
      // Ensure we can inject on this origin
      const ok = await ensurePerms();
      if (!ok) { toast.push('Permission denied for this site'); return; }
      // Add to allowlist if not present
      try {
        const u = new URL(tab.url);
        const h = u.hostname;
        if (h) {
          const next = Array.from(new Set([...(allowedHosts || []), h])).sort();
          await chrome.storage.local.set({ ALLOWED_HOSTS: next });
          setAllowedHosts(next);
        }
      } catch {}
      // Turn on pairing
      await onTogglePairing(true);
      toast.push('Paired to this tab');
    } catch {
      toast.push('Pairing failed');
    }
  }, [allowedHosts, ensurePerms, getContentTab, onTogglePairing, toast]);

  // Move activateMapMode here (before mapSoapHere that uses it)
  const activateMapMode = useCallback(async (section: Section) => {
    const activeTab = await getContentTab();
    if (!activeTab?.id) {
      toast.push('No active tab');
      return false;
    }
    try {
      await ensurePerms();
      await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section });
    } catch (primaryErr) {
      console.warn('MAP_MODE initial send failed, attempting injection', primaryErr);
      try {
        await ensurePerms();
        await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['content.js'] });
        await chrome.tabs.sendMessage(activeTab.id, { type: 'MAP_MODE', on: true, section });
      } catch (fallbackErr) {
        console.error('MAP_MODE fallback failed', fallbackErr);
        toast.push('Unable to enter map mode — reload the EHR tab and try again.');
        return false;
      }
    }
    toast.push(`Click a ${section} field to map`);
    return true;
  }, [toast, getContentTab, ensurePerms]);

  // Quick action: start mapping PLAN (SOAP) in the current tab
  const mapSoapHere = useCallback(async () => {
    try {
      const ok = await activateMapMode('PLAN');
      if (!ok) return;
    } catch {
      toast.push('Unable to start mapping');
    }
  }, [activateMapMode, toast]);

  // First‑time inline tip under header (persist dismiss)
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { TIP_SEEN } = await chrome.storage.local.get(['TIP_SEEN']);
        setTipOpen(!TIP_SEEN);
      } catch {
        setTipOpen(true);
      }
    })();
  }, []);
  const dismissTip = useCallback(async () => {
    setTipOpen(false);
    try { await chrome.storage.local.set({ TIP_SEEN: true }); } catch {}
  }, []);

  const onSelfTestPresign = useCallback(async () => {
    try {
      const encId = crypto.randomUUID();
      const presign = await chrome.runtime.sendMessage({ type: 'PRESIGN_WS', encounterId: encId });
      if (presign?.ok && presign.wssUrl) {
        toast.push('Presign OK');
        pushWsEvent('selftest: presign ok');
      } else {
        toast.push(`Presign failed (${presign?.status ?? 'n/a'})`);
        pushWsEvent('selftest: presign failed');
      }
    } catch (e) {
      toast.push('Presign request error');
    }
  }, [toast]);

  const onSelfTestWS = useCallback(async () => {
    try {
      setBusy(true);
      const encId = crypto.randomUUID();
      const presign = await chrome.runtime.sendMessage({ type: 'PRESIGN_WS', encounterId: encId });
      if (!(presign?.ok && presign.wssUrl)) { toast.push('WS test: presign failed'); return; }
      await chrome.runtime.sendMessage({ type: 'START_CAPTURE' }).catch(() => {});
      await chrome.runtime.sendMessage({ type: 'ASR_CONNECT', wssUrl: presign.wssUrl }).catch(() => {});
      toast.push('WS test: connected (2s)');
      setTimeout(async () => {
        await chrome.runtime.sendMessage({ type: 'ASR_DISCONNECT' }).catch(() => {});
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
        toast.push('WS test: disconnected');
      }, 2000);
    } catch {
      toast.push('WS test error');
    } finally {
      setBusy(false);
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

  // Load allowed hosts (permissions allowlist)
  useEffect(() => {
    (async () => {
      try {
        const { ALLOWED_HOSTS, WINDOW_PAIR_AUTO, OVERLAY_REDACTED, AUDIT_SCREENSHOT_ENABLED, INSERT_MODES, SINGLE_FIELD_MODE } = await chrome.storage.local.get(['ALLOWED_HOSTS','WINDOW_PAIR_AUTO','OVERLAY_REDACTED','AUDIT_SCREENSHOT_ENABLED','INSERT_MODES','SINGLE_FIELD_MODE']);
        if (Array.isArray(ALLOWED_HOSTS)) setAllowedHosts(ALLOWED_HOSTS as string[]);
        setAutoPairOnAllowed(!!WINDOW_PAIR_AUTO);
        const val = !!OVERLAY_REDACTED;
        setRedactedOverlay(val);
        try {
          const tab = await getContentTab();
          if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_SET_REDACTED', on: val });
        } catch {}
        setAuditScreenshots(!!AUDIT_SCREENSHOT_ENABLED);
        if (INSERT_MODES && typeof INSERT_MODES === 'object') {
          setInsertModes((prev) => ({ ...prev, ...(INSERT_MODES as any) }));
        }
        // Per-host single field mode
        try {
          const tab = await getContentTab();
          const url = new URL(tab?.url || '');
          const h = url.hostname;
          const map = (SINGLE_FIELD_MODE && typeof SINGLE_FIELD_MODE === 'object') ? SINGLE_FIELD_MODE as Record<string, boolean> : {};
          if (h) {
            let val: boolean;
            if (Object.prototype.hasOwnProperty.call(map, h)) {
              val = !!map[h];
            } else {
              // Default ON for OSCAR deployments (kai-oscar.com)
              val = /(^|\.)kai-oscar\.com$/.test(h);
              if (val) {
                map[h] = true;
                try { await chrome.storage.local.set({ SINGLE_FIELD_MODE: map }); } catch {}
              }
            }
            setSingleFieldMode(!!val);
          }
        } catch {}
        try { await refreshMetrics(); } catch {}
        try { await flushAuditQueue(); } catch {}
      } catch {}
    })();
  }, []);

  const onToggleSingleFieldMode = useCallback(async (next: boolean) => {
    try {
      const bag = await chrome.storage.local.get(['SINGLE_FIELD_MODE']);
      const map = (bag.SINGLE_FIELD_MODE && typeof bag.SINGLE_FIELD_MODE === 'object') ? bag.SINGLE_FIELD_MODE as Record<string, boolean> : {};
      if (!host) return;
      map[host] = next;
      await chrome.storage.local.set({ SINGLE_FIELD_MODE: map });
      setSingleFieldMode(next);
      toast.push(next ? 'Single note field mode enabled' : 'Single note field mode disabled');
    } catch {
      toast.push('Failed to update setting');
    }
  }, [host, toast]);

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

  // activateMapMode moved earlier (before mapSoapHere) - removed duplicate

  const onMapFields = useCallback(async () => {
    const choice = window.prompt('Map which section? (PLAN, HPI, ROS, EXAM)', 'PLAN');
    const section = (String(choice || 'PLAN').toUpperCase() as Section);
    const valid = section === 'PLAN' || section === 'HPI' || section === 'ROS' || section === 'EXAM';
    const pick = valid ? section : 'PLAN';
    await activateMapMode(pick);
  }, [activateMapMode]);

  const editTemplate = useCallback(async (section: Section) => {
    const cur = defaultTemplates[section];
    const next = window.prompt(`Edit ${section} template`, cur);
    if (next === null) return false;
    try {
      const key = (features.tplPerHost && host) ? `TPL_${host}_${section}` : `TPL_${section}`;
      await chrome.storage.local.set({ [key]: next });
      (defaultTemplates as any)[section] = next;
      toast.push(`${section} template saved`);
      scheduleBackup();
      telemetry.recordEvent('template_saved', { section, host: features.tplPerHost ? host || '(global)' : 'global' }).catch(() => {});
      return true;
    } catch {
      toast.push('Template save failed');
      return false;
    }
  }, [features.tplPerHost, host, toast, scheduleBackup]);

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
          encounterIdRef.current = encId;
          setEncounterId(encId);
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
            try { await audit('record_ws_presign_error', { status: presign?.status }); } catch {}
          }
        } catch {
          transcript.addPartial('[ws] request failed — staying in mock mode');
          setMode('mock');
          setWsState('error');
          const msg = 'Presign request failed';
          setLastError(msg);
          toast.push(msg);
          try { await audit('record_ws_presign_error', { status: 'request_failed' }); } catch {}
        }
      } else {
        await chrome.runtime.sendMessage({ type: 'ASR_DISCONNECT' }).catch(() => {});
        await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
        setRecording(false);
        setMode('idle');
        setWsState('disconnected');
        transcript.clear();
        try { await audit('record_stop'); } catch {}
      }
    } finally {
      setBusy(false);
    }
  }

  // Listen for status + data from background/offscreen
  useEffect(() => {
    const handler = async (m: any) => {
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
          // Purge encounter keys and PHI map on stop
          try {
            const encId = encounterIdRef.current;
            if (encId) {
              try { await deletePHIMap(encId); } catch {}
              try { phiKeyManager.deleteKey(encId); } catch {}
              encounterIdRef.current = null;
              setEncounterId(null);
            }
          } catch {}
          // Recreate speech recognition manager on stop to avoid invalid state
          if (speechManagerRef.current) {
            try { speechManagerRef.current.destroy(); } catch {}
            speechManagerRef.current = null;
          }
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
          // Suppress transcript additions during command mute window
          if (Date.now() < commandMuteUntilRef.current) {
            pushWsEvent('partial: suppressed (command window)');
            return;
          }
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
    width: '100%',
    maxWidth: UI.panel.width + 'px',
    borderRadius: UI.panel.radius,
    backdropFilter: 'blur(14px)',
    background: focusMode ? UI.colors.panelBgFocus : `rgba(255,255,255,${opacity / 100})`,
    color: UI.colors.text
  }), [focusMode, opacity]);

  const pairingEnabled = pairingState.enabled;
  const pairingSummary = pairingState.pairs.length
    ? `${pairingState.pairs.length} window${pairingState.pairs.length === 1 ? '' : 's'} paired`
    : pairingState.enabled ? 'Waiting for eligible host window' : 'No active pairs yet';

  const wsMonitor = isDevelopmentBuild && (
    <div className="text-[11px] text-slate-500 space-y-1">
      {wsEvents.map((e, i) => (<div key={i}>• {e}</div>))}
    </div>
  );

  return (
    <div className={`relative ${isIframeMode ? 'iframe-mode' : ''}`}>
      {permBanner && !isIframeMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex items-center justify-between">
          <div>
            <span className="font-medium">Permissions needed</span>
            <span className="ml-2 text-amber-800 text-[12px]">Grant access to this site to enable mapping and inserting.</span>
          </div>
          <div className="flex gap-2">
            <button className="px-2 py-1 text-xs rounded-md border border-amber-300" onClick={() => setPermBanner(false)}>Dismiss</button>
            <button className="px-2 py-1 text-xs rounded-md bg-amber-600 text-white" onClick={() => ensurePerms()}>Request</button>
          </div>
        </div>
      )}
      {recoveryBanner && snapshotInfo && !isIframeMode && (
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
      {targetChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 w-[420px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl p-4 space-y-3">
            <div className="text-sm font-medium">Select target → {targetChooser.section}</div>
            <div className="text-[12px] text-slate-600">Choose which mapped selector should receive this insert.</div>
            <div className="max-h-40 overflow-auto space-y-2">
              {targetChooser.candidates.map((cand, idx) => (
                <div key={`${cand.selector}-${(cand.framePath||[]).join('.')}`}
                     className="flex items-center justify-between gap-2 text-[12px] text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="assist-target-choice"
                      value={idx}
                      checked={targetSelection === idx}
                      onChange={() => setTargetSelection(idx)}
                    />
                    <span className="font-mono break-all">
                      {cand.selector}
                      {cand.framePath && cand.framePath.length ? `  (iframe ${cand.framePath.join('>')})` : ''}
                      {typeof (cand as any).confidence === 'number' ? `  (${Math.round((cand as any).confidence * 100)}%)` : ''}
                    </span>
                  </label>
                  <button
                    className="px-1.5 py-0.5 rounded border border-slate-300"
                    onClick={async () => {
                      try {
                        const temp: FieldMapping = {
                          section: targetChooser.section,
                          selector: cand.selector,
                          strategy: 'value',
                          verified: false,
                          framePath: cand.framePath,
                          target: (cand.framePath && cand.framePath.length) ? 'iframe' : 'page'
                        } as any;
                        const res = await verifyTarget(temp as any, { preferredSelector: cand.selector, strict: true });
                        toast.push(res.ok ? 'Target OK' : (res.reason === 'missing' ? 'Missing' : 'Not editable'));
                      } catch {
                        toast.push('Test failed');
                      }
                    }}
                  >
                    Test
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-2 py-1 text-xs rounded-md border border-slate-300"
                onClick={() => {
                  setTargetChooser(null);
                  setTargetSelection(0);
                  toast.push('Insert cancelled');
                }}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white"
                onClick={async () => {
              const cand = targetChooser.candidates[targetSelection] || targetChooser.candidates[0];
                setTargetChooser(null);
                setTargetSelection(0);
                const temp: FieldMapping = {
                  section: targetChooser.section,
                  selector: cand.selector,
                  strategy: 'value',
                  verified: false,
                  framePath: cand.framePath,
                  target: (cand.framePath && cand.framePath.length) ? 'iframe' : 'page'
                } as any;
                lastCandidateRef.current = { section: targetChooser.section, selector: cand.selector, framePath: cand.framePath };
                await finalizeInsert(targetChooser.section, temp as FieldMapping, targetChooser.payload, { selector: cand.selector, strict: true });
              }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingInsert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 w-[460px] max-w-[95vw] rounded-lg border border-slate-200 bg-white shadow-xl p-4 space-y-3">
            <div className="text-sm font-medium">Review insert → {pendingInsert.section}</div>
            <div className="grid gap-2 text-[12px]">
              <div className="text-slate-600">
                <div className="font-medium text-slate-700">Existing content</div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2 min-h-[48px] whitespace-pre-wrap">
                  {pendingInsertLoading ? 'Loading…' : (pendingInsertExisting ?? '(unavailable)')}
                </div>
              </div>
              <div className="text-slate-600">
                <div className="font-medium text-slate-700">New content</div>
                <textarea
                  className="w-full rounded border border-slate-300 bg-white p-2 h-32 text-[12px] font-mono"
                  value={pendingInsertDraft}
                  onChange={(e) => setPendingInsertDraft(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-2 py-1 text-xs rounded-md border border-slate-300"
                onClick={() => {
                  setPendingInsert(null);
                  toast.push('Insert cancelled');
                }}
              >
                Cancel
              </button>
              <button
                className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white"
                onClick={async () => {
                  const field = profile?.[pendingInsert.section];
                  if (!field) { setPendingInsert(null); return; }
                  await finalizeInsert(pendingInsert.section, field as FieldMapping, pendingInsertDraft, {
                    selector: pendingInsert.selector,
                    strict: pendingInsertMeta?.strict ?? true
                  });
                  telemetry.recordEvent('insert_preview_confirmed', {
                    section: pendingInsert.section,
                    selector: pendingInsert.selector,
                    edited: pendingInsertDraft !== pendingInsert.payload
                  }).catch(() => {});
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
            host={host}
            hostAllowed={!!host && allowedHosts.includes(host)}
            pairingEnabled={pairingState.enabled}
            pairingSummary={pairingSummary}
            pairingBusy={pairingBusy}
            onTogglePairing={onTogglePairing}
            onToggleFocus={() => setFocusMode((v) => !v)}
            onOpacity={setOpacity}
            onOpenHelp={() => setHelpOpen(true)}
            onOpenSettings={() => setSettingsOpen((v) => !v)}
          />
          {tipOpen && (
            <div className="rounded-md border border-slate-200 bg-indigo-50/80 px-2 py-1 text-[12px] text-slate-800 flex items-center justify-between">
              <div>
                First time? 1) <button className="underline" onClick={() => pairToThisTab()}>Pair</button> · 2) <button className="underline" onClick={() => mapSoapHere()}>Map SOAP</button> · 3) Preview (Alt+G) · 4) Insert (Alt+Enter)
              </div>
              <button aria-label="Dismiss tip" className="ml-2 px-1 text-slate-600 hover:text-slate-900" onClick={dismissTip}>✕</button>
            </div>
          )}
          <div className="flex items-center justify-between text-[12px] text-slate-600">
            <div>
              Inserts: <span className="font-semibold">{metrics.inserts}</span> · Verify fails: <span className="font-semibold text-amber-700">{metrics.verifyFail}</span> · p50: <span className="font-semibold">{metrics.p50} ms</span> · p95: <span className="font-semibold">{metrics.p95} ms</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-2 py-0.5 text-xs rounded-md border border-slate-300"
                onClick={async () => { try { await refreshMetrics(); } catch {} }}
              >Refresh</button>
              <button
                title="Pair to this tab"
                className="px-2 py-0.5 text-xs rounded-md border border-slate-300"
                onClick={() => pairToThisTab()}
              >Pair to tab</button>
              <button
                title="Map SOAP (PLAN) to the editor you click"
                className="px-2 py-0.5 text-xs rounded-md border border-slate-300"
                onClick={() => mapSoapHere()}
              >Map SOAP here</button>
              <button
                title="Insert Plan now"
                className="px-2 py-0.5 text-xs rounded-md border border-slate-300"
                onClick={async () => {
                  const plan = (composedNote && composedNote.sections && (composedNote.sections['Plan'] || composedNote.sections['PLAN'])) || null;
                  if (plan) await onInsert('PLAN', { payloadOverride: plan });
                  else await onInsert('PLAN');
                }}
              >Insert Plan</button>
              <button
                title="Privacy Shield"
                className={`px-2 py-0.5 text-xs rounded-md border ${redactedOverlay && !auditScreenshots ? 'border-emerald-500 text-emerald-700' : 'border-slate-300'}`}
                onClick={async () => {
                  if (redactedOverlay && !auditScreenshots) {
                    // turn off shield
                    setRedactedOverlay(false);
                    try { await chrome.storage.local.set({ OVERLAY_REDACTED: false }); } catch {}
                    try { const tab = await getContentTab(); if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_SET_REDACTED', on: false }); } catch {}
                  } else {
                    // enable redaction and disable audit screenshots
                    setRedactedOverlay(true);
                    try { await chrome.storage.local.set({ OVERLAY_REDACTED: true }); } catch {}
                    try { const tab = await getContentTab(); if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_SET_REDACTED', on: true }); } catch {}
                    setAuditScreenshots(false);
                    try { await chrome.storage.local.set({ AUDIT_SCREENSHOT_ENABLED: false }); } catch {}
                  }
                }}
              >Shield</button>
            </div>
          </div>
            <WindowIndicator
              pairingEnabled={pairingEnabled}
              pairingSummary={pairingSummary}
              lastKnown={windowTrackState.lastKnown}
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
                    onClick={async () => {
                      try {
                        const report = {
                          ts: Date.now(),
                          host,
                          wsState,
                          features,
                          keys: Object.keys(await chrome.storage.local.get(null)),
                        };
                        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                        toast.push('Debug report copied');
                      } catch { toast.push('Copy failed'); }
                    }}
                  >
                    Copy Debug Report
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-2 rounded-md border border-slate-200 p-2">
                  <div className="text-[12px] font-medium text-slate-800 mb-1">Note Field Mode</div>
                  <label className="flex items-center gap-2 text-[12px] text-slate-700">
                    <input type="checkbox" checked={singleFieldMode} onChange={(e) => onToggleSingleFieldMode(e.target.checked)} />
                    Single note field mode for this site ({host || 'unknown'})
                  </label>
                  <div className="text-[11px] text-slate-500 mt-1">If your EHR uses a single editor for the entire note, enable this to focus previews and inserts on that one field.</div>
                </div>
                <div className="text-sm font-medium mt-3">Overlay</div>
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Redact ghost preview text</span>
                  <input
                    type="checkbox"
                    checked={redactedOverlay}
                    onChange={async (e) => {
                      const on = !!e.target.checked;
                      setRedactedOverlay(on);
                      try { await chrome.storage.local.set({ OVERLAY_REDACTED: on }); } catch {}
                      try {
                        const tab = await getContentTab();
                        if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_SET_REDACTED', on });
                      } catch {}
                    }}
                  />
                </label>
                <div className="text-sm font-medium mt-3">Voice</div>
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Enable voice queries (vitals/meds/allergies)</span>
                  <input
                    type="checkbox"
                    checked={voiceQueriesEnabled}
                    onChange={(e) => setVoiceQueriesEnabled(!!e.target.checked)}
                  />
                </label>
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Use AudioWorklet VAD (experimental)</span>
                  <input
                    type="checkbox"
                    checked={useRouterVad}
                    onChange={(e) => setUseRouterVad(!!e.target.checked)}
                  />
                </label>
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Show command HUD pill</span>
                  <input
                    type="checkbox"
                    checked={showCommandHud}
                    onChange={(e) => setShowCommandHud(!!e.target.checked)}
                  />
                </label>
                <div className="text-sm font-medium mt-3">PHI Session</div>
                <button
                  className="px-2 py-1 text-xs rounded-md border border-slate-300"
                  onClick={async () => {
                    try {
                      const encId = encounterIdRef.current;
                      if (encId) {
                        await deletePHIMap(encId);
                        try { phiKeyManager.deleteKey(encId); } catch {}
                        encounterIdRef.current = null;
                        setEncounterId(null);
                        toast.push('PHI session cleared');
                      } else {
                        toast.push('No active encounter');
                      }
                    } catch {
                      toast.push('Failed to clear PHI session');
                    }
                  }}
                >
                  Purge keys & PHI maps
                </button>
                <div className="text-sm font-medium mt-3">Window Management</div>
                <div className="text-[12px] text-slate-600">Keep AssistMD magnetized next to allowed EHR windows.</div>
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Auto-open floating assistant window</span>
                  <input type="checkbox" checked={pairingEnabled} onChange={(e) => onTogglePairing(e.target.checked)} />
                </label>
                <div className="text-sm font-medium mt-3">Insert Mode</div>
                <div className="text-[12px] text-slate-600">Choose Append (default) or Replace per section.</div>
                {(['PLAN','HPI','ROS','EXAM'] as Section[]).map((sec) => (
                  <label key={`mode-${sec}`} className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span>{sec}</span>
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={insertModes[sec]}
                      onChange={async (e) => {
                        const val = (e.target.value === 'replace' ? 'replace' : 'append') as 'append'|'replace';
                        const next = { ...insertModes, [sec]: val };
                        setInsertModes(next);
                        try { await chrome.storage.local.set({ INSERT_MODES: next }); toast.push('Insert mode saved'); } catch {}
                      }}
                    >
                      <option value="append">Append</option>
                      <option value="replace">Replace</option>
                    </select>
                  </label>
                ))}
                <label className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>Auto-pair on allowed hosts</span>
                  <input
                    type="checkbox"
                    checked={autoPairOnAllowed}
                    onChange={async (e) => {
                      const val = !!e.target.checked;
                      try { await chrome.storage.local.set({ WINDOW_PAIR_AUTO: val }); } catch {}
                      setAutoPairOnAllowed(val);
                      toast.push(val ? 'Auto-pair enabled' : 'Auto-pair disabled');
                    }}
                  />
                </label>
                <div className="text-[11px] text-slate-500">{pairingEnabled ? pairingSummary : 'Disabled — enable to magnetize on allowed hosts.'}</div>
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
                <div className="mt-2 flex gap-2">
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={async () => {
                      try {
                        if (!host) { toast.push('No host'); return; }
                        await chrome.storage.local.remove([`MAP_${host}`]);
                        setProfile({} as any);
                        toast.push('Host mappings cleared');
                        scheduleBackup();
                      } catch { toast.push('Clear failed'); }
                    }}
                  >
                    Clear Host Mappings
                  </button>
                </div>
                <div className="text-[12px] text-slate-500">After updating the API base, reload the EHR page and start again.</div>
                <div className="text-sm font-medium mt-3">Templates</div>
                <div className="text-[11px] text-slate-500">
                  {features.tplPerHost
                    ? `Scoped to ${host || 'global default'}`
                    : 'Applies to all hosts'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['PLAN','HPI','ROS','EXAM'] as Section[]).map((sec) => (
                    <button key={sec}
                      className="px-2 py-1 text-xs rounded-md border border-slate-300"
                      onClick={async () => { await editTemplate(sec); }}
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
                        const scope = features.tplPerHost ? (host || 'global default') : 'all hosts';
                        toast.push(`Templates loaded (${scope})`);
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
                <div className="text-sm font-medium mt-3">Permissions</div>
                <div className="text-[12px] text-slate-700">
                  The extension requests access to the current site only when mapping or inserting. If denied, mapping and insert won’t work.
                  <div className="mt-2 flex gap-2">
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={() => ensurePerms()}>Request Permissions</button>
                  </div>
                </div>
                <div className="text-sm font-medium mt-3">Host Allowlist</div>
                <div className="text-[12px] text-slate-700 space-y-2">
                  <div>Current: <span className="font-mono">{host || '(none)'}</span> {host && allowedHosts.includes(host) ? <span className="text-emerald-600">(allowed)</span> : <span className="text-amber-600">(not allowed)</span>}</div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={addCurrentHostToAllowlist} disabled={!host}>Allow Current Host</button>
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={() => { if (host) removeHostFromAllowlist(host); }} disabled={!host || !allowedHosts.includes(host)}>Remove Current Host</button>
                  </div>
                  {allowedHosts && allowedHosts.length > 0 && (
                    <div className="text-[11px] text-slate-600">Allowed: {allowedHosts.map((h) => (
                      <button key={h} className="mr-2 underline" onClick={() => removeHostFromAllowlist(h)} title="Remove">{h}</button>
                    ))}</div>
                  )}
                </div>
                <div className="text-sm font-medium mt-3">Mappings</div>
                <div className="text-[12px] text-slate-700 space-y-1">
                  <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={onTestMappings}>Test Mappings</button>
                </div>
                <div className="text-sm font-medium mt-3">Safety Utilities</div>
                <div className="text-[12px] text-slate-700 space-y-1 flex gap-2 flex-wrap">
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={async () => { try { await chrome.storage.local.remove(['ASSIST_CONFIRMED_FP']); toast.push('Patient confirmation reset'); } catch {} }}
                  >
                    Reset Patient Confirmation
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded-md border border-slate-300"
                    onClick={async () => {
                      if (!host) { toast.push('No host'); return; }
                      try { await chrome.storage.local.remove([`MAP_${host}`]); toast.push('Cleared mappings for host'); setProfile({} as any); } catch { toast.push('Failed to clear mappings'); }
                    }}
                  >
                    Clear Mappings (This Host)
                  </button>
                </div>
                <div className="text-sm font-medium mt-3">Connection Self‑Test</div>
                <div className="text-[12px] text-slate-700 space-y-1 flex gap-2 flex-wrap">
                  <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={onSelfTestPresign} disabled={busy}>Presign Test</button>
                  <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={onSelfTestWS} disabled={busy}>WS Quick Test</button>
                </div>
                <div className="text-sm font-medium mt-3">Telemetry (local)</div>
                <div className="text-[12px] text-slate-700">
                  <div className="mb-2 rounded-md border border-slate-200 bg-white/90 p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div>Insert latency p50: <span className="font-semibold">{metrics.p50} ms</span></div>
                        <div>Insert latency p95: <span className="font-semibold">{metrics.p95} ms</span></div>
                      </div>
                      <div className="text-right">
                        <div>Inserts: <span className="font-semibold">{metrics.inserts}</span></div>
                        <div>Verify fails: <span className="font-semibold text-amber-700">{metrics.verifyFail}</span></div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={refreshMetrics}>Refresh</button>
                    </div>
                  </div>
                  We store recent timing and outcome events locally to help debug (no network). You can export or clear them here.
                  <div className="mt-2 flex gap-2">
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={async () => {
                      try { const blob = new Blob([await telemetry.exportTelemetry()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'assistmd-telemetry.json'; a.click(); URL.revokeObjectURL(url); toast.push('Telemetry exported'); } catch { toast.push('Export failed'); }
                    }}>Export Telemetry</button>
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={async () => { await telemetry.clearTelemetry(); toast.push('Telemetry cleared'); }}>Clear Telemetry</button>
                    <button className="px-2 py-1 text-xs rounded-md border border-slate-300" onClick={async () => {
                      try {
                        const items = await telemetry.getRecent(10);
                        alert('Recent telemetry (last 10):\n' + items.map(i => `${new Date(i.ts).toLocaleTimeString()} · ${i.name} ${i.data?JSON.stringify(i.data):''}`).join('\n'));
                      } catch {}
                    }}>Show Recent</button>
                  </div>
                </div>
                <div className="text-sm font-medium mt-3">Shortcuts & Help</div>
                <div className="text-[12px] text-slate-700 space-y-1">
                  <div>• Cmd/Ctrl + ` — Toggle focus mode</div>
                  <div>• Cmd/Ctrl + B — Download backup snapshot</div>
                  <div>• Alt + R — Toggle recording</div>
                  <div>• Alt + Space — Push‑to‑Talk (hold)</div>
                  <div>• Voice: “assist insert plan”, “assist template plan”, “assist undo”</div>
                  <div>
                    <button
                      className="mt-1 px-2 py-1 text-xs rounded-md border border-slate-300"
                      onClick={async () => {
                        try {
                          const url = chrome.runtime.getURL('ehr-test.html');
                          await chrome.tabs.create({ url });
                        } catch {}
                      }}
                    >
                      Open EHR Test Page
                    </button>
                    <button
                      className="mt-1 ml-2 px-2 py-1 text-xs rounded-md border border-slate-300"
                      onClick={async () => {
                        try {
                          const url = chrome.runtime.getURL('troubleshooting.html');
                          await chrome.tabs.create({ url });
                        } catch {}
                      }}
                    >
                      Troubleshooting
                    </button>
                  </div>
                </div>
              </div>
            )}
            {helpOpen && (
              <QuickStartGuide
                onClose={() => setHelpOpen(false)}
                onOpenSettings={() => {
                  setHelpOpen(false);
                  setSettingsOpen(true);
                }}
              />
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
            <CommandStrip message={commandMessage} speechState={speechRecognitionState} />
            <TranscriptList />

            {/* Chat Log for Assistant Messages */}
            {chatLog.length > 0 && (
              <div className="mt-4 mb-4">
                <div className="text-xs font-semibold text-gray-400 mb-2 px-1">
                  💬 Assistant Chat
                </div>
                <ChatLog messages={chatLog} autoScroll={true} />
              </div>
            )}

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
              onInsertHPI={features.multi && !singleFieldMode ? (() => onInsert('HPI')) : undefined}
              onInsertROS={features.multi && !singleFieldMode ? (() => onInsert('ROS')) : undefined}
              onInsertEXAM={features.multi && !singleFieldMode ? (() => onInsert('EXAM')) : undefined}
              onUndo={features.undo ? (async () => {
                const ok = await undoLastInsert();
                toast.push(ok ? 'Undo applied' : 'Nothing to undo');
              }) : undefined}
              onCopyTranscript={onCopyTranscript}
              transcriptFormat={transcriptFormat}
              onFormatChange={setTranscriptFormat}
              onMapFields={onMapFields}
              onGhostPreview={sendGhostPreview}
              onClearPreview={async () => {
                setGhostPreview(null);
                try {
                  const tab = await getContentTab();
                  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GHOST_CLEAR' });
                } catch {}
              }}
              onComposeNote={handleComposeNote}
              hasTranscript={transcript.get().length > 0}
            />
            {composedNote && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Composed Note</div>
                    {Array.isArray((composedNote as any).flags) && (composedNote as any).flags.length > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border ${
                          (composedNote as any).flags.some((f: any) => f.severity === 'high')
                            ? 'bg-rose-100 text-rose-800 border-rose-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}
                        title="Safety warnings"
                      >
                        ⚠️ {(composedNote as any).flags.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-0.5 text-[11px] rounded-md border border-slate-300 hover:bg-slate-50"
                      onClick={async () => {
                        try {
                          for (const [sec] of Object.entries(composedNote.sections)) {
                            await insertComposed(sec);
                          }
                          toast.push('All sections inserted');
                        } catch { toast.push('Insert all failed'); }
                      }}
                      title="Insert all sections"
                    >Insert All</button>
                    <div className="text-[11px] text-slate-600">{getNoteSummary(composedNote)}</div>
                  </div>
                </div>
                
                {!singleFieldMode && Object.entries(composedNote.sections).map(([sec, txt]) => {
                  // Render text with clickable timestamp links
                  const renderTextWithTimestamps = (text: string) => {
                    const timestampRegex = /\[(\d{2}:\d{2}(?::\d{2})?)\]/g;
                    const parts: (string | JSX.Element)[] = [];
                    let lastIndex = 0;
                    let match;
                    let keyCounter = 0;

                    while ((match = timestampRegex.exec(text)) !== null) {
                      // Add text before timestamp
                      if (match.index > lastIndex) {
                        parts.push(text.slice(lastIndex, match.index));
                      }
                      // Add clickable timestamp
                      const timestamp = match[1];
                      parts.push(
                        <button
                          key={`ts-${keyCounter++}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline font-mono text-[11px] mx-0.5"
                          onClick={() => toast.push(`Jump to ${timestamp} (audio playback not yet wired)`)}
                          title={`Jump to ${timestamp} in transcript`}
                        >
                          [{timestamp}]
                        </button>
                      );
                      lastIndex = match.index + match[0].length;
                    }
                    // Add remaining text
                    if (lastIndex < text.length) {
                      parts.push(text.slice(lastIndex));
                    }
                    return parts.length > 0 ? parts : text;
                  };

                  return (
                    <div key={sec} className="border border-slate-100 rounded-md p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold">{sec}</div>
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] text-slate-500">{String(txt||'').length} chars</div>
                          <button
                            className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                            onClick={async () => { try { await navigator.clipboard.writeText(String(txt||'')); toast.push(`${sec} copied`); } catch { toast.push('Copy failed'); } }}
                            title={`Copy ${sec}`}
                          >Copy</button>
                          <button
                            className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                            onClick={() => insertComposed(sec)}
                          >
                            Insert {sec}
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[12px] whitespace-pre-wrap text-slate-700">
                        {renderTextWithTimestamps(String(txt || '').slice(0, 800))}
                      </div>
                    </div>
                  );
                })}
                {composedNote.flags?.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="font-semibold text-amber-900 flex items-center gap-2">
                      ⚠️ Safety Warnings ({composedNote.flags.length})
                    </div>
                    {composedNote.flags.map((f, i) => {
                      const severityColor = f.severity === 'high' ? 'text-rose-700 bg-rose-100' : f.severity === 'medium' ? 'text-amber-700 bg-amber-100' : 'text-slate-700 bg-slate-100';
                      return (
                        <div key={i} className={`rounded-md px-2 py-1 text-xs ${severityColor}`}>
                          <span className="font-semibold uppercase">[{f.severity}]</span> {f.text}
                        </div>
                      );
                    })}
                  </div>
                )}
                {Array.isArray(composedNote.provenance) && composedNote.provenance.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">🕓 Citations</div>
                      <button className="px-2 py-0.5 text-xs rounded-md border border-slate-300" onClick={() => setShowCitations(v => !v)}>
                        {showCitations ? 'Hide' : 'Show'} ({composedNote.provenance.length})
                      </button>
                    </div>
                    {showCitations && (
                      <div className="text-[12px] text-slate-700 space-y-1">
                        {composedNote.provenance.slice(0, 8).map((p, i) => (
                          <div key={i}>• {formatProvenanceTime(p.timestamp)} {p.section ? `${p.section} — ` : ''}{p.sentence}</div>
                        ))}
                        {composedNote.provenance.length > 8 && (
                          <div className="text-slate-500">…and {composedNote.provenance.length - 8} more</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(composedNote as any).billing && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                    <div className="font-semibold text-indigo-900">💼 Billing Codes</div>
                    {(composedNote as any).billing.icd10?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-indigo-800 mb-1">ICD-10 Diagnoses</div>
                        {(composedNote as any).billing.icd10.map((code: any, i: number) => (
                          <div key={i} className="text-xs text-indigo-700 ml-2">
                            • <span className="font-mono">{code.code}</span> - {code.description}
                            <span className="text-indigo-500 ml-1">({code.confidence})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(composedNote as any).billing.cpt?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-indigo-800 mb-1">CPT Procedures</div>
                        {(composedNote as any).billing.cpt.map((code: any, i: number) => (
                          <div key={i} className="text-xs text-indigo-700 ml-2">
                            • <span className="font-mono">{code.code}</span> - {code.description}
                            <span className="text-indigo-500 ml-1">({code.confidence})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
                      telemetry.recordEvent('patient_confirmed', { fp: pendingGuard.fp }).catch(() => {});
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
                      telemetry.recordEvent('insert_cancelled').catch(() => {});
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
        try { await audit('record_start', { mode: 'init' }); } catch {}
