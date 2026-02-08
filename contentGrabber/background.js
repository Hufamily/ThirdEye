/**
 * BACKGROUND SERVICE WORKER
 * 
 * Handles:
 * - Extension icon click → triggers context grab
 * - Google search scraping from extracted context
 * - Calling the analysis API
 * - Sending results back to content script for display
 * 
 * TO INTEGRATE YOUR OWN ANALYSIS BACKEND:
 * 1. Change ANALYZE_API_URL below
 * 2. Modify the request format if your API expects different input
 * 3. Modify the response handling to match your API output
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * API Base URL - configurable, defaults to 127.0.0.1:8000
 * Can be overridden via chrome.storage.local['analyze_api_url']
 */
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

/** Gaze WebSocket URL - served by the unified backend */
const GAZE_WS_URL = 'ws://127.0.0.1:8000/api/gaze/ws';

/** Gaze HTTP API - fallback when WebSocket not connected */
const GAZE_HTTP_URL = 'http://127.0.0.1:8000/api/gaze';

/** Reconnect delay (ms) when gaze WebSocket disconnects */
const GAZE_WS_RECONNECT_DELAY = 2000;

/** Max reconnect delay (ms) — caps exponential backoff */
const GAZE_WS_MAX_RECONNECT_DELAY = 60000;

/** HTTP polling interval (ms) when WebSocket not connected */
const GAZE_HTTP_POLL_INTERVAL = 200;

/**
 * Analysis API endpoint
 * POST request with { url, text } body
 */
const ANALYZE_API_URL = 'http://127.0.0.1:8000/analyze';

/**
 * Gaze tracking API endpoint (gaze2 runs on port 5000)
 * Same as GAZE_HTTP_URL; used as the configurable default for storage.
 */
const GAZE_API_URL = GAZE_HTTP_URL;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 5000;

/** Max words to use from extracted text as a Google search query */
const MAX_SEARCH_QUERY_WORDS = 12;

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Gets the authentication token from chrome.storage.local
 * Token is synced from React app's localStorage
 * @returns {Promise<string|null>} JWT token or null if not found
 */
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get(['auth_token']);
    return result.auth_token || null;
  } catch (error) {
    console.error('[ContextGrabber] Error getting auth token:', error);
    return null;
  }
}

/**
 * Gets the API base URL from storage or uses default
 * @returns {Promise<string>} API base URL
 */
async function getApiBaseUrl() {
  try {
    const result = await chrome.storage.local.get(['analyze_api_url']);
    if (result.analyze_api_url) {
      // Derive base URL from stored analyze endpoint (strip path)
      try { return new URL(result.analyze_api_url).origin; } catch (_) {}
    }
    return DEFAULT_API_BASE_URL;
  } catch (error) {
    console.error('[ContextGrabber] Error getting API base URL:', error);
    return DEFAULT_API_BASE_URL;
  }
}

/**
 * Makes an authenticated API request
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function authenticatedFetch(endpoint, options = {}) {
  const apiBase = await getApiBaseUrl();
  const token = await getAuthToken();
  
  const url = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Handle 401 Unauthorized - token expired
  if (response.status === 401) {
    console.warn('[ContextGrabber] Authentication failed, token may be expired');
    // Could trigger re-authentication flow here
  }
  
  return response;
}

// ============================================================================
// GAZE WEBSOCKET + HTTP FALLBACK: Relay gaze to content scripts
// ============================================================================

let gazeWs = null;
let gazeWsReconnectTimer = null;
let gazeHttpPollTimer = null;

/**
 * Sends gaze data to all http/https tabs. Called by both WebSocket and HTTP poll.
 */
function relayGazeToTabs(data) {
  if (!data || (data.available === false && !data.x && !data.y)) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id || !tab.url) return;
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
      if (!tab.url.startsWith('http')) return;

      chrome.tabs.sendMessage(tab.id, {
        type: 'GAZE_UPDATE',
        data: {
          x: data.x,
          y: data.y,
          confidence: data.confidence || 1,
          screenWidth: data.screenWidth || 1920,
          screenHeight: data.screenHeight || 1080,
          available: data.available !== false
        }
      }).catch(() => { /* Tab may not have content script loaded */ });
    });
  });
}

/**
 * HTTP polling fallback - background can fetch localhost without CORS.
 * Used when WebSocket is not connected.
 */
async function pollGazeHttp() {
  if (gazeWs && gazeWs.readyState === WebSocket.OPEN) return; // WebSocket active, skip poll

  try {
    const res = await fetch(GAZE_HTTP_URL, { method: 'GET' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.available !== false && typeof data.x === 'number' && typeof data.y === 'number') {
      relayGazeToTabs({
        x: data.x,
        y: data.y,
        confidence: data.confidence,
        screenWidth: data.screenWidth || 1920,
        screenHeight: data.screenHeight || 1080,
        available: true
      });
    }
  } catch (e) {
    // API not running - expected when gaze_cursor not started
  }
}

function startGazeHttpPoll() {
  if (gazeHttpPollTimer) return;
  gazeHttpPollTimer = setInterval(pollGazeHttp, GAZE_HTTP_POLL_INTERVAL);
  console.log('[ContextGrabber] Gaze HTTP polling started (fallback when WebSocket offline)');
}

function stopGazeHttpPoll() {
  if (gazeHttpPollTimer) {
    clearInterval(gazeHttpPollTimer);
    gazeHttpPollTimer = null;
  }
}

/**
 * Connects to the gaze2 WebSocket server and relays gaze (x, y) to all active tabs.
 */
function connectGazeWebSocket() {
  if (gazeWs && gazeWs.readyState === WebSocket.OPEN) return;

  try {
    gazeWs = new WebSocket(GAZE_WS_URL);

    gazeWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.available) return;
        relayGazeToTabs(data);
      } catch (e) {
        console.warn('[ContextGrabber] Gaze message parse error:', e);
      }
    };

    gazeWs.onclose = () => {
      gazeWs = null;
      startGazeHttpPoll(); // Fall back to HTTP when WebSocket drops
      gazeWsReconnectTimer = setTimeout(connectGazeWebSocket, GAZE_WS_RECONNECT_DELAY);
    };

    gazeWs.onerror = () => {
      gazeWsReconnectTimer = setTimeout(connectGazeWebSocket, GAZE_WS_RECONNECT_DELAY);
    };

    gazeWs.onopen = () => {
      console.log('[ContextGrabber] Gaze WebSocket connected');
      stopGazeHttpPoll(); // Prefer WebSocket over HTTP
    };
  } catch (e) {
    console.warn('[ContextGrabber] Gaze WebSocket connect error:', e);
    gazeWsReconnectTimer = setTimeout(connectGazeWebSocket, GAZE_WS_RECONNECT_DELAY);
  }
}

