// Window Pairing Manager for AssistMD
// Keeps the assistant window "magnetized" to the EMR window

class WindowPairManager {
  constructor() {
    this.pairs = new Map(); // emrWindowId -> assistantWindowId
    this.setupListeners();
  }

  async createMagnetizedAssistant(emrWindowId) {
    // Get EMR window dimensions
    const emrWindow = await chrome.windows.get(emrWindowId);
    
    // Position assistant to the right of EMR window
    const assistantWidth = 400;
    const assistantWindow = await chrome.windows.create({
      url: chrome.runtime.getURL("sidepanel.html?mode=popup"),
      type: "popup", // No toolbar/address bar
      width: assistantWidth,
      height: emrWindow.height - 100, // Slightly shorter
      left: emrWindow.left + emrWindow.width - 50, // Slight overlap
      top: emrWindow.top + 50,
      focused: false // Don't steal focus from EMR
    });
    
    this.pairs.set(emrWindowId, assistantWindow.id);
    
    // Store pairing in storage for persistence
    await chrome.storage.local.set({
      [`window_pair_${emrWindowId}`]: assistantWindow.id
    });
    
    return assistantWindow.id;
  }

  setupListeners() {
    // When EMR window moves, move assistant with it
    chrome.windows.onBoundsChanged.addListener(async (windowId) => {
      if (this.pairs.has(windowId)) {
        const emrWindow = await chrome.windows.get(windowId);
        const assistantId = this.pairs.get(windowId);
        
        // Update assistant position to follow EMR
        chrome.windows.update(assistantId, {
          left: emrWindow.left + emrWindow.width - 50,
          top: emrWindow.top + 50,
          height: emrWindow.height - 100
        });
      }
    });

    // When EMR window closes, close assistant
    chrome.windows.onRemoved.addListener((windowId) => {
      if (this.pairs.has(windowId)) {
        const assistantId = this.pairs.get(windowId);
        chrome.windows.remove(assistantId);
        this.pairs.delete(windowId);
        chrome.storage.local.remove([`window_pair_${windowId}`]);
      }
    });

    // When switching between EMR windows, bring assistant along
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE && this.pairs.has(windowId)) {
        const assistantId = this.pairs.get(windowId);
        // Bring assistant window to front with EMR
        chrome.windows.update(assistantId, { focused: true });
        // Then refocus EMR
        setTimeout(() => {
          chrome.windows.update(windowId, { focused: true });
        }, 100);
      }
    });
  }

  // Check if current tab is EMR and needs assistant
  async checkForEMR(tab) {
    const emrPatterns = [
      'epic.com',
      'cerner.com', 
      'athenahealth.com',
      'ehr-test.html',
      // Add more EMR patterns
    ];
    
    const isEMR = emrPatterns.some(pattern => 
      tab.url && tab.url.includes(pattern)
    );
    
    if (isEMR && !this.pairs.has(tab.windowId)) {
      // Auto-open assistant for EMR windows
      await this.createMagnetizedAssistant(tab.windowId);
    }
  }
}

// Initialize on extension load
const windowManager = new WindowPairManager();

// Auto-detect EMR tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    windowManager.checkForEMR(tab);
  }
});

// Export for use in background.js
globalThis.windowManager = windowManager;