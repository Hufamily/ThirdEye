/**
 * CONTENT SCRIPT - ThirdEye Dwell-Based Context Grabber
 * 
 * BEHAVIOR:
 * The overlay stays open while browsing. When the cursor (or gaze point)
 * dwells in one spot for DWELL_TIME_MS, context is scraped from that
 * location and Google search results are shown in the persistent overlay.
 * 
 * HOW TO USE:
 * 1. Configure API endpoints below (GAZE_API_URL, ANALYZE_API_URL)
 * 2. To disable gaze tracking: set ENABLE_GAZE_MODE = false
 * 3. To swap gaze API: change GAZE_API_URL constant
 * 4. Adjust DWELL_TIME_MS to change how long the user must hover
 */

console.log('[ContextGrabber] Script starting to load...');

// ============================================================================
// CONFIGURATION - MODIFY THESE FOR YOUR SETUP
// ============================================================================

/** Gaze tracking API endpoint (GET request) */
const GAZE_API_URL = 'http://127.0.0.1:8000/gaze';

/** Analysis API endpoint (POST request) */
const ANALYZE_API_URL = 'http://127.0.0.1:8000/analyze';

/** Enable/disable gaze tracking (set to false to use cursor-only mode) */
const ENABLE_GAZE_MODE = true;

/** Gaze tracking poll interval in milliseconds */
const GAZE_POLL_INTERVAL = 300;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 3000;

/** Minimum confidence threshold for gaze coordinates (0-1) */
const MIN_CONFIDENCE = 0.5;

/** Maximum text extraction length */
const MAX_TEXT_LENGTH = 4000;

/** How long (ms) cursor/gaze must stay in one area before triggering scrape */
const DWELL_TIME_MS = 2000;

/** Pixel radius — movement within this range counts as "staying still" */
const DWELL_RADIUS = 50;

/** Cooldown (ms) after a scrape before the same area can trigger again */
const DWELL_COOLDOWN_MS = 5000;

/** How often (ms) the dwell detector checks position */
const DWELL_CHECK_INTERVAL = 200;

/** Snapshot capture region size in pixels (width & height around the point) */
const SNAPSHOT_SIZE = 400;

/** 
 * Screenshot API priority mode:
 * - 'api-only': Only use screenshot + backend API, never fall back to Google
 * - 'api-first': Try API first, fall back to Google if API fails/returns nothing
 * - 'google-only': Skip API entirely, only use Google search
 */
const SCREENSHOT_PRIORITY = 'api-first';

/** Number of text lines to capture before and after the target point (centered window) */
const CONTEXT_LINES_BEFORE = 10;
const CONTEXT_LINES_AFTER = 10;

// ============================================================================
// STATE
// ============================================================================

let extensionEnabled = true;          // Toggle extension on/off without reload
let gazeAvailable = ENABLE_GAZE_MODE; // Tracks if gaze API is working
let currentOverlay = null;            // Reference to persistent overlay element
let isTyping = false;                 // Tracks if user is typing
let isPDF = false;                    // Whether current page is a PDF
let isGoogleDoc = false;              // Whether current page is a Google Doc
let isGoogleSlides = false;           // Whether current page is Google Slides
let isPDFjs = false;                  // Whether PDF is rendered via PDF.js

// Dwell detection state
let currentMousePos = { x: 0, y: 0 }; // Latest cursor position
let smoothedMousePos = { x: 0, y: 0 }; // EMA-smoothed cursor position
let mouseVelocity = 0;                 // Pixels/sec cursor speed (smoothed)
let lastMouseTime = 0;                 // Timestamp of last mousemove
let dwellAnchor = null;               // {x, y, time} — where dwell started
let lastScrapedElement = null;        // Avoid re-scraping same element
let lastScrapeTime = 0;               // Timestamp of last scrape
let overlayVisible = false;           // Whether overlay is currently shown
let overlayDocked = false;            // Whether overlay is in docked (compact icon) mode
let lastSnapshotDataUrl = null;       // Last captured snapshot
let activeTab = 'web';                // 'web' or 'images' — which tab is shown
let isHoveringOverlay = false;        // Tracks if cursor is inside the overlay
let lastExtractedRegionKey = '';      // De-dup key for special page extractions
let pdfTrackingOverlay = null;        // Transparent overlay for PDF mouse tracking
let lastScrollTime = 0;               // Timestamp of last scroll event

// Chatbot panel state
let chatbotExpanded = false;          // Whether chatbot panel is expanded
let chatbotPanelWidth = 400;          // Current chatbot panel width in pixels
let chatMessages = [];                // Chat message history
let recentCaptures = [];              // Recent context captures (last 5)
let isSendingMessage = false;        // Whether a message is being sent
let isMinimized = false;              // Whether overlay panel is minimized (resized)

// ============================================================================
// UTILITY: Check if user is typing in an input field
// ============================================================================

function isUserTyping() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const typingElements = ['INPUT', 'TEXTAREA'];
  if (typingElements.includes(activeElement.tagName)) return true;

  if (activeElement.contentEditable === 'true') return true;

  return false;
}

// Listen for input/focus events to update typing state
document.addEventListener('focus', () => { isTyping = isUserTyping(); }, true);
document.addEventListener('blur', () => { isTyping = false; }, true);
document.addEventListener('input', () => { isTyping = isUserTyping(); }, true);
document.addEventListener('keydown', () => { isTyping = isUserTyping(); }, true);
document.addEventListener('keyup', () => { isTyping = false; }, true);

// Load chatbot state from storage on page load
chrome.storage.local.get(['chatbotExpanded', 'chatbotPanelWidth', 'user'], (result) => {
  if (result.chatbotExpanded !== undefined) {
    chatbotExpanded = result.chatbotExpanded;
  }
  if (result.chatbotPanelWidth !== undefined) {
    chatbotPanelWidth = result.chatbotPanelWidth;
  }
  
  // If chatbot was expanded, restore it after overlay is created
  if (chatbotExpanded) {
    setTimeout(() => {
      if (currentOverlay) {
        expandChatbotPanel();
      }
    }, 500);
  }
  
  // Try to sync user info from React app's localStorage if on the dashboard domain
  syncUserInfoFromReactApp();
});

/**
 * Attempts to sync user info from React app's localStorage
 * This works if the extension content script runs on the React app domain
 */
function syncUserInfoFromReactApp() {
  try {
    // Try to read from React app's Zustand persisted storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const authData = JSON.parse(authStorage);
        if (authData.state?.user && authData.state?.token) {
          // Sync to extension storage
          chrome.storage.local.set({
            user: authData.state.user,
            auth_token: authData.state.token
          }, () => {
            console.log('[ContextGrabber] User info synced from React app');
            // Update UI if overlay exists
            if (currentOverlay) {
              loadUserInfo();
            }
          });
        }
      } catch (e) {
        console.warn('[ContextGrabber] Failed to parse auth storage:', e);
      }
    }
  } catch (e) {
    // localStorage might not be accessible (cross-origin)
    console.log('[ContextGrabber] Could not access localStorage:', e.message);
  }
}

// Periodically sync user info (in case user logs in on React app)
setInterval(() => {
  syncUserInfoFromReactApp();
  if (currentOverlay) {
    loadUserInfo();
  }
}, 5000); // Check every 5 seconds

// ============================================================================
// CORE: Get gaze point from API
// ============================================================================

/**
 * Attempts to fetch gaze coordinates from the gaze tracking API
 * Falls back to null if API is unavailable or returns invalid data
 * 
 * @returns {Promise<{x: number, y: number} | null>} Gaze coordinates or null on failure
 */
async function getGazePoint() {
  if (!gazeAvailable) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(GAZE_API_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[ContextGrabber] Gaze API returned:', response.status);
      gazeAvailable = false;
      return null;
    }

    const data = await response.json();

    // Validate response format
    if (typeof data.x !== 'number' || typeof data.y !== 'number') {
      console.warn('[ContextGrabber] Invalid gaze response format:', data);
      return null;
    }

    // Check confidence if provided
    if (data.confidence !== undefined && data.confidence < MIN_CONFIDENCE) {
      return null;
    }

    return { x: data.x, y: data.y };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[ContextGrabber] Gaze API timeout');
    } else {
      console.warn('[ContextGrabber] Gaze API error:', error.message);
    }
    gazeAvailable = false;
    return null;
  }
}

// ============================================================================
// MOUSE TRACKING: Smoothed position + velocity estimation
// ============================================================================

/** EMA smoothing factor (0-1). Lower = smoother but laggier. */
const MOUSE_SMOOTH_FACTOR = 0.35;

/** Velocity EMA smoothing factor. */
const VELOCITY_SMOOTH_FACTOR = 0.3;

/** Below this speed (px/sec) the cursor is considered "at rest". */
const VELOCITY_REST_THRESHOLD = 15;

document.addEventListener('mousemove', (event) => {
  updateMouseState(event.clientX, event.clientY);
}, { passive: true });

// Reset dwell on scroll — the content under the cursor changes
document.addEventListener('scroll', () => {
  dwellAnchor = null;
  lastScrollTime = Date.now();
  
  // Record scroll as confusion trigger
  if (extensionEnabled) {
    chrome.runtime.sendMessage({
      type: 'RECORD_TRIGGER',
      data: {
        triggerType: 'scroll',
        location: { x: currentMousePos.x, y: currentMousePos.y },
        text: window.getSelection().toString().trim() || document.elementFromPoint(currentMousePos.x, currentMousePos.y)?.textContent?.substring(0, 200) || ''
      }
    }).catch(() => {}); // Ignore errors
  }
}, { passive: true, capture: true });

// Track click events as confusion triggers
document.addEventListener('click', (e) => {
  if (extensionEnabled && !isHoveringOverlay) {
    const clickedElement = e.target;
    const text = clickedElement.textContent?.substring(0, 200) || '';
    
    chrome.runtime.sendMessage({
      type: 'RECORD_TRIGGER',
      data: {
        triggerType: 'click',
        location: { x: e.clientX, y: e.clientY },
        text: text
      }
    }).catch(() => {}); // Ignore errors
  }
}, { passive: true });

window.addEventListener('scroll', () => {
  dwellAnchor = null;
  lastScrollTime = Date.now();
}, { passive: true });

// ============================================================================
// PDF MOUSE TRACKING: Transparent overlay to capture cursor on PDF embeds
// ============================================================================

/**
 * Chrome's built-in PDF viewer renders inside an <embed> plugin element
 * that swallows all mouse events.  This function places a transparent
 * overlay on top of the embed so we can track mousemove for dwell
 * detection, while still forwarding clicks and scrolls to the PDF.
 */