/**
 * Disconnects the gaze WebSocket (e.g. when extension is disabled)
 */
function disconnectGazeWebSocket() {
  if (gazeWsReconnectTimer) {
    clearTimeout(gazeWsReconnectTimer);
    gazeWsReconnectTimer = null;
  }
  if (gazeWs) {
    gazeWs.close();
    gazeWs = null;
  }
  stopGazeHttpPoll();
}

// Start gaze connection only if tracking mode includes gaze
chrome.storage.local.get(['tracking_mode'], (result) => {
  const mode = result.tracking_mode || 'gaze+cursor';
  if (mode !== 'cursor') {
    connectGazeWebSocket();
    startGazeHttpPoll();
  } else {
    console.log('[ContextGrabber] Tracking mode is cursor-only — skipping gaze connection');
  }
});

// React to tracking mode changes at runtime
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tracking_mode) {
    const newMode = changes.tracking_mode.newValue || 'gaze+cursor';
    console.log('[ContextGrabber] Tracking mode changed to:', newMode);
    if (newMode === 'cursor') {
      disconnectGazeWebSocket();
      stopGazeHttpPoll();
    } else {
      connectGazeWebSocket();
      startGazeHttpPoll();
    }
  }
});

// ============================================================================
// EXTENSION ICON CLICK → Toggle extension on/off
// ============================================================================

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    console.warn('[ContextGrabber] Cannot run on this page:', tab.url);
    return;
  }

  // Send toggle message to content script
  chrome.tabs.sendMessage(tab.id, { type: 'GRAB_CONTEXT' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[ContextGrabber] Could not reach content script:', chrome.runtime.lastError.message);
      return;
    }
    // Update badge based on new state
    if (response && response.enabled !== undefined) {
      updateBadgeForTab(tab.id, response.enabled);
    }
  });
});

// ============================================================================
// BROWSER HISTORY TRACKING
// ============================================================================

/**
 * Track page visits for learning context
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only track when page is fully loaded
  if (changeInfo.status === 'complete' && tab.url) {
    // Skip chrome:// and extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }
    
    // Track visit asynchronously
    trackPageVisit(tab).catch(err => {
      console.error('[ContextGrabber] Error tracking visit:', err);
    });
  }
});

/**
 * Track page visit using Chrome History API
 */
async function trackPageVisit(tab) {
  try {
    if (!tab.url) return;
    
    // Get visit details from history API
    const visits = await chrome.history.getVisits({ url: tab.url });
    const lastVisit = visits.length > 0 ? visits[0] : null;
    
    // Send to backend if session is active
    const sessionData = await chrome.storage.local.get(['currentSessionId', 'authToken']);
    if (sessionData.currentSessionId && sessionData.authToken) {
      const response = await authenticatedFetch('/api/extension/history/track', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: tab.url,
          title: tab.title || '',
          visitTime: lastVisit ? lastVisit.visitTime : Date.now(),
          transition: lastVisit ? lastVisit.transition : 'unknown',
          visitCount: visits.length,
          sessionId: sessionData.currentSessionId
        })
      });
      
      if (response.ok) {
        console.log('[ContextGrabber] Visit tracked:', tab.url);
      }
    }
  } catch (error) {
    // History API might not be available or permission not granted
    console.debug('[ContextGrabber] Could not track visit (history permission may be missing):', error.message);
  }
}

/**
 * Get recent browsing history for analysis
 */
async function getRecentHistory(maxResults = 100, hoursBack = 24) {
  try {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    const historyItems = await chrome.history.search({
      text: '',
      startTime: startTime,
      endTime: endTime,
      maxResults: maxResults
    });
    
    return historyItems.map(item => ({
      id: item.id,
      url: item.url,
      title: item.title || '',
      visitCount: item.visitCount || 0,
      lastVisitTime: item.lastVisitTime,
      typedCount: item.typedCount || 0
    }));
  } catch (error) {
    console.error('[ContextGrabber] Error getting history:', error);
    return [];
  }
}

/**
 * Analyze browsing patterns for learning context
 */
