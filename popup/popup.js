// @ts-check

/**
 * WCAG 2.2 Compliance Auditor - Popup Controller
 * Manages URL input, active tab injection, WCAG 2.2 audit orchestration,
 * issues table rendering, and PDF report triggers.
 */

let currentAudit = null;
let currentFilter = 'all';
let currentTabId = null;

// Screen Reader VoiceOver Speech Engine State
let currentPersona = 'voiceover'; // 'voiceover' | 'nvda' | 'narrator'
let currentRotor = 'all'; // 'all' | 'heading' | 'landmark' | 'link' | 'control'
let isSpeechPlaying = false;
let isSpeechPaused = false;
let speechStepIndex = -1;
let speechRate = 1.25;
/** @type {SpeechSynthesisVoice|null} */
let selectedVoice = null;
let earconsEnabled = true;
/** @type {SpeechSynthesisVoice[]} */
let availableVoices = [];
let isPageSimActive = false;
/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {any} */
let speechPlaybackTimer = null;
let currentUtteranceId = 0;

document.addEventListener('DOMContentLoaded', async () => {
  setupModeControls();
  setupEventListeners();
  populateVoiceSelect();
  await restoreSavedAuditOrLoadUrl();
});

window.addEventListener('beforeunload', () => {
  stopSequentialSpeech();
});

/**
 * Initializes floating window and side panel dock controls
 */
function setupModeControls() {
  const isWindowMode = window.location.search.includes('mode=window');
  const btnPopout = document.getElementById('btn-popout');
  const btnSidepanel = document.getElementById('btn-sidepanel');

  if (isWindowMode) {
    document.title = 'AuditForge - WCAG 2.2 Auditor (Floating)';
    btnPopout?.classList.add('hidden');
    btnSidepanel?.classList.remove('hidden');
  } else {
    btnPopout?.classList.remove('hidden');
    btnSidepanel?.classList.add('hidden');
  }

  btnPopout?.addEventListener('click', async () => {
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup/popup.html?mode=window'),
        type: 'popup',
        width: 520,
        height: 780,
        focused: true,
      });
      if (!isWindowMode) {
        window.close();
      }
    } catch (err) {
      console.warn('[Auditor] Failed to open popout window:', err);
    }
  });

  btnSidepanel?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      }
    } catch (err) {
      console.warn('[Auditor] Failed to dock to side panel:', err);
    }
  });

  // Keep current active tab and URL in sync when user switches tabs or navigates
  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        const tabUrl = tab?.url || tab?.pendingUrl;
        const inputUrl = document.getElementById('input-url');

        if (tab && tabUrl && isValidWebUrl(tabUrl)) {
          currentTabId = tab.id;
          if (inputUrl && document.activeElement !== inputUrl) {
            // @ts-ignore
            inputUrl.value = tabUrl;
          }

          // If an audit was loaded, show results only if it matches this tab's URL
          if (currentAudit) {
            if (urlsMatch(tabUrl, currentAudit.url)) {
              document.getElementById('results-view')?.classList.remove('hidden');
            } else {
              document.getElementById('results-view')?.classList.add('hidden');
            }
          }
        } else if (tab && (!tabUrl || !isValidWebUrl(tabUrl))) {
          if (inputUrl && document.activeElement !== inputUrl) {
            // @ts-ignore
            inputUrl.value = '';
          }
          document.getElementById('results-view')?.classList.add('hidden');
        }
      } catch (_) {}
    });
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo, tab) => {
      const tabUrl = changeInfo.url || (changeInfo.status === 'complete' ? tab?.url : null);
      if (updatedTabId === currentTabId && tabUrl) {
        const inputUrl = document.getElementById('input-url');
        if (isValidWebUrl(tabUrl)) {
          if (inputUrl && document.activeElement !== inputUrl) {
            // @ts-ignore
            inputUrl.value = tabUrl;
          }
          if (currentAudit) {
            if (urlsMatch(tabUrl, currentAudit.url)) {
              document.getElementById('results-view')?.classList.remove('hidden');
            } else {
              document.getElementById('results-view')?.classList.add('hidden');
            }
          }
        } else {
          if (inputUrl && document.activeElement !== inputUrl) {
            // @ts-ignore
            inputUrl.value = '';
          }
          document.getElementById('results-view')?.classList.add('hidden');
        }
      }
    });
  }
}

/**
 * Helper to check whether a URL is a valid web address that can be audited.
 * @param {string} [url]
 * @returns {boolean}
 */
function isValidWebUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
}

/**
 * Normalizes and compares two URLs to determine if they refer to the same web page.
 * @param {string} [urlA]
 * @param {string} [urlB]
 * @returns {boolean}
 */
function urlsMatch(urlA, urlB) {
  if (!urlA || !urlB) return false;
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    const pathA = (a.origin + a.pathname).replace(/\/$/, '').toLowerCase();
    const pathB = (b.origin + b.pathname).replace(/\/$/, '').toLowerCase();
    return pathA === pathB && a.search === b.search;
  } catch (_) {
    return urlA.trim().replace(/\/$/, '').toLowerCase() === urlB.trim().replace(/\/$/, '').toLowerCase();
  }
}

/**
 * Retrieves the user's currently active web page tab across sidepanel, popup, and window modes.
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
async function getActiveWebTab() {
  try {
    const isWindowMode = window.location.search.includes('mode=window');

    if (isWindowMode) {
      // In standalone window mode, prioritize active tab in the last focused normal browser window
      const normalTabs = await chrome.tabs.query({ active: true, windowType: 'normal' });
      const activeNormalTab = normalTabs.find(t => t.lastFocusedWindow) || normalTabs[0];
      if (activeNormalTab && isValidWebUrl(activeNormalTab.url || activeNormalTab.pendingUrl)) {
        return activeNormalTab;
      }
      const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastFocusedTab && isValidWebUrl(lastFocusedTab.url || lastFocusedTab.pendingUrl)) {
        return lastFocusedTab;
      }
    } else {
      // In side panel or popup mode, currentWindow is the host browser window
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab && isValidWebUrl(currentTab.url || currentTab.pendingUrl)) {
        return currentTab;
      }
      const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastFocusedTab && isValidWebUrl(lastFocusedTab.url || lastFocusedTab.pendingUrl)) {
        return lastFocusedTab;
      }
      const normalTabs = await chrome.tabs.query({ active: true, windowType: 'normal' });
      const activeNormalTab = normalTabs.find(t => t.lastFocusedWindow) || normalTabs[0];
      if (activeNormalTab && isValidWebUrl(activeNormalTab.url || activeNormalTab.pendingUrl)) {
        return activeNormalTab;
      }
    }
  } catch (err) {
    console.warn('[Auditor] Could not determine active tab:', err);
  }
  return null;
}

/**
 * Restores previous audit from session storage (if still on the same page)
 * or autofills the URL bar with the currently active page URL.
 */