function installPDFMouseTracker() {
  const embed = document.querySelector('embed[type="application/pdf"]')
    || document.querySelector('embed');
  if (embed) {
    _createPDFTracker(embed);
    return;
  }

  // Embed might not exist yet — Chrome injects it asynchronously.
  // Use MutationObserver to catch it reliably.
  const observer = new MutationObserver((mutations) => {
    const found = document.querySelector('embed[type="application/pdf"]')
      || document.querySelector('embed');
    if (found) {
      observer.disconnect();
      _createPDFTracker(found);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Safety timeout: stop observing after 10s to avoid leaks
  setTimeout(() => observer.disconnect(), 10000);
}

/**
 * Shared handler that updates ALL mouse tracking state.
 * Used by both the main document listener and the PDF tracker.
 */
function updateMouseState(x, y) {
  const now = Date.now();

  // Compute instantaneous velocity
  if (lastMouseTime > 0) {
    const dt = (now - lastMouseTime) / 1000;
    if (dt > 0) {
      const dx = x - currentMousePos.x;
      const dy = y - currentMousePos.y;
      const instantSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
      mouseVelocity = VELOCITY_SMOOTH_FACTOR * instantSpeed
                    + (1 - VELOCITY_SMOOTH_FACTOR) * mouseVelocity;
    }
  }
  lastMouseTime = now;

  // Store raw position
  currentMousePos = { x, y };

  // EMA-smoothed position
  smoothedMousePos = {
    x: MOUSE_SMOOTH_FACTOR * x + (1 - MOUSE_SMOOTH_FACTOR) * smoothedMousePos.x,
    y: MOUSE_SMOOTH_FACTOR * y + (1 - MOUSE_SMOOTH_FACTOR) * smoothedMousePos.y
  };
}

function _createPDFTracker(embed) {
  if (pdfTrackingOverlay) return; // Already installed

  const tracker = document.createElement('div');
  tracker.id = 'cg-pdf-mouse-tracker';
  tracker.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    z-index: 2147483646;
    background: transparent;
    cursor: auto;
    touch-action: none;
  `;

  // Helper to temporarily disable pointer events for forwarding
  const forwardEvent = (duration = 2) => {
    tracker.style.pointerEvents = 'none';
    let frames = duration;
    const restore = () => {
      if (--frames <= 0) {
        tracker.style.pointerEvents = 'auto';
      } else {
        requestAnimationFrame(restore);
      }
    };
    requestAnimationFrame(restore);
  };

  // Track mouse/pointer position — update ALL state (smoothed pos, velocity, timestamp)
  tracker.addEventListener('pointermove', (e) => {
    updateMouseState(e.clientX, e.clientY);
  }, { passive: true });

  // Forward clicks: briefly become transparent to pointer events so the
  // click reaches the PDF embed underneath, then re-enable tracking.
  tracker.addEventListener('mousedown', (e) => {
    updateMouseState(e.clientX, e.clientY);
    forwardEvent(2);
  });

  // Forward scroll/wheel to the PDF (for zoom and scroll)
  tracker.addEventListener('wheel', (e) => {
    updateMouseState(e.clientX, e.clientY);
    forwardEvent(1);
  }, { passive: true });

  // Forward keyboard events (e.g. Ctrl+F for PDF search, arrow keys for navigation)
  tracker.addEventListener('keydown', (e) => {
    forwardEvent(1);
  });

  // Ensure pointer-events are re-enabled after any interaction
  tracker.addEventListener('mouseup', () => {
    tracker.style.pointerEvents = 'auto';
  });

  // --- Touch support for mobile/tablet PDF viewing ---

  // Track touch position for gaze-like tracking
  tracker.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      updateMouseState(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  // Forward touch start for text selection, links, etc.
  tracker.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      updateMouseState(touch.clientX, touch.clientY);
    }
    // Forward multi-touch gestures (pinch-to-zoom)
    if (e.touches.length >= 2) {
      forwardEvent(10); // Longer forward for pinch gestures
    } else {
      forwardEvent(3);
    }
  }, { passive: true });

  // Forward touch end
  tracker.addEventListener('touchend', () => {
    tracker.style.pointerEvents = 'auto';
  }, { passive: true });

  // Double-tap detection for zoom
  let lastTapTime = 0;
  tracker.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      // Double-tap detected — forward for longer to allow zoom animation
      forwardEvent(5);
    }
    lastTapTime = now;
  });

  // Context menu (right-click) forwarding for PDF viewer options
  tracker.addEventListener('contextmenu', (e) => {
    forwardEvent(3);
  });

  // Make sure the context-grabber overlay sits above this tracker
  document.body.appendChild(tracker);
  pdfTrackingOverlay = tracker;
  console.log('[ContextGrabber] PDF mouse tracker installed over embed (touch support enabled)');
}

// ============================================================================
// TARGET RESOLUTION: Find semantic container and extract text
// ============================================================================

/**
 * Finds the semantic container element at the given coordinates
 * Walks up the DOM tree to find: section, article, main, or a suitable div
 * Dispatches to specialised finders for Google Docs, PDF.js, etc.
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Element | null} The semantic container element or null
 */
function findSemanticContainer(x, y) {
  // Google Docs: find the nearest kix paragraph / line
  if (isGoogleDoc) {
    return findGoogleDocsContainer(x, y);
  }

  // Google Slides: find the nearest slide text container
  if (isGoogleSlides) {
    return findGoogleSlidesContainer(x, y);
  }

  // PDF.js viewer: find the nearest text layer span
  if (isPDFjs) {
    return findPDFjsContainer(x, y);
  }

  let element = document.elementFromPoint(x, y);

  if (!element) return null;

  // Priority: semantic tags > larger div > original element
  const semanticTags = ['SECTION', 'ARTICLE', 'MAIN'];
  let current = element;

  // Walk up DOM, max 15 levels
  for (let i = 0; i < 15 && current; i++) {
    if (semanticTags.includes(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }

  // If no semantic tag, try to find a substantial div
  current = element;
  for (let i = 0; i < 15 && current; i++) {
    if (current.tagName === 'DIV' && current.offsetHeight > 100) {
      return current;
    }
    current = current.parentElement;
  }

  // Fall back to original element or its parent
  return element.parentElement || element;
}

// ============================================================================
// GOOGLE DOCS: Cursor-aware text extraction
// ============================================================================

/**
 * Helper: Walk up the DOM tree looking for a container that matches the given criteria.
 * Used by all container finders to reduce duplication.
 *
 * @param {Element} element - Starting element
 * @param {number} maxLevels - Max levels to walk up (typically 15-20)
 * @param {Function} checkFn - Function that returns true if element matches criteria
 * @returns {Element|null} - First matching element or null
 */
function findContainerByCriteria(element, maxLevels, checkFn) {
  let current = element;
  for (let i = 0; i < maxLevels && current; i++) {
    if (checkFn(current)) return current;
    current = current.parentElement;
  }
  return null;
}

/**
 * Finds the Google Docs paragraph container nearest to (x, y).
 * Google Docs uses .kix-paragraphrenderer for paragraphs and
 * .kix-lineview for individual lines.  Canvas rendering may hide
 * these visually but they remain in the DOM for accessibility.
 */
function findGoogleDocsContainer(x, y) {
  // Try elementFromPoint first — may land on canvas or a kix element
  const hit = document.elementFromPoint(x, y);

  if (hit) {
    // Walk up looking for a kix paragraph / page
    const found = findContainerByCriteria(hit, 20, (el) => {
      return el.classList && (
        el.classList.contains('kix-paragraphrenderer') ||
        el.classList.contains('kix-page')
      );
    });
    if (found) return found;
  }

  // Fallback: find the paragraph whose bounding rect contains (x, y)
  const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
  let closest = null;
  let closestDist = Infinity;

  for (const p of paragraphs) {
    const rect = p.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // Check containment first
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return p;
    }

    // Track closest by vertical distance
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = p;
    }
  }

  // If closest is within a reasonable range (~200px), use it
  if (closest && closestDist < 200) return closest;

  // Last resort — return the editor container itself
  return document.querySelector('.kix-appview-editor') || hit;
}

/**
 * Extracts text from Google Docs around the cursor point.
 * Gathers the target paragraph plus surrounding paragraphs for context.
 *
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @returns {string} Extracted text
 */
function extractGoogleDocsText(x, y) {
  const parts = [];

  // 1) Try user selection first (works even with canvas rendering)
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 5) {
    parts.push(selection.toString().trim());
  }

  // 2) Try Google Docs' internal clipboard textarea
  const clipboardArea = document.querySelector('.docs-texteventtarget-iframe');
  if (clipboardArea && clipboardArea.contentDocument) {
    try {
      const iframeBody = clipboardArea.contentDocument.body;
      if (iframeBody && iframeBody.textContent.trim()) {
        parts.push(iframeBody.textContent.trim());
      }
    } catch { /* cross-origin — ignore */ }
  }

  // 3) Extract text from kix-lineview elements near the cursor
  const targetParagraph = findGoogleDocsContainer(x, y);
  if (targetParagraph) {
    // Get the target paragraph text
    const targetText = extractKixParagraphText(targetParagraph);
    if (targetText) parts.push(targetText);

    // Also grab surrounding paragraphs for context
    const allParagraphs = Array.from(document.querySelectorAll('.kix-paragraphrenderer'));
    const idx = allParagraphs.indexOf(targetParagraph);
    if (idx >= 0) {
      // 2 paragraphs before
      for (let i = Math.max(0, idx - 2); i < idx; i++) {
        const t = extractKixParagraphText(allParagraphs[i]);
        if (t) parts.push(t);
      }
      // 2 paragraphs after
      for (let i = idx + 1; i <= Math.min(allParagraphs.length - 1, idx + 2); i++) {
        const t = extractKixParagraphText(allParagraphs[i]);
        if (t) parts.push(t);
      }
    }
  }

  // 4) If still empty, try all visible lines on the current page
  if (parts.join('').trim().length < 20) {
    const pages = document.querySelectorAll('.kix-page');
    for (const page of pages) {
      const rect = page.getBoundingClientRect();
      // Only extract from the page that's currently in view
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const lines = page.querySelectorAll('.kix-lineview-text-block');
      for (const line of lines) {
        const t = line.textContent.trim();
        if (t) parts.push(t);
      }
    }
  }

  const unique = [...new Set(parts.filter(Boolean))];
  return unique.join('\n').substring(0, MAX_TEXT_LENGTH);
}

/**
 * Extracts text content from a single Google Docs paragraph element.
 * Handles both direct text nodes and .kix-lineview-text-block spans.
 */
function extractKixParagraphText(paragraphEl) {
  // Try the text blocks inside line views first
  const textBlocks = paragraphEl.querySelectorAll('.kix-lineview-text-block');
  if (textBlocks.length > 0) {
    return Array.from(textBlocks)
      .map(b => b.textContent.trim())
      .filter(Boolean)
      .join(' ');
  }
  // Fallback: word nodes
  const wordNodes = paragraphEl.querySelectorAll('.kix-wordhtmlgenerator-word-node');
  if (wordNodes.length > 0) {
    return Array.from(wordNodes)
      .map(w => w.textContent)
      .join('')
      .trim();
  }
  // Last resort: innerText
  return (paragraphEl.innerText || paragraphEl.textContent || '').trim();
}

// ============================================================================
// GOOGLE SLIDES: Text extraction from slide containers
// ============================================================================

/**
 * Finds the nearest text container inside a Google Slides presentation.
 */
function findGoogleSlidesContainer(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;

  // Walk up to find a shape or text container
  const found = findContainerByCriteria(hit, 20, (el) => {
    if (!el.classList) return false;
    if (el.classList.contains('punch-viewer-svgpage-svgcontainer')) return true;
    if (el.classList.contains('punch-viewer-content')) return true;
    if (el.tagName === 'SVG') return true;
    return false;
  });
  return found || hit.parentElement || hit;
}

/**
 * Extracts text from Google Slides at a given point.
 * Slides embed text in SVG <text> elements and special divs.
 */
function extractGoogleSlidesText(x, y) {
  const parts = [];

  // User selection
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 3) {
    parts.push(selection.toString().trim());
  }

  // Find the current slide container
  const slideContainer = findGoogleSlidesContainer(x, y);
  if (slideContainer) {
    // SVG text elements
    const svgTexts = slideContainer.querySelectorAll('text');
    for (const t of svgTexts) {
      const text = t.textContent.trim();
      if (text) parts.push(text);
    }
    // Div-based text containers
    const textDivs = slideContainer.querySelectorAll('[class*="text"]');
    for (const d of textDivs) {
      const text = d.textContent.trim();
      if (text.length > 3) parts.push(text);
    }
  }

  // Presenter notes
  const notes = document.querySelector('.punch-viewer-speaker-notes-text');
  if (notes && notes.textContent.trim()) {
    parts.push(`[Speaker Notes: ${notes.textContent.trim()}]`);
  }

  return [...new Set(parts.filter(Boolean))].join('\n').substring(0, MAX_TEXT_LENGTH);
}

// ============================================================================
// PDF: Multi-strategy text extraction
// ============================================================================

/**
 * Finds the nearest text-layer container in a PDF.js viewer.
 * PDF.js renders text spans in a .textLayer div positioned over the canvas.
 */
function findPDFjsContainer(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;

  // Walk up looking for .textLayer or .page
  const found = findContainerByCriteria(hit, 15, (el) => {
    return el.classList && (
      el.classList.contains('textLayer') ||
      el.classList.contains('page')
    );
  });
  if (found) return found;

  // Try to find the nearest .textLayer by page position
  const textLayers = document.querySelectorAll('.textLayer');
  for (const layer of textLayers) {
    const rect = layer.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
      return layer;
    }
  }

  return hit;
}

/**
 * Extracts text from a PDF viewed in-browser.
 * Tries multiple strategies:
 *   1. User selection (works in Chrome's built-in viewer and PDF.js)
 *   2. PDF search highlights (when user has searched in PDF)
 *   3. PDF.js text layer spans near the cursor
 *   4. PDF links and annotations near cursor
 *   5. All visible text layer content on the current page
 *   6. PDF document metadata (title, author, subject)
 *   7. Fallback to document title
 *
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @returns {string}
 */
function extractPDFText(x, y) {
  const parts = [];

  // 1) User text selection — works in both Chrome viewer and PDF.js
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 3) {
    parts.push(selection.toString().trim());
  }

  // 2) PDF search highlights — if user searched in PDF, prioritize that context
  if (isPDFjs) {
    const searchHighlights = extractPDFSearchHighlights();
    if (searchHighlights) parts.push(searchHighlights);
  }

  // 3) PDF.js text layer: find spans near the cursor
  if (isPDFjs) {
    const nearbyText = extractPDFjsTextNearPoint(x, y);
    if (nearbyText) parts.push(nearbyText);
  }

  // 4) PDF links and annotations near cursor
  if (isPDFjs) {
    const linkContext = extractPDFLinksNearPoint(x, y);
    if (linkContext) parts.push(linkContext);

    const annotations = extractPDFAnnotations(x, y);
    if (annotations) parts.push(annotations);
  }

  // 5) Chrome built-in PDF viewer — try to access the viewer's content
  const viewerEl = document.querySelector('#viewer .page .textLayer');
  if (viewerEl) {
    const text = viewerEl.textContent.trim();
    if (text) parts.push(text.substring(0, MAX_TEXT_LENGTH / 2));
  }

  // 6) PDF document metadata (title, author, subject)
  if (isPDFjs) {
    const metadata = extractPDFMetadata();
    if (metadata) parts.push(metadata);
  }

  // 7) Fallback: document title + URL
  if (parts.join('').trim().length < 10) {
    const fallback = getFallbackPageContext();
    if (fallback) parts.push(fallback);
  }

  return [...new Set(parts.filter(Boolean))].join('\n').substring(0, MAX_TEXT_LENGTH);
}

/**
 * Extracts text from PDF.js search highlights.
 * When user has used Ctrl+F in PDF.js, highlighted matches are marked.
 * @returns {string}
 */
function extractPDFSearchHighlights() {
  const highlights = document.querySelectorAll('.textLayer .highlight, .textLayer .selected');
  if (!highlights.length) return '';

  const texts = [];
  for (const h of highlights) {
    const text = h.textContent.trim();
    if (text) texts.push(`[Search: ${text}]`);
  }
  return texts.join(' ');
}

/**
 * Extracts PDF links (internal and external) near the cursor.
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @returns {string}
 */
function extractPDFLinksNearPoint(x, y) {
  const LINK_RADIUS = 100; // pixels
  const annotationLayer = document.querySelector('.annotationLayer');
  if (!annotationLayer) return '';

  const links = annotationLayer.querySelectorAll('a, [data-element-id]');
  const nearbyLinks = [];

  for (const link of links) {
    const rect = link.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

    if (dist < LINK_RADIUS) {
      const href = link.getAttribute('href') || link.getAttribute('data-dest');
      const title = link.getAttribute('title') || link.textContent.trim();
      if (href && href.startsWith('http')) {
        nearbyLinks.push(`[Link: ${title || href}]`);
      } else if (href) {
        nearbyLinks.push(`[Internal: ${title || 'page ref'}]`);
      }
    }
  }

  return nearbyLinks.slice(0, 5).join(' ');
}

/**
 * Extracts PDF annotations (comments, notes, highlights) near the cursor.
 * PDF.js renders popup annotations in .annotationLayer.
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @returns {string}
 */
function extractPDFAnnotations(x, y) {
  const ANNOTATION_RADIUS = 150; // pixels
  const annotationLayer = document.querySelector('.annotationLayer');
  if (!annotationLayer) return '';

  // Look for popup annotations, sticky notes, highlights with content
  const annotations = annotationLayer.querySelectorAll(
    '.popupAnnotation, .textAnnotation, .highlightAnnotation, .underlineAnnotation, .squigglyAnnotation'
  );
  const nearbyAnnotations = [];

  for (const anno of annotations) {
    const rect = anno.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

    if (dist < ANNOTATION_RADIUS) {
      // Try to get annotation content from popup or title
      const popup = anno.querySelector('.popupContent, .popup');
      const content = popup ? popup.textContent.trim() : anno.getAttribute('title');
      if (content) {
        nearbyAnnotations.push(`[Annotation: ${content.substring(0, 200)}]`);
      }
    }
  }

  return nearbyAnnotations.slice(0, 3).join(' ');
}

/**
 * Extracts PDF document metadata from PDF.js.
 * PDF.js stores metadata in the PDFViewerApplication object.
 * @returns {string}
 */
function extractPDFMetadata() {
  const parts = [];

  // Try to access PDF.js application object
  const pdfApp = window.PDFViewerApplication;
  if (pdfApp && pdfApp.pdfDocument) {
    try {
      // Metadata is loaded asynchronously, but may be available
      const info = pdfApp.documentInfo;
      if (info) {
        if (info.Title) parts.push(`[PDF Title: ${info.Title}]`);
        if (info.Author) parts.push(`[Author: ${info.Author}]`);
        if (info.Subject) parts.push(`[Subject: ${info.Subject}]`);
        if (info.Keywords) parts.push(`[Keywords: ${info.Keywords}]`);
      }
    } catch { /* ignore access errors */ }
  }

  // Fallback: check meta tags that PDF.js sometimes injects
  const metaTitle = document.querySelector('meta[name="pdf:title"], meta[name="dc:title"]');
  const metaAuthor = document.querySelector('meta[name="pdf:author"], meta[name="dc:creator"]');
  if (metaTitle && metaTitle.content) parts.push(`[PDF Title: ${metaTitle.content}]`);
  if (metaAuthor && metaAuthor.content) parts.push(`[Author: ${metaAuthor.content}]`);

  return parts.join(' ');
}

/**
 * Extracts the PDF document outline (table of contents) if available.
 * Useful for understanding document structure.
 * @returns {Array} Array of outline items with titles and page numbers
 */
function extractPDFOutline() {
  const outline = [];

  // Try PDF.js application object
  const pdfApp = window.PDFViewerApplication;
  if (pdfApp && pdfApp.pdfOutlineViewer) {
    try {
      const outlineView = pdfApp.pdfOutlineViewer;
      if (outlineView._outline) {
        const extractItems = (items, level = 0) => {
          for (const item of items) {
            outline.push({
              title: item.title,
              level: level,
              dest: item.dest
            });
            if (item.items && item.items.length) {
              extractItems(item.items, level + 1);
            }
          }
        };
        extractItems(outlineView._outline);
      }
    } catch { /* ignore */ }
  }

  // Fallback: parse the sidebar outline if visible
  const sidebarOutline = document.querySelectorAll('#outlineView .treeItem a');
  if (sidebarOutline.length > 0 && outline.length === 0) {
    for (const item of sidebarOutline) {
      const level = parseInt(item.closest('.treeItem')?.style.marginLeft || '0') / 20;
      outline.push({
        title: item.textContent.trim(),
        level: Math.round(level)
      });
    }
  }

  return outline;
}

/**
 * Gets the current PDF zoom level from PDF.js.
 * @returns {number} Zoom scale (1.0 = 100%)
 */
function getPDFZoomLevel() {
  const pdfApp = window.PDFViewerApplication;
  if (pdfApp && pdfApp.pdfViewer) {
    return pdfApp.pdfViewer.currentScale || 1.0;
  }
  // Fallback: check for CSS transform scale on pages
  const page = document.querySelector('.page');
  if (page) {
    const transform = window.getComputedStyle(page).transform;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\(([^,]+)/);
      if (match) return parseFloat(match[1]) || 1.0;
    }
  }
  return 1.0;
}

/**
 * Gets the current page number in PDF.js viewer.
 * @returns {number} Current page number (1-indexed)
 */
function getCurrentPDFPage() {
  const pdfApp = window.PDFViewerApplication;
  if (pdfApp && pdfApp.pdfViewer) {
    return pdfApp.pdfViewer.currentPageNumber || 1;
  }
  // Fallback: find which page is most visible
  const pages = document.querySelectorAll('.page');
  const viewportCenter = window.innerHeight / 2;
  for (let i = 0; i < pages.length; i++) {
    const rect = pages[i].getBoundingClientRect();
    if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Extracts text from PDF.js text layer spans near a given cursor point.
 * PDF.js positions <span> elements over the canvas to match the original
 * PDF text coordinates. We find the page containing the cursor, then
 * gather text from spans that are vertically close to the cursor.
 *
 * @param {number} x - Client X
 * @param {number} y - Client Y
 * @returns {string}
 */
function extractPDFjsTextNearPoint(x, y) {
  // Find the page the cursor is on
  const pages = document.querySelectorAll('.page');
  let targetPage = null;
  for (const page of pages) {
    const rect = page.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) {
      targetPage = page;
      break;
    }
  }

  if (!targetPage) return '';

  const textLayer = targetPage.querySelector('.textLayer');
  if (!textLayer) return '';

  const spans = textLayer.querySelectorAll('span, br');
  const lineGroups = [];  // Group spans by their vertical position
  let currentLine = [];
  let lastTop = -Infinity;

  for (const span of spans) {
    if (span.tagName === 'BR') {
      if (currentLine.length) { lineGroups.push(currentLine); currentLine = []; }
      continue;
    }
    const rect = span.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    // New line if vertical position changed significantly
    if (Math.abs(rect.top - lastTop) > 5 && currentLine.length) {
      lineGroups.push(currentLine);
      currentLine = [];
    }
    currentLine.push({ text: span.textContent, top: rect.top, bottom: rect.bottom });
    lastTop = rect.top;
  }
  if (currentLine.length) lineGroups.push(currentLine);

  // Find the line group closest to the cursor's Y position
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < lineGroups.length; i++) {
    const lineTop = lineGroups[i][0].top;
    const lineBottom = lineGroups[i][0].bottom;
    const mid = (lineTop + lineBottom) / 2;
    const dist = Math.abs(y - mid);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }

  // Grab ~20 lines around the cursor (increased from 10 for better context)
  const startLine = Math.max(0, bestIdx - 10);
  const endLine = Math.min(lineGroups.length, bestIdx + 10);
  const result = [];
  for (let i = startLine; i < endLine; i++) {
    result.push(lineGroups[i].map(s => s.text).join(''));
  }

  return result.join('\n');
}

/**
 * Extracts visible text from an element
 * Limits to MAX_TEXT_LENGTH characters
 * 
 * @param {Element} element - The element to extract text from
 * @returns {string} Extracted text (trimmed and limited)
 */
function extractVisibleText(element) {
  // Get visible text content
  const text = element.innerText || element.textContent || '';
  
  // Clean up whitespace
  const cleaned = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Limit length
  return cleaned.substring(0, MAX_TEXT_LENGTH);
}

/**
 * Extracts text from the page centered around a given point (x, y).
 * Collects visible text lines, finds the closest to the cursor, and returns
 * a window of CONTEXT_LINES_BEFORE + 1 + CONTEXT_LINES_AFTER lines.
 * 
 * @param {number} x - Client X coordinate
 * @param {number} y - Client Y coordinate
 * @returns {string} Centered context text
 */
function extractCenteredTextFromPoint(x, y) {
  // Gather all visible text "lines" with their bounding positions
  const textLines = [];
  
  // Walk visible block-level elements that contain text
  const blockSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, dd, dt, blockquote, figcaption, div, span, label';
  const elements = document.querySelectorAll(blockSelectors);
  
  for (const el of elements) {
    // Skip invisible elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }
    
    // Skip elements that are just containers (have child block elements with text)
    // Only process elements with direct text content
    let hasDirectText = false;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
        hasDirectText = true;
        break;
      }
    }
    
    // For spans and labels, check if parent is already processed block
    const isInlineInBlock = (el.tagName === 'SPAN' || el.tagName === 'LABEL') && 
      el.parentElement && ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV'].includes(el.parentElement.tagName);
    
    if (!hasDirectText && !isInlineInBlock) {
      // Check if it's a leaf element with text content
      if (el.children.length > 0) continue;
    }
    
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length === 0) continue;
    
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue; // Not in viewport
    
    // Split by newlines if the element contains multiple lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;
    
    // Approximate line positions within the element
    const lineHeight = rect.height / Math.max(lines.length, 1);
    for (let i = 0; i < lines.length; i++) {
      const lineTop = rect.top + i * lineHeight;
      const lineMid = lineTop + lineHeight / 2;
      textLines.push({
        text: lines[i],
        top: lineTop,
        mid: lineMid,
        left: rect.left,
        right: rect.right
      });
    }
  }
  
  if (textLines.length === 0) {
    return '';
  }
  
  // Sort lines by their vertical position
  textLines.sort((a, b) => a.mid - b.mid);
  
  // De-duplicate lines (same text at similar vertical positions)
  const uniqueLines = [];
  let lastText = '';
  let lastMid = -Infinity;
  for (const line of textLines) {
    if (line.text === lastText && Math.abs(line.mid - lastMid) < 10) {
      continue;
    }
    uniqueLines.push(line);
    lastText = line.text;
    lastMid = line.mid;
  }
  
  // Find the line closest to the cursor's Y position
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < uniqueLines.length; i++) {
    const dist = Math.abs(uniqueLines[i].mid - y);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  
  // Extract a centered window: CONTEXT_LINES_BEFORE before, target, CONTEXT_LINES_AFTER after
  const startIdx = Math.max(0, closestIdx - CONTEXT_LINES_BEFORE);
  const endIdx = Math.min(uniqueLines.length, closestIdx + CONTEXT_LINES_AFTER + 1);
  
  const contextLines = [];
  for (let i = startIdx; i < endIdx; i++) {
    contextLines.push(uniqueLines[i].text);
  }
  
  return contextLines.join('\n').substring(0, MAX_TEXT_LENGTH);
}

// ============================================================================
// RICH CONTEXT EXTRACTION: Multi-strategy text/metadata gathering
// ============================================================================

/**
 * Consolidates structured context extraction: combines image, ARIA, code, table, and link extraction.
 * Uses a registry pattern to reduce duplication.
 */
function extractStructuredContext(element) {
  const parts = [];

  // Image context (alt text, captions, titles)
  if (element.tagName === 'IMG') {
    if (element.alt) parts.push(`[Image: ${element.alt}]`);
    if (element.title) parts.push(`[Title: ${element.title}]`);
  }
  const images = element.querySelectorAll ? element.querySelectorAll('img') : [];
  for (const img of images) {
    if (img.alt && img.alt.trim()) parts.push(`[Image: ${img.alt.trim()}]`);
    if (img.title && img.title.trim()) parts.push(`[Title: ${img.title.trim()}]`);
  }
  const captions = element.querySelectorAll ? element.querySelectorAll('figcaption') : [];
  for (const cap of captions) {
    const text = cap.textContent.trim();
    if (text) parts.push(`[Caption: ${text}]`);
  }

  // ARIA labels and titles
  const ariaLabel = element.getAttribute && element.getAttribute('aria-label');
  if (ariaLabel) parts.push(`[Aria: ${ariaLabel}]`);
  const titled = element.querySelectorAll ? element.querySelectorAll('[aria-label], [title]') : [];
  for (const el of titled) {
    const label = el.getAttribute('aria-label');
    const title = el.getAttribute('title');
    if (label) parts.push(`[Aria: ${label}]`);
    if (title) parts.push(`[Title: ${title}]`);
  }

  // Code blocks
  const blocks = element.querySelectorAll ? element.querySelectorAll('pre, code') : [];
  for (const block of blocks) {
    const text = block.textContent.trim();
    if (text.length > 10) {
      const lang = block.className.match(/lang(?:uage)?-(\w+)/)?.[1] || '';
      parts.push(`[Code${lang ? '(' + lang + ')' : ''}: ${text.substring(0, 500)}]`);
    }
  }

  // Table content (serialized rows)
  const tables = element.querySelectorAll ? element.querySelectorAll('table') : [];
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    const rowTexts = [];
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      const cellTexts = Array.from(cells).map(c => c.textContent.trim()).filter(Boolean);
      if (cellTexts.length) rowTexts.push(cellTexts.join(' | '));
    }
    if (rowTexts.length) {
      parts.push(`[Table: ${rowTexts.slice(0, 10).join(' /// ')}]`);
    }
  }

  // Link text (up to 10 notable links)
  const links = element.querySelectorAll ? element.querySelectorAll('a[href]') : [];
  let linkCount = 0;
  for (const link of links) {
    if (linkCount >= 10) break;
    const text = link.textContent.trim();
    if (text.length > 3 && text.length < 200) {
      parts.push(`[Link: ${text}]`);
      linkCount++;
    }
  }

  return parts;
}

/** Extracts image-related context (alt text, captions, nearby text)
 * from the element at or near the given point.
 */
function extractImageContext(element) {
  const parts = [];

  // Direct image element
  if (element.tagName === 'IMG') {
    if (element.alt) parts.push(`[Image: ${element.alt}]`);
    if (element.title) parts.push(`[Title: ${element.title}]`);
  }

  // Images inside the container
  const images = element.querySelectorAll ? element.querySelectorAll('img') : [];
  for (const img of images) {
    if (img.alt && img.alt.trim()) parts.push(`[Image: ${img.alt.trim()}]`);
    if (img.title && img.title.trim()) parts.push(`[Title: ${img.title.trim()}]`);
  }

  // Figcaption elements
  const captions = element.querySelectorAll ? element.querySelectorAll('figcaption') : [];
  for (const cap of captions) {
    const text = cap.textContent.trim();
    if (text) parts.push(`[Caption: ${text}]`);
  }

  return parts;
}

/**
 * DEPRECATED: Use extractStructuredContext() instead (consolidated function).
 */
function extractAriaContext(element) {
  const parts = [];
  const ariaLabel = element.getAttribute && element.getAttribute('aria-label');
  if (ariaLabel) parts.push(`[Aria: ${ariaLabel}]`);

  const titled = element.querySelectorAll ? element.querySelectorAll('[aria-label], [title]') : [];
  for (const el of titled) {
    const label = el.getAttribute('aria-label');
    const title = el.getAttribute('title');
    if (label) parts.push(`[Aria: ${label}]`);
    if (title) parts.push(`[Title: ${title}]`);
  }
  return parts;
}

/**
 * DEPRECATED: Use extractStructuredContext() instead (consolidated function).
 */
function extractCodeContext(element) {
  const blocks = element.querySelectorAll ? element.querySelectorAll('pre, code') : [];
  const parts = [];
  for (const block of blocks) {
    const text = block.textContent.trim();
    if (text.length > 10) {
      const lang = block.className.match(/lang(?:uage)?-(\w+)/)?.[1] || '';
      parts.push(`[Code${lang ? '(' + lang + ')' : ''}: ${text.substring(0, 500)}]`);
    }
  }
  return parts;
}

/**
 * DEPRECATED: Use extractStructuredContext() instead (consolidated function).
 */
function extractTableContext(element) {
  const tables = element.querySelectorAll ? element.querySelectorAll('table') : [];
  const parts = [];
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    const rowTexts = [];
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      const cellTexts = Array.from(cells).map(c => c.textContent.trim()).filter(Boolean);
      if (cellTexts.length) rowTexts.push(cellTexts.join(' | '));
    }
    if (rowTexts.length) {
      parts.push(`[Table: ${rowTexts.slice(0, 10).join(' /// ')}]`);
    }
  }
  return parts;
}

/**
 * DEPRECATED: Use extractStructuredContext() instead (consolidated function).
 */
function extractLinkContext(element) {
  const links = element.querySelectorAll ? element.querySelectorAll('a[href]') : [];
  const parts = [];
  for (const link of links) {
    const text = link.textContent.trim();
    if (text.length > 3 && text.length < 200) {
      parts.push(`[Link: ${text}]`);
    }
  }
  return parts.slice(0, 10); // Limit to 10 links
}

/**
 * Extracts page-level metadata: Open Graph, JSON-LD, meta description.
 */
function extractPageMetadata() {
  const parts = [];

  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && metaDesc.content) parts.push(`[Meta: ${metaDesc.content.trim()}]`);

  // Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogTitle && ogTitle.content) parts.push(`[OG Title: ${ogTitle.content.trim()}]`);
  if (ogDesc && ogDesc.content) parts.push(`[OG Desc: ${ogDesc.content.trim()}]`);

  // JSON-LD structured data
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      const name = data.name || data.headline || '';
      const desc = data.description || '';
      if (name) parts.push(`[Schema: ${name}]`);
      if (desc) parts.push(`[Schema Desc: ${desc.substring(0, 300)}]`);
    } catch { /* ignore malformed JSON-LD */ }
  }

  return parts;
}

/**
 * Returns centralized page context fallback: document title or current URL.
 */
function getFallbackPageContext() {
  return document.title || window.location.href;
}

/**
 * Master extraction: combines all strategies to build rich context.
 * Returns the best available text for search query construction.
 */
function extractRichContext(element) {
  const segments = [];

  // 1) Primary: visible text (the baseline)
  const visibleText = extractVisibleText(element);
  if (visibleText) segments.push(visibleText);

  // 2) Structured context (image, ARIA, code, table, links) — consolidated
  segments.push(...extractStructuredContext(element));

  // 7) Page-level metadata (only if visible text is thin)
  if (visibleText.length < 100) {
    segments.push(...extractPageMetadata());
  }

  // De-duplicate and join
  const unique = [...new Set(segments.filter(Boolean))];
  const combined = unique.join('\n');
  return combined.substring(0, MAX_TEXT_LENGTH);
}

/**
 * Resolves a point (x, y) to a semantic container and extracts text.
 * Dispatches to specialised extractors for PDFs, Google Docs, and Slides.
 * Falls back to rich multi-strategy extraction for normal pages.
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object | null} Object with { element, text, url } or null
 */
function resolveTargetFromPoint(x, y) {
  let text = '';
  let container = null;

  // --- Google Docs --------------------------------------------------------
  if (isGoogleDoc) {
    text = extractGoogleDocsText(x, y);
    container = findGoogleDocsContainer(x, y);
    console.log('[ContextGrabber] Google Docs extraction:', text.substring(0, 80));
  }
  // --- Google Slides ------------------------------------------------------
  else if (isGoogleSlides) {
    text = extractGoogleSlidesText(x, y);
    container = findGoogleSlidesContainer(x, y);
    console.log('[ContextGrabber] Google Slides extraction:', text.substring(0, 80));
  }
  // --- PDF (built-in or PDF.js) -------------------------------------------
  else if (isPDF || isPDFjs) {
    text = extractPDFText(x, y);
    container = isPDFjs ? findPDFjsContainer(x, y) : document.body;

    // Enrich with PDF context: page number, zoom, and nearby outline headings
    if (isPDFjs) {
      const pageNum = getCurrentPDFPage();
      const zoom = getPDFZoomLevel();
      const outline = extractPDFOutline();

      // Find the most relevant outline section for current page
      if (outline.length > 0) {
        // Add current section context (simplified: just add top-level outline items)
        const sectionContext = outline
          .filter(item => item.level === 0)
          .slice(0, 5)
          .map(item => item.title)
          .join(' > ');
        if (sectionContext) {
          text = `[Document: ${sectionContext}]\n` + text;
        }
      }

      console.log('[ContextGrabber] PDF page:', pageNum, 'zoom:', (zoom * 100).toFixed(0) + '%');
    }

    console.log('[ContextGrabber] PDF extraction:', text.substring(0, 80));
  }
  // --- Normal web page ----------------------------------------------------
  else {
    container = findSemanticContainer(x, y);
    
    // Use centered text extraction around the cursor point
    const centeredText = extractCenteredTextFromPoint(x, y);
    if (centeredText && centeredText.length > 20) {
      text = centeredText;
      console.log('[ContextGrabber] Using centered context extraction');
    } else if (container) {
      // Fallback to container-based extraction if centered didn't yield enough
      text = extractRichContext(container);
      console.log('[ContextGrabber] Fallback to container extraction');
    }
  }

  if (!container && !text) {
    console.warn('[ContextGrabber] No container or text found at', x, y);
    return null;
  }

  if (text.length === 0) {
    console.warn('[ContextGrabber] No text extracted from container');
    return null;
  }

  return {
    element: container || document.body,
    text: text,
    url: window.location.href
  };
}

// ============================================================================
// OVERLAY: Display analysis results
// ============================================================================

/**
 * Creates and displays the overlay with analysis results
 * 
 * @param {Object} result - Analysis result from backend
 * @param {string} result.summary - Summary text
 * @param {string[]} result.confusion_points - List of confusion points
 * @param {string[]} result.image_queries - List of image queries
 */
/**
 * Creates the persistent overlay (called once on page load)
 * The overlay stays open and its content is updated in-place.
 */
function createPersistentOverlay() {
  console.log('[ContextGrabber] createPersistentOverlay called, currentOverlay:', !!currentOverlay);
  if (currentOverlay) return;

  // Inject styles
  if (!document.getElementById('context-grabber-styles')) {
    const style = document.createElement('style');
    style.id = 'context-grabber-styles';
    style.textContent = getOverlayStyles();
    document.head.appendChild(style);
    console.log('[ContextGrabber] Styles injected');
  }

  const overlay = document.createElement('div');
  overlay.id = 'context-grabber-overlay';
  overlay.className = 'cg-overlay';
  overlay.innerHTML = `
    <div class="cg-overlay-content">
      <div class="cg-overlay-header">
        <div class="cg-header-row-1">
          <div class="cg-title-container">
            <img src="${chrome.runtime.getURL('logo.png')}" alt="ThirdEye Logo" class="cg-logo" />
            <span class="cg-title">ThirdEye</span>
          </div>
          <span class="cg-status" id="cg-status">Watching...</span>
          <div class="cg-user-info" id="cg-user-info" style="display:none;">
            <button class="cg-user-profile-btn" id="cg-user-profile-btn" title="Open Profile">
              <img class="cg-user-avatar" id="cg-user-avatar" src="" alt="User" />
              <span class="cg-user-name" id="cg-user-name"></span>
            </button>
          </div>
        </div>
        <div class="cg-header-row-2">
          <div class="cg-header-buttons">
            <button class="cg-btn-text-icon" id="cg-close-session-btn" title="Close Session and Save to Notebook">
              <svg class="cg-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <span class="cg-btn-text">Close Session</span>
            </button>
            <button class="cg-toggle-btn" id="cg-toggle-btn" aria-label="Toggle extension" title="Toggle on/off (Ctrl+Shift+G)">&#9654;</button>
            <button class="cg-btn-text-icon" id="cg-chat-btn" aria-label="Expand to Chat" title="Expand to Chat">
              <svg class="cg-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span class="cg-btn-text">Chat</span>
            </button>
            <button class="cg-minimize-btn" aria-label="Resize panel" title="Resize panel">&#8212;</button>
            <button class="cg-dock-btn" id="cg-dock-btn" aria-label="Dock to corner" title="Dock to corner">&#8690;</button>
          </div>
        </div>
      </div>
      <div class="cg-body" id="cg-body">
        <div class="cg-section"><p class="cg-hint">Hover over content for ${DWELL_TIME_MS / 1000}s to search.<br><em>Ctrl+Shift+G to toggle, or click &#9654;</em></p></div>
      </div>
      <div class="cg-quick-chat-container" id="cg-quick-chat-container" style="display:none;">
        <div class="cg-quick-chat-input-wrapper">
          <button class="cg-chat-expand-btn" id="cg-chat-expand-btn" title="Expand chat input">
            <svg class="cg-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
          <textarea 
            id="cg-quick-chat-input" 
            class="cg-quick-chat-input" 
            placeholder="Ask a question about the content..."
            rows="1"
          ></textarea>
          <button id="cg-quick-chat-send" class="cg-quick-chat-send-btn">➤</button>
        </div>
      </div>
    </div>
    <div class="cg-docked-icon" id="cg-docked-icon" style="display:none" title="Expand ThirdEye">
      <img src="${chrome.runtime.getURL('logo.png')}" alt="ThirdEye" class="cg-docked-logo" />
    </div>
  `;

  document.body.appendChild(overlay);
  currentOverlay = overlay;
  overlayVisible = true;
  console.log('[ContextGrabber] Overlay appended to body, visible:', overlayVisible);
  
  // Load user info after overlay is created
  setTimeout(() => {
    syncUserInfoFromReactApp();
    loadUserInfo();
  }, 100);

  // Toggle button: enable/disable extension
  const toggleBtn = overlay.querySelector('#cg-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    toggleExtension();
    updateToggleButton();
  });
  updateToggleButton(); // Set initial state

  // Minimize/restore toggle - minimize height instead of width
  const minimizeBtn = overlay.querySelector('.cg-minimize-btn');
  const body = overlay.querySelector('#cg-body');
  const quickChatContainer = overlay.querySelector('#cg-quick-chat-container');
  const NORMAL_MAX_HEIGHT = '80vh';
  
  // Restore minimize state if it was set
  if (isMinimized) {
    overlay.style.maxHeight = 'auto';
    overlay.style.height = 'auto';
    if (body) body.style.display = 'none';
    if (quickChatContainer) quickChatContainer.style.display = 'none';
    minimizeBtn.innerHTML = '&#9744;';
    minimizeBtn.setAttribute('title', 'Expand panel');
  } else {
    overlay.style.maxHeight = NORMAL_MAX_HEIGHT;
    overlay.style.height = 'auto';
    if (body) body.style.display = 'block';
    minimizeBtn.innerHTML = '&#8212;';
    minimizeBtn.setAttribute('title', 'Minimize panel');
  }
  
  minimizeBtn.addEventListener('click', () => {
    // If chatbot is expanded, collapse it first (but don't reset minimize state)
    const wasChatbotExpanded = chatbotExpanded;
    if (chatbotExpanded) {
      // Temporarily save minimize state
      const savedMinimized = isMinimized;
      collapseChatbotPanel();
      // Restore minimize state since collapseChatbotPanel resets it
      isMinimized = savedMinimized;
    }
    
    // Toggle minimize state
    isMinimized = !isMinimized;
    
    if (isMinimized) {
      // Minimize: hide body and chat, show only header
      overlay.style.maxHeight = 'auto';
      overlay.style.height = 'auto';
      if (body) body.style.display = 'none';
      if (quickChatContainer) quickChatContainer.style.display = 'none';
      minimizeBtn.innerHTML = '&#9744;'; // Square icon (expand)
      minimizeBtn.setAttribute('title', 'Expand panel');
    } else {
      // Restore: show content and restore original size
      overlay.style.maxHeight = NORMAL_MAX_HEIGHT;
      overlay.style.height = 'auto';
      if (body) body.style.display = 'block';
      // Quick chat will show/hide based on its own logic
      minimizeBtn.innerHTML = '&#8212;'; // Horizontal line (minimize)
      minimizeBtn.setAttribute('title', 'Minimize panel');
    }
  });

  // Load user info and display Google account
  loadUserInfo();
  
  // User profile button - link to webpage
  const userProfileBtn = overlay.querySelector('#cg-user-profile-btn');
  if (userProfileBtn) {
    userProfileBtn.addEventListener('click', () => {
      openPersonalDashboard();
    });
  }
  
  // Close Session button
  const closeSessionBtn = overlay.querySelector('#cg-close-session-btn');
  closeSessionBtn.addEventListener('click', () => {
    closeSessionAndSave();
  });
  
  // Chat button: expand overlay height to show chat
  const chatBtn = overlay.querySelector('#cg-chat-btn');
  chatBtn.addEventListener('click', () => {
    toggleChatbotPanel();
  });
  
  // Quick chat input (bottom bar)
  const quickChatInput = overlay.querySelector('#cg-quick-chat-input');
  const quickChatSend = overlay.querySelector('#cg-quick-chat-send');
  const chatExpandBtn = overlay.querySelector('#cg-chat-expand-btn');
  let chatInputExpanded = false;
  
  if (quickChatInput && quickChatSend) {
    quickChatSend.addEventListener('click', () => sendQuickChatMessage());
    quickChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendQuickChatMessage();
      }
    });
  }
  
  // Chat expand button
  if (chatExpandBtn && quickChatInput) {
    chatExpandBtn.addEventListener('click', () => {
      chatInputExpanded = !chatInputExpanded;
      if (chatInputExpanded) {
        quickChatInput.style.height = '120px';
        quickChatInput.rows = 5;
        chatExpandBtn.querySelector('svg').style.transform = 'rotate(180deg)';
      } else {
        quickChatInput.style.height = 'auto';
        quickChatInput.rows = 1;
        chatExpandBtn.querySelector('svg').style.transform = 'rotate(0deg)';
      }
    });
  }

  // Dock/undock toggle
  const dockBtn = overlay.querySelector('#cg-dock-btn');
  const dockedIcon = overlay.querySelector('#cg-docked-icon');
  const overlayContent = overlay.querySelector('.cg-overlay-content');
  
  dockBtn.addEventListener('click', () => {
    overlayDocked = true;
    overlay.classList.add('cg-docked');
    overlayContent.style.display = 'none';
    dockedIcon.style.display = 'flex';
  });
  
  dockedIcon.addEventListener('click', () => {
    overlayDocked = false;
    overlay.classList.remove('cg-docked');
    overlayContent.style.display = 'block';
    dockedIcon.style.display = 'none';
  });

  // Don't trigger dwell when hovering the overlay itself
  overlay.addEventListener('mouseenter', () => {
    isHoveringOverlay = true;
    dwellAnchor = null;
  });
  overlay.addEventListener('mouseleave', () => {
    isHoveringOverlay = false;
    dwellAnchor = null;   // Reset so a fresh dwell starts from the new position
  });
}

/**
 * Updates the overlay body content in-place
 * @param {string} html - New HTML content for the body
 */
function updateOverlayContent(html) {
  if (!currentOverlay) createPersistentOverlay();
  const body = currentOverlay.querySelector('#cg-body');
  const overlayContent = currentOverlay.querySelector('.cg-overlay-content');
  
  // Save current tab state before updating
  const currentActiveTab = activeTab || 'summary';
  
  if (body) {
    body.innerHTML = html;
    // Ensure body is visible (in case overlay was minimized)
    body.style.display = 'block';
    // Ensure overlay is visible and expanded
    if (currentOverlay) {
      currentOverlay.style.display = 'block';
      currentOverlay.style.visibility = 'visible';
      currentOverlay.style.maxHeight = '80vh'; // Ensure it's expanded
      currentOverlay.style.height = 'auto';
    }
    // Ensure overlay content is visible
    if (overlayContent) {
      overlayContent.style.display = 'block';
    }
    
    // Restore tab state after innerHTML update
    // Re-attach tab event listeners if tabs exist
    const tabBar = currentOverlay.querySelector('.cg-tab-bar');
    if (tabBar) {
      // Remove any existing listeners by checking if handler exists
      // Use a data attribute to track if listener is attached
      if (!tabBar.dataset.tabListenerAttached) {
        tabBar.dataset.tabListenerAttached = 'true';
        
        // Attach event listener using event delegation (survives innerHTML updates)
        tabBar.addEventListener('click', function tabClickHandler(e) {
          const tab = e.target.closest('.cg-tab');
          if (!tab) return;
          
          e.preventDefault();
          e.stopPropagation();
          
          const panelId = tab.dataset.tab;
          if (!panelId) return;
          
          // Update active tab
          const tabs = tabBar.querySelectorAll('.cg-tab');
          tabs.forEach(t => t.classList.remove('cg-tab-active'));
          tab.classList.add('cg-tab-active');
          
          // Show/hide panels
          const summaryPanel = currentOverlay.querySelector('#cg-panel-summary');
          const explanationPanel = currentOverlay.querySelector('#cg-panel-explanation');
          const resourcesPanel = currentOverlay.querySelector('#cg-panel-resources');
          
          if (summaryPanel) summaryPanel.style.display = panelId === 'summary' ? 'block' : 'none';
          if (explanationPanel) explanationPanel.style.display = panelId === 'explanation' ? 'block' : 'none';
          if (resourcesPanel) resourcesPanel.style.display = panelId === 'resources' ? 'block' : 'none';
          
          activeTab = panelId;
        }, { capture: false });
      }
      
      // Restore active tab state
      const tabs = tabBar.querySelectorAll('.cg-tab');
      tabs.forEach(t => {
        if (t.dataset.tab === currentActiveTab) {
          t.classList.add('cg-tab-active');
        } else {
          t.classList.remove('cg-tab-active');
        }
      });
      
      // Show/hide panels based on active tab
      const summaryPanel = currentOverlay.querySelector('#cg-panel-summary');
      const explanationPanel = currentOverlay.querySelector('#cg-panel-explanation');
      const resourcesPanel = currentOverlay.querySelector('#cg-panel-resources');
      
      if (summaryPanel) summaryPanel.style.display = currentActiveTab === 'summary' ? 'block' : 'none';
      if (explanationPanel) explanationPanel.style.display = currentActiveTab === 'explanation' ? 'block' : 'none';
      if (resourcesPanel) resourcesPanel.style.display = currentActiveTab === 'resources' ? 'block' : 'none';
    }
  }
  // #region agent log
  const debugUpdateContent = {location:'content.js:1872',message:'updateOverlayContent called',data:{hasOverlay:!!currentOverlay,hasBody:!!body,hasOverlayContent:!!overlayContent,htmlLength:html?.length||0,bodyDisplay:body?.style?.display,overlayDisplay:currentOverlay?.style?.display},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
  console.log('[DEBUG]', JSON.stringify(debugUpdateContent));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugUpdateContent)}).catch(()=>{});
  // #endregion
}

/**
 * Updates the status indicator text
 * @param {string} text - Status text
 */
function setOverlayStatus(text) {
  if (!currentOverlay) createPersistentOverlay();
  if (!currentOverlay) return;
  const status = currentOverlay.querySelector('#cg-status');
  if (status) status.textContent = text;
}

/**
 * Shows an error message in the overlay with dark theme styling
 * @param {string} title - Error title
 * @param {string} message - Error message
 */
function showErrorOverlay(title, message) {
  if (!currentOverlay) createPersistentOverlay();
  const html = `
    <div class="cg-error">
      <div class="cg-error-title">${escapeHtml(title)}</div>
      <p class="cg-error-message">${escapeHtml(message)}</p>
    </div>
    <div class="cg-section">
      <p class="cg-hint">You can still use text-based search by hovering over content.</p>
    </div>
  `;
  updateOverlayContent(html);
  setOverlayStatus('Error');
}

/**
 * Shows an info message in the overlay with dark theme styling
 * @param {string} title - Info title
 * @param {string} message - Info message
 */
function showInfoOverlay(title, message) {
  if (!currentOverlay) createPersistentOverlay();
  const html = `
    <div class="cg-info">
      <div class="cg-info-title">${escapeHtml(title)}</div>
      <p class="cg-info-message">${escapeHtml(message)}</p>
    </div>
  `;
  updateOverlayContent(html);
  setOverlayStatus('Info');
}

/**
 * Shows analysis results from the analysis API in the overlay
 */
function showOverlay(result) {
  let html = '';

  if (result.summary) {
    html += `<div class="cg-section"><strong>Summary</strong><p>${escapeHtml(result.summary)}</p></div>`;
  }

  if (result.confusion_points && result.confusion_points.length > 0) {
    html += '<div class="cg-section"><strong>Questions/Confusion</strong><ul>';
    result.confusion_points.forEach(point => {
      html += `<li>${escapeHtml(point)}</li>`;
    });
    html += '</ul></div>';
  }

  if (result.image_queries && result.image_queries.length > 0) {
    html += '<div class="cg-section"><strong>Helpful Images</strong><ul>';
    result.image_queries.forEach(query => {
      html += `<li><em>${escapeHtml(query)}</em></li>`;
    });
    html += '</ul></div>';
  }

  // Add "Save to Notebook" button
  html += `
    <div class="cg-section">
      <button class="cg-save-notebook-btn" id="cg-save-notebook-btn">
        📝 Save to Notebook
      </button>
    </div>
  `;

  updateOverlayContent(html);
  setOverlayStatus('Analysis ready');
  
  // Wire up save button
  setTimeout(() => {
    const saveBtn = currentOverlay?.querySelector('#cg-save-notebook-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => saveToNotebook(result));
    }
  }, 100);
}

/**
 * Saves current context to notebook
 */
async function saveToNotebook(analysisResult) {
  chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' }, async (response) => {
    const sessionId = response?.sessionId;
    if (!sessionId) {
      alert('No active session. Please enable the extension first.');
      return;
    }
    
    const lastCapture = recentCaptures[recentCaptures.length - 1];
    const content = `
# ${document.title || 'Untitled'}

## Summary
${analysisResult.summary || 'No summary available'}

## Context
${lastCapture ? escapeHtml(lastCapture.text) : 'No context captured'}

## Confusion Points
${analysisResult.confusion_points?.map(p => `- ${p}`).join('\n') || 'None'}

## Source
URL: ${window.location.href}
Captured: ${new Date().toISOString()}
    `.trim();
    
    chrome.runtime.sendMessage({
      type: 'CREATE_NOTEBOOK_ENTRY',
      data: {
        sessionId: sessionId,
        title: `${document.title || 'Untitled'} - ${new Date().toLocaleDateString()}`,
        content: content,
        context: {
          url: window.location.href,
          text: lastCapture?.text || '',
          searchQuery: analysisResult.image_queries?.[0] || ''
        }
      }
    }, (response) => {
      if (response?.success) {
        setOverlayStatus('Saved to notebook!');
        const saveBtn = currentOverlay?.querySelector('#cg-save-notebook-btn');
        if (saveBtn) {
          saveBtn.textContent = '✓ Saved!';
          saveBtn.disabled = true;
          setTimeout(() => {
            saveBtn.textContent = '📝 Save to Notebook';
            saveBtn.disabled = false;
          }, 2000);
        }
      } else {
        alert('Failed to save to notebook: ' + (response?.error || 'Unknown error'));
      }
    });
  });
}

/**
 * Gets the CSS styles for the overlay
 * Positioning and styling to not block page interaction
 */
function getOverlayStyles() {
  return `
    #context-grabber-overlay {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 380px;
      max-height: 80vh;
      background: hsl(0, 0%, 12.5%); /* #201f20 - matches frontend background */
      border: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      pointer-events: auto;
      font-feature-settings: "rlig" 1, "calt" 1;
      display: flex;
      flex-direction: column;
      transition: max-height 0.3s ease, height 0.3s ease;
    }

    .cg-overlay-content {
      padding: 16px;
      padding-bottom: 80px; /* Space for chat input at bottom */
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
      font-size: 14px;
      line-height: 1.5;
      position: relative;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      word-wrap: break-word;
      word-break: break-word;
    }

    .cg-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;
      margin: 0;
      padding: 0;
      word-wrap: break-word;
      word-break: break-word;
    }

    .cg-section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
    }

    .cg-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .cg-section strong {
      display: block;
      margin-bottom: 8px;
      color: hsl(0, 0%, 43.1%); /* matches frontend primary */
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cg-section p {
      margin: 0;
      padding: 0;
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    /* General paragraph styling for overlay */
    #context-grabber-overlay p {
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    .cg-section ul {
      margin: 0;
      padding-left: 20px;
      list-style: disc;
    }

    .cg-section li {
      margin: 4px 0;
      padding: 0;
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    /* Prevent text selection while maintaining readability */
    #context-grabber-overlay {
      user-select: text;
    }

    /* Scrollbar styling - dark theme */
    #context-grabber-overlay::-webkit-scrollbar {
      width: 6px;
    }

    #context-grabber-overlay::-webkit-scrollbar-track {
      background: hsl(0, 0%, 14.9%); /* matches frontend secondary */
      border-radius: 3px;
    }

    #context-grabber-overlay::-webkit-scrollbar-thumb {
      background: hsl(0, 0%, 18%); /* matches frontend muted */
      border-radius: 3px;
    }

    #context-grabber-overlay::-webkit-scrollbar-thumb:hover {
      background: hsl(0, 0%, 25%);
    }

    /* Overlay header bar - 2 rows */
    .cg-overlay-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 10px;
      margin-bottom: 10px;
      border-bottom: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
    }

    .cg-header-row-1 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .cg-header-row-2 {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      width: 100%;
      flex-wrap: wrap;
      gap: 4px;
    }

    .cg-title-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cg-logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .cg-title {
      font-weight: 700;
      font-size: 14px;
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    .cg-status {
      font-size: 11px;
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      flex: 1;
      text-align: right;
      margin-right: 8px;
    }

    .cg-minimize-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .cg-minimize-btn:hover {
      background: hsl(0, 0%, 18%); /* matches frontend muted */
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    .cg-toggle-btn {
      background: hsl(0, 0%, 43.1%); /* matches frontend primary */
      border: none;
      font-size: 12px;
      cursor: pointer;
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
      margin-right: 4px;
    }

    .cg-toggle-btn:hover {
      background: hsl(0, 0%, 50%);
    }

    .cg-toggle-btn.cg-toggle-paused {
      background: hsl(0, 62.8%, 30.6%); /* matches frontend destructive */
    }

    .cg-toggle-btn.cg-toggle-paused:hover {
      background: hsl(0, 62.8%, 35%);
    }

    .cg-dock-btn {
      background: none;
      border: none;
      font-size: 14px;
      cursor: pointer;
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .cg-dock-btn:hover {
      background: hsl(0, 0%, 18%); /* matches frontend muted */
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    /* Docked (compact) mode - small floating icon */
    .cg-docked-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, hsl(0, 0%, 43.1%), hsl(0, 0%, 35%)); /* matches frontend primary gradient */
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      transition: all 0.2s;
    }

    .cg-docked-icon:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    }

    .cg-docked-logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    /* When docked, shrink the overlay container */
    #context-grabber-overlay.cg-docked {
      width: auto;
      max-height: none;
      background: transparent;
      border: none;
      box-shadow: none;
      overflow: visible;
    }

    .cg-hint {
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      font-style: italic;
    }

    .cg-loading {
      color: hsl(0, 0%, 43.1%); /* matches frontend primary */
      font-style: italic;
      padding: 8px 0;
    }

    /* Search result items */
    .cg-result-item {
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
    }

    .cg-result-item:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .cg-result-title {
      color: hsl(0, 0%, 70%); /* lighter gray for links */
      text-decoration: none;
      font-size: 15px;
      font-weight: 500;
      display: block;
      margin-bottom: 2px;
      cursor: pointer;
    }

    .cg-result-title:hover {
      color: hsl(0, 0%, 43.1%); /* matches frontend primary */
      text-decoration: underline;
    }

    .cg-result-url {
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      font-size: 12px;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .cg-result-snippet {
      color: hsl(0, 0%, 80%); /* slightly lighter than foreground for readability */
      font-size: 13px;
      line-height: 1.4;
    }

    /* Snapshot preview */
    .cg-snapshot-wrap {
      border: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
      border-radius: 4px;
      overflow: hidden;
      max-height: 200px;
    }

    .cg-snapshot-img {
      width: 100%;
      max-width: 100%;
      height: auto;
      display: block;
      object-fit: contain;
    }

    /* Tab bar */
    .cg-tab-bar {
      display: flex;
      border-bottom: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
      margin-bottom: 12px;
    }

    .cg-tab {
      background: none;
      border: none;
      padding: 6px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .cg-tab:hover {
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    .cg-tab-active {
      color: hsl(0, 0%, 43.1%); /* matches frontend primary */
      border-bottom-color: hsl(0, 0%, 43.1%); /* matches frontend primary */
    }

    /* Image grid */
    .cg-image-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .cg-image-card {
      border: 1px solid hsl(0, 0%, 18%); /* matches frontend border */
      border-radius: 4px;
      overflow: hidden;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      transition: box-shadow 0.2s;
      background: hsl(0, 0%, 14.9%); /* matches frontend secondary */
    }

    .cg-image-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      border-color: hsl(0, 0%, 25%);
    }

    .cg-image-card img {
      width: 100%;
      max-width: 100%;
      height: 100px;
      object-fit: cover;
      display: block;
    }

    .cg-image-label {
      font-size: 11px;
      color: hsl(0, 0%, 63.9%); /* matches frontend muted-foreground */
      padding: 4px 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Tab panel styling */
    .cg-tab-panel {
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
      overflow-y: auto;
      max-height: calc(80vh - 200px);
      min-height: 200px;
      padding-right: 8px;
    }
    
    .cg-tab-panel::-webkit-scrollbar {
      width: 6px;
    }
    
    .cg-tab-panel::-webkit-scrollbar-track {
      background: hsl(0, 0%, 14.9%);
      border-radius: 3px;
    }
    
    .cg-tab-panel::-webkit-scrollbar-thumb {
      background: hsl(0, 0%, 18%);
      border-radius: 3px;
    }
    
    .cg-tab-panel::-webkit-scrollbar-thumb:hover {
      background: hsl(0, 0%, 25%);
    }

    /* Chatbot panel styles */
    .cg-chat-btn {
      /* Uses .cg-btn-text-icon styles */
    }

    /* Expanded chatbot panel - expands height, keeps width */
    #context-grabber-overlay.cg-chatbot-expanded {
      width: 380px !important;
      max-height: 90vh !important;
      height: auto !important;
      top: 16px !important;
      right: 16px !important;
      bottom: auto !important;
      display: flex;
      flex-direction: column;
    }

    #context-grabber-overlay.cg-chatbot-expanded .cg-overlay-content {
      padding-bottom: 16px; /* Normal padding when expanded */
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    #context-grabber-overlay.cg-chatbot-expanded .cg-body {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    /* Hide quick chat container when chatbot is expanded */
    #context-grabber-overlay.cg-chatbot-expanded .cg-quick-chat-container {
      display: none !important;
    }

    .cg-chat-context-section {
      padding: 12px;
      border-bottom: 1px solid hsl(0, 0%, 18%);
      background: hsl(0, 0%, 14.9%);
      max-height: 150px;
      overflow-y: auto;
    }

    .cg-chat-context-title {
      font-size: 11px;
      font-weight: 600;
      color: hsl(0, 0%, 43.1%);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .cg-chat-context-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cg-chat-context-item {
      padding: 8px;
      background: hsl(0, 0%, 12.5%);
      border: 1px solid hsl(0, 0%, 18%);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .cg-chat-context-item:hover {
      background: hsl(0, 0%, 18%);
      border-color: hsl(0, 0%, 25%);
    }

    .cg-chat-context-text {
      font-size: 12px;
      color: hsl(0, 0%, 80%);
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .cg-chat-context-time {
      font-size: 10px;
      color: hsl(0, 0%, 63.9%);
    }

    .cg-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .cg-chat-empty {
      text-align: center;
      color: hsl(0, 0%, 63.9%);
      font-style: italic;
      padding: 40px 20px;
    }

    .cg-chat-message {
      display: flex;
      flex-direction: column;
      max-width: 85%;
      animation: fadeIn 0.3s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cg-chat-message-user {
      align-self: flex-end;
    }

    .cg-chat-message-assistant {
      align-self: flex-start;
    }

    .cg-chat-message-content {
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .cg-chat-message-user .cg-chat-message-content {
      background: hsl(0, 0%, 43.1%);
      color: hsl(0, 0%, 98%);
      border-bottom-right-radius: 4px;
    }

    .cg-chat-message-assistant .cg-chat-message-content {
      background: hsl(0, 0%, 18%);
      color: hsl(0, 0%, 98%);
      border-bottom-left-radius: 4px;
    }

    .cg-chat-message-content code {
      background: hsl(0, 0%, 14.9%);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }

    .cg-chat-message-content strong {
      font-weight: 600;
    }

    .cg-chat-message-content em {
      font-style: italic;
    }

    .cg-chat-message-time {
      font-size: 10px;
      color: hsl(0, 0%, 63.9%);
      margin-top: 4px;
      padding: 0 4px;
    }

    .cg-chat-input-container {
      display: flex;
      padding: 12px;
      border-top: 1px solid hsl(0, 0%, 18%);
      background: hsl(0, 0%, 12.5%);
      gap: 8px;
      align-items: flex-end;
    }

    .cg-chat-input {
      flex: 1;
      background: hsl(0, 0%, 14.9%);
      border: 1px solid hsl(0, 0%, 18%);
      border-radius: 8px;
      padding: 10px 12px;
      color: hsl(0, 0%, 98%);
      font-size: 14px;
      font-family: inherit;
      resize: none;
      max-height: 120px;
      line-height: 1.5;
    }

    .cg-chat-input:focus {
      outline: none;
      border-color: hsl(0, 0%, 43.1%);
    }

    .cg-chat-input::placeholder {
      color: hsl(0, 0%, 63.9%);
    }

    .cg-chat-send-btn {
      background: hsl(0, 0%, 43.1%);
      border: none;
      border-radius: 8px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: hsl(0, 0%, 98%);
      font-size: 18px;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .cg-chat-send-btn:hover:not(:disabled) {
      background: hsl(0, 0%, 50%);
    }

    .cg-chat-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cg-chat-resize-handle {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      cursor: ew-resize;
      background: transparent;
      z-index: 10;
    }

    .cg-chat-resize-handle:hover {
      background: hsl(0, 0%, 43.1%);
    }

    /* Save to Notebook button */
    .cg-save-notebook-btn {
      width: 100%;
      padding: 10px 16px;
      background: hsl(0, 0%, 43.1%);
      border: none;
      border-radius: 6px;
      color: hsl(0, 0%, 98%);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
    }

    .cg-save-notebook-btn:hover:not(:disabled) {
      background: hsl(0, 0%, 50%);
    }

    .cg-save-notebook-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* User info display */
    .cg-user-info {
      display: flex;
      align-items: center;
      margin-left: auto;
    }

    .cg-user-profile-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: hsl(0, 0%, 14.9%);
      border: none;
      border-radius: 12px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .cg-user-profile-btn:hover {
      background: hsl(0, 0%, 18%);
    }

    .cg-user-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
      pointer-events: none;
    }

    .cg-user-name {
      color: hsl(0, 0%, 80%);
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: none;
    }

    /* Header buttons container */
    .cg-header-buttons {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Text + Icon buttons */
    .cg-btn-text-icon {
      background: none;
      border: none;
      cursor: pointer;
      color: hsl(0, 0%, 63.9%);
      padding: 6px 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 6px;
      transition: all 0.2s;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
    }

    .cg-btn-text-icon:hover {
      background: hsl(0, 0%, 18%);
      color: hsl(0, 0%, 98%);
    }

    .cg-btn-text-icon:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cg-btn-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .cg-btn-text {
      font-size: 13px;
      line-height: 1;
    }

    /* Close Session button */
    .cg-close-session-btn {
      /* Uses .cg-btn-text-icon styles */
      color: hsl(0, 62.8%, 50%);
    }

    .cg-close-session-btn:hover {
      background: hsl(0, 62.8%, 20%);
      color: hsl(0, 62.8%, 70%);
    }

    /* Quick chat input container (bottom bar) - fixed at bottom */
    .cg-quick-chat-container {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid hsl(0, 0%, 18%);
      padding: 12px;
      background: hsl(0, 0%, 12.5%);
      z-index: 10;
    }

    .cg-quick-chat-input-wrapper {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .cg-chat-expand-btn {
      background: hsl(0, 0%, 14.9%);
      border: 1px solid hsl(0, 0%, 18%);
      border-radius: 6px;
      width: 32px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: hsl(0, 0%, 63.9%);
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .cg-chat-expand-btn:hover {
      background: hsl(0, 0%, 18%);
      color: hsl(0, 0%, 98%);
    }

    .cg-chat-expand-btn svg {
      width: 14px;
      height: 14px;
      transition: transform 0.2s;
    }

    .cg-quick-chat-input {
      flex: 1;
      background: hsl(0, 0%, 14.9%);
      border: 1px solid hsl(0, 0%, 18%);
      border-radius: 8px;
      padding: 8px 12px;
      color: hsl(0, 0%, 98%);
      font-size: 13px;
      font-family: inherit;
      resize: none;
      max-height: 80px;
      line-height: 1.4;
      min-height: 36px;
    }

    .cg-quick-chat-input:focus {
      outline: none;
      border-color: hsl(0, 0%, 43.1%);
    }

    .cg-quick-chat-input::placeholder {
      color: hsl(0, 0%, 63.9%);
    }

    .cg-quick-chat-send-btn {
      background: hsl(0, 0%, 43.1%);
      border: none;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: hsl(0, 0%, 98%);
      font-size: 16px;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .cg-quick-chat-send-btn:hover:not(:disabled) {
      background: hsl(0, 0%, 50%);
    }

    .cg-quick-chat-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Results container */
    .cg-results {
      color: hsl(0, 0%, 98%); /* matches frontend foreground */
    }

    /* Error message styling */
    .cg-error {
      padding: 12px;
      background: hsl(0, 62.8%, 20%); /* darker destructive color for background */
      border: 1px solid hsl(0, 62.8%, 30.6%); /* matches frontend destructive */
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .cg-error-title {
      font-weight: 600;
      font-size: 14px;
      color: hsl(0, 62.8%, 60%); /* lighter destructive for text */
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cg-error-title::before {
      content: '⚠';
      font-size: 16px;
    }

    .cg-error-message {
      font-size: 13px;
      color: hsl(0, 0%, 80%); /* slightly lighter than foreground */
      line-height: 1.5;
      margin: 0;
    }

    /* Info message styling */
    .cg-info {
      padding: 12px;
      background: hsl(0, 0%, 18%); /* matches frontend muted */
      border: 1px solid hsl(0, 0%, 25%);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .cg-info-title {
      font-weight: 600;
      font-size: 14px;
      color: hsl(0, 0%, 43.1%); /* matches frontend primary */
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cg-info-title::before {
      content: 'ℹ';
      font-size: 16px;
    }

    .cg-info-message {
      font-size: 13px;
      color: hsl(0, 0%, 80%);
      line-height: 1.5;
      margin: 0;
    }
  `;
}

/**
 * Escapes HTML to prevent injection
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// CHATBOT PANEL: Expandable right-side chat interface
// ============================================================================

/**
 * Toggles the chatbot panel - expands overlay height to show chat
 */
function toggleChatbotPanel() {
  chatbotExpanded = !chatbotExpanded;
  
  if (!currentOverlay) {
    createPersistentOverlay();
  }
  
  if (chatbotExpanded) {
    expandChatbotPanel();
  } else {
    collapseChatbotPanel();
  }
  
  // Save state to storage
  chrome.storage.local.set({ chatbotExpanded, chatbotPanelWidth });
}

/**
 * Creates the chat popup window element
 */
function createChatPopup() {
  const popup = document.createElement('div');
  popup.id = 'cg-chat-popup';
  popup.className = 'cg-chat-popup';
  
  const recentContextHTML = recentCaptures.length > 0
    ? `
      <div class="cg-chat-context-section">
        <div class="cg-chat-context-title">Recent Context</div>
        <div class="cg-chat-context-list">
          ${recentCaptures.slice(0, 5).map((capture, idx) => `
            <div class="cg-chat-context-item" data-capture-idx="${idx}">
              <div class="cg-chat-context-text">${escapeHtml(capture.text.substring(0, 100))}${capture.text.length > 100 ? '...' : ''}</div>
              <div class="cg-chat-context-time">${new Date(capture.timestamp).toLocaleTimeString()}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';
  
  popup.innerHTML = `
    <div class="cg-chat-popup-header">
      <span class="cg-chat-popup-title">Chat</span>
      <button class="cg-chat-popup-close" id="cg-chat-popup-close" aria-label="Close chat">×</button>
    </div>
    ${recentContextHTML}
    <div class="cg-chat-messages" id="cg-chat-messages">
      <div class="cg-chat-empty">Start a conversation! Ask questions about the content you're viewing.</div>
    </div>
    <div class="cg-chat-input-container">
      <textarea 
        id="cg-chat-input" 
        class="cg-chat-input" 
        placeholder="Ask a question about the content..."
        rows="2"
      ></textarea>
      <button id="cg-chat-send" class="cg-chat-send-btn">➤</button>
    </div>
  `;
  
  // Add close button handler
  const closeBtn = popup.querySelector('#cg-chat-popup-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatbotExpanded = false;
      popup.style.display = 'none';
      chrome.storage.local.set({ chatbotExpanded });
    });
  }
  
  // Add styles if not already added
  if (!document.getElementById('cg-chat-popup-styles')) {
    const style = document.createElement('style');
    style.id = 'cg-chat-popup-styles';
    style.textContent = `
      .cg-chat-popup {
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 400px;
        max-height: 600px;
        background: hsl(0, 0%, 12.5%);
        border: 1px solid hsl(0, 0%, 18%);
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s ease;
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .cg-chat-popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid hsl(0, 0%, 18%);
        background: hsl(0, 0%, 14.9%);
      }
      
      .cg-chat-popup-title {
        font-weight: 600;
        font-size: 14px;
        color: hsl(0, 0%, 98%);
      }
      
      .cg-chat-popup-close {
        background: none;
        border: none;
        color: hsl(0, 0%, 63.9%);
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
        line-height: 1;
      }
      
      .cg-chat-popup-close:hover {
        background: hsl(0, 0%, 18%);
        color: hsl(0, 0%, 98%);
      }
      
      .cg-chat-popup .cg-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        min-height: 200px;
        max-height: 400px;
      }
      
      .cg-chat-popup .cg-chat-input-container {
        border-top: 1px solid hsl(0, 0%, 18%);
        padding: 12px;
        background: hsl(0, 0%, 12.5%);
      }
    `;
    document.head.appendChild(style);
  }
  
  return popup;
}

/**
 * Expands the overlay height to show chatbot interface (keeps width at 380px)
 */
function expandChatbotPanel() {
  if (!currentOverlay) return;
  
  currentOverlay.classList.add('cg-chatbot-expanded');
  // Keep width at 380px, expand height
  currentOverlay.style.width = '380px';
  currentOverlay.style.maxHeight = '90vh';
  currentOverlay.style.height = 'auto';
  // Keep position
  currentOverlay.style.top = '16px';
  currentOverlay.style.right = '16px';
  currentOverlay.style.bottom = 'auto';
  
  // Hide quick chat container when expanded (it's replaced by chatbot panel's input)
  hideQuickChatInput();
  
  // Replace body content with chatbot interface
  const body = currentOverlay.querySelector('#cg-body');
  if (body) {
    body.innerHTML = getChatbotPanelHTML();
    initializeChatbotPanel();
  }
  
  // Load chat history
  loadChatHistory();
}

/**
 * Collapses the chatbot panel back to compact overlay
 */
function collapseChatbotPanel() {
  if (!currentOverlay) return;
  
  currentOverlay.classList.remove('cg-chatbot-expanded');
  currentOverlay.style.width = '380px';
  currentOverlay.style.top = '16px';
  currentOverlay.style.bottom = 'auto';
  currentOverlay.style.right = '16px';
  currentOverlay.style.maxHeight = '80vh';
  currentOverlay.style.height = 'auto';
  
  // Reset minimize button state
  const minimizeBtn = currentOverlay.querySelector('.cg-minimize-btn');
  if (minimizeBtn) {
    isMinimized = false;
    minimizeBtn.innerHTML = '&#8212;';
    minimizeBtn.setAttribute('title', 'Minimize panel');
  }
  
  // Restore original content
  const body = currentOverlay.querySelector('#cg-body');
  if (body) {
    body.style.display = 'block';
    body.innerHTML = `<div class="cg-section"><p class="cg-hint">Hover over content for ${DWELL_TIME_MS / 1000}s to search.<br><em>Ctrl+Shift+G to toggle, or click &#9654;</em></p></div>`;
  }
  
  // Hide quick chat container when collapsed (unless there are recent captures)
  // Quick chat will show again when next inquiry is triggered
  hideQuickChatInput();
}

/**
 * Gets the HTML for the chatbot panel interface
 */
function getChatbotPanelHTML() {
  const recentContextHTML = recentCaptures.length > 0
    ? `
      <div class="cg-chat-context-section">
        <div class="cg-chat-context-title">Recent Context</div>
        <div class="cg-chat-context-list">
          ${recentCaptures.slice(0, 5).map((capture, idx) => `
            <div class="cg-chat-context-item" data-capture-idx="${idx}">
              <div class="cg-chat-context-text">${escapeHtml(capture.text.substring(0, 100))}${capture.text.length > 100 ? '...' : ''}</div>
              <div class="cg-chat-context-time">${new Date(capture.timestamp).toLocaleTimeString()}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';
  
  return `
    ${recentContextHTML}
    <div class="cg-chat-messages" id="cg-chat-messages">
      ${chatMessages.length === 0 
        ? '<div class="cg-chat-empty">Start a conversation! Ask questions about the content you\'re viewing.</div>'
        : chatMessages.map(msg => getChatMessageHTML(msg)).join('')
      }
    </div>
    <div class="cg-chat-input-container">
      <textarea 
        id="cg-chat-input" 
        class="cg-chat-input" 
        placeholder="Ask a question about the content..."
        rows="2"
      ></textarea>
      <button id="cg-chat-send" class="cg-chat-send-btn" ${isSendingMessage ? 'disabled' : ''}>
        ${isSendingMessage ? '⏳' : '➤'}
      </button>
    </div>
  `;
}

/**
 * Gets HTML for a single chat message
 */
function getChatMessageHTML(message) {
  const isUser = message.role === 'user';
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  
  return `
    <div class="cg-chat-message ${isUser ? 'cg-chat-message-user' : 'cg-chat-message-assistant'}">
      <div class="cg-chat-message-content">${formatMarkdown(message.content)}</div>
      <div class="cg-chat-message-time">${timestamp}</div>
    </div>
  `;
}

/**
 * Simple markdown formatting (basic support)
 */
function formatMarkdown(text) {
  // Escape HTML first
  let html = escapeHtml(text);
  
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Code: `code`
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

/**
 * Initializes the chatbot panel event handlers
 */
function initializeChatbotPanel() {
  const sendBtn = document.getElementById('cg-chat-send');
  const input = document.getElementById('cg-chat-input');
  const messagesContainer = document.getElementById('cg-chat-messages');
  
  // Send message on button click
  if (sendBtn) {
    // Remove old listeners by cloning and replacing
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', () => sendChatMessage());
  }
  
  // Send message on Enter (Shift+Enter for new line)
  if (input) {
    // Remove old listeners by cloning and replacing
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  
  // Context item click handlers
  const contextItems = document.querySelectorAll('.cg-chat-context-item');
  contextItems.forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.captureIdx);
      if (idx >= 0 && idx < recentCaptures.length && input) {
        const capture = recentCaptures[idx];
        const chatInput = document.getElementById('cg-chat-input');
        if (chatInput) {
          chatInput.value = `Tell me more about: "${capture.text.substring(0, 50)}..."`;
          chatInput.focus();
        }
      }
    });
  });
  
  // Scroll to bottom
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Sends a chat message to the backend (from expanded chatbot panel)
 */
async function sendChatMessage() {
  const input = document.getElementById('cg-chat-input');
  if (!input || isSendingMessage) return;
  
  const messageText = input.value.trim();
  if (!messageText) return;
  
  await sendChatMessageFromText(messageText);
}

/**
 * Updates the chat messages display
 */
function updateChatMessages() {
  const messagesContainer = document.getElementById('cg-chat-messages');
  if (!messagesContainer) return;
  
  if (chatMessages.length === 0) {
    messagesContainer.innerHTML = '<div class="cg-chat-empty">Start a conversation! Ask questions about the content you\'re viewing.</div>';
  } else {
    messagesContainer.innerHTML = chatMessages.map(msg => getChatMessageHTML(msg)).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Loads chat history from backend
 */
function loadChatHistory() {
  chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' }, (response) => {
    const sessionId = response?.sessionId;
    if (!sessionId) return;
    
    chrome.runtime.sendMessage({
      type: 'GET_CHAT_HISTORY',
      data: { limit: 50 }
    }, (response) => {
      if (response?.success && response?.history?.messages) {
        chatMessages = response.history.messages;
        updateChatMessages();
      }
    });
  });
}

/**
 * Records a context capture for chatbot context
 */
function recordContextCapture(text, location) {
  recentCaptures.push({
    text: text.substring(0, 500), // Limit length
    timestamp: new Date().toISOString(),
    location: location
  });
  
  // Keep only last 5 captures
  if (recentCaptures.length > 5) {
    recentCaptures.shift();
  }
  
  // Show quick chat input when inquiry is triggered
  showQuickChatInput();
  
  // Update context section if chatbot is expanded
  if (chatbotExpanded && currentOverlay) {
    const contextSection = currentOverlay.querySelector('.cg-chat-context-section');
    if (contextSection) {
      const body = currentOverlay.querySelector('#cg-body');
      if (body) {
        body.innerHTML = getChatbotPanelHTML();
        initializeChatbotPanel();
      }
    }
  }
}

/**
 * Shows the quick chat input bar at the bottom
 */
function showQuickChatInput() {
  if (!currentOverlay) return;
  const quickChatContainer = currentOverlay.querySelector('#cg-quick-chat-container');
  const overlayContent = currentOverlay.querySelector('.cg-overlay-content');
  if (quickChatContainer) {
    quickChatContainer.style.display = 'block';
  }
  if (overlayContent) {
    overlayContent.style.paddingBottom = '80px';
  }
}

/**
 * Hides the quick chat input bar
 */
function hideQuickChatInput() {
  if (!currentOverlay) return;
  const quickChatContainer = currentOverlay.querySelector('#cg-quick-chat-container');
  const overlayContent = currentOverlay.querySelector('.cg-overlay-content');
  if (quickChatContainer) {
    quickChatContainer.style.display = 'none';
  }
  if (overlayContent) {
    overlayContent.style.paddingBottom = '16px';
  }
}

/**
 * Sends a message from the quick chat input
 */
async function sendQuickChatMessage() {
  const input = document.getElementById('cg-quick-chat-input');
  const sendBtn = document.getElementById('cg-quick-chat-send');
  
  if (!input || !sendBtn || isSendingMessage) return;
  
  const messageText = input.value.trim();
  if (!messageText) return;
  
  // Expand chatbot panel and send message
  if (!chatbotExpanded) {
    chatbotExpanded = true;
    expandChatbotPanel();
    // Wait a bit for panel to expand before sending
    setTimeout(() => {
      sendChatMessageFromText(messageText);
    }, 100);
  } else {
    // Already expanded, just send the message
    await sendChatMessageFromText(messageText);
  }
  
  // Clear input
  input.value = '';
}

/**
 * Sends a chat message from text (used by both quick chat and expanded panel)
 */
async function sendChatMessageFromText(messageText) {
  const input = chatbotExpanded 
    ? document.getElementById('cg-chat-input')
    : document.getElementById('cg-quick-chat-input');
  const sendBtn = chatbotExpanded
    ? document.getElementById('cg-chat-send')
    : document.getElementById('cg-quick-chat-send');
  const messagesContainer = chatbotExpanded
    ? document.getElementById('cg-chat-messages')
    : null;
  
  if (isSendingMessage) return;
  
  // Add user message to UI immediately
  const userMessage = {
    role: 'user',
    content: messageText,
    timestamp: new Date().toISOString()
  };
  chatMessages.push(userMessage);
  
  // Make sure chat popup is shown
  if (!chatbotExpanded) {
    toggleChatPopup();
    // Wait for popup to be created before updating messages
    setTimeout(() => {
      updateChatMessages();
    }, 150);
  } else {
    updateChatMessages();
  }
  
  if (input) input.value = '';
  isSendingMessage = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳';
  }
  
  // Get session ID and context
  chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' }, async (response) => {
    const sessionId = response?.sessionId || null;
    
    const context = {
      url: window.location.href,
      documentTitle: document.title,
      recentCaptures: recentCaptures.slice(0, 5).map(c => ({
        text: c.text,
        timestamp: c.timestamp,
        location: c.location
      })),
      selectedText: window.getSelection().toString().trim() || undefined
    };
    
    // Send message to backend
    chrome.runtime.sendMessage({
      type: 'SEND_CHAT_MESSAGE',
      data: {
        message: messageText,
        context: context
      }
    }, (response) => {
      isSendingMessage = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = '➤';
      }
      
      if (response?.success && response?.response) {
        // Add assistant response
        const assistantMessage = {
          role: 'assistant',
          content: response.response.response || response.response,
          timestamp: response.response.timestamp || new Date().toISOString()
        };
        chatMessages.push(assistantMessage);
        updateChatMessages();
      } else {
        // Show error
        const errorMessage = {
          role: 'assistant',
          content: 'Sorry, I couldn\'t process your message. Please try again.',
          timestamp: new Date().toISOString()
        };
        chatMessages.push(errorMessage);
        updateChatMessages();
      }
    });
  });
}

/**
 * Loads user info from storage and displays Google account
 */
function loadUserInfo() {
  chrome.storage.local.get(['user', 'auth_token'], (result) => {
    if (result.user && currentOverlay) {
      const userInfo = currentOverlay.querySelector('#cg-user-info');
      const userAvatar = currentOverlay.querySelector('#cg-user-avatar');
      const userName = currentOverlay.querySelector('#cg-user-name');
      
      if (userInfo && userAvatar && userName) {
        userInfo.style.display = 'flex';
        if (result.user.picture) {
          userAvatar.src = result.user.picture;
        }
        userName.textContent = result.user.name || result.user.email || 'User';
        userAvatar.title = result.user.email || '';
      }
    }
  });
}

/**
 * Opens personal dashboard
 */
function openPersonalDashboard() {
  chrome.storage.local.get(['api_base_url'], (result) => {
    const apiBase = result.api_base_url || 'http://localhost:8000';
    const dashboardUrl = `${apiBase.replace('/api', '')}/personal`;
    chrome.tabs.create({ url: dashboardUrl });
  });
}

/**
 * Closes the current session, creates notebook entry, and disables extension
 */
async function closeSessionAndSave() {
  chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' }, async (response) => {
    const sessionId = response?.sessionId;
    if (!sessionId) {
      alert('No active session to close.');
      return;
    }
    
    // Show loading state
    setOverlayStatus('Closing session...');
    const closeBtn = currentOverlay?.querySelector('#cg-close-session-btn');
    if (closeBtn) {
      closeBtn.disabled = true;
      closeBtn.querySelector('.cg-btn-text').textContent = 'Closing...';
    }
    
    // Fetch session start time from backend if available
    chrome.runtime.sendMessage({
      type: 'GET_SESSION_INFO',
      data: { sessionId: sessionId }
    }, (sessionInfoResponse) => {
      const startTime = sessionInfoResponse?.startTime || new Date(Date.now() - 3600000).toISOString(); // Default to 1 hour ago if not available
      
      // Collect all session data for notebook
      const sessionData = {
        sessionId: sessionId,
        url: window.location.href,
        documentTitle: document.title,
        startTime: startTime,
        endTime: new Date().toISOString(),
        chatMessages: chatMessages,
        contextCaptures: recentCaptures,
        confusionTriggers: [], // Will be fetched from backend if needed
        analysisResults: [] // Will be collected if available
      };
      
      // Create notebook entry with all session data
      const notebookContent = generateSessionNotebookContent(sessionData);
      
      chrome.runtime.sendMessage({
        type: 'CREATE_NOTEBOOK_ENTRY',
        data: {
          sessionId: sessionId,
          title: `Session: ${document.title || 'Untitled'} - ${new Date().toLocaleDateString()}`,
          content: notebookContent,
          context: {
            url: window.location.href,
            sessionData: sessionData
          }
        }
      }, async (notebookResponse) => {
        if (notebookResponse?.success) {
          // Stop the session on backend
          chrome.runtime.sendMessage({
            type: 'STOP_SESSION',
            data: { sessionId: sessionId }
          }, (stopResponse) => {
            // Disable extension completely
            extensionEnabled = false;
            
            // Hide overlay
            if (currentOverlay) {
              currentOverlay.style.display = 'none';
            }
            
            // Clear session data
            chrome.storage.local.remove(['currentSessionId']);
            chatMessages = [];
            recentCaptures = [];
            
            // Update toggle button to show paused state
            updateToggleButton();
            
            // Notify background about state change
            chrome.runtime.sendMessage({ 
              type: 'EXTENSION_STATE_CHANGED', 
              enabled: false 
            }).catch(() => {}); // Ignore if background not ready
            
            // Update UI
            setOverlayStatus('Session closed');
            if (closeBtn) {
              closeBtn.disabled = false;
              closeBtn.querySelector('.cg-btn-text').textContent = 'Close Session';
            }
            
            // Show success message (if overlay is shown again)
            updateOverlayContent(`
              <div class="cg-section">
                <p style="color: hsl(0, 0%, 43.1%); font-weight: 600;">Session Closed</p>
                <p>Your session has been saved to your notebook.</p>
                <p class="cg-hint">Click the play button to start a new session.</p>
              </div>
            `);
          });
        } else {
          alert('Failed to save session to notebook: ' + (notebookResponse?.error || 'Unknown error'));
          if (closeBtn) {
            closeBtn.disabled = false;
            closeBtn.querySelector('.cg-btn-text').textContent = 'Close Session';
          }
          setOverlayStatus('Error saving session');
        }
      });
    });
    
    // Create notebook entry with all session data
    // NOTE: User will specify exact content in next prompt
    const notebookContent = generateSessionNotebookContent(sessionData);
    
    chrome.runtime.sendMessage({
      type: 'CREATE_NOTEBOOK_ENTRY',
      data: {
        sessionId: sessionId,
        title: `Session: ${document.title || 'Untitled'} - ${new Date().toLocaleDateString()}`,
        content: notebookContent,
        context: {
          url: window.location.href,
          sessionData: sessionData
        }
      }
    }, async (notebookResponse) => {
      if (notebookResponse?.success) {
        // Stop the session on backend
        chrome.runtime.sendMessage({
          type: 'STOP_SESSION',
          data: { sessionId: sessionId }
        }, (stopResponse) => {
          // Disable extension completely
          extensionEnabled = false;
          
          // Hide overlay
          if (currentOverlay) {
            currentOverlay.style.display = 'none';
          }
          
          // Clear session data
          chrome.storage.local.remove(['currentSessionId']);
          chatMessages = [];
          recentCaptures = [];
          
          // Update toggle button to show paused state
          updateToggleButton();
          
          // Notify background about state change
          chrome.runtime.sendMessage({ 
            type: 'EXTENSION_STATE_CHANGED', 
            enabled: false 
          }).catch(() => {}); // Ignore if background not ready
          
          // Update UI
          setOverlayStatus('Session closed');
          if (closeBtn) {
            closeBtn.disabled = false;
            closeBtn.querySelector('.cg-btn-text').textContent = 'Close Session';
          }
          
          // Show success message
          updateOverlayContent(`
            <div class="cg-section">
              <p style="color: hsl(0, 0%, 43.1%); font-weight: 600;">Session Closed</p>
              <p>Your session has been saved to your notebook.</p>
              <p class="cg-hint">Click the play button to start a new session.</p>
            </div>
          `);
        });
      } else {
        alert('Failed to save session to notebook: ' + (notebookResponse?.error || 'Unknown error'));
        if (closeBtn) {
          closeBtn.disabled = false;
          closeBtn.querySelector('.cg-btn-text').textContent = 'Close Session';
        }
        setOverlayStatus('Error saving session');
      }
    });
  });
}

/**
 * Generates notebook content from session data
 * Format matches the structured inquiry-response format shown in the UI
 */
function generateSessionNotebookContent(sessionData) {
  const sessionDate = new Date(sessionData.endTime);
  const formattedDate = sessionDate.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  let content = `# ${sessionData.documentTitle || 'Learning Session'}\n\n`;
  content += `**Session Date:** ${formattedDate}\n`;
  content += `**Source URL:** ${sessionData.url}\n\n`;
  content += `---\n\n`;
  
  // Process chat messages as inquiry-response pairs
  if (sessionData.chatMessages && sessionData.chatMessages.length > 0) {
    // Group messages into inquiry-response pairs
    for (let i = 0; i < sessionData.chatMessages.length; i += 2) {
      const userMessage = sessionData.chatMessages[i];
      const assistantMessage = sessionData.chatMessages[i + 1];
      
      if (userMessage && userMessage.role === 'user') {
        const inquiryTime = new Date(userMessage.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        content += `## Inquiry ${Math.floor(i / 2) + 1}\n\n`;
        content += `**${inquiryTime}**\n\n`;
        content += `### Question\n\n`;
        content += `${userMessage.content}\n\n`;
        
        // Add context/documentation references if available
        if (sessionData.contextCaptures && sessionData.contextCaptures.length > 0) {
          const relevantCapture = sessionData.contextCaptures.find(
            c => new Date(c.timestamp) <= new Date(userMessage.timestamp)
          ) || sessionData.contextCaptures[sessionData.contextCaptures.length - 1];
          
          if (relevantCapture) {
            content += `### Information Retrieval\n\n`;
            content += `**Context Source:** ${sessionData.documentTitle || 'Current Page'}\n`;
            content += `*Reading relevant content from the page.*\n\n`;
            content += `> ${relevantCapture.text.substring(0, 300)}${relevantCapture.text.length > 300 ? '...' : ''}\n\n`;
          }
        }
        
        // Process assistant response
        if (assistantMessage && assistantMessage.role === 'assistant') {
          const responseContent = assistantMessage.content;
          
          // Extract structured information from response
          const structuredResponse = parseStructuredResponse(responseContent);
          
          content += `### Agent Action\n\n`;
          content += `${structuredResponse.agentAction || 'Analyzed the inquiry and provided relevant information.'}\n\n`;
          
          content += `### Response\n\n`;
          content += `${structuredResponse.intro || 'Found relevant information:'}\n\n`;
          
          // Key Concepts
          if (structuredResponse.keyConcepts && structuredResponse.keyConcepts.length > 0) {
            content += `#### Key Concepts\n\n`;
            structuredResponse.keyConcepts.forEach(concept => {
              content += `- ${concept}\n`;
            });
            content += `\n`;
          }
          
          // Recommendations
          if (structuredResponse.recommendations && structuredResponse.recommendations.length > 0) {
            content += `#### Recommendations\n\n`;
            structuredResponse.recommendations.forEach(rec => {
              content += `- ${rec}\n`;
            });
            content += `\n`;
          }
          
          // Links
          if (structuredResponse.links && structuredResponse.links.length > 0) {
            content += `#### Links for Further Inquiry\n\n`;
            structuredResponse.links.forEach(link => {
              content += `- **[${link.title}](${link.url})**\n`;
              if (link.description) {
                content += `  ${link.description}\n`;
              }
            });
            content += `\n`;
          }
          
          // If no structured data found, include full response
          if (!structuredResponse.keyConcepts && !structuredResponse.recommendations && !structuredResponse.links) {
            content += `${responseContent}\n\n`;
          }
        }
        
        content += `---\n\n`;
      }
    }
  }
  
  // Add session summary if there were context captures
  if (sessionData.contextCaptures && sessionData.contextCaptures.length > 0) {
    content += `## Session Summary\n\n`;
    content += `**Total Context Captures:** ${sessionData.contextCaptures.length}\n`;
    content += `**Total Inquiries:** ${Math.floor((sessionData.chatMessages?.length || 0) / 2)}\n`;
    content += `**Session Duration:** ${calculateSessionDuration(sessionData)}\n\n`;
  }
  
  return content;
}

/**
 * Parses assistant response to extract structured information
 * Looks for key concepts, recommendations, and links
 */
function parseStructuredResponse(responseText) {
  const result = {
    agentAction: null,
    intro: null,
    keyConcepts: [],
    recommendations: [],
    links: []
  };
  
  // Try to extract key concepts (lines starting with bullet points or dashes)
  const conceptPattern = /(?:key concepts?|concepts?)[:\-]?\s*\n([\s\S]*?)(?:\n\n|\n(?:recommendations?|links?|$))/i;
  const conceptMatch = responseText.match(conceptPattern);
  if (conceptMatch) {
    const conceptLines = conceptMatch[1].split('\n')
      .map(line => line.replace(/^[\s\-*•]\s*/, '').trim())
      .filter(line => line.length > 0);
    result.keyConcepts = conceptLines;
  }
  
  // Try to extract recommendations
  const recPattern = /(?:recommendations?|suggestions?)[:\-]?\s*\n([\s\S]*?)(?:\n\n|\n(?:links?|$))/i;
  const recMatch = responseText.match(recPattern);
  if (recMatch) {
    const recLines = recMatch[1].split('\n')
      .map(line => line.replace(/^[\s\-*•]\s*/, '').trim())
      .filter(line => line.length > 0);
    result.recommendations = recLines;
  }
  
  // Extract links (markdown format or URLs)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkPattern.exec(responseText)) !== null) {
    result.links.push({
      title: linkMatch[1],
      url: linkMatch[2],
      description: null
    });
  }
  
  // Extract URLs directly
  const urlPattern = /https?:\/\/[^\s\)]+/g;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(responseText)) !== null) {
    const url = urlMatch[0];
    // Check if already added as markdown link
    if (!result.links.some(l => l.url === url)) {
      result.links.push({
        title: url,
        url: url,
        description: null
      });
    }
  }
  
  // Extract intro text (first paragraph before structured sections)
  const introMatch = responseText.match(/^([^#\n]+(?:\n[^#\n]+)*)/);
  if (introMatch) {
    result.intro = introMatch[1].trim();
  }
  
  return result;
}

/**
 * Calculates session duration
 */
function calculateSessionDuration(sessionData) {
  if (!sessionData.startTime || !sessionData.endTime) {
    return 'Unknown';
  }
  
  const start = new Date(sessionData.startTime);
  const end = new Date(sessionData.endTime);
  const diffMs = end - start;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (diffHours > 0) {
    return `${diffHours}h ${mins}m`;
  }
  return `${diffMins}m`;
}

// ============================================================================
// EXTENSION TOGGLE: Enable/disable without page reload
// ============================================================================

/**
 * Toggles the extension on or off.
 * When disabled, completely hides the overlay from the screen.
 */
function toggleExtension() {
  extensionEnabled = !extensionEnabled;
  dwellAnchor = null; // Reset dwell state
  
  // Ensure overlay exists
  if (!currentOverlay) {
    createPersistentOverlay();
  }
  
  if (extensionEnabled) {
    console.log('[ContextGrabber] Extension ENABLED');
    // Show the overlay
    if (currentOverlay) {
      currentOverlay.style.display = 'block';
    }
    setOverlayStatus('Watching...');
    showOverlayIfHidden();
  } else {
    console.log('[ContextGrabber] Extension DISABLED');
    // Completely hide the overlay
    if (currentOverlay) {
      currentOverlay.style.display = 'none';
    }
  }
  
  // Update the toggle button appearance
  updateToggleButton();
  
  // Notify background about state change for badge update
  chrome.runtime.sendMessage({ 
    type: 'EXTENSION_STATE_CHANGED', 
    enabled: extensionEnabled 
  }).catch(() => {}); // Ignore if background not ready
}

/**
 * Shows the overlay if it doesn't exist.
 * Creates the overlay if it doesn't exist.
 */
function showOverlayIfHidden() {
  if (!currentOverlay) {
    createPersistentOverlay();
  }
  if (!currentOverlay) return; // Still failed to create
  
  // Ensure overlay is visible (no longer hiding content, just resizing)
  overlayVisible = true;
}

/**
 * Updates the toggle button appearance based on extension state.
 */
function updateToggleButton() {
  if (!currentOverlay) createPersistentOverlay();
  if (!currentOverlay) return;
  const toggleBtn = currentOverlay.querySelector('#cg-toggle-btn');
  if (toggleBtn) {
    if (extensionEnabled) {
      toggleBtn.innerHTML = '&#9724;'; // Pause/stop symbol
      toggleBtn.title = 'Pause extension (Ctrl+Shift+G)';
      toggleBtn.classList.remove('cg-toggle-paused');
    } else {
      toggleBtn.innerHTML = '&#9654;'; // Play symbol
      toggleBtn.title = 'Resume extension (Ctrl+Shift+G)';
      toggleBtn.classList.add('cg-toggle-paused');
    }
  }
}

// Keyboard shortcut to toggle extension: Ctrl+Shift+G (or Cmd+Shift+G on Mac)
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    toggleExtension();
  }
}, true);

// ============================================================================
// MESSAGE HANDLER: Receive analysis results from background worker
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_ANALYSIS') {
    showOverlay(message.data);
    sendResponse({ success: true });
  }

  // Toggle extension on/off
  if (message.type === 'TOGGLE_EXTENSION') {
    toggleExtension();
    sendResponse({ enabled: extensionEnabled });
  }

  // Get current extension state
  if (message.type === 'GET_EXTENSION_STATE') {
    sendResponse({ enabled: extensionEnabled });
  }

  // Extension icon was clicked → toggle extension on/off
  if (message.type === 'GRAB_CONTEXT') {
    // Toggle the extension - agent flow runs automatically via dwell detection
    toggleExtension();
    sendResponse({ received: true, enabled: extensionEnabled });
  }

  // Receive Google search results from background
  // These are now ONLY used for Resources tab webpages via searchRelevantWebpages()
  // DO NOT show search results overlay - agents handle all display now
  if (message.type === 'SHOW_SEARCH_RESULTS') {
    // The searchRelevantWebpages function has its own listener to handle these for Resources tab
    // We completely ignore legacy search results - agents are the only display method
    console.log('[ContextGrabber] Received search results (for Resources tab only, not displaying overlay)');
    sendResponse({ success: true });
    return; // Don't process further
  }

  // Receive Google Images results from background
  if (message.type === 'SHOW_IMAGE_RESULTS') {
    showImageResultsInOverlay(message.data);
    sendResponse({ success: true });
  }

  // Receive agent orchestration results
  if (message.type === 'SHOW_AGENT_RESULTS') {
    showAgentResultsOverlay(message.data.orchestrationResult, message.data.relevantWebpages || []);
    sendResponse({ success: true });
  }
});

