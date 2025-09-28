// Window tracking to help users find their sidepanel
// Shows which window the sidepanel is controlling

let activeSidepanelWindowId = null;
let lastActiveTabId = null;

// Track which window has the sidepanel open
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  
  // Check if this window has our sidepanel
  try {
    const window = await chrome.windows.get(windowId, { populate: true });
    const sidepanelTab = window.tabs?.find(tab => 
      tab.url?.includes('sidepanel.html')
    );
    
    if (sidepanelTab) {
      activeSidepanelWindowId = windowId;
    }
  } catch (e) {
    console.log('Window tracking error:', e);
  }
});

// When user clicks extension icon, bring them to the window with sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  // If sidepanel exists in another window, focus that window
  if (activeSidepanelWindowId && tab.windowId !== activeSidepanelWindowId) {
    try {
      await chrome.windows.update(activeSidepanelWindowId, { focused: true });
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'AssistMD',
        message: 'Switched to window with active sidepanel'
      });
      return;
    } catch (e) {
      // Window no longer exists
      activeSidepanelWindowId = null;
    }
  }
  
  // Otherwise, open sidepanel normally
  // ... existing sidepanel opening code ...
});