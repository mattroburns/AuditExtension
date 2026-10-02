// @ts-nocheck

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

// Remove X-Frame-Options, CSP (frame-ancestors), and isolation headers on sub_frames to allow live mobile device simulation
async function setupDeclarativeNetRequestRules() {
  if (chrome.declarativeNetRequest && typeof chrome.declarativeNetRequest.updateDynamicRules === 'function') {
    try {
      const RULE_ID = 2001;
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
          {
            id: RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              responseHeaders: [
                { header: 'x-frame-options', operation: 'remove' },
                { header: 'content-security-policy', operation: 'remove' },
                { header: 'content-security-policy-report-only', operation: 'remove' },
                { header: 'cross-origin-embedder-policy', operation: 'remove' },
                { header: 'cross-origin-opener-policy', operation: 'remove' },
                { header: 'cross-origin-resource-policy', operation: 'remove' },
              ],
            },
            condition: {
              resourceTypes: ['sub_frame'],
            },
          },
        ],
      });
      console.log('[AuditForge] Sub_frame framing unblock rules registered (CSP & X-Frame-Options removed).');
    } catch (err) {
      console.warn('[AuditForge] Could not configure framing unblock rules:', err);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AuditForge Extension] Extension installed and ready.');
  setupSidePanel();
  setupDeclarativeNetRequestRules();
});

// Also initialize on worker startup
setupSidePanel();
setupDeclarativeNetRequestRules();

// Fallback action click handler to open side panel directly if needed
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('[AuditForge] Could not open side panel directly:', err);
    }
  }
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

  // Open a dedicated browser popup window at exact mobile device viewport dimensions
  if (message.action === 'OPEN_DEVICE_WINDOW') {
    const { url, width, height } = message;
    (async () => {
      try {
        if (chrome.windows && typeof chrome.windows.create === 'function') {
          const win = await chrome.windows.create({
            url: url || undefined,
            width: Math.min(width || 393, 1920),
            height: Math.min(height || 852, 1080),
            type: 'popup',
            focused: true,
          });
          sendResponse({ success: true, windowId: win.id });
        } else {
          sendResponse({ success: false, error: 'chrome.windows API not available' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Resize current browser window to active device dimensions
  if (message.action === 'RESIZE_WINDOW_TO_DEVICE') {
    const { width, height } = message;
    (async () => {
      try {
        if (chrome.windows && typeof chrome.windows.update === 'function') {
          const currentWindow = await chrome.windows.getCurrent();
          if (currentWindow?.id) {
            await chrome.windows.update(currentWindow.id, {
              width: Math.min(width || 393, 1920),
              height: Math.min(height || 852, 1080),
              state: 'normal',
            });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active window found' });
          }
        } else {
          sendResponse({ success: false, error: 'chrome.windows API not available' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