// ============================================================================
// GRAB CONTEXT: Triggered by clicking the extension icon
// ============================================================================

/**
 * Grabs context from the page and sends it to background for Google search
 * Uses: selected text > last clicked area > visible page content
 */
function handleGrabContext() {
  let text = '';

  // Priority 1: Use selected text if any
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    text = selection.toString().trim().substring(0, MAX_TEXT_LENGTH);
    console.log('[ContextGrabber] Using selected text:', text.substring(0, 80));
  }

  // Priority 2: Use text near the center of the viewport
  if (!text) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const target = resolveTargetFromPoint(centerX, centerY);
    if (target) {
      text = target.text;
      console.log('[ContextGrabber] Using center-of-page text:', text.substring(0, 80));
    }
  }

  // Priority 3: Use document title + meta description
  if (!text) {
    const meta = document.querySelector('meta[name="description"]');
    const fallback = getFallbackPageContext();
    text = fallback + ' ' + (meta ? meta.content : '');
    console.log('[ContextGrabber] Using page title/meta:', text.substring(0, 80));
  }

  if (text.trim().length === 0) {
    console.warn('[ContextGrabber] No text found to search');
    return;
  }

  // Send to background worker for Google search
  chrome.runtime.sendMessage(
    {
      type: 'SEARCH_GOOGLE',
      data: {
        url: window.location.href,
        text: text
      }
    },
    response => {
      if (chrome.runtime.lastError) {
        console.error('[ContextGrabber] Message error:', chrome.runtime.lastError);
      }
    }
  );
}

