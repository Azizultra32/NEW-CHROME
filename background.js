const TAG = 'BG';

// Silence console in production to reduce noise/PHI risk
try {
  const PROD = true; // static for MV3 build copy
  if (PROD) {
    console.log = () => {};
    console.warn = () => {};
  }
} catch {}

try {
importScripts('background/windowPairing.js', 'background/windowTracking.js');
} catch (error) {
  console.warn(`[${TAG}] failed to import pairing helpers`, error);
}

// Lightweight WS reconnection orchestrator (background-level)
let asrActive = false;
let lastEncounterId = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000; // backoff up to 10s

// Pinned popup management (e.g., EHR plan popup) — keep connected to parent window
const pinnedPopups = new Map(); // popupWindowId -> parentWindowId
const parentHasPopup = new Map(); // parentWindowId -> popupWindowId

function clearReconnectTimer() {
  try { if (reconnectTimer) clearTimeout(reconnectTimer); } catch {}
  reconnectTimer = null;
  reconnectDelayMs = 1000;
}

async function presign(encounterId) {
  const fetchWithTimeout = async (url, init = {}, timeoutMs = 30000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
  };
  const API_BASE = await resolveApiBase();
  const res = await fetchWithTimeout(`${API_BASE}/v1/encounters/${encounterId}/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'whisper' })
  }, 30000);
  const text = await res.text();
  const json = JSON.parse(text || '{}');
  const { wssUrl, headers } = json || {};
  return { ok: !!wssUrl, status: res.status, wssUrl, headers: headers || {} };
}

function scheduleReconnect(reason) {
  if (!asrActive || !lastEncounterId) return;
  if (reconnectTimer) return;
  const delay = Math.min(10000, reconnectDelayMs);
  console.log(`[${TAG}][ASR][RECONNECT] in ${delay}ms`, reason ? `(${reason})` : '');
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const p = await presign(lastEncounterId);
      if (p.ok && p.wssUrl) {
        console.log(`[${TAG}][ASR][RECONNECT][PRESIGN_OK]`, p.status);
        try { await chrome.runtime.sendMessage({ type: 'ASR_CONNECT', wssUrl: p.wssUrl, headers: p.headers }); } catch {}
        reconnectDelayMs = 1000; // reset backoff on success
      } else {
        console.warn(`[${TAG}][ASR][RECONNECT][PRESIGN_FAIL] status=`, p.status);
        reconnectDelayMs = Math.min(10000, reconnectDelayMs * 2);
        scheduleReconnect('presign-failed');
      }
    } catch (e) {
      console.warn(`[${TAG}][ASR][RECONNECT][ERR]`, String(e));
      reconnectDelayMs = Math.min(10000, reconnectDelayMs * 2);
      scheduleReconnect('presign-error');
    }
  }, delay);
}

async function resolveApiBase() {
  const fallback = (globalThis.__ASSIST_CONFIG__ && __ASSIST_CONFIG__.API_BASE) || 'http://localhost:8080';
  try {
    const { API_BASE } = await chrome.storage.local.get(['API_BASE']);
    return API_BASE || fallback;
  } catch {
    return fallback;
  }
}

async function ensureOffscreen() {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) {
    console.log(`[${TAG}] offscreen already present`);
    return;
  }
  console.log(`[${TAG}] creating offscreen document`);
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Low-latency mic capture for clinical dictation'
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }); } catch {}
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (globalThis.windowTracker) {
      const handled = await globalThis.windowTracker.focusExisting(tab.windowId);
      if (handled) {
        return;
      }
    }

    await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
    globalThis.windowTracker?.recordSidepanelOpen?.(tab.windowId);

    // Show helpful notification about OS-level always-on-top
    const platform = navigator.platform?.toUpperCase?.() || '';
    const isMac = platform.includes('MAC');
    const isWindows = platform.includes('WIN');

    let message = 'Tip: Keep AssistMD on top using ';
    if (isMac) {
      message += 'Rectangle/Magnet window manager';
    } else if (isWindows) {
      message += 'PowerToys (Win+Ctrl+T)';
    } else {
      message += 'your window manager\'s always-on-top feature';
    }

    // Only show tip once per session
    const shown = await chrome.storage.session.get('alwaysOnTopTipShown');
    if (!shown.alwaysOnTopTipShown) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'AssistMD Tip',
        message,
        requireInteraction: false
      });
      await chrome.storage.session.set({ alwaysOnTopTipShown: true });
    }
  } catch {
    try {
      const popup = await chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html'), type: 'popup', width: 420, height: 740 });
      globalThis.windowTracker?.recordSidepanelPopup?.(popup.id);
    } catch {}
  }
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === 'PING') {
    send({ ok: true });
    return true;
  }
  (async () => {
    // Passive status events from offscreen/clients — ack + react
    if (msg?.type === 'ASR_WS_STATE') {
      try {
        if (msg.state === 'open') {
          clearReconnectTimer();
        }
        if (msg.state === 'closed' || msg.state === 'error') {
          // Let offscreen retry first; background will re-presign if needed
          scheduleReconnect(msg.state);
        }
      } finally {
        send({ ok: true });
      }
      return;
    }

    if (msg?.type === 'START_CAPTURE') {
      console.log(`[${TAG}] START_CAPTURE`);
      try {
        await ensureOffscreen();
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_START' }).catch(() => {});
        send({ ok: true });
      } catch (error) {
        console.error(`[${TAG}] ensureOffscreen failed`, error);
        send({ ok: false, error: String(error) });
      }
      return;
    }

    if (msg?.type === 'STOP_CAPTURE') {
      console.log(`[${TAG}] STOP_CAPTURE`);
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' }).catch(() => {});
      send({ ok: true });
      return;
    }

    if (msg?.type === 'PRESIGN_WS' && msg.encounterId) {
      const API_BASE = await resolveApiBase();
      console.log(`[${TAG}][PRESIGN][REQ]`, { API_BASE, encounterId: msg.encounterId });
      try {
        // Remember encounter for future reconnect attempts
        lastEncounterId = msg.encounterId;
        clearReconnectTimer();
        const res = await fetch(`${API_BASE}/v1/encounters/${msg.encounterId}/presign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // 'Authorization': 'Bearer <YOUR_TOKEN>'
          },
          body: JSON.stringify({ mode: 'whisper' })
        });
        const text = await res.text();
        console.log(`[${TAG}][PRESIGN][RES]`, res.status, text);
        const { wssUrl, headers } = JSON.parse(text || '{}');
        send({ ok: !!wssUrl, wssUrl, status: res.status, headers: headers || {} });
      } catch (error) {
        console.warn(`[${TAG}][PRESIGN][ERR]`, String(error));
        send({ ok: false, error: String(error) });
      }
      return;
    }

    if (msg?.type === 'ASR_CONNECT' && msg.wssUrl) {
      console.log(`[${TAG}][ASR_CONNECT]`, msg.wssUrl);
      asrActive = true;
      clearReconnectTimer();
      chrome.runtime.sendMessage({ type: 'ASR_CONNECT', wssUrl: msg.wssUrl }).catch(() => {});
      send({ ok: true });
      return;
    }

    if (msg?.type === 'ASR_DISCONNECT') {
      console.log(`[${TAG}][ASR_DISCONNECT]`);
      asrActive = false;
      clearReconnectTimer();
      chrome.runtime.sendMessage({ type: 'ASR_DISCONNECT' }).catch(() => {});
      send({ ok: true });
      return;
    }

    if (msg?.type === 'EHR_DEMOGRAPHICS') {
      try {
        const tabId = sender?.tab?.id;
        if (tabId !== undefined) {
          await chrome.storage.session.set({ [`FP_${tabId}`]: { fp: msg.fp, preview: msg.preview } });
        }
      } catch {}
      chrome.runtime.sendMessage({ type: 'EHR_FP', fp: msg.fp, preview: msg.preview }).catch(() => {});
      send({ ok: true });
      return;
    }

    if (msg?.type === 'COMMAND_INSERT_TEXT' && typeof msg.text === 'string') {
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const tab = tabs[0];
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', text: msg.text });
        }
        send({ ok: true });
      } catch (error) {
        send({ ok: false, error: String(error) });
      }
      return;
    }

    if (msg?.type === 'COMMAND_WINDOW' && typeof msg.ms === 'number') {
      if (!msg.forwarded) {
        chrome.runtime.sendMessage({ type: 'COMMAND_WINDOW', ms: msg.ms, forwarded: true }).catch(() => {});
      }
      send({ ok: true });
      return;
    }

    if (msg?.type === 'WINDOW_PAIR_SET') {
      try {
        const manager = globalThis.windowManager;
        if (!manager) { send({ ok: false, error: 'PAIRING_UNAVAILABLE' }); return; }
        const enabled = await manager.setEnabled(!!msg.enabled);
        send({ ok: true, enabled });
      } catch (error) {
        send({ ok: false, error: String(error) });
      }
      return;
    }

    if (msg?.type === 'WINDOW_PAIR_STATUS') {
      try {
        const manager = globalThis.windowManager;
        if (!manager) { send({ ok: true, enabled: false, pairs: [] }); return; }
        const state = await manager.getState();
        send({ ok: true, ...state });
      } catch (error) {
        send({ ok: false, error: String(error) });
      }
      return;
    }

    if (msg?.type === 'WINDOW_TRACK_STATUS') {
      const tracker = globalThis.windowTracker;
      const state = tracker?.getState?.() || { sidepanelWindowId: null, lastKnown: null };
      send({ ok: true, ...state });
      return;
    }

    send({ ok: false, error: 'UNKNOWN_MESSAGE' });
  })();
  return true;
});

