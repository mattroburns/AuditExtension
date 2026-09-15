// @ts-check

/**
 * WCAG 2.2 Accessibility Compliance Auditor - Background Service Worker
 * Manages tab navigation, tab event synchronization, and message dispatch.
 */

// Configure side panel to open on action click by default
async function setupSidePanel() {
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[AuditForge] Side panel configured to open on action click.');
    } catch (err) {
      console.warn('[AuditForge] Failed to set side panel behavior:', err);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AuditForge Extension] Extension installed and ready.');
  setupSidePanel();
});

// Also initialize on worker startup
setupSidePanel();

// Fallback action click handler if openPanelOnActionClick needs direct trigger
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (err) {
      console.warn('[AuditForge] Could not open side panel directly:', err);
    }
  }

  // Fallback: Open persistent popup window if sidePanel API unavailable
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html?mode=window'),
    type: 'popup',
    width: 480,
    height: 750,
    focused: true,
  });
});

// Handle requests from popup to navigate tabs and wait for page completion
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'NAVIGATE_AND_WAIT') {
    const { tabId, url } = message;

    (async () => {
      try {
        await chrome.tabs.update(tabId, { url });

        // Wait for page to finish loading
        const onUpdatedListener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            sendResponse({ success: true });
          }
        };

        chrome.tabs.onUpdated.addListener(onUpdatedListener);

        // Fallback safety timeout (20s)
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);
          sendResponse({ success: true, timedOut: true });
        }, 20000);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open for async response
  }
});