// ============================================================================
// SEARCH RESULTS OVERLAY
// ============================================================================

/**
 * Displays Google search results in the overlay
 * 
 * @param {Object} data - Search result data
 * @param {string} data.query - The search query used
 * @param {Array} data.results - Array of {title, url, snippet}
 * @param {string} data.sourceUrl - The page URL where context was grabbed
 */
/**
 * Updates the persistent overlay with Google search results
 */
/**
 * Updates the persistent overlay with Google search results.
 * Includes snapshot preview and tabs for Web / Images.
 */
function showSearchResultsOverlay(data) {
  let html = '';

  // Snapshot preview (if captured)
  if (lastSnapshotDataUrl) {
    html += `<div class="cg-section"><strong>Snapshot</strong><div class="cg-snapshot-wrap"><img src="${lastSnapshotDataUrl}" class="cg-snapshot-img" alt="Area snapshot" /></div></div>`;
  }

  // Search query
  html += `<div class="cg-section"><strong>Search Query</strong><p>${escapeHtml(data.query)}</p></div>`;

  // Tab bar: Web | Images
  html += '<div class="cg-tab-bar">';
  html += '<button class="cg-tab cg-tab-active" data-tab="web">Web</button>';
  html += '<button class="cg-tab" data-tab="images">Images</button>';
  html += '</div>';

  // Web results panel
  html += '<div class="cg-tab-panel" id="cg-panel-web">';
  if (data.results && data.results.length > 0) {
    html += '<div class="cg-results">';
    data.results.forEach((result) => {
      html += '<div class="cg-result-item">';
      html += `<a href="${escapeHtml(result.url)}" target="_blank" class="cg-result-title">${escapeHtml(result.title)}</a>`;
      html += `<div class="cg-result-url">${escapeHtml(result.url.substring(0, 60))}${result.url.length > 60 ? '...' : ''}</div>`;
      if (result.snippet) {
        html += `<div class="cg-result-snippet">${escapeHtml(result.snippet)}</div>`;
      }
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<p>No web results found.</p>';
  }
  html += '</div>';

  // Images panel (initially hidden, populated when tab is clicked or results arrive)
  html += '<div class="cg-tab-panel" id="cg-panel-images" style="display:none">';
  html += '<p class="cg-loading">Loading images...</p>';
  html += '</div>';

  updateOverlayContent(html);
  setOverlayStatus('Results ready');
  activeTab = 'web';

  // Wire up tab switching
  const tabs = currentOverlay.querySelectorAll('.cg-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('cg-tab-active'));
      tab.classList.add('cg-tab-active');

      const panelId = tab.dataset.tab;
      currentOverlay.querySelector('#cg-panel-web').style.display = panelId === 'web' ? 'block' : 'none';
      currentOverlay.querySelector('#cg-panel-images').style.display = panelId === 'images' ? 'block' : 'none';
      activeTab = panelId;
    });
  });
}