// ----- EHR Plan Popup Pinning (keep connected to parent EMR window) -----
async function repositionPinnedPopup(parentWindowId) {
  try {
    const popupId = parentHasPopup.get(parentWindowId);
    if (!popupId) return;
    const emr = await chrome.windows.get(parentWindowId);
    const width = 600;
    const height = 700;
    const left = (emr.left ?? 0) + Math.max((emr.width ?? 0) - width - 20, 0);
    const top = (emr.top ?? 0) + 40;
    try { await chrome.windows.update(popupId, { left, top, width, height }); } catch {}
    // Try to make it always on top if the platform supports it (best-effort)
    try { await chrome.windows.update(popupId, { alwaysOnTop: true }); } catch {}
  } catch {}
}

// Detect when the extension's ehr-popup.html opens in a new window (via window.open)
try {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!tab || changeInfo.status !== 'complete') return;
    const url = String(tab.url || '');
    if (!url.includes('ehr-popup.html')) return;
    try {
      // Map popup window to its opener's window
      const openerId = tab.openerTabId;
      if (typeof openerId === 'number') {
        try {
          const openerTab = await chrome.tabs.get(openerId);
          if (openerTab && typeof openerTab.windowId === 'number') {
            const parentId = openerTab.windowId;
            const popupWindowId = tab.windowId;
            if (typeof popupWindowId === 'number') {
              pinnedPopups.set(popupWindowId, parentId);
              parentHasPopup.set(parentId, popupWindowId);
              await repositionPinnedPopup(parentId);
            }
          }
        } catch {}
      }
    } catch {}
  });

  // Reposition popup when parent moves/resizes
  chrome.windows.onBoundsChanged.addListener(async (windowId) => {
    if (!parentHasPopup.has(windowId)) return;
    await repositionPinnedPopup(windowId);
  });

  // Keep popup above by focusing it when parent regains focus (best-effort)
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    const popupId = parentHasPopup.get(windowId);
    if (!popupId) return;
    try { await chrome.windows.update(popupId, { focused: true }); } catch {}
  });

  // Cleanup bookkeeping
  chrome.windows.onRemoved.addListener((windowId) => {
    if (pinnedPopups.has(windowId)) {
      const parentId = pinnedPopups.get(windowId);
      pinnedPopups.delete(windowId);
      if (parentHasPopup.get(parentId) === windowId) {
        parentHasPopup.delete(parentId);
      }
      return;
    }
    if (parentHasPopup.has(windowId)) {
      const popupId = parentHasPopup.get(windowId);
      parentHasPopup.delete(windowId);
      if (pinnedPopups.get(popupId) === windowId) pinnedPopups.delete(popupId);
    }
  });
} catch (e) {
  console.warn('[BG] popup pinning listeners failed to initialize', e);
}