async function restoreSavedAuditOrLoadUrl() {
  // Always retrieve the current active tab first
  const activeTab = await getActiveWebTab();
  const inputUrl = document.getElementById('input-url');
  let activeUrl = '';

  if (activeTab) {
    currentTabId = activeTab.id;
    const rawUrl = activeTab.url || activeTab.pendingUrl;
    if (rawUrl && isValidWebUrl(rawUrl)) {
      activeUrl = rawUrl;
    }
  }

  // Autofill the bar with the URL of the page you are currently on
  if (inputUrl) {
    // @ts-ignore
    inputUrl.value = activeUrl || '';
  }

  // If there's a saved audit, check if it matches the current page URL
  try {
    const storageArea = chrome.storage?.session || chrome.storage?.local;
    if (storageArea) {
      const saved = await storageArea.get(['currentAudit', 'currentFilter', 'currentTabId', 'lastUrl']);
      const savedAuditUrl = saved?.currentAudit?.url || saved?.lastUrl;

      // Only restore previous audit results if the user is still on that same audited page
      if (saved && saved.currentAudit && activeUrl && savedAuditUrl && urlsMatch(activeUrl, savedAuditUrl)) {
        currentAudit = saved.currentAudit;
        currentFilter = saved.currentFilter || 'all';
        if (saved.currentTabId) currentTabId = saved.currentTabId;

        renderScorecard(currentAudit);
        renderIssuesList();

        document.getElementById('results-view')?.classList.remove('hidden');
        document.getElementById('scan-progress')?.classList.add('hidden');
        document.getElementById('error-view')?.classList.add('hidden');
        return;
      } else {
        // Different page or new tab: clear stale audit view so fresh page is ready to audit
        currentAudit = null;
        document.getElementById('results-view')?.classList.add('hidden');
        document.getElementById('scan-progress')?.classList.add('hidden');
        document.getElementById('error-view')?.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('[Auditor] Could not restore saved audit:', err);
  }
}

/**
 * Pre-populates URL input with current active tab URL
 */
async function loadActiveTabUrl() {
  const activeTab = await getActiveWebTab();
  if (activeTab) {
    currentTabId = activeTab.id;
    const rawUrl = activeTab.url || activeTab.pendingUrl;
    if (rawUrl && isValidWebUrl(rawUrl)) {
      const inputUrl = document.getElementById('input-url');
      if (inputUrl) {
        // @ts-ignore
        inputUrl.value = rawUrl;
      }
    }
  }
}

function setupEventListeners() {
  const form = document.getElementById('audit-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    // @ts-ignore
    const url = document.getElementById('input-url')?.value.trim();
    if (url) runAudit(url);
  });

  // Severity Filter Tabs
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderIssuesList();
    });
  });

  // Screen Reader Drawer Toggle
  const srHeader = document.getElementById('sr-header-toggle');
  const srToggleBtn = document.getElementById('sr-toggle-btn');
  const srBody = document.getElementById('sr-panel-body');
  
  const toggleSrPanel = () => {
    if (!srBody) return;
    const isHidden = srBody.classList.toggle('hidden');
    if (srToggleBtn) {
      srToggleBtn.textContent = isHidden ? '▼ View Readout' : '▲ Hide Readout';
    }
  };

  srHeader?.addEventListener('click', (e) => {
    toggleSrPanel();
  });
  srToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSrPanel();
  });

  // Export PDF Button
  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    if (!currentAudit) return;
    try {
      const btn = document.getElementById('btn-export-pdf');
      if (btn) btn.textContent = 'Generating PDF...';
      // @ts-ignore
      await window.generateWcagPdfReport(currentAudit);
      if (btn) {
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Export PDF Report</span>';
      }
    } catch (err) {
      console.error('PDF Generation failed:', err);
      alert(`Failed to generate PDF: ${err.message}`);
      const btn = document.getElementById('btn-export-pdf');
      if (btn) {
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Export PDF Report</span>';
      }
    }
  });

  // Screen Reader Persona Tabs
  document.querySelectorAll('.sr-persona-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopSequentialSpeech();
      document.querySelectorAll('.sr-persona-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPersona = btn.getAttribute('data-persona') || 'voiceover';
      const personaNames = { voiceover: 'Apple VoiceOver', nvda: 'NVDA / JAWS', narrator: 'Windows Narrator' };
      updateCaptionDisplay(`Persona switched to ${personaNames[currentPersona] || currentPersona}.`, false);
      renderSpeechTimeline(currentAudit?.speechSequence || []);
    });
  });

  // Rotor Navigation Tabs
  document.querySelectorAll('.sr-rotor-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopSequentialSpeech();
      document.querySelectorAll('.sr-rotor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRotor = btn.getAttribute('data-rotor') || 'all';
      renderSpeechTimeline(currentAudit?.speechSequence || []);
    });
  });

  // Speech Audio Playback Buttons
  document.getElementById('sr-btn-play')?.addEventListener('click', () => {
    if (isSpeechPlaying && !isSpeechPaused) {
      pauseSequentialSpeech();
    } else if (isSpeechPlaying && isSpeechPaused) {
      resumeSequentialSpeech();
    } else {
      const filtered = getFilteredSpeechSequence();
      const startIdx = (speechStepIndex >= 0 && speechStepIndex < filtered.length) ? speechStepIndex : 0;
      startSequentialSpeech(startIdx);
    }
  });

  document.getElementById('sr-btn-stop')?.addEventListener('click', () => {
    stopSequentialSpeech();
  });

  document.getElementById('sr-btn-prev')?.addEventListener('click', () => {
    stepSequentialSpeech(-1);
  });

  document.getElementById('sr-btn-next')?.addEventListener('click', () => {
    stepSequentialSpeech(1);
  });

  // Speech Rate Select
  document.getElementById('sr-rate-select')?.addEventListener('change', (e) => {
    // @ts-ignore
    speechRate = parseFloat(e.target?.value) || 1.25;
  });

  // Voice Select
  document.getElementById('sr-voice-select')?.addEventListener('change', (e) => {
    // @ts-ignore
    const voiceName = e.target?.value;
    selectedVoice = availableVoices.find(v => v.name === voiceName) || null;
  });

  // Earcons Toggle
  const earconBtn = document.getElementById('sr-btn-earcons');
  earconBtn?.addEventListener('click', () => {
    earconsEnabled = !earconsEnabled;
    earconBtn.classList.toggle('active', earconsEnabled);
    const bellSvg = '<svg class="earcon-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
    const bellOffSvg = '<svg class="earcon-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M2 2l20 20"/><path d="M8.66 8.66A6 6 0 0 1 18 8c0 7 3 9 3 9H7.34"/><path d="M3 17a2.98 2.98 0 0 0 .5-1.5"/></svg>';
    earconBtn.innerHTML = `${earconsEnabled ? bellSvg : bellOffSvg} <span class="earcon-label">Audio Cues</span>`;
  });

  // On-Page Simulator Toggle Button
  document.getElementById('btn-launch-page-sim')?.addEventListener('click', () => {
    toggleOnPageSimulator();
  });

  // Tab Order Drawer Toggle
  const tabHeader = document.getElementById('tab-order-header-toggle');
  const tabToggleBtn = document.getElementById('tab-order-toggle-btn');
  const tabBody = document.getElementById('tab-order-panel-body');

  const toggleTabPanel = () => {
    if (!tabBody) return;
    const isHidden = tabBody.classList.toggle('hidden');
    if (tabToggleBtn) {
      tabToggleBtn.textContent = isHidden ? '▼ View Sequence' : '▲ Hide Sequence';
    }
  };

  tabHeader?.addEventListener('click', () => {
    toggleTabPanel();
  });
  tabToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTabPanel();
  });

  // Toggle Tab-Trail Overlay on Web Page
  document.getElementById('btn-toggle-tab-trail')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-toggle-tab-trail');
    const label = document.getElementById('tab-trail-btn-label');
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (!targetTab?.id) return;

      const res = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          // @ts-ignore
          if (typeof window.__auditforgeToggleTabTrail === 'function') {
            return window.__auditforgeToggleTabTrail();
          }
          return { active: false };
        }
      });

      const trailResult = res[0]?.result;
      if (trailResult && trailResult.active) {
        btn?.classList.add('active');
        if (label) label.textContent = '✕ Hide Tab-Trail Overlay';
      } else {
        btn?.classList.remove('active');
        if (label) label.textContent = '🗺️ Show Tab-Trail Overlay';
      }
    } catch (err) {
      console.warn('Could not toggle tab trail on page:', err);
    }
  });

  // Color Blindness Lens Buttons
  document.querySelectorAll('.cvd-pill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.cvd-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cvdType = btn.getAttribute('data-cvd') || 'none';

      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (!targetTab?.id) return;

        // Ensure audit runner is injected before setting filter
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content/audit-runner.js'],
        });

        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (type) => {
            // @ts-ignore
            if (typeof window.__auditforgeSetColorFilter === 'function') {
              return window.__auditforgeSetColorFilter(type);
            }
          },
          args: [cvdType],
        });
      } catch (err) {
        console.warn('Could not apply color blindness filter:', err);
      }
    });
  });
}

/**
 * Executes WCAG 2.2 audit against the target URL
 * @param {string} targetUrl
 */
async function runAudit(targetUrl) {
  const progressSec = document.getElementById('scan-progress');
  const resultsSec = document.getElementById('results-view');
  const errorSec = document.getElementById('error-view');
  const btnGo = document.getElementById('btn-go');

  progressSec?.classList.remove('hidden');
  resultsSec?.classList.add('hidden');
  errorSec?.classList.add('hidden');
  if (btnGo) {
    // @ts-ignore
    btnGo.disabled = true;
    btnGo.innerHTML = '<span class="btn-icon">⏳</span> Auditing...';
  }

  try {
    let tab = await getActiveWebTab();
    if (!tab || !tab.id) {
      const [curTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = curTab;
    }
    if (!tab || !tab.id) {
      throw new Error('No active browser tab found.');
    }
    currentTabId = tab.id;

    // Normalize URL
    let validUrl = targetUrl;
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = `https://${validUrl}`;
    }

    // If user specified a different URL, navigate current tab to it
    if (tab.url !== validUrl && !tab.url.startsWith(validUrl)) {
      updateProgress('Navigating to Target URL...', 'Loading web page before executing audit...');
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'NAVIGATE_AND_WAIT', tabId: tab.id, url: validUrl }, (response) => {
          if (response && response.success) resolve(null);
          else reject(new Error(response?.error || 'Failed to navigate to target URL.'));
        });
      });
      // Refresh tab reference
      try {
        tab = await chrome.tabs.get(tab.id);
      } catch (_) {
        tab = await getActiveWebTab();
      }
      if (tab?.id) currentTabId = tab.id;
    }

    // Check if target page is accessible (cannot audit chrome:// or web store pages)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('https://chrome.google.com/webstore')) {
      throw new Error('Browser internal pages and extensions store cannot be scripted due to Chrome security restrictions.');
    }

    updateProgress('Injecting WCAG 2.2 Ruleset...', 'Loading axe-core and evaluation engine into DOM...');

    // Inject axe-core and audit-runner into page DOM
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/axe.min.js', 'content/audit-runner.js'],
    });

    updateProgress('Auditing Page Against WCAG 2.2 AA...', 'Evaluating DOM, :hover contrast, and ARIA semantic accuracy...');

    // Execute audit in the target page
    const executionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        // @ts-ignore
        if (typeof window.__runWcagAudit === 'function') {
          // @ts-ignore
          return await window.__runWcagAudit();
        }
        throw new Error('Auditor runner was not initialized properly.');
      },
    });

    const auditData = executionResults[0]?.result;
    if (!auditData || !auditData.success) {
      throw new Error('Audit run did not return results.');
    }

    currentAudit = auditData;

    // Persist to session storage so popup re-opening retains audit results
    try {
      const storageArea = chrome.storage?.session || chrome.storage?.local;
      if (storageArea) {
        await storageArea.set({
          currentAudit,
          currentFilter,
          currentTabId,
          lastUrl: validUrl
        });
      }
    } catch (_) {}

    // Render results
    renderScorecard(auditData);
    renderIssuesList();

    progressSec?.classList.add('hidden');
    resultsSec?.classList.remove('hidden');
  } catch (err) {
    console.error('[Auditor Error]:', err);
    progressSec?.classList.add('hidden');
    errorSec?.classList.remove('hidden');
    const msg = document.getElementById('error-message');
    if (msg) msg.textContent = err.message || 'An unexpected error occurred.';
  } finally {
    if (btnGo) {
      // @ts-ignore
      btnGo.disabled = false;
      btnGo.innerHTML = '<span class="btn-icon">⚡</span> Go';
    }
  }
}