/**
 * Populates the Images tab inside the overlay with Google Images results.
 */
function showImageResultsInOverlay(data) {
  if (!currentOverlay) return;
  const panel = currentOverlay.querySelector('#cg-panel-images');
  if (!panel) return;

  let html = '';
  if (data.images && data.images.length > 0) {
    html += '<div class="cg-image-grid">';
    data.images.forEach(img => {
      const title = img.title ? escapeHtml(img.title) : 'Image result';
      const link = img.sourceUrl || img.thumbnailUrl;
      html += `<a href="${escapeHtml(link)}" target="_blank" class="cg-image-card" title="${title}">`;
      html += `<img src="${escapeHtml(img.thumbnailUrl)}" alt="${title}" loading="lazy" />`;
      if (img.title) {
        html += `<span class="cg-image-label">${title}</span>`;
      }
      html += '</a>';
    });
    html += '</div>';
  } else {
    html += '<p>No image results found.</p>';
  }

  panel.innerHTML = html;
  setOverlayStatus('Images loaded');
}

/**
 * Searches for relevant webpages based on concepts and hypothesis
 * @param {Array<string>} concepts - Concepts from Agent 2.0
 * @param {Object} hypothesis - Winning hypothesis from Agent 3.0
 * @returns {Promise<Array>} Array of {title, url, snippet}
 */
