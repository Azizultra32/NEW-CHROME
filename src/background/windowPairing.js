// Window Pairing Manager for AssistMD
// Keeps the assistant window "magnetized" to the EMR window when enabled

const STORAGE_KEY_ENABLED = 'WINDOW_PAIR_ENABLED';
const STORAGE_KEY_AUTO = 'WINDOW_PAIR_AUTO';
const STORAGE_ALLOWED_HOSTS = 'ALLOWED_HOSTS';
const EMR_PATTERNS = ['epic.com', 'cerner.com', 'athenahealth.com', 'ehr-test.html'];

class WindowPairManager {
  constructor() {
    this.enabled = false;
    this.pairs = new Map(); // emrWindowId -> assistantWindowId
    this.assistants = new Map(); // assistantWindowId -> emrWindowId
    this.metadata = new Map(); // emrWindowId -> { host, title, url }
    this.allowedHosts = [];
    this.initialized = false;
    this.auto = false;
    this.init();
    this.setupListeners();
  }

  async init() {
    try {
      const store = await chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_ALLOWED_HOSTS, STORAGE_KEY_AUTO]);
      this.enabled = !!store[STORAGE_KEY_ENABLED];
      this.auto = !!store[STORAGE_KEY_AUTO];
      if (Array.isArray(store[STORAGE_ALLOWED_HOSTS])) {
        this.allowedHosts = store[STORAGE_ALLOWED_HOSTS];
      }
      // Always refresh to inject docks on all pages
      await this.refreshPairs();
      // If auto-pair is on and we have allowed hosts, ensure enabled
      if (this.auto && (!this.enabled) && Array.isArray(this.allowedHosts) && this.allowedHosts.length > 0) {
        try { await this.setEnabled(true); } catch {}
      }
      this.broadcastStatus();
    } catch (error) {
      console.warn('[WindowPair] init error', error);
    } finally {
      this.initialized = true;
    }
  }

  setupListeners() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!tab || changeInfo.status !== 'complete') return;
      this.checkForEMR(tab).catch(() => {});
    });

    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs.get(tabId).then((tab) => {
        this.checkForEMR(tab).catch(() => {});
      }).catch(() => {});
    });

    chrome.windows.onBoundsChanged.addListener(async (windowId) => {
      if (!this.enabled || !this.pairs.has(windowId)) return;
      try {
        const emrWindow = await chrome.windows.get(windowId);
        const assistantId = this.pairs.get(windowId);
        if (!assistantId) return;
        await chrome.windows.update(assistantId, {
          left: (emrWindow.left ?? 0) + Math.max((emrWindow.width ?? 0) - this.getAssistantWidth(emrWindow.width), 0),
          top: (emrWindow.top ?? 0) + 40,
          height: Math.max((emrWindow.height ?? 0) - 80, 480)
        });
      } catch {}
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      if (this.pairs.has(windowId)) {
        this.teardownPair(windowId).catch(() => {});
        return;
      }
      const parentId = this.assistants.get(windowId);
      if (parentId) {
        this.assistants.delete(windowId);
        this.pairs.delete(parentId);
        this.metadata.delete(parentId);
        this.broadcastStatus();
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (STORAGE_ALLOWED_HOSTS in changes) {
        const next = changes[STORAGE_ALLOWED_HOSTS]?.newValue;
        this.allowedHosts = Array.isArray(next) ? next : [];
        if (this.enabled) {
          this.refreshPairs().catch(() => {});
        } else if (this.auto && this.allowedHosts.length > 0) {
          this.setEnabled(true).catch(() => {});
        }
      }
      if (STORAGE_KEY_ENABLED in changes) {
        const nextEnabled = !!changes[STORAGE_KEY_ENABLED]?.newValue;
        if (nextEnabled !== this.enabled) {
          this.setEnabled(nextEnabled).catch(() => {});
        }
      }
      if (STORAGE_KEY_AUTO in changes) {
        this.auto = !!changes[STORAGE_KEY_AUTO]?.newValue;
        if (this.auto && !this.enabled && this.allowedHosts.length > 0) {
          this.setEnabled(true).catch(() => {});
        }
      }
    });
  }

  getAssistantWidth(emrWidth = 1200) {
    const clamped = Math.max(320, Math.min(420, emrWidth * 0.32));
    return Math.round(clamped);
  }

  async checkForEMR(tab) {
    if (!tab || !tab.windowId) return;
    
    // Always inject dock on valid web pages (not chrome:// or extension pages)
    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://') && 
        !tab.url.startsWith('edge://') && 
        !tab.url.startsWith('about:')) {
      await this.injectDock(tab.id);
    }
    
    if (!this.enabled) return;
    
    const info = this.analyzeTab(tab);
    if (!info) {
      if (this.pairs.has(tab.windowId)) {
        await this.teardownPair(tab.windowId);
      }
      return;
    }
    
    if (this.pairs.has(tab.windowId)) {
      this.metadata.set(tab.windowId, info);
      this.broadcastStatus();
      return;
    }
    await this.createMagnetizedAssistant(tab.windowId, info);
  }

  analyzeTab(tab) {
    if (!tab || !tab.url) return null;
    const url = tab.url;
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      return null;
    }
    const allowlistActive = Array.isArray(this.allowedHosts) && this.allowedHosts.length > 0;
    const explicitlyAllowed = allowlistActive ? this.allowedHosts.includes(host) : false;
    if (allowlistActive && !explicitlyAllowed) return null;
    const lower = url.toLowerCase();
    const matches = EMR_PATTERNS.some((pattern) => lower.includes(pattern));
    if (!matches && !explicitlyAllowed) return null;
    return {
      host,
      title: tab.title || host,
      url
    };
  }

  isHostAllowed(host) {
    if (!Array.isArray(this.allowedHosts) || this.allowedHosts.length === 0) return true;
    return this.allowedHosts.includes(host);
  }

  async createMagnetizedAssistant(emrWindowId, info) {
    if (!this.enabled || this.pairs.has(emrWindowId)) return this.pairs.get(emrWindowId) || null;
    let emrWindow;
    try {
      emrWindow = await chrome.windows.get(emrWindowId);
    } catch (error) {
      console.warn('[WindowPair] failed to locate EMR window', error);
      return null;
    }
    try {
      const width = this.getAssistantWidth(emrWindow.width ?? 1200);
      const assistantWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('sidepanel.html?mode=popup'),
        type: 'popup',
        width,
        height: Math.max((emrWindow.height ?? 0) - 80, 520),
        left: (emrWindow.left ?? 0) + Math.max((emrWindow.width ?? 0) - width - 20, 0),
        top: (emrWindow.top ?? 0) + 40,
        focused: false
      });
      this.pairs.set(emrWindowId, assistantWindow.id);
      this.assistants.set(assistantWindow.id, emrWindowId);
      this.metadata.set(emrWindowId, info || {});
      this.broadcastStatus();
      return assistantWindow.id;
    } catch (error) {
      console.warn('[WindowPair] failed to create assistant window', error);
      return null;
    }
  }

  async teardownPair(emrWindowId) {
    const assistantId = this.pairs.get(emrWindowId);
    this.pairs.delete(emrWindowId);
    this.metadata.delete(emrWindowId);
    if (assistantId) {
      this.assistants.delete(assistantId);
      try { await chrome.windows.remove(assistantId); } catch {}
    }
    this.broadcastStatus();
  }

  async refreshPairs() {
    try {
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
      
      // First, inject dock on all valid web pages
      for (const win of windows) {
        const tabs = win.tabs || [];
        for (const tab of tabs) {
          if (tab.id && tab.url && 
              !tab.url.startsWith('chrome://') && 
              !tab.url.startsWith('chrome-extension://') && 
              !tab.url.startsWith('edge://') && 
              !tab.url.startsWith('about:')) {
            await this.injectDock(tab.id);
          }
        }
      }
      
      if (!this.enabled) {
        await this.disableAll();
        return;
      }
      
      const seen = new Set();
      for (const win of windows) {
        const tabs = win.tabs || [];
        const activeTab = tabs.find((t) => t.active) || tabs[0];
        const info = this.analyzeTab(activeTab);
        if (info) {
          seen.add(win.id);
          this.metadata.set(win.id, info);
          if (!this.pairs.has(win.id)) {
            await this.createMagnetizedAssistant(win.id, info);
          }
        }
      }
      for (const emrId of Array.from(this.pairs.keys())) {
        if (!seen.has(emrId)) {
          await this.teardownPair(emrId);
        }
      }
      this.broadcastStatus();
    } catch (error) {
      console.warn('[WindowPair] refresh error', error);
    }
  }

  async disableAll() {
    const ids = Array.from(this.pairs.keys());
    await Promise.all(ids.map((id) => this.teardownPair(id).catch(() => {})));
    this.pairs.clear();
    this.assistants.clear();
    this.metadata.clear();
    this.broadcastStatus();
  }

  async setEnabled(next) {
    const desired = !!next;
    if (desired === this.enabled) return this.enabled;
    this.enabled = desired;
    await chrome.storage.local.set({ [STORAGE_KEY_ENABLED]: desired });
    if (desired) {
      await this.refreshPairs();
    } else {
      await this.disableAll();
    }
    this.broadcastStatus();
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  async getState() {
    return {
      enabled: this.enabled,
      pairs: Array.from(this.metadata.entries()).map(([emrWindowId, meta]) => ({
        emrWindowId,
        assistantWindowId: this.pairs.get(emrWindowId) || null,
        ...meta
      }))
    };
  }

  broadcastStatus() {
    const payload = {
      type: 'WINDOW_PAIR_STATUS_EVENT',
      enabled: this.enabled,
      pairs: Array.from(this.metadata.entries()).map(([emrWindowId, meta]) => ({
        emrWindowId,
        assistantWindowId: this.pairs.get(emrWindowId) || null,
        ...meta
      }))
    };
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  async injectDock(tabId) {
    if (!tabId) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (error) {
      // Ignore permissions errors; dock will appear once host is allowed.
    }
  }
}

// Initialize on extension load and expose globally
globalThis.windowManager = new WindowPairManager();