function updateProgress(title, sub) {
  const pTitle = document.getElementById('progress-title');
  const pSub = document.getElementById('progress-sub');
  if (pTitle) pTitle.textContent = title;
  if (pSub) pSub.textContent = sub;
}

/**
 * Renders the score card, metrics, and summary
 * @param {Object} audit
 */
function renderScorecard(audit) {
  const scoreVal = document.getElementById('score-value');
  const circle = document.getElementById('score-circle');
  const grade = document.getElementById('result-grade');
  const risk = document.getElementById('result-risk');
  const riskPill = document.getElementById('result-risk-pill');
  const duration = document.getElementById('result-duration');
  const title = document.getElementById('result-title');
  const urlLink = document.getElementById('result-url');
  const summary = document.getElementById('result-summary');

  if (scoreVal) scoreVal.textContent = String(audit.score);
  if (grade) grade.textContent = audit.grade;
  if (risk) risk.textContent = `${audit.riskLevel.toUpperCase()} RISK`;
  if (duration) duration.textContent = `${audit.scanDurationSeconds}s`;
  if (title) title.textContent = audit.pageTitle || 'Target Page';
  if (urlLink) {
    // @ts-ignore
    urlLink.href = audit.url;
    urlLink.textContent = audit.url;
  }
  if (summary) summary.textContent = audit.summary;

  // Score circle color
  const riskClass = `risk-${audit.riskLevel.toLowerCase()}`;
  if (riskPill) {
    riskPill.className = `pill risk-pill ${riskClass}`;
  }

  const borderColors = {
    Low: '#10b981',
    Moderate: '#f59e0b',
    High: '#f97316',
    Severe: '#ef4444',
  };
  if (circle) {
    circle.style.borderColor = borderColors[audit.riskLevel] || '#3b82f6';
  }

  // Screen Reader Compatibility Metrics
  const srScore = audit.screenReaderScore !== undefined ? audit.screenReaderScore : 100;
  const srScoreEl = document.getElementById('result-sr-score');
  const srBadgeEl = document.getElementById('sr-score-badge');
  const srBarriersEl = document.getElementById('sr-barrier-count');
  const srLandmarkEl = document.getElementById('sr-landmark-status');
  const srHeadingEl = document.getElementById('sr-heading-status');

  if (srScoreEl) srScoreEl.textContent = `${srScore}/100`;
  if (srBadgeEl) {
    srBadgeEl.textContent = `${srScore}/100 VoiceOver`;
    if (srScore >= 85) {
      srBadgeEl.style.color = '#34d399';
      srBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else if (srScore >= 70) {
      srBadgeEl.style.color = '#fbbf24';
      srBadgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    } else {
      srBadgeEl.style.color = '#f87171';
      srBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
  }

  const barrierCount = (audit.speechSequence || []).filter(s => s.isBarrier).length;
  if (srBarriersEl) {
    srBarriersEl.textContent = `${barrierCount} detected`;
    srBarriersEl.style.color = barrierCount === 0 ? '#34d399' : '#f87171';
  }

  const hasLandmarkIssue = (audit.violations || []).some(v => v.id === 'screen-reader-landmarks' || v.id === 'landmark-one-main');
  if (srLandmarkEl) {
    srLandmarkEl.textContent = hasLandmarkIssue ? 'Deficient / Missing' : 'Verified';
    srLandmarkEl.style.color = hasLandmarkIssue ? '#f87171' : '#34d399';
  }

  const hasHeadingIssue = (audit.violations || []).some(v => v.id === 'screen-reader-heading-order' || v.id === 'heading-order');
  if (srHeadingEl) {
    srHeadingEl.textContent = hasHeadingIssue ? 'Broken / Skipped' : 'Sequential';
    srHeadingEl.style.color = hasHeadingIssue ? '#f87171' : '#34d399';
  }

  // Update Rotor Filter Counts
  const seq = audit.speechSequence || [];
  const rAll = document.getElementById('rotor-count-all');
  const rHead = document.getElementById('rotor-count-heading');
  const rLand = document.getElementById('rotor-count-landmark');
  const rLink = document.getElementById('rotor-count-link');
  const rCtrl = document.getElementById('rotor-count-control');
  const rText = document.getElementById('rotor-count-text');

  if (rAll) rAll.textContent = String(seq.length);
  if (rHead) rHead.textContent = String(seq.filter(s => s.rotorCategory === 'heading').length);
  if (rLand) rLand.textContent = String(seq.filter(s => s.rotorCategory === 'landmark').length);
  if (rLink) rLink.textContent = String(seq.filter(s => s.rotorCategory === 'link').length);
  if (rCtrl) rCtrl.textContent = String(seq.filter(s => s.rotorCategory === 'control').length);
  if (rText) rText.textContent = String(seq.filter(s => s.rotorCategory === 'text').length);

  renderSpeechTimeline(audit.speechSequence || []);
  renderTabOrderSequence(audit.tabOrder);

  // Key Metrics
  const mCrit = document.getElementById('metric-critical');
  const mSer = document.getElementById('metric-serious');
  const mMod = document.getElementById('metric-moderate');
  const mPass = document.getElementById('metric-passed');

  if (mCrit) mCrit.textContent = String(audit.stats.criticalCount);
  if (mSer) mSer.textContent = String(audit.stats.seriousCount);
  if (mMod) mMod.textContent = String(audit.stats.moderateCount);
  if (mPass) mPass.textContent = String(audit.stats.rulesPassedCount);

  // Tab counts
  const tabAll = document.getElementById('tab-count-all');
  const tabCrit = document.getElementById('tab-count-crit');
  const tabSer = document.getElementById('tab-count-ser');
  const tabMod = document.getElementById('tab-count-mod');

  if (tabAll) tabAll.textContent = String(audit.violations.length);
  if (tabCrit) tabCrit.textContent = String(audit.violations.filter(v => v.impact === 'critical').length);
  if (tabSer) tabSer.textContent = String(audit.violations.filter(v => v.impact === 'serious').length);
  if (tabMod) tabMod.textContent = String(audit.violations.filter(v => v.impact === 'moderate').length);
}

/**
 * Retrieves the announcement string corresponding to the current screen reader persona
 * @param {Object} step
 * @param {string} [persona]
 * @returns {string}
 */
function getStepAnnouncement(step, persona = currentPersona) {
  if (!step) return '';
  if (persona === 'nvda' && step.nvdaText) return step.nvdaText;
  if (persona === 'narrator' && step.narratorText) return step.narratorText;
  return step.voiceOverText || step.spokenText || '';
}

/**
 * Filters the active audit's speech sequence by the selected rotor category
 * @returns {Array<Object>}
 */
function getFilteredSpeechSequence() {
  const seq = (currentAudit && currentAudit.speechSequence) ? currentAudit.speechSequence : [];
  if (currentRotor === 'all') return seq;
  return seq.filter(s => s.rotorCategory === currentRotor);
}

/**
 * Populates system voices into the voice selector dropdown
 */
function populateVoiceSelect() {
  const select = document.getElementById('sr-voice-select');
  if (!select || !('speechSynthesis' in window)) return;

  const loadVoices = () => {
    availableVoices = window.speechSynthesis.getVoices() || [];
    if (availableVoices.length === 0) return;

    select.innerHTML = '<option value="">Default System Voice</option>';
    const englishVoices = availableVoices.filter(v => v.lang && v.lang.startsWith('en'));
    const voicesToRender = englishVoices.length > 0 ? englishVoices : availableVoices;

    voicesToRender.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });
  };

  loadVoices();
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

/**
 * Generates synthesized earcons (auditory sound cues) using Web Audio API oscillators
 * @param {'barrier'|'link'|'landmark'|'control'} type
 */
function playEarcon(type) {
  if (!earconsEnabled) return;
  try {
    if (!audioCtx) {
      // @ts-ignore
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) audioCtx = new AudioCtxClass();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'barrier') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.16);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === 'link') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'landmark') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (_) {}
}