async function searchRelevantWebpages(concepts, hypothesis) {
  return new Promise((resolve) => {
    // Build search query from concepts and hypothesis
    const conceptText = concepts && concepts.length > 0 ? concepts.join(' ') : '';
    const hypothesisText = hypothesis?.hypothesis || '';
    const searchQuery = `${conceptText} ${hypothesisText}`.trim().substring(0, 100);
    
    if (!searchQuery) {
      resolve([]);
      return;
    }
    
    // Store pending search with unique ID
    const searchId = `webpage_search_${Date.now()}_${Math.random()}`;
    if (!window._pendingWebpageSearches) {
      window._pendingWebpageSearches = new Map();
    }
    
    // Set up one-time listener for search results
    const listener = (message) => {
      if (message.type === 'SHOW_SEARCH_RESULTS') {
        const messageQuery = (message.data.query || '').toLowerCase();
        const ourQuery = searchQuery.toLowerCase();
        
        // Match if queries are similar (check if they share significant words)
        const ourWords = ourQuery.split(/\s+/).filter(w => w.length > 3);
        const messageWords = messageQuery.split(/\s+/).filter(w => w.length > 3);
        const matchingWords = ourWords.filter(w => messageWords.includes(w));
        
        // If at least 30% of words match, consider it our search
        if (matchingWords.length > 0 && matchingWords.length >= Math.ceil(ourWords.length * 0.3)) {
          chrome.runtime.onMessage.removeListener(listener);
          if (window._pendingWebpageSearches) {
            window._pendingWebpageSearches.delete(searchId);
          }
          resolve(message.data.results || []);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    
    // Store search info
    window._pendingWebpageSearches.set(searchId, { query: searchQuery, resolve, listener });
    
    // Use existing Google search functionality
    chrome.runtime.sendMessage(
      {
        type: 'SEARCH_GOOGLE',
        data: {
          url: window.location.href,
          text: searchQuery
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ContextGrabber] Web search error:', chrome.runtime.lastError);
          chrome.runtime.onMessage.removeListener(listener);
          if (window._pendingWebpageSearches) {
            window._pendingWebpageSearches.delete(searchId);
          }
          resolve([]);
        }
      }
    );
    
    // Timeout after 5 seconds
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      if (window._pendingWebpageSearches) {
        window._pendingWebpageSearches.delete(searchId);
      }
      resolve([]);
    }, 5000);
  });
}

/**
 * Displays agent orchestration results in the overlay
 * @param {Object} orchestrationResult - Full orchestration result with agent outputs
 * @param {Array} relevantWebpages - Relevant webpages from search
 */
