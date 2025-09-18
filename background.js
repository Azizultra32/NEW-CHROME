const TAG = 'BG';

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
    await chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html'), type: 'popup', width: 420, height: 740 });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === 'PING') {
    send({ ok: true });
    return true;
  }
  (async () => {
    if (msg?.type === 'START_CAPTURE') {
      console.log(`[${TAG}] START_CAPTURE`);
      await ensureOffscreen();
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_START' }).catch(() => {});
      send({ ok: true });
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
      chrome.runtime.sendMessage({ type: 'ASR_CONNECT', wssUrl: msg.wssUrl }).catch(() => {});
      send({ ok: true });
      return;
    }

    if (msg?.type === 'ASR_DISCONNECT') {
      console.log(`[${TAG}][ASR_DISCONNECT]`);
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

    send({ ok: false, error: 'UNKNOWN_MESSAGE' });
  })();
  return true;
});