/**
 * Updates the live VoiceOver caption banner in the drawer
 * @param {string} text
 * @param {boolean} isSpeaking
 */
function updateCaptionDisplay(text, isSpeaking = false) {
  const captionTextEl = document.getElementById('sr-caption-text');
  const indicatorEl = document.getElementById('sr-caption-indicator');
  if (captionTextEl) {
    captionTextEl.textContent = text ? `🗣️ "${text}"` : 'Ready to speak.';
  }
  if (indicatorEl) {
    if (isSpeaking) indicatorEl.classList.remove('hidden');
    else indicatorEl.classList.add('hidden');
  }
}

/**
 * Updates Play/Pause button UI during sequential speech playback
 * @param {boolean} isPlaying
 * @param {boolean} [isPaused]
 */
function updatePlayButtonUI(isPlaying, isPaused = false) {
  const btnPlay = document.getElementById('sr-btn-play');
  const icon = document.getElementById('sr-play-icon');
  const label = document.getElementById('sr-play-label');
  const btnStop = document.getElementById('sr-btn-stop');

  if (btnStop) {
    // @ts-ignore
    btnStop.disabled = !isPlaying && !isPaused;
  }

  if (btnPlay && icon && label) {
    if (isPlaying && !isPaused) {
      btnPlay.classList.add('is-playing');
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      label.textContent = 'Pause';
    } else if (isPaused) {
      btnPlay.classList.remove('is-playing');
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      label.textContent = 'Resume';
    } else {
      btnPlay.classList.remove('is-playing');
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      label.textContent = 'Read All';
    }
  }
}

/**
 * Highlights the active step card in the popup timeline and scrolls it into view
 * @param {number} idx
 */
function highlightTimelineCard(idx) {
  const container = document.getElementById('speech-timeline');
  if (!container) return;

  container.querySelectorAll('.speech-step-card').forEach((c, i) => {
    if (i === idx) {
      c.classList.add('is-active-speaking');
      if (!c.querySelector('.sr-equalizer')) {
        const topEl = c.querySelector('.speech-step-top');
        if (topEl) {
          const eq = document.createElement('div');
          eq.className = 'sr-equalizer';
          eq.innerHTML = '<span class="sr-eq-bar"></span><span class="sr-eq-bar"></span><span class="sr-eq-bar"></span>';
          topEl.prepend(eq);
        }
      }
      c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      c.classList.remove('is-active-speaking');
      c.querySelector('.sr-equalizer')?.remove();
    }
  });
}

/**
 * Clears active speaking styling from all timeline cards
 */
function clearTimelineActiveCard() {
  const container = document.getElementById('speech-timeline');
  if (!container) return;
  container.querySelectorAll('.speech-step-card').forEach((c) => {
    c.classList.remove('is-active-speaking');
    c.querySelector('.sr-equalizer')?.remove();
  });
}

/**
 * Audibly speaks a single step using SpeechSynthesis and synchronizes webpage highlighting
 * @param {Object} step
 * @param {number} filteredIdx
 * @param {Function} [onComplete] - Callback receiving (isSuccess: boolean)
 */
function speakSingleStep(step, filteredIdx, onComplete = null) {
  if (!('speechSynthesis' in window)) {
    alert('Web Speech API is not supported in this browser.');
    if (typeof onComplete === 'function') onComplete(false);
    return;
  }

  // Clear any scheduled auto-play timer
  if (speechPlaybackTimer) {
    clearTimeout(speechPlaybackTimer);
    speechPlaybackTimer = null;
  }

  // Increment utterance generation ID to invalidate any callbacks from prior cancelled steps
  const utteranceId = ++currentUtteranceId;

  // Cancel any active speech. In Chromium, cancel() triggers onerror ('canceled') on the previous utterance.
  // Because utteranceId has changed, that aborted utterance's callbacks will be safely ignored.
  window.speechSynthesis.cancel();

  const textToSpeak = getStepAnnouncement(step);
  updateCaptionDisplay(textToSpeak, true);

  if (step.isBarrier) {
    playEarcon('barrier');
  } else if (step.type === 'Link') {
    playEarcon('link');
  } else if (step.type === 'Landmark') {
    playEarcon('landmark');
  } else {
    playEarcon('control');
  }

  highlightTimelineCard(filteredIdx);

  if (step.selector) {
    highlightElementOnPage(step.selector, {
      impact: step.isBarrier ? 'serious' : 'minor',
      help: step.isBarrier ? `Auditory Barrier (${step.type})` : `Screen Reader: ${step.type}`,
      wcagRule: step.spokenText,
      target: step.selector,
    });
  }

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.rate = speechRate;
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  let completed = false;
  const finish = (isSuccess) => {
    // If a newer utterance started or playback was stopped, silently ignore this completion
    if (utteranceId !== currentUtteranceId) return;
    if (completed) return;
    completed = true;

    updateCaptionDisplay(textToSpeak, false);
    clearTimelineActiveCard();

    if (typeof onComplete === 'function') {
      onComplete(isSuccess);
    }
  };

  utterance.onend = () => {
    finish(true);
  };

  utterance.onerror = (e) => {
    // Aborted or cancelled utterances must NOT trigger sequential step advancement
    finish(false);
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Advances to the next item during sequential auto-play
 */
function advanceAndPlayNext() {
  if (!isSpeechPlaying || isSpeechPaused) return;

  const filtered = getFilteredSpeechSequence();
  if (!filtered || filtered.length === 0) {
    stopSequentialSpeech();
    return;
  }

  speechStepIndex++;

  if (speechStepIndex >= filtered.length) {
    stopSequentialSpeech();
    return;
  }

  const currentStep = filtered[speechStepIndex];
  speakSingleStep(currentStep, speechStepIndex, (isSuccess) => {
    // Only continue if the step finished speaking naturally and auto-play is still active
    if (isSuccess && isSpeechPlaying && !isSpeechPaused) {
      if (speechStepIndex + 1 < filtered.length) {
        speechPlaybackTimer = setTimeout(advanceAndPlayNext, 450);
      } else {
        stopSequentialSpeech();
      }
    }
  });
}

/**
 * Starts sequential automated playback through the filtered speech timeline
 * @param {number} [startIndex]
 */
function startSequentialSpeech(startIndex = 0) {
  const filtered = getFilteredSpeechSequence();
  if (!filtered || filtered.length === 0) return;

  if (speechPlaybackTimer) {
    clearTimeout(speechPlaybackTimer);
    speechPlaybackTimer = null;
  }

  isSpeechPlaying = true;
  isSpeechPaused = false;
  speechStepIndex = Math.max(0, Math.min(startIndex, filtered.length - 1));

  updatePlayButtonUI(true);

  const currentStep = filtered[speechStepIndex];
  speakSingleStep(currentStep, speechStepIndex, (isSuccess) => {
    if (isSuccess && isSpeechPlaying && !isSpeechPaused) {
      if (speechStepIndex + 1 < filtered.length) {
        speechPlaybackTimer = setTimeout(advanceAndPlayNext, 450);
      } else {
        stopSequentialSpeech();
      }
    }
  });
}

/**
 * Pauses automated speech playback
 */
function pauseSequentialSpeech() {
  if (speechPlaybackTimer) {
    clearTimeout(speechPlaybackTimer);
    speechPlaybackTimer = null;
  }
  if (isSpeechPlaying && !isSpeechPaused) {
    isSpeechPaused = true;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    updatePlayButtonUI(false, true);
  }
}

/**
 * Resumes paused speech playback
 */
function resumeSequentialSpeech() {
  if (isSpeechPlaying && isSpeechPaused) {
    isSpeechPaused = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    updatePlayButtonUI(true);
  }
}

/**
 * Completely stops automated speech playback
 */
function stopSequentialSpeech() {
  if (speechPlaybackTimer) {
    clearTimeout(speechPlaybackTimer);
    speechPlaybackTimer = null;
  }
  currentUtteranceId++;

  isSpeechPlaying = false;
  isSpeechPaused = false;
  speechStepIndex = -1;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  updatePlayButtonUI(false);
  clearTimelineActiveCard();
  updateCaptionDisplay('Speech playback stopped.', false);
}

/**
 * Jumps to the previous or next step in the speech sequence
 * @param {number} direction - (+1 for Next / Fast-Forward, -1 for Previous / Rewind)
 */
function stepSequentialSpeech(direction) {
  const filtered = getFilteredSpeechSequence();
  if (!filtered || filtered.length === 0) return;

  // Clear any existing timer immediately
  if (speechPlaybackTimer) {
    clearTimeout(speechPlaybackTimer);
    speechPlaybackTimer = null;
  }

  // Calculate destination index
  let targetIndex = speechStepIndex + direction;
  if (speechStepIndex === -1 && direction > 0) {
    targetIndex = 0;
  } else if (targetIndex < 0) {
    targetIndex = 0;
  } else if (targetIndex >= filtered.length) {
    targetIndex = filtered.length - 1;
  }

  speechStepIndex = targetIndex;

  // Speak the selected step
  speakSingleStep(filtered[speechStepIndex], speechStepIndex, (isSuccess) => {
    // Only continue auto-play if "Read All" was actively running AND this step finished naturally
    if (isSuccess && isSpeechPlaying && !isSpeechPaused) {
      if (speechStepIndex + 1 < filtered.length) {
        speechPlaybackTimer = setTimeout(advanceAndPlayNext, 450);
      } else {
        stopSequentialSpeech();
      }
    }
  });
}

/**
 * Toggles the In-Page Interactive VoiceOver Simulator on the audited webpage
 */
async function toggleOnPageSimulator() {
  const btn = document.getElementById('btn-launch-page-sim');
  let [targetTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!targetTab || !targetTab.id) {
    [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!targetTab || !targetTab.id) return;

  isPageSimActive = !isPageSimActive;

  if (isPageSimActive) {
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '<span>⏹</span> Exit Simulator';
    }
    updateCaptionDisplay('On-Page Simulator active. Press Tab on the page to hear VoiceOver announcements.', true);
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      files: ['content/audit-runner.js'],
    });
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (persona) => {
        // @ts-ignore
        if (typeof window.__auditforgeStartVoiceOverSimulator === 'function') {
          // @ts-ignore
          window.__auditforgeStartVoiceOverSimulator(persona);
        }
      },
      args: [currentPersona],
    });
  } else {
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '<span>🚀</span> On-Page Simulator';
    }
    updateCaptionDisplay('On-Page Simulator exited.', false);
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => {
        // @ts-ignore
        if (typeof window.__auditforgeStopVoiceOverSimulator === 'function') {
          // @ts-ignore
          window.__auditforgeStopVoiceOverSimulator();
        }
      },
    });
  }
}