function showAgentResultsOverlay(orchestrationResult, relevantWebpages = []) {
  if (!orchestrationResult || !orchestrationResult.data) {
    console.warn('[ContextGrabber] Invalid orchestration result');
    return;
  }
  
  const agents = orchestrationResult.data.agents || {};
  const agent2 = agents['2.0'] || agents['target_interpreter'] || {};
  const agent3 = agents['3.0'] || agents['gap_hypothesis'] || {};
  const agent4 = agents['4.0'] || agents['explanation_composer'] || {};
  
  // #region agent log
  const debugAgentData = {location:'content.js:4405',message:'agent data extracted',data:{agent2Keys:Object.keys(agent2),agent3Keys:Object.keys(agent3),agent4Keys:Object.keys(agent4),hasContentType:!!agent2.content_type,hasConcepts:!!(agent2.concepts?.length),hasCandidates:!!(agent3.candidates?.length),hasInstantHud:!!agent4.instant_hud,hasDeepDive:!!agent4.deep_dive,agent2Sample:JSON.stringify(agent2).substring(0,200),agent3Sample:JSON.stringify(agent3).substring(0,200),agent4Sample:JSON.stringify(agent4).substring(0,200)},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
  console.log('[DEBUG]', JSON.stringify(debugAgentData));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugAgentData)}).catch(()=>{});
  // #endregion
  
  // Get winning hypothesis
  let winningHypothesis = null;
  if (agent3.candidates && agent3.winning_hypothesis) {
    winningHypothesis = agent3.candidates.find(c => c.id === agent3.winning_hypothesis) || agent3.candidates[0];
  } else if (agent3.candidates && agent3.candidates.length > 0) {
    winningHypothesis = agent3.candidates[0];
  }
  
  // #region agent log
  const debugShowOverlay = {location:'content.js:4399',message:'showAgentResultsOverlay called',data:{hasResult:!!orchestrationResult,hasData:!!orchestrationResult?.data,hasAgents:!!(orchestrationResult?.data?.agents),agentKeys:orchestrationResult?.data?.agents?Object.keys(orchestrationResult.data.agents):[],webpageCount:relevantWebpages?.length||0,hasWinningHypothesis:!!winningHypothesis},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
  console.log('[DEBUG]', JSON.stringify(debugShowOverlay));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugShowOverlay)}).catch(()=>{});
  // #endregion
  
  let html = '';
  
  // Snapshot preview removed per user request - no longer showing snapshot UI
  
  // Tab bar: Summary | Explanation | Resources
  // Use current activeTab or default to 'summary'
  const initialTab = activeTab || 'summary';
  html += '<div class="cg-tab-bar">';
  html += `<button class="cg-tab ${initialTab === 'summary' ? 'cg-tab-active' : ''}" data-tab="summary">Summary</button>`;
  html += `<button class="cg-tab ${initialTab === 'explanation' ? 'cg-tab-active' : ''}" data-tab="explanation">Explanation</button>`;
  html += `<button class="cg-tab ${initialTab === 'resources' ? 'cg-tab-active' : ''}" data-tab="resources">Resources</button>`;
  html += '</div>';
  
  // Summary Tab
  html += `<div class="cg-tab-panel" id="cg-panel-summary" style="display: ${initialTab === 'summary' ? 'block' : 'none'}">`;
  html += '<div class="cg-section">';
  
  // Summary (detailed summary from Agent 2.0)
  if (agent2.summary) {
    html += '<div style="margin-bottom: 16px;"><strong>Summary</strong>';
    html += `<p style="margin-top: 8px; line-height: 1.6;">${escapeHtml(agent2.summary)}</p>`;
    html += '</div>';
  }
  
  // Content Type
  if (agent2.content_type) {
    html += `<div style="margin-bottom: 12px;"><strong>Content Type</strong><p style="display: inline-block; padding: 4px 8px; background: hsl(0, 0%, 18%); border-radius: 4px; margin-left: 8px;">${escapeHtml(agent2.content_type)}</p></div>`;
  }
  
  // Concepts section REMOVED per user request
  
  // Gap Hypothesis
  if (winningHypothesis) {
    html += '<div style="margin-bottom: 12px;"><strong>Gap Hypothesis</strong>';
    html += `<p style="margin-top: 8px;">${escapeHtml(winningHypothesis.hypothesis || '')}</p>`;
    if (winningHypothesis.prerequisites && winningHypothesis.prerequisites.length > 0) {
      html += '<div style="margin-top: 8px;"><strong style="font-size: 12px;">Prerequisites:</strong><ul style="margin: 4px 0 0 20px; font-size: 13px;">';
      winningHypothesis.prerequisites.forEach(prereq => {
        html += `<li>${escapeHtml(prereq)}</li>`;
      });
      html += '</ul></div>';
    }
    html += '</div>';
  }
  
  // Fallback message if no agent data is available
  if (!agent2.summary && !agent2.content_type && !winningHypothesis) {
    html += '<div style="margin-bottom: 12px;"><p style="color: hsl(0, 0%, 60%);">Agent analysis completed. Check the Explanation tab for detailed insights.</p></div>';
  }
  
  html += '</div></div>';
  
  // Explanation Tab
  html += `<div class="cg-tab-panel" id="cg-panel-explanation" style="display: ${initialTab === 'explanation' ? 'block' : 'none'}">`;
  
  // Check if Agent 4.0 has error
  if (agent4.error) {
    html += '<div class="cg-section">';
    html += '<p style="color: hsl(0, 0%, 60%);">Explanation generation is pending. This usually means a gap hypothesis needs to be identified first.</p>';
    if (winningHypothesis) {
      html += '<p style="margin-top: 8px; color: hsl(0, 0%, 60%);">A hypothesis was found but explanation generation encountered an issue. Please try again.</p>';
    }
    html += '</div>';
  }
  
  // Instant HUD
  if (agent4.instant_hud) {
    html += '<div class="cg-section">';
    html += '<strong>Quick Summary</strong>';
    if (agent4.instant_hud.summary || agent4.instant_hud.body) {
      html += `<p style="margin-top: 8px; line-height: 1.6;">${escapeHtml(agent4.instant_hud.summary || agent4.instant_hud.body || '')}</p>`;
    }
    if (agent4.instant_hud.key_points && agent4.instant_hud.key_points.length > 0) {
      html += '<ul style="margin: 8px 0 0 20px;">';
      agent4.instant_hud.key_points.forEach(point => {
        html += `<li>${escapeHtml(point)}</li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
  }
  
  // Deep Dive
  if (agent4.deep_dive) {
    html += '<div class="cg-section">';
    html += '<strong>Deep Dive</strong>';
    // Handle both old format (full_explanation) and new format (explanation)
    const explanationText = agent4.deep_dive.explanation || agent4.deep_dive.full_explanation;
    if (explanationText) {
      html += `<p style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${escapeHtml(explanationText)}</p>`;
    }
    if (agent4.deep_dive.examples && agent4.deep_dive.examples.length > 0) {
      html += '<div style="margin-top: 12px;"><strong style="font-size: 12px;">Examples:</strong>';
      agent4.deep_dive.examples.forEach(example => {
        // Handle both string examples and object examples
        const exampleText = typeof example === 'string' ? example : (example.content || example.description || JSON.stringify(example));
        html += `<div style="margin: 8px 0; padding: 8px; background: hsl(0, 0%, 14.9%); border-radius: 4px; font-size: 13px; line-height: 1.5;">${escapeHtml(exampleText)}</div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  }
  
  // Fallback if no explanation data
  if (!agent4.instant_hud && !agent4.deep_dive && !agent4.error) {
    html += '<div class="cg-section">';
    html += '<p style="color: hsl(0, 0%, 60%);">Explanation is being generated. Please check back in a moment.</p>';
    html += '</div>';
  }
  
  html += '</div>';
  
  // Resources Tab
  html += '<div class="cg-tab-panel" id="cg-panel-resources" style="display:none">';
  if (relevantWebpages && relevantWebpages.length > 0) {
    html += '<div class="cg-results">';
    relevantWebpages.forEach((page) => {
      html += '<div class="cg-result-item">';
      html += `<a href="${escapeHtml(page.url)}" target="_blank" class="cg-result-title">${escapeHtml(page.title || 'Untitled')}</a>`;
      html += `<div class="cg-result-url">${escapeHtml(page.url.substring(0, 60))}${page.url.length > 60 ? '...' : ''}</div>`;
      if (page.snippet) {
        html += `<div class="cg-result-snippet">${escapeHtml(page.snippet)}</div>`;
      }
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<p class="cg-loading">No relevant webpages found.</p>';
  }
  html += '</div>';
  
  // #region agent log
  const debugBeforeUpdate = {location:'content.js:4522',message:'about to update overlay content',data:{htmlLength:html.length,hasCurrentOverlay:!!currentOverlay},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
  console.log('[DEBUG]', JSON.stringify(debugBeforeUpdate));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugBeforeUpdate)}).catch(()=>{});
  // #endregion
  
  updateOverlayContent(html);
  setOverlayStatus('Analysis complete');
  // Don't reset activeTab - preserve user's current tab selection
  if (!activeTab) activeTab = 'summary';
  
  // #region agent log
  const debugAfterUpdate = {location:'content.js:4525',message:'overlay content updated',data:{hasCurrentOverlay:!!currentOverlay,overlayVisible:currentOverlay?.style?.display!=='none'},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
  console.log('[DEBUG]', JSON.stringify(debugAfterUpdate));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugAfterUpdate)}).catch(()=>{});
  // #endregion
  
  // Tab switching is now handled in updateOverlayContent using event delegation
  // This ensures tabs work even if overlay content is updated
  // Just ensure initial state is set
  const tabBar = currentOverlay.querySelector('.cg-tab-bar');
  if (tabBar && !tabBar.dataset.tabListenerAttached) {
    // Trigger updateOverlayContent logic to attach listener
    // The listener will be attached in updateOverlayContent
    const currentBody = currentOverlay.querySelector('#cg-body');
    if (currentBody) {
      // Force re-attachment by calling updateOverlayContent with current HTML
      // But actually, the listener should already be attached from updateOverlayContent call above
      // So we just need to ensure the initial tab state is correct
      const summaryPanel = currentOverlay.querySelector('#cg-panel-summary');
      const explanationPanel = currentOverlay.querySelector('#cg-panel-explanation');
      const resourcesPanel = currentOverlay.querySelector('#cg-panel-resources');
      
      if (summaryPanel) summaryPanel.style.display = 'block';
      if (explanationPanel) explanationPanel.style.display = 'none';
      if (resourcesPanel) resourcesPanel.style.display = 'none';
    }
  }
}

// ============================================================================
// DWELL DETECTION: Trigger scrape when position stays still
// ============================================================================

/**
 * Calculates distance between two points
 */
function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Sends the context image snapshot to the backend analysis API.
 * Backend receives image and returns analysis results (e.g., OCR, visual search, etc.).
 * Expects backend to return: { success: boolean, results?: [{title, url, snippet}] }
 *
 * @param {string} imageDataUrl - Data URL of the snapshot image
 * @returns {Promise<Array|null>} - Array of results or null on error/timeout
 */
/**
 * Send screenshot to Agent 1.0 (Capture & Scrape) API
 * @param {string} imageDataUrl - Screenshot as data URL
 * @param {string} url - Current page URL
 * @param {Object} cursorPos - Cursor position {x, y}
 * @param {string} textExtraction - Pre-extracted text from DOM
 * @returns {Promise<Object|null>} Agent 1.0 response or null
 */
async function sendScreenshotToAgent10(imageDataUrl, url, cursorPos, textExtraction) {
  // #region agent log
  const debugEntry = {location:'content.js:4569',message:'sendScreenshotToAgent10 entry',data:{hasImage:!!imageDataUrl,url:url?.substring(0,50),textLen:textExtraction?.length||0},timestamp:Date.now(),runId:'run1',hypothesisId:'A,B,C,D,E,F'};
  console.log('[DEBUG]', JSON.stringify(debugEntry));
  fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugEntry)}).catch(()=>{});
  // #endregion
  if (!imageDataUrl) return null;
  
  try {
    // Get API base URL and auth token from storage
    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(['api_base_url', 'auth_token', 'user_id', 'session_id'], (result) => {
        resolve({
          apiBase: result.api_base_url || 'http://localhost:8000',
          authToken: result.auth_token || null,
          userId: result.user_id || null,
          sessionId: result.session_id || null
        });
      });
    });
    // #region agent log
    const debugStorage = {location:'content.js:4584',message:'storage data retrieved',data:{apiBase:storageData.apiBase,hasAuth:!!storageData.authToken,hasUserId:!!storageData.userId,hasSessionId:!!storageData.sessionId},timestamp:Date.now(),runId:'run1',hypothesisId:'F'};
    console.log('[DEBUG]', JSON.stringify(debugStorage));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugStorage)}).catch(()=>{});
    // #endregion
    
    // First, call Agent 1.0 to capture content
    const agent10Url = `${storageData.apiBase}/api/agents/capture-scrape`;
    
    // Prepare capture request payload
    const capturePayload = {
      url: url,
      cursor_position: cursorPos,
      screenshot: imageDataUrl,  // Base64 data URL
      text_extraction: textExtraction || '',  // Pre-extracted text
      context_lines: CONTEXT_LINES_BEFORE + CONTEXT_LINES_AFTER,
      dwell_time_ms: DWELL_TIME_MS,
      user_id: storageData.userId,
      session_id: storageData.sessionId
    };
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (storageData.authToken) {
      headers['Authorization'] = `Bearer ${storageData.authToken}`;
    }
    
    // POST to Agent 1.0 API with timeout
    const controller1 = new AbortController();
    const timeoutId1 = setTimeout(() => controller1.abort(), 10000);  // 10s timeout for vision processing
    
    const captureResponse = await fetch(agent10Url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(capturePayload),
      signal: controller1.signal
    });
    
    clearTimeout(timeoutId1);
    // #region agent log
    const debugCaptureResp = {location:'content.js:4619',message:'capture response received',data:{status:captureResponse.status,ok:captureResponse.ok,url:agent10Url.substring(0,60)},timestamp:Date.now(),runId:'run1',hypothesisId:'B'};
    console.log('[DEBUG]', JSON.stringify(debugCaptureResp));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugCaptureResp)}).catch(()=>{});
    // #endregion
    
    if (!captureResponse.ok) {
      console.warn('[ContextGrabber] Agent 1.0 returned status:', captureResponse.status);
      // #region agent log
      const debugCaptureFail = {location:'content.js:4623',message:'capture endpoint failed',data:{status:captureResponse.status},timestamp:Date.now(),runId:'run1',hypothesisId:'B'};
      console.log('[DEBUG]', JSON.stringify(debugCaptureFail));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugCaptureFail)}).catch(()=>{});
      // #endregion
      return null;
    }
    
    const captureResult = await captureResponse.json();
    // #region agent log
    const debugCaptureResult = {location:'content.js:4628',message:'capture result parsed',data:{success:captureResult.success,hasData:!!captureResult.data,error:captureResult.error},timestamp:Date.now(),runId:'run1',hypothesisId:'B'};
    console.log('[DEBUG]', JSON.stringify(debugCaptureResult));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugCaptureResult)}).catch(()=>{});
    // #endregion
    
    if (!captureResult.success || !captureResult.data) {
      console.warn('[ContextGrabber] Agent 1.0 failed:', captureResult.error);
      // #region agent log
      const debugCaptureInvalid = {location:'content.js:4630',message:'capture result invalid returning partial',data:{success:captureResult.success,hasData:!!captureResult.data},timestamp:Date.now(),runId:'run1',hypothesisId:'B'};
      console.log('[DEBUG]', JSON.stringify(debugCaptureInvalid));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugCaptureInvalid)}).catch(()=>{});
      // #endregion
      // Return with success=false so caller knows capture failed
      return {
        success: false,
        data: {
          capture: captureResult.data || null,
          orchestration: null
        },
        error: captureResult.error || 'Capture failed'
      };
    }
    
    // Now call orchestration endpoint to process through full pipeline
    const orchestrateUrl = `${storageData.apiBase}/api/agents/orchestrate`;
    
    const orchestratePayload = {
      user_id: storageData.userId,
      capture_result: captureResult.data,
      session_id: storageData.sessionId
    };
    
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 30000);  // 30s timeout for full orchestration
    
    const orchestrateResponse = await fetch(orchestrateUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(orchestratePayload),
      signal: controller2.signal
    });
    
    clearTimeout(timeoutId2);
    // #region agent log
    const debugOrchResp = {location:'content.js:4652',message:'orchestration response received',data:{status:orchestrateResponse.status,ok:orchestrateResponse.ok,url:orchestrateUrl.substring(0,60)},timestamp:Date.now(),runId:'run1',hypothesisId:'C'};
    console.log('[DEBUG]', JSON.stringify(debugOrchResp));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugOrchResp)}).catch(()=>{});
    // #endregion
    
    if (!orchestrateResponse.ok) {
      console.warn('[ContextGrabber] Orchestration returned status:', orchestrateResponse.status);
      // #region agent log
      const debugOrchFail = {location:'content.js:4657',message:'orchestration endpoint failed returning capture only',data:{status:orchestrateResponse.status},timestamp:Date.now(),runId:'run1',hypothesisId:'C'};
      console.log('[DEBUG]', JSON.stringify(debugOrchFail));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugOrchFail)}).catch(()=>{});
      // #endregion
      // Return result with success=false when orchestration fails, so caller knows it failed
      return {
        success: false,
        data: {
          capture: captureResult.data,
          orchestration: null
        },
        error: `Orchestration endpoint returned status ${orchestrateResponse.status}`
      };
    }
    
    const orchestrateResult = await orchestrateResponse.json();
    // #region agent log
    const debugOrchResult = {location:'content.js:4662',message:'orchestration result parsed',data:{success:orchestrateResult.success,hasData:!!orchestrateResult.data,hasAgents:!!(orchestrateResult.data?.agents),agentKeys:orchestrateResult.data?.agents?Object.keys(orchestrateResult.data.agents):[],error:orchestrateResult.error},timestamp:Date.now(),runId:'run1',hypothesisId:'D,E'};
    console.log('[DEBUG]', JSON.stringify(debugOrchResult));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugOrchResult)}).catch(()=>{});
    // #endregion
    
    // Check if orchestration actually succeeded
    if (!orchestrateResult.success || !orchestrateResult.data) {
      // #region agent log
      const debugOrchFailed = {location:'content.js:4708',message:'orchestration result has success=false',data:{success:orchestrateResult.success,hasData:!!orchestrateResult.data,error:orchestrateResult.error},timestamp:Date.now(),runId:'run1',hypothesisId:'D'};
      console.log('[DEBUG]', JSON.stringify(debugOrchFailed));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugOrchFailed)}).catch(()=>{});
      // #endregion
      return {
        success: false,
        data: {
          capture: captureResult.data,
          orchestration: null
        },
        error: orchestrateResult.error || 'Orchestration returned success=false'
      };
    }
    
    // Merge orchestration results with capture result
    const mergedResult = {
      success: orchestrateResult.success,
      data: {
        capture: captureResult.data,
        orchestration: orchestrateResult.data
      },
      error: orchestrateResult.error
    };
    // #region agent log
    const debugMerged = {location:'content.js:4670',message:'sendScreenshotToAgent10 returning merged result',data:{success:mergedResult.success,hasOrchestration:!!mergedResult.data.orchestration,hasAgents:!!(mergedResult.data.orchestration?.agents),agentKeys:mergedResult.data.orchestration?.agents?Object.keys(mergedResult.data.orchestration.agents):[]},timestamp:Date.now(),runId:'run1',hypothesisId:'D,E'};
    console.log('[DEBUG]', JSON.stringify(debugMerged));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugMerged)}).catch(()=>{});
    // #endregion
    return mergedResult;
  } catch (err) {
    // #region agent log
    const debugException = {location:'content.js:4671',message:'sendScreenshotToAgent10 exception caught',data:{name:err.name,message:err.message,isAbort:err.name==='AbortError',isFetchError:err.message?.includes('Failed to fetch')},timestamp:Date.now(),runId:'run1',hypothesisId:'A'};
    console.log('[DEBUG]', JSON.stringify(debugException));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugException)}).catch(()=>{});
    // #endregion
    if (err.name === 'AbortError') {
      console.warn('[ContextGrabber] Request timed out');
    } else if (err.message && err.message.includes('Failed to fetch')) {
      console.warn('[ContextGrabber] Request failed: Backend may be offline or CORS issue');
    } else {
      console.warn('[ContextGrabber] Request failed:', err.message || err.toString());
    }
    return null;
  }
}

async function sendImageToBackend(imageDataUrl) {
  if (!imageDataUrl || !ANALYZE_API_URL) return null;

  try {
    // Convert data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();

    // Create FormData with image
    const formData = new FormData();
    formData.append('image', blob, 'snapshot.png');

    // POST to backend with 5-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const backendResponse = await fetch(ANALYZE_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!backendResponse.ok) {
      console.warn('[ContextGrabber] Backend returned status:', backendResponse.status);
      return null;
    }

    const data = await backendResponse.json();
    if (data.success && data.results && Array.isArray(data.results)) {
      console.log('[ContextGrabber] Backend returned', data.results.length, 'results');
      return data.results;
    } else if (!data.success) {
      console.warn('[ContextGrabber] Backend error:', data.message || 'unknown');
      return null;
    }
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[ContextGrabber] Backend image analysis timed out');
    } else if (err.message && err.message.includes('Failed to fetch')) {
      console.warn('[ContextGrabber] Backend image analysis failed: Failed to fetch - backend may be offline or CORS issue');
    } else {
      console.warn('[ContextGrabber] Backend image analysis failed:', err.message || err.toString());
    }
    return null;
  }
}

/**
 * Auto-saves notebook entry with agent data
 * @param {Object} orchestrationResult - Full orchestration result
 * @param {Array} relevantWebpages - Relevant webpages
 * @param {string} originalText - Original extracted text
 * @param {string} url - Page URL
 */
async function autoSaveToNotebook(orchestrationResult, relevantWebpages, originalText, url) {
  try {
    const agents = orchestrationResult.data?.agents || {};
    const agent2 = agents['2.0'] || agents['target_interpreter'] || {};
    const agent3 = agents['3.0'] || agents['gap_hypothesis'] || {};
    const agent4 = agents['4.0'] || agents['explanation_composer'] || {};
    
    // Get winning hypothesis
    let winningHypothesis = null;
    if (agent3.candidates && agent3.winning_hypothesis) {
      winningHypothesis = agent3.candidates.find(c => c.id === agent3.winning_hypothesis) || agent3.candidates[0];
    }
    
    // Get storage data
    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(['api_base_url', 'auth_token', 'user_id', 'session_id'], (result) => {
        resolve({
          apiBase: result.api_base_url || 'http://localhost:8000',
          authToken: result.auth_token || null,
          userId: result.user_id || null,
          sessionId: result.session_id || null
        });
      });
    });
    
    if (!storageData.userId || !storageData.authToken) {
      console.warn('[ContextGrabber] Cannot auto-save: missing user_id or auth_token');
      return;
    }
    
    // Prepare notebook entry data
    const title = agent2.content_type || winningHypothesis?.hypothesis?.substring(0, 50) || 'Untitled Entry';
    const snippet = agent4.instant_hud?.summary || originalText.substring(0, 200);
    const preview = agent4.deep_dive?.explanation?.substring(0, 500) || snippet;
    const concepts = agent2.concepts || [];
    const prerequisites = winningHypothesis?.prerequisites || [];
    const tags = [...concepts, ...prerequisites].filter(Boolean);
    
    // Full content as JSON
    const content = JSON.stringify({
      agentData: {
        classification: agent2,
        hypothesis: agent3,
        explanation: agent4
      },
      relevantWebpages: relevantWebpages,
      originalText: originalText,
      url: url,
      timestamp: new Date().toISOString()
    });
    
    const entryData = {
      sessionId: storageData.sessionId,
      title: title,
      snippet: snippet,
      preview: preview,
      content: content,
      tags: tags,
      date: new Date().toISOString().split('T')[0]
    };
    
    // Call backend API
    const response = await fetch(`${storageData.apiBase}/api/personal/notebook-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storageData.authToken}`
      },
      body: JSON.stringify(entryData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[ContextGrabber] Auto-saved to notebook:', result.id);
      setOverlayStatus('Saved to notebook');
      
      // Show success notification briefly
      setTimeout(() => {
        if (currentOverlay) {
          const statusEl = currentOverlay.querySelector('.cg-status');
          if (statusEl) {
            statusEl.textContent = 'Saved to notebook';
            setTimeout(() => {
              statusEl.textContent = '';
            }, 3000);
          }
        }
      }, 100);
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.warn('[ContextGrabber] Auto-save failed:', error);
      setOverlayStatus('Save failed');
    }
  } catch (err) {
    console.error('[ContextGrabber] Auto-save error:', err);
    setOverlayStatus('Save error');
  }
}

