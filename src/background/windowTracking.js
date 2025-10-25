// Window tracking helper to keep a reference to the host window showing the side panel

class WindowTracker {
  constructor() {
    this.sidepanelWindowId = null;
    this.lastKnown = null; // { windowId, tabId, title, url }
    this.setupListeners().catch(() => {});
  }

  async setupListeners() {
    // Check if we have tabs permission first
    try {
      const hasPermission = await chrome.permissions.contains({ permissions: ['tabs'] });
      if (!hasPermission) {
        console.warn('WindowTracker: tabs permission not granted yet');
        // Listen for permission changes
        chrome.permissions.onAdded?.addListener((permissions) => {
          if (permissions.permissions?.includes('tabs')) {
            this.setupListeners(); // Re-setup when permission granted
          }
        });
        return;
      }
    } catch (e) {
      console.warn('WindowTracker: Failed to check tabs permission:', e);
    }

    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      try {
        const win = await chrome.windows.get(windowId, { populate: true });
        const sidepanelTab = win.tabs?.find((tab) => tab.url?.includes('sidepanel.html'));
        if (sidepanelTab) {
          this.sidepanelWindowId = windowId;
          this.broadcast();
          return;
        }
      } catch {}
    });

    if (chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab?.url && !tab.url.startsWith('chrome-extension://')) {
            this.lastKnown = {
              windowId,
              tabId,
              title: tab.title || '',
              url: tab.url
            };
            this.broadcast();
          }
        } catch {}
      });
    }

    if (chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!tab || tabId !== this.lastKnown?.tabId) return;
      if (changeInfo.title) {
        this.lastKnown = { ...this.lastKnown, title: changeInfo.title };
        this.broadcast();
      }
      if (changeInfo.url) {
        this.lastKnown = { ...this.lastKnown, url: changeInfo.url };
        this.broadcast();
      }
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      if (this.lastKnown?.tabId === tabId) {
        this.lastKnown = null;
        this.broadcast();
      }
      if (removeInfo?.isWindowClosing && this.sidepanelWindowId === removeInfo.windowId) {
        this.sidepanelWindowId = null;
        this.broadcast();
      }
    });
  }

  recordSidepanelOpen(windowId) {
    this.sidepanelWindowId = windowId;
    this.broadcast();
  }

  recordSidepanelPopup(windowId) {
    this.sidepanelWindowId = windowId;
    this.broadcast();
  }

  async focusExisting(currentWindowId) {
    if (!this.sidepanelWindowId || this.sidepanelWindowId === currentWindowId) {
      return false;
    }
    try {
      await chrome.windows.update(this.sidepanelWindowId, { focused: true });
      return true;
    } catch {
      this.sidepanelWindowId = null;
      this.broadcast();
      return false;
    }
  }

  getState() {
    return {
      sidepanelWindowId: this.sidepanelWindowId,
      lastKnown: this.lastKnown
    };
  }

  broadcast() {
    chrome.runtime.sendMessage({
      type: 'WINDOW_TRACK_STATUS_EVENT',
      sidepanelWindowId: this.sidepanelWindowId,
      lastKnown: this.lastKnown
    }).catch(() => {});
  }
}

globalThis.windowTracker = new WindowTracker();