async function analyzeBrowsingPatterns(daysBack = 7) {
  try {
    const hoursBack = daysBack * 24;
    const history = await getRecentHistory(500, hoursBack);
    
    // Group by domain
    const domainGroups = {};
    history.forEach(item => {
      try {
        const domain = new URL(item.url).hostname;
        if (!domainGroups[domain]) {
          domainGroups[domain] = {
            domain: domain,
            visits: 0,
            urls: [],
            lastVisit: 0
          };
        }
        domainGroups[domain].visits += item.visitCount || 1;
        domainGroups[domain].urls.push(item.url);
        if (item.lastVisitTime > domainGroups[domain].lastVisit) {
          domainGroups[domain].lastVisit = item.lastVisitTime;
        }
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    // Sort by visit count
    const topDomains = Object.values(domainGroups)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 20);
    
    return {
      totalVisits: history.length,
      topDomains: topDomains,
      learningSites: topDomains.filter(d => 
        d.domain.includes('docs.google.com') ||
        d.domain.includes('github.com') ||
        d.domain.includes('stackoverflow.com') ||
        d.domain.includes('developer.mozilla.org') ||
        d.domain.includes('medium.com') ||
        d.domain.includes('wikipedia.org')
      )
    };
  } catch (error) {
    console.error('[ContextGrabber] Error analyzing patterns:', error);
    return { totalVisits: 0, topDomains: [], learningSites: [] };
  }
}

// Handle history analysis requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_BROWSING_HISTORY') {
    getRecentHistory(message.maxResults || 100, message.hoursBack || 24)
      .then(history => sendResponse({ success: true, history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'ANALYZE_BROWSING_PATTERNS') {
    analyzeBrowsingPatterns(message.daysBack || 7)
      .then(analysis => sendResponse({ success: true, analysis }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Updates the extension badge to show enabled/disabled state
 */
function updateBadgeForTab(tabId, enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  } else {
    chrome.action.setBadgeText({ text: 'OFF', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9800', tabId });
  }
}

// ============================================================================
// CONTEXT MENU: Right-click → Settings
// ============================================================================

// Create context menu on extension load
chrome.contextMenus.create({
  id: 'thirdeye-settings',
  title: 'ThirdEye Settings',
  contexts: ['page']
});

// Handle context menu click → open options page
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'thirdeye-settings') {
    chrome.runtime.openOptionsPage();
  }
});

// ============================================================================
// GET ANALYZE API URL
// ============================================================================

/**
 * Gets the Analysis API URL from storage
 * @returns {Promise<string>} API URL
 */
async function getAnalyzeApiUrl() {
  try {
    const stored = await chrome.storage.local.get('analyze_api_url');
    return stored.analyze_api_url || ANALYZE_API_URL;
  } catch (error) {
    console.error('[ContextGrabber] Error getting API URL:', error);
    return ANALYZE_API_URL;
  }
}

/**
 * Gets the Gaze API URL from storage
 * @returns {Promise<string|null>} Gaze API URL or null if disabled
 */
async function getGazeApiUrl() {
  try {
    const stored = await chrome.storage.local.get('gaze_api_url');
    // Return null if explicitly empty, otherwise return URL or default
    if (stored.gaze_api_url === '') return null;
    return stored.gaze_api_url || GAZE_API_URL;
  } catch (error) {
    console.error('[ContextGrabber] Error getting Gaze API URL:', error);
    return GAZE_API_URL;
  }
}

// ============================================================================
// MESSAGE HANDLER: Receive content from content script
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Quick backend reachability check — used by content script before attempting agent flow
  if (message.type === 'BACKEND_HEALTH_CHECK') {
    const timeout = message.timeoutMs || 1500;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    getApiBaseUrl().then(apiBase =>
      fetch(`${apiBase}/health`, { method: 'GET', signal: controller.signal })
    ).then(res => {
      clearTimeout(timer);
      sendResponse({ available: res.ok });
    }).catch(() => {
      clearTimeout(timer);
      sendResponse({ available: false });
    });
    return true; // async
  }

  // Handle request for Analysis API URL from content script
  if (message.type === 'GET_ANALYZE_API_URL') {
    getAnalyzeApiUrl().then(apiUrl => {
      sendResponse({ apiUrl });
    });
    return true; // Indicate we'll send response asynchronously
  }
  
  // Handle request for Gaze API URL from content script
  if (message.type === 'GET_GAZE_API_URL') {
    getGazeApiUrl().then(gazeUrl => {
      sendResponse({ gazeUrl });
    });
    return true; // Indicate we'll send response asynchronously
  }
  
  // Handle extension state changes from content script
  if (message.type === 'EXTENSION_STATE_CHANGED') {
    if (sender.tab && sender.tab.id) {
      updateBadgeForTab(sender.tab.id, message.enabled);
      
      // Start or stop session based on enabled state
      if (message.enabled && sender.tab.url) {
        startSession({
          url: sender.tab.url,
          documentTitle: sender.tab.title || 'Unknown',
          documentType: detectDocumentType(sender.tab.url)
        }).then(session => {
          if (session) {
            console.log('[ContextGrabber] Session started:', session.sessionId);
          }
        });
      } else {
        getCurrentSessionId().then(sessionId => {
          if (sessionId) {
            stopSession(sessionId).then(result => {
              if (result) {
                console.log('[ContextGrabber] Session stopped:', result.sessionId);
              }
            });
          }
        });
      }
    }
    sendResponse({ received: true });
  }

  if (message.type === 'ANALYZE_CONTENT') {
    analyzeContent(message.data, sender.tab.id);
    sendResponse({ received: true });
  }

  if (message.type === 'SEARCH_GOOGLE') {
    searchGoogleAndRespond(message.data, sender.tab.id);
    sendResponse({ received: true });
  }

  // Capture visible tab screenshot and return it
  if (message.type === 'CAPTURE_AREA') {
    captureVisibleTab(sender.tab.id, message.data)
      .then(dataUrl => sendResponse({ dataUrl, error: null }))
      .catch(err => {
        console.error('[ContextGrabber] Capture error:', err);
        const errorMessage = err.message || err.toString() || 'Unknown error';
        sendResponse({ dataUrl: null, error: errorMessage });
      });
    return true; // Keep sendResponse channel open for async
  }

  // Search Google Images
  if (message.type === 'SEARCH_GOOGLE_IMAGES') {
    searchGoogleImagesAndRespond(message.data, sender.tab.id);
    sendResponse({ received: true });
  }

  // Session management
  if (message.type === 'START_SESSION') {
    startSession(message.data)
      .then(session => sendResponse({ success: !!session, session }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'STOP_SESSION') {
    stopSession(message.data.sessionId)
      .then(result => sendResponse({ success: !!result, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_SESSION_ID') {
    getCurrentSessionId()
      .then(sessionId => sendResponse({ sessionId }))
      .catch(err => sendResponse({ sessionId: null, error: err.message }));
    return true;
  }

  // Confusion trigger recording
  if (message.type === 'RECORD_TRIGGER') {
    getCurrentSessionId()
      .then(sessionId => {
        if (sessionId) {
          return recordConfusionTrigger(sessionId, message.data);
        }
        return false;
      })
      .then(success => sendResponse({ success }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Notebook entry creation
  if (message.type === 'CREATE_NOTEBOOK_ENTRY') {
    createNotebookEntry(message.data)
      .then(entry => sendResponse({ success: !!entry, entry }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Chatbot messages
  if (message.type === 'SEND_CHAT_MESSAGE') {
    getCurrentSessionId()
      .then(sessionId => {
        return sendChatMessage({
          message: message.data.message,
          sessionId: sessionId,
          context: message.data.context
        });
      })
      .then(response => sendResponse({ success: !!response, response }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_CHAT_HISTORY') {
    getCurrentSessionId()
      .then(sessionId => getChatHistory(sessionId, message.data?.limit))
      .then(history => sendResponse({ success: !!history, history }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Get session info (start time, etc.)
  if (message.type === 'GET_SESSION_INFO') {
    // For now, return basic info. Backend can provide more details later
    sendResponse({ 
      success: true, 
      startTime: new Date(Date.now() - 3600000).toISOString() // Default to 1 hour ago
    });
    return true;
  }
});

/**
 * Detects document type from URL
 * @param {string} url - Page URL
 * @returns {string} Document type
 */
function detectDocumentType(url) {
  if (!url) return 'other';
  if (url.includes('docs.google.com')) return 'google-doc';
  if (url.includes('github.com')) return 'github';
  if (url.includes('notion.so')) return 'notion';
  if (url.includes('atlassian.net') || url.includes('confluence')) return 'confluence';
  return 'other';
}

// ============================================================================
// GOOGLE SEARCH: Scrape results for context
// ============================================================================

/** Time-decay LRU cache for recent search results (avoids redundant requests) */
const searchCache = new Map();
const SEARCH_CACHE_MAX = 30;
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets cached search results if available and not expired.
 * Increments access count and updates last-access time for LRU scoring.
 */
function getCachedResults(query) {
  const entry = searchCache.get(query);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.createdAt > SEARCH_CACHE_TTL) {
    searchCache.delete(query);
    return null;
  }

  // Update access tracking for LRU
  entry.accessCount++;
  entry.lastAccessTime = Date.now();
  return entry.results;
}

/**
 * Sets cache entry with time-decay LRU metadata.
 * On eviction, prioritizes frequently accessed AND recently accessed queries.
 */
function setCachedResults(query, results) {
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    // Evict entry with lowest LRU score
    let lowestScore = Infinity;
    let lowestKey = null;

    const now = Date.now();
    for (const [key, entry] of searchCache.entries()) {
      // Score = accessCount * 10 + (recency: ms since last access, scaled to 1-10 range)
      const msSinceLastAccess = now - entry.lastAccessTime;
      const recencyScore = Math.max(1, 10 - (msSinceLastAccess / SEARCH_CACHE_TTL) * 10);
      const score = (entry.accessCount * 20) + recencyScore;

      if (score < lowestScore) {
        lowestScore = score;
        lowestKey = key;
      }
    }

    if (lowestKey) searchCache.delete(lowestKey);
  }

  searchCache.set(query, {
    results,
    createdAt: Date.now(),
    lastAccessTime: Date.now(),
    accessCount: 1
  });
}

/** Common English stop words to strip from search queries */
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','it','as','be','was','are','been','has','have','had',
  'that','this','these','those','which','what','who','whom','where','when',
  'how','not','no','do','does','did','will','would','can','could','shall',
  'should','may','might','its','than','then','so','if','just','also','very',
  'into','about','up','out','all','some','any','each','every','such','here',
  'there','other','more','much','own'
]);

/**
 * Builds an effective search query from extracted page text.
 *
 * Improvements over the naive "first sentence" approach:
 * 1. Strips rich-extraction metadata tags like [Image: ...], [Table: ...]
 * 2. Removes common stop words to keep only keywords
 * 3. Scores candidate phrases by keyword density
 * 4. Avoids URLs and very short fragments
 */
function buildSearchQuery(text) {
  // 1) Strip metadata bracket tags from rich extraction
  let cleaned = text.replace(/\[[^\]]{0,80}\]/g, ' ');

  // 2) Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, ' ');

  // 3) Collapse whitespace and split into sentences/lines
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);

  if (sentences.length === 0) {
    // Fallback: just take the first N words of whatever we have
    return cleaned.split(/\s+/).slice(0, MAX_SEARCH_QUERY_WORDS).join(' ');
  }

  // 4) Score each sentence by keyword density (non-stop-word ratio)
  let bestSentence = sentences[0];
  let bestScore = -1;

  for (const sentence of sentences.slice(0, 10)) { // check first 10 sentences
    const words = sentence.split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2) continue;
    const keywords = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
    const score = keywords.length / words.length; // keyword density 0-1
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // 5) Take up to MAX_SEARCH_QUERY_WORDS, preferring keywords
  const words = bestSentence.split(/\s+/);
  const keywordsFirst = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
  const query = keywordsFirst.slice(0, MAX_SEARCH_QUERY_WORDS).join(' ');

  return query || words.slice(0, MAX_SEARCH_QUERY_WORDS).join(' ');
}

/**
 * Fetches Google search results page and parses out result entries
 * 
 * @param {string} query - Search query string
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function scrapeGoogleResults(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[ContextGrabber] Google returned status:', response.status);
      // If Google blocks us (429 / 503), fall back to DuckDuckGo
      if (response.status === 429 || response.status === 503) {
        console.log('[ContextGrabber] Google rate-limited, trying DuckDuckGo...');
        return await scrapeDuckDuckGoResults(query);
      }
      return [];
    }

    const html = await response.text();
    const results = parseGoogleHTML(html);

    // If Google returned an empty set (CAPTCHA page, etc.), try DDG
    if (results.length === 0) {
      console.log('[ContextGrabber] Google returned 0 results, trying DuckDuckGo...');
      return await scrapeDuckDuckGoResults(query);
    }

    return results;
  } catch (error) {
    console.error('[ContextGrabber] Google search error:', error.message);
    // Network error / timeout — try DuckDuckGo as fallback
    try {
      return await scrapeDuckDuckGoResults(query);
    } catch (ddgError) {
      console.error('[ContextGrabber] DuckDuckGo fallback also failed:', ddgError.message);
      return [];
    }
  }
}

/**
 * Parses Google search results from raw HTML using regex only.
 * Service workers (MV3) don't support DOMParser, so we use pattern matching.
 * Extracts titles, URLs, and snippets from result blocks.
 */
function parseGoogleHTML(html) {
  const results = [];

  // Pattern 1: Match <a> followed by <h3> structure (modern Google results)
  // Google structure: <a href="URL">...<h3>TITLE</h3>...</a>
  const resultPattern = /<a[^>]+href="(https?:\/\/(?!www\.google\.)[^"]+)"[^>]*>(?:(?!<\/a>).)*?<h3[^>]*>(.*?)<\/h3>/gis;
  let match;

  while ((match = resultPattern.exec(html)) !== null && results.length < 5) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();

    if (!title || !url) continue;
    if (url.includes('google.com/search') || url.includes('accounts.google') || url.includes('gstatic.com')) continue;

    // Extract snippet: look for text after the title block
    const afterMatch = html.substring(match.index + match[0].length, match.index + match[0].length + 500);
    const snippetMatch = afterMatch.match(/<span[^>]*>([^<]{40,200})<\/span>/i);
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    results.push({ title, url, snippet });
  }

  // Pattern 2: Alternative structure - separate h3 and link patterns
  if (results.length === 0) {
    const titleRegex = /<h3[^>]*>(.*?)<\/h3>/gi;
    const linkRegex = /<a[^>]+href="(https?:\/\/(?!www\.google\.com)[^"]+)"[^>]*>/gi;

    const titles = [];
    while ((match = titleRegex.exec(html)) !== null && titles.length < 8) {
      const clean = match[1].replace(/<[^>]+>/g, '').trim();
      if (clean.length > 5) titles.push(clean);
    }

    const urls = [];
    const seenUrls = new Set();
    while ((match = linkRegex.exec(html)) !== null && urls.length < 15) {
      const u = match[1];
      if (seenUrls.has(u)) continue;
      seenUrls.add(u);
      if (!u.includes('google.com') && !u.includes('gstatic.com') && !u.includes('accounts.google')) {
        urls.push(u);
      }
    }

    for (let i = 0; i < Math.min(titles.length, urls.length, 5); i++) {
      results.push({ title: titles[i], url: urls[i], snippet: '' });
    }
  }

  // Pattern 3: Featured snippets and knowledge panels
  if (results.length === 0) {
    const featuredPattern = /data-(?:title|text)="([^"]{10,100})"/gi;
    while ((match = featuredPattern.exec(html)) !== null && results.length < 3) {
      const text = match[1].trim();
      if (text && !text.includes('Google')) {
        results.push({ title: text, url: '', snippet: 'Featured result' });
      }
    }
  }

  console.log('[ContextGrabber] Parsed', results.length, 'results from Google HTML');
  return results;
}

// ============================================================================
// DUCKDUCKGO FALLBACK: Used when Google blocks or returns empty
// ============================================================================

/**
 * Scrapes DuckDuckGo HTML search results as a fallback.
 * DDG's HTML version is more tolerant of automated requests.
 *
 * @param {string} query
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function scrapeDuckDuckGoResults(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[ContextGrabber] DuckDuckGo returned status:', response.status);
      return [];
    }

    const html = await response.text();
    return parseDuckDuckGoHTML(html);
  } catch (error) {
    console.error('[ContextGrabber] DuckDuckGo search error:', error.message);
    return [];
  }
}

/**
 * Parses DuckDuckGo HTML lite results page using regex only.
 * Service workers (MV3) don't support DOMParser.
 * Results are in <div class="result"> blocks.
 */
function parseDuckDuckGoHTML(html) {
  const results = [];

  // Pattern 1: DDG HTML lite result links with class="result__a"
  const resultPattern = /class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = resultPattern.exec(html)) !== null && results.length < 5) {
    let url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();

    // DDG redirects through uddg= param; extract actual URL
    const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (!title || !url || url.includes('duckduckgo.com')) continue;

    // Try to find snippet in nearby result__snippet class
    const snippetPattern = new RegExp(`${escapeRegex(title)}[\\s\\S]{0,500}class="result__snippet"[^>]*>([^<]{10,200})`, 'i');
    const snippetMatch = html.match(snippetPattern);
    const snippet = snippetMatch ? snippetMatch[1].trim() : '';

    results.push({ title, url, snippet });
  }

  // Pattern 2: Alternative - look for links with href containing uddg
  if (results.length === 0) {
    const altPattern = /<a[^>]+href="[^"]*uddg=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
    while ((match = altPattern.exec(html)) !== null && results.length < 5) {
      const url = decodeURIComponent(match[1]);
      const title = match[2].trim();
      if (title.length > 5 && url && !url.includes('duckduckgo.com')) {
        results.push({ title, url, snippet: '' });
      }
    }
  }

  console.log('[ContextGrabber] Parsed', results.length, 'results from DuckDuckGo HTML');
  return results;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handles the full flow: receive context → search Google → send results to overlay
 */
async function searchGoogleAndRespond(data, tabId) {
  try {
    const query = buildSearchQuery(data.text);
    console.log('[ContextGrabber] Searching for:', query);

    if (!query || query.trim().length < 3) {
      console.warn('[ContextGrabber] Query too short, skipping search');
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_SEARCH_RESULTS',
        data: {
          query: query || '(empty)',
          results: [{ title: 'Query too short', url: '', snippet: 'Please select more text for better search results.' }],
          sourceUrl: data.url
        }
      });
      return;
    }

    // Check cache first
    let results = getCachedResults(query);
    if (results) {
      console.log('[ContextGrabber] Cache hit for:', query);
    } else {
      results = await scrapeGoogleResults(query);
      if (results.length > 0) setCachedResults(query, results);
    }

    // If no results from any source, provide a helpful fallback
    if (!results || results.length === 0) {
      console.warn('[ContextGrabber] No search results found for:', query);
      results = [{
        title: 'No results found',
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: 'Click to search manually on Google. Try selecting different text for better results.'
      }];
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_SEARCH_RESULTS',
      data: {
        query: query,
        results: results,
        sourceUrl: data.url
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[ContextGrabber] Failed to send search results:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error('[ContextGrabber] Search flow error:', error);
    // Send error state to content script so user sees something
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_SEARCH_RESULTS',
        data: {
          query: data.text ? data.text.substring(0, 50) : 'unknown',
          results: [{
            title: 'Search failed',
            url: '',
            snippet: `Error: ${error.message}. Try again or select different text.`
          }],
          sourceUrl: data.url
        }
      });
    } catch { /* ignore send errors */ }
  }
}

// ============================================================================
// SCREENSHOT CAPTURE: Capture visible tab and return it
// ============================================================================

/**
 * Captures a screenshot of the currently visible tab.
 * Returns the full-page screenshot as a data URL.
 * The content script will crop it to the area of interest.
 *
 * @param {number} tabId - Tab to capture
 * @param {Object} area  - { x, y, width, height, devicePixelRatio }
 * @returns {Promise<string>} data URL of the screenshot
 */
async function captureVisibleTab(tabId, area) {
  // Get the window ID for this tab
  const tab = await chrome.tabs.get(tabId);

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png'
  });

  return dataUrl;
}