/**
 * Renders the simulated speech sequence readout into the timeline with rotor filtering
 * @param {Array<Object>} [speechSequence]
 */
function renderSpeechTimeline(speechSequence) {
  const container = document.getElementById('speech-timeline');
  if (!container) return;

  const sequence = speechSequence || (currentAudit ? currentAudit.speechSequence : []) || [];
  const filtered = currentRotor === 'all'
    ? sequence
    : sequence.filter(s => s.rotorCategory === currentRotor);

  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 11px;">
        No sequential elements found matching the "${escapeHtml(currentRotor)}" rotor filter on this page.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((step, idx) => {
    const barrierClass = step.isBarrier ? 'is-barrier' : '';
    const barrierBadge = step.isBarrier
      ? `<span class="speech-barrier-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Barrier</span>`
      : '';
    const stateBadge = step.state
      ? `<span class="speech-state-badge">${escapeHtml(step.state)}</span>`
      : '';
    const announcementText = getStepAnnouncement(step);

    return `
      <div class="speech-step-card ${barrierClass} highlightable" data-filtered-index="${idx}" title="Click to locate and highlight this element on the page">
        <div class="speech-step-top">
          <div class="speech-step-left">
            <span class="speech-step-num">#${idx + 1}</span>
            <span class="speech-role-tag">${escapeHtml(step.type)}</span>
            ${stateBadge}
          </div>
          <div class="speech-actions">
            ${barrierBadge}
            <button type="button" class="btn-speak-speech" title="Hear announcement aloud">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span>Speak</span>
            </button>
            <button type="button" class="btn-highlight-speech" title="Locate & highlight this element on the page">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
              <span>Locate</span>
            </button>
          </div>
        </div>
        <div class="speech-text-bubble">
          <svg class="bubble-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <em>${escapeHtml(announcementText)}</em>
        </div>
        <div class="speech-selector">
          ${escapeHtml(step.selector || 'DOM Element')}
        </div>
      </div>
    `;
  }).join('');

  // Attach highlight and speak event listeners to speech step cards
  container.querySelectorAll('.speech-step-card').forEach((cardEl) => {
    const idx = parseInt(cardEl.getAttribute('data-filtered-index') || '-1', 10);
    const step = filtered[idx];
    if (!step) return;

    const btnSpeak = cardEl.querySelector('.btn-speak-speech');
    const btnLocate = cardEl.querySelector('.btn-highlight-speech');

    btnSpeak?.addEventListener('click', (e) => {
      e.stopPropagation();
      isSpeechPlaying = false;
      isSpeechPaused = false;
      updatePlayButtonUI(false);
      speechStepIndex = idx;
      speakSingleStep(step, idx);
    });

    const triggerHighlight = (btnTarget) => {
      updateCaptionDisplay(getStepAnnouncement(step), false);
      if (step.selector) {
        highlightElementOnPage(step.selector, {
          impact: step.isBarrier ? 'serious' : 'minor',
          help: step.isBarrier ? `Auditory Barrier (${step.type})` : `Screen Reader: ${step.type}`,
          wcagRule: step.spokenText,
          target: step.selector,
        }, btnTarget || btnLocate);
      }
    };

    btnLocate?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHighlight(btnLocate);
    });

    cardEl.addEventListener('click', (e) => {
      if (e.target.closest('.btn-speak-speech') || e.target.closest('.btn-highlight-speech')) return;
      triggerHighlight(btnLocate);
    });
  });
}

/**
 * Renders the sequential keyboard tab navigation order list
 * @param {Object} tabOrder
 */
function renderTabOrderSequence(tabOrder) {
  const container = document.getElementById('tab-sequence-list');
  const badgeEl = document.getElementById('tab-order-status-badge');
  const countEl = document.getElementById('tab-total-count');
  const flowEl = document.getElementById('tab-flow-status');
  const posEl = document.getElementById('tab-positive-count');
  const skipEl = document.getElementById('tab-skip-status');

  if (!container) return;

  if (!tabOrder || !tabOrder.items || tabOrder.items.length === 0) {
    if (badgeEl) badgeEl.textContent = '0 Controls';
    if (countEl) countEl.textContent = '0';
    if (flowEl) flowEl.textContent = 'N/A';
    if (posEl) posEl.textContent = '0';
    if (skipEl) skipEl.textContent = 'Not Checked';
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 11.5px;">
        No focusable interactive elements detected on this page.
      </div>
    `;
    return;
  }

  // Update summary strip
  if (badgeEl) {
    badgeEl.textContent = `${tabOrder.totalElements} Controls (${tabOrder.flowStatus})`;
    if (tabOrder.flowStatus === 'Sequential') {
      badgeEl.style.color = '#34d399';
      badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else if (tabOrder.flowStatus === 'Needs Review') {
      badgeEl.style.color = '#fbbf24';
      badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
    } else {
      badgeEl.style.color = '#f87171';
      badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
  }

  if (countEl) countEl.textContent = String(tabOrder.totalElements);
  if (flowEl) {
    flowEl.textContent = tabOrder.flowStatus;
    flowEl.style.color = tabOrder.flowStatus === 'Sequential' ? '#34d399' : (tabOrder.flowStatus === 'Needs Review' ? '#fbbf24' : '#f87171');
  }
  if (posEl) {
    posEl.textContent = String(tabOrder.positiveTabIndexCount);
    if (tabOrder.positiveTabIndexCount > 0) {
      posEl.classList.add('has-warn');
      posEl.style.color = '#f87171';
    } else {
      posEl.classList.remove('has-warn');
      posEl.style.color = '#34d399';
    }
  }
  if (skipEl) {
    skipEl.textContent = tabOrder.hasSkipLink ? 'Detected' : 'Missing';
    skipEl.style.color = tabOrder.hasSkipLink ? '#34d399' : '#fbbf24';
  }

  // Render cards
  container.innerHTML = tabOrder.items.map((item, idx) => {
    const isWarn = item.hasPositiveTabIndex || item.hasVisualJump || item.hasMissingName;
    const isRadioGroup = !!item.isRadioGroupLeader;
    return `
      <div class="tab-sequence-card ${isWarn ? 'card-warn' : ''} ${isRadioGroup ? 'card-radiogroup' : ''}" data-step-index="${idx}">
        <div class="tab-card-left">
          <span class="tab-badge-num ${isWarn ? 'warn' : ''} ${isRadioGroup ? 'radiogroup' : ''}">
            ${isRadioGroup ? '🔘' : item.step}
          </span>
          <div class="tab-card-info">
            <div class="tab-card-title-row">
              <span class="tab-role-tag">&lt;${escapeHtml(item.tagName)}&gt;</span>
              ${isRadioGroup ? `<span class="tab-badge-radiogroup">Radio Group (1 of ${item.radioGroupTotal})</span>` : ''}
              <span class="tab-name-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            </div>
            <span class="tab-selector-text" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</span>
            ${isRadioGroup ? `<span class="tab-radiogroup-hint">ℹ️ Tab enters group • Next Tab exits group • Arrow keys navigate choices</span>` : ''}
            ${item.warningText ? `<span class="tab-warning-text">⚠️ ${escapeHtml(item.warningText)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="btn-locate-tab" title="Scroll to and highlight this tab stop on page">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
          <span>Locate</span>
        </button>
      </div>
    `;
  }).join('');

  // Attach Locate event listeners
  container.querySelectorAll('.tab-sequence-card').forEach((cardEl) => {
    const idx = parseInt(cardEl.getAttribute('data-step-index') || '-1', 10);
    const item = tabOrder.items[idx];
    if (!item || !item.selector) return;

    const triggerLocate = () => {
      runInPageHighlight(item.selector, {
        impact: item.hasPositiveTabIndex ? 'serious' : (item.hasVisualJump ? 'moderate' : 'minor'),
        help: `Tab Order Stop #${item.step} (${item.role}): ${item.name}`,
        wcagRule: item.warningText || `Tab Sequence #${item.step} (${item.tagName})`,
        target: item.selector,
      });
    };

    cardEl.querySelector('.btn-locate-tab')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerLocate();
    });

    cardEl.addEventListener('click', (e) => {
      if (e.target.closest('.btn-locate-tab')) return;
      triggerLocate();
    });
  });
}