/**
 * Sends extracted text to background for Google search + image search.
 * Also captures a snapshot of the area around the dwell point.
 * Respects SCREENSHOT_PRIORITY setting.
 */
async function triggerSearchFromPoint(x, y) {
  // Try to extract text — dispatches to PDF / Google Docs / normal extractors
  const target = resolveTargetFromPoint(x, y);
  let text = target ? target.text.trim() : '';
  const url = window.location.href;

  // Fall back to page title if text extraction returned nothing
  if (!text) {
    text = getFallbackPageContext();
    console.log('[ContextGrabber] Fallback to page title:', text.substring(0, 60));
  }

  // If still nothing usable, bail out
  if (!text || text.trim().length === 0) {
    console.warn('[ContextGrabber] No text to search');
    return;
  }

  // De-duplicate: on special pages use a region-based key instead of element ref
  if (isPDF || isPDFjs || isGoogleDoc || isGoogleSlides) {
    const regionKey = `${Math.round(x / 100)},${Math.round(y / 100)},${text.substring(0, 40)}`;
    if (regionKey === lastExtractedRegionKey && (Date.now() - lastScrapeTime) < DWELL_COOLDOWN_MS) {
      return;
    }
    lastExtractedRegionKey = regionKey;
  } else if (target && target.element === lastScrapedElement && (Date.now() - lastScrapeTime) < DWELL_COOLDOWN_MS) {
    // Normal page: skip if same element was scraped recently
    return;
  }

  if (target) lastScrapedElement = target.element;
  lastScrapeTime = Date.now();

  console.log('[ContextGrabber] Dwell triggered at', x, y, '— text length:', text.length);
  setOverlayStatus('Capturing...');
  updateOverlayContent('<p class="cg-loading">Capturing area and searching...</p>');
  
  // Record context capture for chatbot
  if (text && text.trim().length > 10) {
    recordContextCapture(text, { x, y });
    
    // Also record as confusion trigger
    chrome.runtime.sendMessage({
      type: 'RECORD_TRIGGER',
      data: {
        triggerType: 'hover',
        location: { x, y },
        text: text.substring(0, 500)
      }
    }).catch(() => {}); // Ignore errors
  }

  // --- AGENT ORCHESTRATION FLOW (Primary Method) ---
  // Always try to use agents, with or without snapshot
  let agentFlowCompleted = false;
  
  // 1) Try to capture a snapshot of the area around the dwell point
  try {
    const snapshot = await captureAreaSnapshot(x, y);
    lastSnapshotDataUrl = snapshot;
  } catch (err) {
    console.warn('[ContextGrabber] Snapshot capture failed:', err);
    lastSnapshotDataUrl = null;
    
    // Check if it's a permission error
    const errorMsg = err.message || err.toString();
    if (errorMsg.includes('activeTab') || errorMsg.includes('not been invoked') || 
        errorMsg.includes('permission') || errorMsg.includes('Permission')) {
      console.warn('[ContextGrabber] Screenshot permission not available, will use text-only for agents');
      // Continue without snapshot - agents can work with text only
    }
  }

  // 2) Send to Agent 1.0 (Capture & Scrape) API and orchestrate
  // Try with snapshot if available, or text-only if not
  try {
    console.log('[ContextGrabber] Sending to Agent 1.0 API...');
    setOverlayStatus('Extracting content...');
    
    const agent10Result = await sendScreenshotToAgent10(lastSnapshotDataUrl, url, { x, y }, text);
    // #region agent log
    const debugResultReceived = {location:'content.js:4922',message:'agent10Result received in triggerSearchFromPoint',data:{isNull:!agent10Result,hasSuccess:!!(agent10Result?.success),success:agent10Result?.success,hasData:!!agent10Result?.data,hasOrchestration:!!(agent10Result?.data?.orchestration),hasAgents:!!(agent10Result?.data?.orchestration?.agents),agentKeys:agent10Result?.data?.orchestration?.agents?Object.keys(agent10Result.data.orchestration.agents):[]},timestamp:Date.now(),runId:'run1',hypothesisId:'A,B,C,D,E'};
    console.log('[DEBUG]', JSON.stringify(debugResultReceived));
    fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugResultReceived)}).catch(()=>{});
    // #endregion
    if (agent10Result && agent10Result.success) {
      // The structure from sendScreenshotToAgent10 is:
      // { success: true, data: { capture: {...}, orchestration: { agents: {...} } } }
      const resultData = agent10Result.data || {};
      const captureData = resultData.capture || resultData;
      const orchestrationData = resultData.orchestration;
      
      console.log('[ContextGrabber] Agent 1.0 result structure:', {
        hasCapture: !!captureData,
        hasOrchestration: !!orchestrationData,
        dataKeys: Object.keys(resultData),
        orchestrationKeys: orchestrationData ? Object.keys(orchestrationData) : []
      });
      // #region agent log
      const debugExtracted = {location:'content.js:4930',message:'extracted orchestration data',data:{hasOrchestration:!!orchestrationData,orchestrationKeys:orchestrationData?Object.keys(orchestrationData):[],hasAgents:!!(orchestrationData?.agents),agentKeys:orchestrationData?.agents?Object.keys(orchestrationData.agents):[]},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
      console.log('[DEBUG]', JSON.stringify(debugExtracted));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugExtracted)}).catch(()=>{});
      // #endregion
      
      // Use extracted text if better than DOM extraction
      if (captureData?.extracted_text && captureData.extracted_text.length > text.length) {
        text = captureData.extracted_text;
        console.log('[ContextGrabber] Using Agent 1.0 extracted text (better than DOM)');
      }
      
      // Check if orchestration result is available
      const agents = orchestrationData?.agents || {};
      // #region agent log
      const debugAgentsCheck = {location:'content.js:4944',message:'checking agents object',data:{hasAgents:!!agents,agentCount:Object.keys(agents).length,agentKeys:Object.keys(agents),agent2Full:JSON.stringify(agents['2.0']||{}).substring(0,500),agent3Full:JSON.stringify(agents['3.0']||{}).substring(0,500),agent4Full:JSON.stringify(agents['4.0']||{}).substring(0,500),orchestrationDataFull:JSON.stringify(orchestrationData).substring(0,1000)},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
      console.log('[DEBUG]', JSON.stringify(debugAgentsCheck));
      console.log('[DEBUG FULL] Orchestration data:', JSON.stringify(orchestrationData, null, 2));
      console.log('[DEBUG FULL] Agents:', JSON.stringify(agents, null, 2));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugAgentsCheck)}).catch(()=>{});
      // #endregion
      
      if (agents && Object.keys(agents).length > 0) {
        console.log('[ContextGrabber] Orchestration complete, processing results. Agents:', Object.keys(agents));
        setOverlayStatus('Processing agent results...');
        
        // Extract concepts and hypothesis for web search
        const agent2 = agents['2.0'] || agents['target_interpreter'] || {};
        const agent3 = agents['3.0'] || agents['gap_hypothesis'] || {};
        
        // Get winning hypothesis
        let winningHypothesis = null;
        if (agent3.candidates && agent3.winning_hypothesis) {
          winningHypothesis = agent3.candidates.find(c => c.id === agent3.winning_hypothesis) || agent3.candidates[0];
        }
        
        // Search for relevant webpages
        const concepts = agent2.concepts || [];
        setOverlayStatus('Finding relevant resources...');
        const relevantWebpages = await searchRelevantWebpages(concepts, winningHypothesis);
        
        // Display agent results
        showAgentResultsOverlay({
          success: true,
          data: {
            agents: agents,
            capture: captureData
          }
        }, relevantWebpages);
        
        // Auto-save to notebook
        await autoSaveToNotebook({
          success: true,
          data: {
            agents: agents,
            capture: captureData
          }
        }, relevantWebpages, text, url);
        
        agentFlowCompleted = true;
        return; // Done with agent flow - don't fall through to Google search
      } else {
        console.warn('[ContextGrabber] No orchestration agents found. Full result:', JSON.stringify(agent10Result, null, 2));
        // #region agent log
        const debugNoAgents = {location:'content.js:4986',message:'no agents found in orchestration',data:{hasOrchestration:!!orchestrationData,hasAgents:!!(orchestrationData?.agents),agentKeys:orchestrationData?.agents?Object.keys(orchestrationData.agents):[]},timestamp:Date.now(),runId:'run1',hypothesisId:'E'};
        console.log('[DEBUG]', JSON.stringify(debugNoAgents));
        fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugNoAgents)}).catch(()=>{});
        // #endregion
        // Show error instead of falling back to Google search
        showErrorOverlay('Agent Processing Failed', 
          'The agent orchestration did not return results. Please check backend logs and ensure agents are running.');
        return;
      }
    } else {
      console.warn('[ContextGrabber] Agent 1.0 call failed or returned no success:', agent10Result);
      // #region agent log
      const debugCheckFailed = {location:'content.js:4992',message:'agent10Result check failed showing error',data:{isNull:!agent10Result,hasSuccess:!!(agent10Result?.success),success:agent10Result?.success},timestamp:Date.now(),runId:'run1',hypothesisId:'A,B,C,D'};
      console.log('[DEBUG]', JSON.stringify(debugCheckFailed));
      fetch('http://127.0.0.1:7243/ingest/6ed3f67c-a961-4b6e-83a6-c9bfc2dcd30b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugCheckFailed)}).catch(()=>{});
      // #endregion
      showErrorOverlay('Agent Processing Failed', 
        'Failed to process content with agents. Please check backend connection and try again.');
      return;
    }
  } catch (err) {
    console.error('[ContextGrabber] Agent 1.0 extraction failed:', err);
    showErrorOverlay('Agent Processing Error', 
      `Failed to process with agents: ${err.message || err.toString()}. Please check backend connection.`);
    return;
  }
  
  // If we reach here, agent flow didn't complete - show error
  if (!agentFlowCompleted) {
    console.error('[ContextGrabber] Agent flow did not complete');
    showErrorOverlay('Processing Failed', 
      'Unable to process content. Please ensure backend is running and try again.');
  }
}

// ============================================================================
// OCR: Client-side text recognition from snapshot images via Tesseract.js
// ============================================================================

let tesseractLoaded = false;
let tesseractWorkerInstance = null;

/**
 * Dynamically loads Tesseract.js from CDN if not already present.
 */
function loadTesseractJS() {
  return new Promise((resolve, reject) => {
    if (tesseractLoaded && window.Tesseract) {
      return resolve();
    }
    if (document.getElementById('cg-tesseract-script')) {
      // Already loading, wait for it
      const check = setInterval(() => {
        if (window.Tesseract) { clearInterval(check); tesseractLoaded = true; resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); reject(new Error('Tesseract load timeout')); }, 15000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'cg-tesseract-script';
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => { tesseractLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
    document.head.appendChild(script);
  });
}

/**
 * Performs OCR on a data URL image using Tesseract.js.
 * Returns extracted text or empty string on failure.
 *
 * @param {string} imageDataUrl - PNG/JPEG data URL of the image
 * @returns {Promise<string>} Recognized text
 */
async function performClientOCR(imageDataUrl) {
  try {
    await loadTesseractJS();

    if (!window.Tesseract) {
      console.warn('[ContextGrabber] Tesseract.js not available');
      return '';
    }

    console.log('[ContextGrabber] Starting OCR recognition...');

    const result = await window.Tesseract.recognize(imageDataUrl, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          setOverlayStatus(`OCR ${Math.round((m.progress || 0) * 100)}%`);
        }
      }
    });

    const text = result?.data?.text || '';
    console.log('[ContextGrabber] OCR complete, extracted', text.length, 'chars');
    setOverlayStatus('OCR complete');
    return text;
  } catch (error) {
    console.error('[ContextGrabber] OCR error:', error);
    return '';
  }
}

// ============================================================================
// SNAPSHOT CAPTURE: Grab a cropped image of the area around the cursor
// ============================================================================

/**
 * Requests a full-page screenshot from the background service worker,
 * then crops it to a region around (x, y) using an offscreen canvas.
 * Works on any page including PDFs, images, and canvas-heavy pages.
 *
 * @param {number} x - Client X coordinate (CSS pixels)
 * @param {number} y - Client Y coordinate (CSS pixels)
 * @returns {Promise<string|null>} Cropped snapshot as a data URL, or null
 */
async function captureAreaSnapshot(x, y) {
  return new Promise((resolve, reject) => {
    const dpr = window.devicePixelRatio || 1;
    const halfSize = SNAPSHOT_SIZE / 2;

    // Region in CSS pixels, clamped to viewport
    const cropX = Math.max(0, x - halfSize);
    const cropY = Math.max(0, y - halfSize);
    const cropW = Math.min(SNAPSHOT_SIZE, window.innerWidth - cropX);
    const cropH = Math.min(SNAPSHOT_SIZE, window.innerHeight - cropY);

    chrome.runtime.sendMessage(
      {
        type: 'CAPTURE_AREA',
        data: { x: cropX, y: cropY, width: cropW, height: cropH, devicePixelRatio: dpr }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || !response.dataUrl) {
          // If there's an error message from background, include it
          if (response && response.error) {
            return reject(new Error(response.error));
          }
          return resolve(null);
        }

        // Crop the full-page screenshot to just our region
        const img = new Image();
        img.onload = () => {
          // Compute actual scale from the captured image vs CSS viewport.
          // captureVisibleTab returns an image at device-pixel size, which
          // may differ from window.innerWidth * devicePixelRatio on some
          // displays / zoom levels.  Deriving scale from the image itself
          // avoids the "top-right corner" bug on PDFs and high-DPI screens.
          const scaleX = img.naturalWidth  / window.innerWidth;
          const scaleY = img.naturalHeight / window.innerHeight;

          const srcX = Math.round(cropX * scaleX);
          const srcY = Math.round(cropY * scaleY);
          const srcW = Math.round(cropW * scaleX);
          const srcH = Math.round(cropH * scaleY);

          const canvas = document.createElement('canvas');
          canvas.width  = srcW;
          canvas.height = srcH;
          const ctx = canvas.getContext('2d');

          // Source: from the full screenshot at the correctly scaled coordinates
          ctx.drawImage(
            img,
            srcX, srcY,   // source x, y
            srcW, srcH,   // source w, h
            0, 0,         // dest x, y
            srcW, srcH    // dest w, h
          );

          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = response.dataUrl;
      }
    );
  });
}

/**
 * Core dwell detection loop
 * Checks if the current position (cursor or gaze) has stayed within
 * DWELL_RADIUS for longer than DWELL_TIME_MS, then triggers a scrape.
 */
async function dwellDetectionLoop() {
  while (true) {
    try {
      await new Promise(resolve => setTimeout(resolve, DWELL_CHECK_INTERVAL));

      // Skip if extension is disabled
      if (!extensionEnabled) {
        dwellAnchor = null;
        continue;
      }

      // Skip while typing or cursor is inside the overlay
      if (isTyping || isHoveringOverlay) {
        dwellAnchor = null;
        continue;
      }

      // Skip briefly after a scroll (content shifted under cursor)
      if (Date.now() - lastScrollTime < 500) {
        dwellAnchor = null;
        continue;
      }

      // Get current point: gaze API first, then smoothed mouse fallback
      let point = null;
      if (gazeAvailable) {
        point = await getGazePoint();
      }
      if (!point) {
        // Use smoothed position for stabler dwell detection
        point = { x: Math.round(smoothedMousePos.x), y: Math.round(smoothedMousePos.y) };
      }

      // Ignore (0,0) — mouse hasn't moved yet
      if (point.x === 0 && point.y === 0) continue;

      const now = Date.now();

      // Decay velocity when cursor is stationary (no mousemove events).
      // mousemove only fires while the cursor is moving, so mouseVelocity
      // freezes at the last measured speed once the cursor stops.  We need
      // to decay it here so the "at rest" check below can ever pass.
      const msSinceLastMove = now - lastMouseTime;
      if (msSinceLastMove > DWELL_CHECK_INTERVAL) {
        // Exponential decay: the longer since last move, the lower velocity
        const decayFactor = Math.exp(-msSinceLastMove / 300); // ~300ms half-life
        mouseVelocity = mouseVelocity * decayFactor;
      }

      if (!dwellAnchor) {
        // Start a dwell anchor (velocity gate removed — decay handles it now)
        dwellAnchor = { x: point.x, y: point.y, time: now };
        continue;
      }

      // Check if position moved outside the dwell radius
      if (distance(point, dwellAnchor) > DWELL_RADIUS) {
        // Moved away — reset anchor
        dwellAnchor = { x: point.x, y: point.y, time: now };
        continue;
      }

      // Still within radius — check how long AND that cursor is truly at rest
      const dwellDuration = now - dwellAnchor.time;

      if (dwellDuration >= DWELL_TIME_MS && mouseVelocity < VELOCITY_REST_THRESHOLD) {
        // Dwell threshold reached AND cursor is at rest — trigger scrape
        triggerSearchFromPoint(dwellAnchor.x, dwellAnchor.y);
        // Reset anchor so we don't re-trigger immediately
        dwellAnchor = null;
      }
    } catch (error) {
      console.error('[ContextGrabber] Dwell loop error:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ============================================================================
// MAIN: Initialize extension
// ============================================================================

function main() {
  console.log('[ContextGrabber] Extension loaded. Gaze mode:', ENABLE_GAZE_MODE,
    '| Dwell time:', DWELL_TIME_MS + 'ms', '| Radius:', DWELL_RADIUS + 'px');

  // ---- Detect page type ----
  const href = window.location.href;

  // PDF detection
  isPDF = document.contentType === 'application/pdf'
    || window.location.pathname.toLowerCase().endsWith('.pdf')
    || document.querySelector('embed[type="application/pdf"]') !== null;

  // PDF.js detection (Mozilla's PDF viewer, common in Firefox & many web viewers)
  // Be specific: require both .pdfViewer AND .page/.textLayer to avoid false positives
  isPDFjs = !!document.querySelector('.pdfViewer .page .textLayer')
    || !!document.querySelector('#viewer.pdfViewer');

  if (isPDF || isPDFjs) {
    console.log('[ContextGrabber] PDF detected (PDF.js:', isPDFjs, ') — smart extraction enabled');
  }

  // For Chrome's built-in PDF viewer, install a mouse-tracking overlay
  // so cursor position is captured over the <embed> element.
  if (isPDF && !isPDFjs) {
    installPDFMouseTracker();
  }

  // Google Docs detection
  isGoogleDoc = /docs\.google\.com\/document\//.test(href);
  if (isGoogleDoc) {
    console.log('[ContextGrabber] Google Doc detected — kix DOM extraction enabled');
  }

  // Google Slides detection
  isGoogleSlides = /docs\.google\.com\/presentation\//.test(href);
  if (isGoogleSlides) {
    console.log('[ContextGrabber] Google Slides detected — SVG text extraction enabled');
  }

  // For Google Docs, wait a moment for the DOM to populate
  if (isGoogleDoc || isGoogleSlides) {
    setTimeout(() => {
      const paraCount = document.querySelectorAll('.kix-paragraphrenderer').length;
      console.log('[ContextGrabber] Google Docs paragraphs found:', paraCount);
    }, 3000);
  }

  // For PDF.js, dynamically re-check after the viewer finishes rendering
  if (!isPDFjs && isPDF) {
    setTimeout(() => {
      if (document.querySelector('.pdfViewer .page .textLayer') || document.querySelector('#viewer.pdfViewer')) {
        isPDFjs = true;
        console.log('[ContextGrabber] PDF.js text layer detected after load');
      }
    }, 3000);
  }

  // Create the persistent overlay immediately
  createPersistentOverlay();

  // Start dwell detection loop
  dwellDetectionLoop();
}

// Start the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}