// ============================================================================
// GOOGLE IMAGES SEARCH: Scrape image results for context
// ============================================================================

/**
 * Fetches Google Images results and parses thumbnails/titles
 *
 * @param {string} query - Search query
 * @returns {Promise<Array<{title: string, thumbnailUrl: string, sourceUrl: string}>>}
 */
async function scrapeGoogleImageResults(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&num=6`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[ContextGrabber] Google Images returned status:', response.status);
      return [];
    }

    const html = await response.text();
    return parseGoogleImagesHTML(html);
  } catch (error) {
    console.error('[ContextGrabber] Google Images search error:', error.message);
    return [];
  }
}

/**
 * Parses Google Images search page HTML to extract image thumbnails.
 * Google Images embeds base64 thumbnail data and metadata in script tags.
 */
function parseGoogleImagesHTML(html) {
  const results = [];

  // Strategy 1: Extract image data from the "AF_initDataCallback" script blocks
  // Google embeds image URLs in JSON-like structures within script tags
  const imgRegex = /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp|svg)[^"]*)",\s*(\d+),\s*(\d+)\]/gi;
  const seen = new Set();
  let match;

  while ((match = imgRegex.exec(html)) !== null && results.length < 8) {
    const url = match[1];
    const width = parseInt(match[2]);
    const height = parseInt(match[3]);

    // Skip tiny images (icons, tracking pixels) and Google's own assets
    if (width < 50 || height < 50) continue;
    if (url.includes('gstatic.com') || url.includes('google.com')) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    results.push({
      thumbnailUrl: url,
      width: width,
      height: height,
      sourceUrl: '',
      title: ''
    });
  }

  // Strategy 2: Fallback — look for <img> tags with data-src or src attributes
  if (results.length === 0) {
    const imgTagRegex = /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"[^>]*>/gi;
    while ((match = imgTagRegex.exec(html)) !== null && results.length < 8) {
      const url = match[1];
      if (url.includes('gstatic.com') || url.includes('google.com/images')) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      results.push({
        thumbnailUrl: url,
        width: 0,
        height: 0,
        sourceUrl: '',
        title: ''
      });
    }
  }

  // Try to extract titles from nearby text
  const titleRegex = /"([^"]{10,80})"\s*,\s*"(https?:\/\/[^"]+)"/g;
  while ((match = titleRegex.exec(html)) !== null) {
    // Try to match titles to existing results by proximity in HTML
    for (const r of results) {
      if (!r.title && !r.sourceUrl) {
        r.title = match[1];
        r.sourceUrl = match[2];
        break;
      }
    }
  }

  return results;
}

/**
 * Full flow: receive context → search Google Images → send results to content script
 */
async function searchGoogleImagesAndRespond(data, tabId) {
  try {
    const query = buildSearchQuery(data.text);
    console.log('[ContextGrabber] Searching Google Images for:', query);

    if (!query || query.trim().length < 3) {
      console.warn('[ContextGrabber] Query too short for image search');
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_IMAGE_RESULTS',
        data: { query: query || '(empty)', images: [] }
      });
      return;
    }

    const images = await scrapeGoogleImageResults(query);
    console.log('[ContextGrabber] Found', images.length, 'images');

    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_IMAGE_RESULTS',
      data: {
        query: query,
        images: images
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[ContextGrabber] Failed to send image results:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error('[ContextGrabber] Image search flow error:', error);
    // Send empty results so UI doesn't hang
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_IMAGE_RESULTS',
        data: { query: '', images: [] }
      });
    } catch { /* ignore */ }
  }
}

// ============================================================================
// MAIN: Call analysis API and send results to content script
// ============================================================================

/**
 * Sends content to analysis backend and returns results to content script
 * 
 * @param {Object} data - Content to analyze
 * @param {string} data.url - Page URL
 * @param {string} data.text - Extracted text content
 * @param {number} tabId - Chrome tab ID for sending response
 */
async function analyzeContent(data, tabId) {
  try {
    console.log('[ContextGrabber] Analyzing content for tab', tabId);

    // Call analysis API
    const result = await callAnalysisAPI(data);

    if (!result) {
      console.warn('[ContextGrabber] Analysis API returned no result');
      return;
    }

    console.log('[ContextGrabber] Analysis complete, sending to content script');

    // Send result back to content script for display
    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'SHOW_ANALYSIS',
        data: result
      },
      response => {
        if (chrome.runtime.lastError) {
          console.error('[ContextGrabber] Failed to send analysis to content script:', 
            chrome.runtime.lastError.message);
        }
      }
    );
  } catch (error) {
    console.error('[ContextGrabber] Analysis error:', error);
  }
}

/**
 * Makes the actual API call to the analysis backend
 * 
 * CUSTOMIZE THIS FUNCTION for your backend:
 * - Change request format (headers, body structure)
 * - Transform response to match expected output
 * - Add authentication if needed
 * 
 * @param {Object} data - { url, text, sessionId? }
 * @returns {Promise<Object>} Analysis result
 */
async function callAnalysisAPI(data) {
  try {
    const sessionId = await getCurrentSessionId();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Use new API endpoint if available, fallback to old one
    const endpoint = '/api/personal/analyze';
    const apiBase = await getApiBaseUrl();
    const url = `${apiBase}${endpoint}`;

    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        url: data.url,
        text: data.text,
        sessionId: sessionId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[ContextGrabber] Analysis API returned status:', response.status);
      // Fallback to old endpoint if new one fails
      return await tryOldAnalysisAPI(data);
    }

    const result = await response.json();

    // Validate response format
    if (!result.summary || !Array.isArray(result.confusion_points) || 
        !Array.isArray(result.image_queries)) {
      console.warn('[ContextGrabber] Invalid analysis response format:', result);
      return getPlaceholderResponse(data);
    }

    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[ContextGrabber] Analysis API timeout');
    } else {
      console.warn('[ContextGrabber] Analysis API error:', error.message);
    }

    // Try old endpoint as fallback
    return await tryOldAnalysisAPI(data);
  }
}

/**
 * Fallback to old analysis API endpoint
 * @param {Object} data - { url, text }
 * @returns {Promise<Object>} Analysis result
 */
async function tryOldAnalysisAPI(data) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const apiUrl = await getAnalyzeApiUrl();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: data.url,
        text: data.text
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return getPlaceholderResponse(data);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return getPlaceholderResponse(data);
  }
}

/**
 * Returns a placeholder response when the analysis backend is unavailable
 * Helps with testing the UI when your real backend isn't ready
 * 
 * REMOVE THIS when your real API is ready
 * 
 * @param {Object} data - The content that would have been analyzed
 * @returns {Object} Placeholder analysis result
 */
function getPlaceholderResponse(data) {
  const textPreview = data.text.substring(0, 100).trim();
  
  return {
    summary: `Content from ${data.url}: "${textPreview}..."`,
    confusion_points: [
      'Analysis API is not available. Is your backend running on ' + ANALYZE_API_URL + '?',
      'Check console for detailed error messages',
      'Until backend is ready, this is a placeholder response'
    ],
    image_queries: [
      'Set up your analysis backend',
      'Configure ANALYZE_API_URL in background.js'
    ]
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Starts a new learning session
 * @param {Object} data - Session data
 * @param {string} data.url - Page URL
 * @param {string} data.documentTitle - Document title
 * @param {string} data.documentType - Document type (google-doc, github, notion, confluence, other)
 * @returns {Promise<Object|null>} Session object with sessionId or null on error
 */
async function startSession(data) {
  try {
    const response = await authenticatedFetch('/api/extension/session/start', {
      method: 'POST',
      body: JSON.stringify({
        url: data.url,
        documentTitle: data.documentTitle || document.title || 'Unknown',
        documentType: data.documentType || 'other'
      })
    });
    
    if (!response.ok) {
      console.error('[ContextGrabber] Failed to start session:', response.status);
      return null;
    }
    
    const result = await response.json();
    
    // Store sessionId in storage
    if (result.sessionId) {
      await chrome.storage.local.set({ currentSessionId: result.sessionId });
    }
    
    return result;
  } catch (error) {
    console.error('[ContextGrabber] Error starting session:', error);
    return null;
  }
}

/**
 * Stops the current session
 * @param {string} sessionId - Session ID to stop
 * @returns {Promise<Object|null>} Stop result or null on error
 */
async function stopSession(sessionId) {
  if (!sessionId) return null;
  
  try {
    const response = await authenticatedFetch(`/api/extension/session/${sessionId}/stop`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      console.error('[ContextGrabber] Failed to stop session:', response.status);
      return null;
    }
    
    const result = await response.json();
    
    // Clear sessionId from storage
    await chrome.storage.local.remove(['currentSessionId']);
    
    return result;
  } catch (error) {
    console.error('[ContextGrabber] Error stopping session:', error);
    return null;
  }
}

/**
 * Gets the current session ID from storage
 * @returns {Promise<string|null>} Current session ID or null
 */
async function getCurrentSessionId() {
  try {
    const result = await chrome.storage.local.get(['currentSessionId']);
    return result.currentSessionId || null;
  } catch (error) {
    console.error('[ContextGrabber] Error getting session ID:', error);
    return null;
  }
}

/**
 * Records a confusion trigger
 * @param {string} sessionId - Session ID
 * @param {Object} trigger - Trigger data
 * @param {string} trigger.triggerType - Type: 'scroll' | 'hover' | 'click'
 * @param {Object} trigger.location - Location { x, y }
 * @param {string} trigger.text - Extracted text
 * @returns {Promise<boolean>} Success status
 */
async function recordConfusionTrigger(sessionId, trigger) {
  if (!sessionId) return false;
  
  try {
    const response = await authenticatedFetch(`/api/personal/sessions/${sessionId}/triggers`, {
      method: 'POST',
      body: JSON.stringify({
        triggerType: trigger.triggerType,
        location: trigger.location,
        text: trigger.text,
        timestamp: new Date().toISOString()
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('[ContextGrabber] Error recording trigger:', error);
    return false;
  }
}

/**
 * Creates a notebook entry
 * @param {Object} entry - Entry data
 * @param {string} entry.sessionId - Session ID
 * @param {string} entry.title - Entry title
 * @param {string} entry.content - Entry content (markdown)
 * @param {Object} entry.context - Context data
 * @returns {Promise<Object|null>} Created entry or null on error
 */
async function createNotebookEntry(entry) {
  try {
    const response = await authenticatedFetch('/api/personal/notebook-entries', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: entry.sessionId,
        title: entry.title,
        content: entry.content,
        context: entry.context
      })
    });
    
    if (!response.ok) {
      console.error('[ContextGrabber] Failed to create notebook entry:', response.status);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[ContextGrabber] Error creating notebook entry:', error);
    return null;
  }
}

// ============================================================================
// CHATBOT API CONNECTIONS
// ============================================================================

/**
 * Sends a chat message to the chatbot API
 * @param {Object} data - Chat data
 * @param {string} data.message - User message
 * @param {string} data.sessionId - Session ID
 * @param {Object} data.context - Context data
 * @returns {Promise<Object|null>} Chat response or null on error
 */
async function sendChatMessage(data) {
  try {
    const response = await authenticatedFetch('/api/extension/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: data.message,
        sessionId: data.sessionId,
        context: data.context
      })
    });
    
    if (!response.ok) {
      console.error('[ContextGrabber] Chat API error:', response.status);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[ContextGrabber] Error sending chat message:', error);
    return null;
  }
}

/**
 * Gets chat history for a session
 * @param {string} sessionId - Session ID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Promise<Object|null>} Chat history or null on error
 */
async function getChatHistory(sessionId, limit = 50) {
  if (!sessionId) return null;
  
  try {
    const response = await authenticatedFetch(`/api/extension/chat/history?sessionId=${sessionId}&limit=${limit}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      console.error('[ContextGrabber] Failed to get chat history:', response.status);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[ContextGrabber] Error getting chat history:', error);
    return null;
  }
}

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

// ============================================================================
// USER INFO SYNC: Sync user info from React app localStorage
// ============================================================================

/**
 * Syncs user info from React app's localStorage to extension storage
 * This allows the extension to display Google account info
 */
async function syncUserInfo() {
  // Try to get user info from storage (set by React app via message)
  // The React app should send user info when user logs in
  chrome.storage.local.get(['user', 'auth_token'], (result) => {
    if (result.user) {
      console.log('[ContextGrabber] User info synced:', result.user.email);
    }
  });
}

// Listen for user info updates from content scripts or React app
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_USER_INFO') {
    // Store user info from React app
    chrome.storage.local.set({
      user: message.user,
      auth_token: message.token
    }, () => {
      console.log('[ContextGrabber] User info stored:', message.user?.email);
      sendResponse({ success: true });
    });
    return true;
  }
});

// Sync user info on startup
syncUserInfo();

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

// Log when service worker starts
console.log('[ContextGrabber] Background service worker initialized');