/**
 * Renders the formatted issues table & accordion list
 */
function renderIssuesList() {
  const container = document.getElementById('issues-list');
  if (!container || !currentAudit) return;

  container.innerHTML = '';

  const filtered = currentAudit.violations.filter((v) => {
    if (currentFilter === 'all') return true;
    return v.impact === currentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
        <span>No issues identified under this severity category.</span>
      </div>
    `;
    return;
  }

  filtered.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'violation-card';

    // Element rows
    const elementsHtml = (v.nodes || []).slice(0, 5).map((node, idx) => {
      let contrastBadge = '';
      if (node.contrastFix) {
        const cf = node.contrastFix;
        if (node.hoverDetails) {
          contrastBadge = `
            <div style="margin-top: 5px; padding: 5px 8px; background: rgba(249, 115, 22, 0.12); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 4px; font-size: 10px;">
              <span style="color: #fb923c; font-weight: 700;">Hover Contrast:</span> ${escapeHtml(node.hoverDetails.hoverRatio)} on hover vs ${escapeHtml(node.hoverDetails.requiredRatio)} required (Resting: ${escapeHtml(node.hoverDetails.restingRatio)})
              <div style="color: var(--text-dim); margin-top: 2px;">
                Fix: <strong style="color: #38bdf8; font-family: monospace;">${escapeHtml(cf.suggestedFg)}</strong> (${escapeHtml(cf.suggestedRatio)} PASS)
              </div>
            </div>
          `;
        } else {
          contrastBadge = `
            <div style="margin-top: 5px; padding: 5px 8px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 4px; font-size: 10px;">
              <span style="color: #f87171; font-weight: 700;">Contrast Ratio:</span> ${escapeHtml(cf.currentRatio)} vs ${escapeHtml(cf.requiredRatio)} required
              <span style="color: var(--text-dim); margin-left: 6px;">➔ Recommended: <strong style="color: #38bdf8; font-family: monospace;">${escapeHtml(cf.suggestedFg)}</strong></span>
            </div>
          `;
        }
      }

      let ariaBadge = '';
      if (node.ariaDetails) {
        const ad = node.ariaDetails;
        ariaBadge = `
          <div style="margin-top: 5px; padding: 5px 8px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 4px; font-size: 10px;">
            <div style="color: #38bdf8; font-weight: 700;">ARIA Assessment: ${escapeHtml(ad.diagnosis)}</div>
            <div style="color: var(--text-dim); margin-top: 2px;">
              Current: <code style="color: #f87171;">${escapeHtml(ad.ariaLabel)}</code> &nbsp;➔&nbsp; Fix: <strong style="color: #34d399;">${escapeHtml(ad.recommendedLabel)}</strong>
            </div>
          </div>
        `;
      }

      let srBadge = '';
      if (node.srDetails) {
        const sd = node.srDetails;
        srBadge = `
          <div style="margin-top: 5px; padding: 5px 8px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 4px; font-size: 10px;">
            <div style="color: #c084fc; font-weight: 700;">Screen Reader Assessment: ${escapeHtml(sd.diagnosis)}</div>
            <div style="color: var(--text-dim); margin-top: 2px;">
              Announced: <code style="color: #f87171;">${escapeHtml(sd.currentText)}</code> &nbsp;➔&nbsp; Fix: <strong style="color: #34d399;">${escapeHtml(sd.recommended)}</strong>
            </div>
          </div>
        `;
      }

      return `
        <div class="element-item highlightable" data-node-index="${idx}" title="Click to navigate to and highlight this element on the page">
          <div class="element-item-header">
            <div class="element-meta" style="margin-bottom: 0;">
              <strong>Element ${idx + 1} of ${v.affectedCount}:</strong>
              <code>${escapeHtml(node.target || 'DOM Root')}</code>
            </div>
            <button type="button" class="btn-highlight-element" title="Scroll to and highlight this element on the active page">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
              <span>Highlight</span>
            </button>
          </div>
          <div class="element-meta" style="margin-top: 5px;">
            <strong>HTML:</strong>
            <code style="color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px;">${escapeHtml(node.html || '<element />')}</code>
          </div>
          ${contrastBadge}
          ${ariaBadge}
          ${srBadge}
        </div>
      `;
    }).join('');

    const moreNote = v.affectedCount > 5
      ? `<div style="font-size: 10px; color: var(--text-dim); font-style: italic; padding: 2px 6px;">+ ${v.affectedCount - 5} additional elements itemized in PDF report.</div>`
      : '';

    card.innerHTML = `
      <div class="violation-card-header">
        <div class="violation-title-group">
          <span class="severity-tag severity-${v.impact}">${v.impact}</span>
          <span class="violation-rule-name">${escapeHtml(v.help)}</span>
          <span class="violation-badge-count">(${v.affectedCount})</span>
        </div>
        <div class="violation-header-actions">
          <button type="button" class="btn-highlight-header" title="Highlight first affected element on page">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
            <span>Locate</span>
          </button>
          <span class="expand-icon">▼ Details</span>
        </div>
      </div>

      <div class="violation-details-panel">
        <p class="violation-desc">${escapeHtml(v.description)} &nbsp;•&nbsp; <strong>${escapeHtml(v.wcagRule)}</strong></p>
        
        <div class="element-items-wrapper">
          ${elementsHtml}
          ${moreNote}
        </div>

        <div class="code-box">
          <div class="code-box-header">
            <span>RECOMMENDED CODE FIX:</span>
            <button class="btn-copy">Copy Fix</button>
          </div>
          <pre class="code-snippet"><code>${escapeHtml(v.remediationCode)}</code></pre>
        </div>
      </div>
    `;

    // Toggle expand
    card.querySelector('.violation-card-header')?.addEventListener('click', (e) => {
      if (e.target.closest('.btn-highlight-header')) return;
      card.classList.toggle('open');
      const icon = card.querySelector('.expand-icon');
      if (icon) icon.textContent = card.classList.contains('open') ? '▲ Less' : '▼ Details';
    });

    // Quick Highlight from card header
    const headerHighlightBtn = card.querySelector('.btn-highlight-header');
    headerHighlightBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const firstNode = (v.nodes || [])[0];
      if (firstNode && firstNode.target) {
        highlightElementOnPage(firstNode.target, {
          impact: v.impact,
          help: v.help,
          wcagRule: v.wcagRule,
          description: v.description,
          target: firstNode.target,
          html: firstNode.html,
          remediationCode: v.remediationCode,
          contrastFix: firstNode.contrastFix,
          ariaDetails: firstNode.ariaDetails,
          srDetails: firstNode.srDetails,
        }, headerHighlightBtn);
      }
    });

    // Element row highlight clicks
    const elItems = card.querySelectorAll('.element-item');
    elItems.forEach((elItem) => {
      const idx = parseInt(elItem.getAttribute('data-node-index') || '-1', 10);
      const node = (v.nodes || [])[idx];
      if (!node || !node.target) return;

      const btn = elItem.querySelector('.btn-highlight-element');

      const triggerHighlight = (btnTarget) => {
        highlightElementOnPage(node.target, {
          impact: v.impact,
          help: v.help,
          wcagRule: v.wcagRule,
          description: v.description,
          target: node.target,
          html: node.html,
          remediationCode: v.remediationCode,
          contrastFix: node.contrastFix,
          ariaDetails: node.ariaDetails,
          srDetails: node.srDetails,
        }, btnTarget || btn);
      };

      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerHighlight(btn);
      });

      elItem.addEventListener('click', (e) => {
        if (e.target.closest('.btn-highlight-element')) return;
        triggerHighlight(btn);
      });
    });

    // Copy Code Button
    card.querySelector('.btn-copy')?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(v.remediationCode);
      const btn = card.querySelector('.btn-copy');
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Fix'; }, 1500);
      }
    });

    container.appendChild(card);
  });
}

/**
 * Triggers in-page highlighting for a specific target selector by querying
 * the active tab and executing the in-page spotlight overlay script.
 * @param {string|string[]} selector
 * @param {Object} [meta]
 * @param {HTMLElement} [triggerButton]
 */
async function highlightElementOnPage(selector, meta = {}, triggerButton = null) {
  if (!selector) return;

  const originalHtml = triggerButton ? triggerButton.innerHTML : '';

  try {
    // 1. Prioritize currently active tab in the user's active window (the page directly behind popup)
    let [targetTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!targetTab || !targetTab.id) {
      [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    // 2. Fallback to recorded tab ID if needed
    if ((!targetTab || !targetTab.id) && currentTabId) {
      try {
        targetTab = await chrome.tabs.get(currentTabId);
      } catch (_) {}
    }

    if (!targetTab || !targetTab.id) {
      console.warn('AuditForge: No active tab found to highlight element.');
      if (triggerButton) {
        triggerButton.innerHTML = '<span>⚠️ No Tab</span>';
        setTimeout(() => { triggerButton.innerHTML = originalHtml; }, 2000);
      }
      return;
    }

    currentTabId = targetTab.id;

    if (triggerButton) {
      triggerButton.classList.add('btn-located');
      triggerButton.innerHTML = '<span>✓ Spotlight</span>';
      setTimeout(() => {
        triggerButton.innerHTML = originalHtml;
        triggerButton.classList.remove('btn-located');
      }, 2200);
    }

    // Execute in-page spotlight overlay on the target tab.
    // NOTE: We deliberately do NOT call chrome.windows.update or chrome.tabs.update
    // here because focusing another window causes Chrome to automatically close
    // this extension popup!
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: runInPageHighlight,
      args: [selector, meta],
    });
  } catch (err) {
    console.error('AuditForge: Failed to trigger in-page highlight:', err);
    if (triggerButton) {
      triggerButton.classList.remove('btn-located');
      triggerButton.innerHTML = '<span>⚠️ Notice</span>';
      setTimeout(() => { triggerButton.innerHTML = originalHtml; }, 2200);
    }
  }
}

/**
 * Self-contained highlight function injected directly into the target tab.
 * Uses window.__auditforgeHighlight if available, or renders the spotlight overlay directly.
 * @param {string|string[]} targetSelector
 * @param {Object} meta
 */
function runInPageHighlight(targetSelector, meta = {}) {
  // @ts-ignore
  if (typeof window.__auditforgeHighlight === 'function') {
    // @ts-ignore
    return window.__auditforgeHighlight(targetSelector, meta);
  }

  // Fallback if content script was not yet injected into page
  // @ts-ignore
  if (typeof window.__auditforgeClearHighlight === 'function') {
    // @ts-ignore
    window.__auditforgeClearHighlight();
  } else {
    document.getElementById('__auditforge_overlay_root__')?.remove();
    document.getElementById('__auditforge_overlay_styles__')?.remove();
    document.getElementById('__auditforge_highlight_overlay__')?.remove();
    document.getElementById('__auditforge_toast__')?.remove();
  }

  function safeEscape(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[c]));
  }

  function findElement(target) {
    if (!target) return null;
    if (typeof Element !== 'undefined' && target instanceof Element) return target;

    if (Array.isArray(target)) {
      if (target.length === 1) return findElement(target[0]);
      let currentDoc = document;
      let foundEl = null;
      for (let i = 0; i < target.length; i++) {
        const sel = target[i];
        if (!currentDoc) break;
        try {
          foundEl = currentDoc.querySelector(sel);
          if (foundEl && (foundEl.tagName === 'IFRAME' || foundEl.tagName === 'FRAME')) {
            try {
              // @ts-ignore
              currentDoc = foundEl.contentDocument || foundEl.contentWindow?.document;
            } catch (_) {
              return foundEl;
            }
          }
        } catch (_) {
          break;
        }
      }
      if (foundEl) return foundEl;
    }

    const selectorStr = typeof target === 'string' ? target.trim() : String(target).trim();
    if (!selectorStr) return null;

    if (selectorStr === 'html' || selectorStr === ':root') return document.documentElement;
    if (selectorStr === 'body') return document.body;

    try {
      const el = document.querySelector(selectorStr);
      if (el) return el;
    } catch (_) {}

    if (selectorStr.startsWith('#') && !selectorStr.includes(' ') && !selectorStr.includes('>') && !selectorStr.includes(':')) {
      try {
        const el = document.getElementById(selectorStr.slice(1));
        if (el) return el;
      } catch (_) {}
    }

    try {
      const escaped = selectorStr.replace(/#([^\s>+~.:[\]]+)/g, (_, id) => `#${CSS.escape(id)}`);
      const el = document.querySelector(escaped);
      if (el) return el;
    } catch (_) {}

    const parts = selectorStr.split(/\s*>\s*|\s+/).filter(Boolean);
    if (parts.length > 1) {
      for (let i = parts.length - 1; i >= 0; i--) {
        try {
          const seg = parts[i];
          const el = document.querySelector(seg);
          if (el) return el;
        } catch (_) {}
      }
    }

    if (meta && meta.html) {
      try {
        const tagMatch = meta.html.match(/^<([a-z0-9-]+)/i);
        if (tagMatch) {
          const tag = tagMatch[1];
          const candidates = Array.from(document.querySelectorAll(tag));
          const snippet = meta.html.slice(0, 45);
          const matched = candidates.find((c) => c.outerHTML && c.outerHTML.includes(snippet));
          if (matched) return matched;
        }
      } catch (_) {}
    }

    if (meta && (meta.text || meta.target)) {
      const queryText = (meta.text || '').trim().toLowerCase();
      if (queryText) {
        const interactives = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], h1, h2, h3, h4, img'));
        const matched = interactives.find((el) => ((el.innerText || el.textContent || '')).trim().toLowerCase().includes(queryText));
        if (matched) return matched;
      }
    }

    return null;
  }

  const targetEl = findElement(targetSelector);
  const selectorString = Array.isArray(targetSelector) ? targetSelector.join(' ') : String(targetSelector);
  const isDocumentScope = !targetEl || targetEl === document.documentElement || targetEl === document.body || selectorString === 'html' || selectorString === 'body';

  const severityPalette = {
    critical: { border: '#ef4444', glow: 'rgba(239, 68, 68, 0.45)', bg: 'rgba(239, 68, 68, 0.12)' },
    serious:  { border: '#f97316', glow: 'rgba(249, 115, 22, 0.45)', bg: 'rgba(249, 115, 22, 0.12)' },
    moderate: { border: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', bg: 'rgba(245, 158, 11, 0.12)' },
    minor:    { border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', bg: 'rgba(56, 189, 248, 0.12)' },
    default:  { border: '#6366f1', glow: 'rgba(99, 102, 241, 0.45)', bg: 'rgba(99, 102, 241, 0.12)' },
  };
  const color = severityPalette[(meta.impact || 'default').toLowerCase()] || severityPalette.default;

  let styles = document.getElementById('__auditforge_overlay_styles__');
  if (!styles) {
    styles = document.createElement('style');
    styles.id = '__auditforge_overlay_styles__';
    styles.textContent = `
      @keyframes __af_fade_in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes __af_pulse_ring {
        0% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 0px var(--af-glow), 0 0 20px var(--af-border); }
        50% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 8px rgba(0,0,0,0), 0 0 35px var(--af-border); }
        100% { box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 0 0px var(--af-glow), 0 0 20px var(--af-border); }
      }
      @keyframes __af_slide_up {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .__af_root {
        position: fixed; inset: 0; z-index: 2147483640; pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc; animation: __af_fade_in 0.2s ease-out;
      }
      .__af_backdrop {
        position: fixed; inset: 0; background: rgba(11, 15, 25, 0.75);
        backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); cursor: pointer;
      }
      .__af_spotlight {
        position: fixed; box-sizing: border-box; border: 2.5px solid var(--af-border);
        border-radius: 8px; background: transparent;
        box-shadow: 0 0 0 99999px rgba(11, 15, 25, 0.72), 0 0 25px var(--af-border);
        pointer-events: none; animation: __af_pulse_ring 2s infinite ease-in-out;
        transition: top 0.05s linear, left 0.05s linear, width 0.05s linear, height 0.05s linear;
      }
      .__af_spotlight .af_corner { position: absolute; width: 10px; height: 10px; border-color: #ffffff; border-style: solid; }
      .__af_spotlight .af_tl { top: -2px; left: -2px; border-width: 3px 0 0 3px; border-top-left-radius: 4px; }
      .__af_spotlight .af_tr { top: -2px; right: -2px; border-width: 3px 3px 0 0; border-top-right-radius: 4px; }
      .__af_spotlight .af_bl { bottom: -2px; left: -2px; border-width: 0 0 3px 3px; border-bottom-left-radius: 4px; }
      .__af_spotlight .af_br { bottom: -2px; right: -2px; border-width: 0 3px 3px 0; border-bottom-right-radius: 4px; }
      .__af_toolbar {
        position: fixed; max-width: 480px; min-width: 320px;
        background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.18);
        border-top: 3.5px solid var(--af-border); border-radius: 10px;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85), 0 0 25px var(--af-glow);
        padding: 14px 16px; pointer-events: auto; z-index: 2147483645;
        animation: __af_slide_up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .__af_toolbar_header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
      .__af_badge {
        background: var(--af-border); color: #ffffff; padding: 2px 8px; border-radius: 4px;
        font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
      }
      .__af_rule_title { font-size: 12px; font-weight: 700; color: #f8fafc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .__af_btn_close {
        background: rgba(255, 255, 255, 0.1); border: none; color: #94a3b8;
        width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        cursor: pointer; font-size: 12px; line-height: 1; transition: all 0.15s ease;
      }
      .__af_btn_close:hover { background: rgba(239, 68, 68, 0.4); color: #ffffff; }
      .__af_desc { font-size: 11px; line-height: 1.45; color: #cbd5e1; margin-bottom: 8px; }
      .__af_meta_row {
        font-size: 10px; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 5px; padding: 5px 8px; margin-bottom: 6px; word-break: break-all; font-family: monospace; color: #38bdf8;
      }
      .__af_diag_box {
        background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 5px; padding: 6px 8px; font-size: 10.5px; margin-bottom: 8px; color: #fef3c7;
      }
      .__af_toolbar_actions {
        display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 10px;
        padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .__af_btn_action {
        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0; padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;
      }
      .__af_btn_action:hover { background: rgba(56, 189, 248, 0.2); border-color: #38bdf8; color: #ffffff; }
    `;
    document.head.appendChild(styles);
  }

  const root = document.createElement('div');
  root.id = '__auditforge_overlay_root__';
  root.className = '__af_root';
  root.style.setProperty('--af-border', color.border);
  root.style.setProperty('--af-glow', color.glow);

  const backdrop = document.createElement('div');
  backdrop.className = '__af_backdrop';
  backdrop.title = 'Click anywhere to dismiss overlay (or press Escape)';
  if (isDocumentScope) {
    backdrop.style.background = 'rgba(11, 15, 25, 0.75)';
    backdrop.style.backdropFilter = 'blur(2px)';
  } else {
    backdrop.style.background = 'transparent';
    backdrop.style.backdropFilter = 'none';
  }
  root.appendChild(backdrop);

  let spotlight = null;
  let prevOutline = '';
  let prevOutlineOffset = '';
  if (!isDocumentScope && targetEl) {
    if (targetEl.style) {
      prevOutline = targetEl.style.outline;
      prevOutlineOffset = targetEl.style.outlineOffset;
      targetEl.style.outline = `3.5px dashed ${color.border}`;
      targetEl.style.outlineOffset = '4px';
    }

    spotlight = document.createElement('div');
    spotlight.className = '__af_spotlight';
    spotlight.innerHTML = `
      <div class="af_corner af_tl"></div>
      <div class="af_corner af_tr"></div>
      <div class="af_corner af_bl"></div>
      <div class="af_corner af_br"></div>
    `;
    root.appendChild(spotlight);
  }

  const toolbar = document.createElement('div');
  toolbar.className = '__af_toolbar';

  const ruleLabel = meta.help || meta.wcagRule || 'WCAG 2.2 Finding';
  const impactLabel = (meta.impact || 'ISSUE').toUpperCase();
  const targetLabel = meta.target || (targetEl ? targetEl.tagName.toLowerCase() : 'Page Scope');

  let diagnosisHtml = '';
  if (meta.contrastFix) {
    const cf = meta.contrastFix;
    diagnosisHtml = `
      <div class="__af_diag_box">
        <strong>⚠️ Contrast Failure:</strong> ${safeEscape(cf.currentRatio)} vs ${safeEscape(cf.requiredRatio)} required.
        <div style="margin-top: 3px;">➔ Fix: Change color to <strong style="color: #38bdf8; font-family: monospace;">${safeEscape(cf.suggestedFg)}</strong> (${safeEscape(cf.suggestedRatio)} PASS)</div>
      </div>
    `;
  } else if (meta.ariaDetails) {
    const ad = meta.ariaDetails;
    diagnosisHtml = `
      <div class="__af_diag_box" style="background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.3); color: #e0f2fe;">
        <strong>🗣️ ARIA Analysis:</strong> ${safeEscape(ad.diagnosis)}
        <div style="margin-top: 3px;">➔ Recommended Label: <strong style="color: #34d399;">"${safeEscape(ad.recommendedLabel)}"</strong></div>
      </div>
    `;
  } else if (meta.srDetails) {
    const sd = meta.srDetails;
    diagnosisHtml = `
      <div class="__af_diag_box" style="background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #f3e8ff;">
        <strong>🎙️ Screen Reader Readout:</strong> ${safeEscape(sd.diagnosis)}
      </div>
    `;
  } else if (meta.spokenText) {
    diagnosisHtml = `
      <div class="__af_diag_box" style="background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); color: #f3e8ff;">
        <strong>🎙️ VoiceOver Announcement:</strong> ${safeEscape(meta.spokenText)}
      </div>
    `;
  }

  const descText = meta.description || (isDocumentScope
    ? 'This is a page-wide architectural finding applicable to the whole document structure.'
    : 'Review the element highlighted in the spotlight on the site.');

  const recenterBtnHtml = !isDocumentScope
    ? `<button type="button" class="__af_btn_action __af_btn_recenter">🎯 Re-center Spotlight</button>`
    : '';

  toolbar.innerHTML = `
    <div class="__af_toolbar_header">
      <span class="__af_badge">${safeEscape(impactLabel)}</span>
      <span class="__af_rule_title" title="${safeEscape(ruleLabel)}">${safeEscape(ruleLabel)}</span>
      <button type="button" class="__af_btn_close" title="Dismiss Overlay (Esc)">✕</button>
    </div>
    <div class="__af_desc">${safeEscape(descText)}</div>
    ${diagnosisHtml}
    <div class="__af_meta_row">
      <strong style="color: #94a3b8;">Target:</strong> ${safeEscape(targetLabel)}
    </div>
    <div class="__af_toolbar_actions">
      ${recenterBtnHtml}
      <button type="button" class="__af_btn_action __af_btn_dismiss">✕ Dismiss</button>
    </div>
  `;

  root.appendChild(toolbar);
  document.body.appendChild(root);

  if (!isDocumentScope && targetEl) {
    try {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (_) {
      try { targetEl.scrollIntoView(true); } catch (_) {}
    }
  }

  function updateSpotlight() {
    if (isDocumentScope || !targetEl || !spotlight) {
      toolbar.style.top = '50%';
      toolbar.style.left = '50%';
      toolbar.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const r = targetEl.getBoundingClientRect();
    const pad = 8;
    const minDim = 28;
    const top = Math.round(r.top - pad);
    const left = Math.round(r.left - pad);
    const width = Math.round(Math.max(r.width + pad * 2, minDim));
    const height = Math.round(Math.max(r.height + pad * 2, minDim));

    spotlight.style.top = `${top}px`;
    spotlight.style.left = `${left}px`;
    spotlight.style.width = `${width}px`;
    spotlight.style.height = `${height}px`;

    const tHeight = toolbar.offsetHeight || 150;
    const tWidth = toolbar.offsetWidth || 380;

    let tTop = top + height + 14;
    if (tTop + tHeight > window.innerHeight - 15) {
      tTop = top - tHeight - 14;
    }
    if (tTop < 15) {
      tTop = Math.max(15, top + 15);
    }

    const tLeft = Math.max(15, Math.min(left, window.innerWidth - tWidth - 25));

    toolbar.style.top = `${tTop}px`;
    toolbar.style.left = `${tLeft}px`;
    toolbar.style.transform = 'none';
  }

  updateSpotlight();

  const intervalId = setInterval(updateSpotlight, 40);
  setTimeout(() => clearInterval(intervalId), 3500);

  const cleanup = () => {
    clearInterval(intervalId);
    window.removeEventListener('scroll', updateSpotlight);
    window.removeEventListener('resize', updateSpotlight);
    window.removeEventListener('keydown', onKeyDown);
    if (targetEl && targetEl.style) {
      targetEl.style.outline = prevOutline;
      targetEl.style.outlineOffset = prevOutlineOffset;
    }
    root.remove();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') cleanup();
  };

  backdrop.addEventListener('click', cleanup);
  window.addEventListener('scroll', updateSpotlight, { passive: true });
  window.addEventListener('resize', updateSpotlight, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  toolbar.querySelector('.__af_btn_close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
  toolbar.querySelector('.__af_btn_dismiss')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
  toolbar.querySelector('.__af_btn_recenter')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  });

  return { success: true, isDocumentScope, target: targetLabel };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
