import React, { useEffect, useState } from 'react';

interface WindowInfo {
  windowId: number;
  tabTitle: string;
  tabUrl: string;
  focused: boolean;
}

export function WindowIndicator() {
  const [activeWindow, setActiveWindow] = useState<WindowInfo | null>(null);
  const [allWindows, setAllWindows] = useState<WindowInfo[]>([]);

  useEffect(() => {
    // Get current active tab/window
    const updateActiveWindow = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.windowId) {
          setActiveWindow({
            windowId: tab.windowId,
            tabTitle: tab.title || 'Untitled',
            tabUrl: tab.url || '',
            focused: true
          });
        }
      } catch (error) {
        console.error('Error getting active window:', error);
      }
    };

    // Listen for tab/window changes
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      updateActiveWindow();
    };

    const handleWindowFocusChanged = (windowId: number) => {
      updateActiveWindow();
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);
    
    // Initial load
    updateActiveWindow();

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.windows.onFocusChanged.removeListener(handleWindowFocusChanged);
    };
  }, []);

  const isEMR = activeWindow?.tabUrl && (
    activeWindow.tabUrl.includes('epic.com') ||
    activeWindow.tabUrl.includes('ehr-test.html') ||
    activeWindow.tabUrl.includes('athena') ||
    activeWindow.tabUrl.includes('cerner')
  );

  return (
    <div className="window-indicator">
      <div className="window-status">
        <div className="status-dot" data-connected={!!activeWindow} />
        <span className="status-text">
          {activeWindow ? (
            <>
              Controlling: <strong>{activeWindow.tabTitle.slice(0, 30)}...</strong>
              {isEMR && <span className="emr-badge">EMR</span>}
            </>
          ) : (
            'No active window'
          )}
        </span>
      </div>
      
      <style jsx>{`
        .window-indicator {
          background: rgba(0, 0, 0, 0.05);
          padding: 8px 12px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 12px;
        }
        
        .window-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #dc2626;
        }
        
        .status-dot[data-connected="true"] {
          background: #16a34a;
        }
        
        .emr-badge {
          background: #3b82f6;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          margin-left: 8px;
        }
      `}</style>
    </div>
  );
}