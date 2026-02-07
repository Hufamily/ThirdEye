/**
 * CONTENT SCRIPT - Dwell-Based Context Grabber
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

// ============================================================================
// CONFIGURATION - MODIFY THESE FOR YOUR SETUP
// ============================================================================

/** Gaze tracking API endpoint (GET request) */
const GAZE_API_URL = 'http://localhost:8000/gaze';

/** Analysis API endpoint (POST request) */
const ANALYZE_API_URL = 'http://localhost:8000/analyze';

/** Enable/disable gaze tracking (set to false to use cursor-only mode) */
const ENABLE_GAZE_MODE = false;

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

// ============================================================================
// STATE
// ============================================================================

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
let lastSnapshotDataUrl = null;       // Last captured snapshot
let activeTab = 'web';                // 'web' or 'images' — which tab is shown
let isHoveringOverlay = false;        // Tracks if cursor is inside the overlay
let lastExtractedRegionKey = '';      // De-dup key for special page extractions
let pdfTrackingOverlay = null;        // Transparent overlay for PDF mouse tracking
let lastScrollTime = 0;               // Timestamp of last scroll event

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
}, { passive: true, capture: true });

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
    if (container) {
      text = extractRichContext(container);
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
  if (currentOverlay) return;

  // Inject styles
  if (!document.getElementById('context-grabber-styles')) {
    const style = document.createElement('style');
    style.id = 'context-grabber-styles';
    style.textContent = getOverlayStyles();
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'context-grabber-overlay';
  overlay.className = 'cg-overlay';
  overlay.innerHTML = `
    <div class="cg-overlay-content">
      <div class="cg-overlay-header">
        <span class="cg-title">Context Grabber</span>
        <span class="cg-status" id="cg-status">Watching...</span>
        <button class="cg-minimize-btn" aria-label="Minimize">&#8212;</button>
      </div>
      <div class="cg-body" id="cg-body">
        <div class="cg-section"><p class="cg-hint">Hover over content for ${DWELL_TIME_MS / 1000}s to search.</p></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  currentOverlay = overlay;
  overlayVisible = true;

  // Minimize/restore toggle
  const minimizeBtn = overlay.querySelector('.cg-minimize-btn');
  const body = overlay.querySelector('#cg-body');
  minimizeBtn.addEventListener('click', () => {
    const isMinimized = body.style.display === 'none';
    body.style.display = isMinimized ? 'block' : 'none';
    minimizeBtn.innerHTML = isMinimized ? '&#8212;' : '&#9744;';
    overlayVisible = isMinimized;
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
  if (body) body.innerHTML = html;
}

/**
 * Updates the status indicator text
 * @param {string} text - Status text
 */
function setOverlayStatus(text) {
  if (!currentOverlay) return;
  const status = currentOverlay.querySelector('#cg-status');
  if (status) status.textContent = text;
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

  updateOverlayContent(html);
  setOverlayStatus('Analysis ready');
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
      background: white;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-y: auto;
      pointer-events: auto;
    }

    .cg-overlay-content {
      padding: 16px;
      color: #333;
      font-size: 14px;
      line-height: 1.5;
    }

    .cg-close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #999;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .cg-close-btn:hover {
      background: #f0f0f0;
      color: #333;
    }

    .cg-section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #eee;
    }

    .cg-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .cg-section strong {
      display: block;
      margin-bottom: 8px;
      color: #4CAF50;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cg-section p {
      margin: 0;
      padding: 0;
    }

    .cg-section ul {
      margin: 0;
      padding-left: 20px;
      list-style: disc;
    }

    .cg-section li {
      margin: 4px 0;
      padding: 0;
    }

    /* Prevent text selection while maintaining readability */
    #context-grabber-overlay {
      user-select: text;
    }

    /* Scrollbar styling */
    #context-grabber-overlay::-webkit-scrollbar {
      width: 6px;
    }

    #context-grabber-overlay::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }

    #context-grabber-overlay::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 3px;
    }

    #context-grabber-overlay::-webkit-scrollbar-thumb:hover {
      background: #999;
    }

    /* Overlay header bar */
    .cg-overlay-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
      margin-bottom: 10px;
      border-bottom: 1px solid #eee;
    }

    .cg-title {
      font-weight: 700;
      font-size: 14px;
      color: #333;
    }

    .cg-status {
      font-size: 11px;
      color: #999;
      flex: 1;
      text-align: right;
      margin-right: 8px;
    }

    .cg-minimize-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #999;
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
      background: #f0f0f0;
      color: #333;
    }

    .cg-hint {
      color: #999;
      font-style: italic;
    }

    .cg-loading {
      color: #4CAF50;
      font-style: italic;
      padding: 8px 0;
    }

    /* Search result items */
    .cg-result-item {
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    .cg-result-item:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .cg-result-title {
      color: #1a0dab;
      text-decoration: none;
      font-size: 15px;
      font-weight: 500;
      display: block;
      margin-bottom: 2px;
      cursor: pointer;
    }

    .cg-result-title:hover {
      text-decoration: underline;
    }

    .cg-result-url {
      color: #006621;
      font-size: 12px;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .cg-result-snippet {
      color: #545454;
      font-size: 13px;
      line-height: 1.4;
    }

    /* Snapshot preview */
    .cg-snapshot-wrap {
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
      max-height: 200px;
    }

    .cg-snapshot-img {
      width: 100%;
      height: auto;
      display: block;
    }

    /* Tab bar */
    .cg-tab-bar {
      display: flex;
      border-bottom: 2px solid #eee;
      margin-bottom: 12px;
    }

    .cg-tab {
      background: none;
      border: none;
      padding: 6px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #888;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .cg-tab:hover {
      color: #333;
    }

    .cg-tab-active {
      color: #4CAF50;
      border-bottom-color: #4CAF50;
    }

    /* Image grid */
    .cg-image-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .cg-image-card {
      border: 1px solid #eee;
      border-radius: 4px;
      overflow: hidden;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      transition: box-shadow 0.2s;
    }

    .cg-image-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    .cg-image-card img {
      width: 100%;
      height: 100px;
      object-fit: cover;
      display: block;
    }

    .cg-image-label {
      font-size: 11px;
      color: #555;
      padding: 4px 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
// MESSAGE HANDLER: Receive analysis results from background worker
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_ANALYSIS') {
    showOverlay(message.data);
    sendResponse({ success: true });
  }

  // Extension icon was clicked → grab context and search Google
  if (message.type === 'GRAB_CONTEXT') {
    handleGrabContext();
    sendResponse({ received: true });
  }

  // Receive Google search results from background
  if (message.type === 'SHOW_SEARCH_RESULTS') {
    showSearchResultsOverlay(message.data);
    sendResponse({ success: true });
  }

  // Receive Google Images results from background
  if (message.type === 'SHOW_IMAGE_RESULTS') {
    showImageResultsInOverlay(message.data);
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
    } else {
      console.warn('[ContextGrabber] Backend image analysis failed:', err.message);
    }
    return null;
  }
}

/**
 * Sends extracted text to background for Google search + image search.
 * Also captures a snapshot of the area around the dwell point.
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

  // 1) Capture a snapshot of the area around the dwell point
  try {
    const snapshot = await captureAreaSnapshot(x, y);
    lastSnapshotDataUrl = snapshot;
  } catch (err) {
    console.warn('[ContextGrabber] Snapshot capture failed:', err);
    lastSnapshotDataUrl = null;
  }

  // 2) Try backend image analysis first (if configured)
  let backendResults = null;
  if (lastSnapshotDataUrl && ANALYZE_API_URL) {
    console.log('[ContextGrabber] Sending snapshot to backend analysis...');
    setOverlayStatus('Backend analysis...');
    backendResults = await sendImageToBackend(lastSnapshotDataUrl);
  }

  // 3) If backend returned results, display them and skip Google search
  if (backendResults && backendResults.length > 0) {
    console.log('[ContextGrabber] Backend provided', backendResults.length, 'results');
    // Display backend results using existing overlay function
    showSearchResultsOverlay({
      query: text.substring(0, 60) + '...',
      results: backendResults
    });
    return;
  }

  // 4) Fall back to Google text search
  console.log('[ContextGrabber] Falling back to Google text search');
  setOverlayStatus('Searching Google...');

  // Request web search results
  chrome.runtime.sendMessage(
    { type: 'SEARCH_GOOGLE', data: { url, text } },
    response => {
      if (chrome.runtime.lastError) {
        console.error('[ContextGrabber] Message error:', chrome.runtime.lastError);
      }
    }
  );

  // Request image search results in parallel
  chrome.runtime.sendMessage(
    { type: 'SEARCH_GOOGLE_IMAGES', data: { url, text } },
    response => {
      if (chrome.runtime.lastError) {
        console.error('[ContextGrabber] Image search message error:', chrome.runtime.lastError);
      }
    }
  );

  // If text extraction was thin, try OCR on the snapshot
  if (lastSnapshotDataUrl && text.replace(/\[.*?\]/g, '').trim().length < 60) {
    console.log('[ContextGrabber] Text is thin, attempting OCR on snapshot...');
    setOverlayStatus('Running OCR...');
    performClientOCR(lastSnapshotDataUrl).then(ocrText => {
      if (ocrText && ocrText.trim().length > 10) {
        console.log('[ContextGrabber] OCR extracted:', ocrText.substring(0, 80));
        // Re-search with better text from OCR
        chrome.runtime.sendMessage(
          { type: 'SEARCH_GOOGLE', data: { url, text: ocrText.trim() } },
          () => {
            if (chrome.runtime.lastError) {
              console.error('[ContextGrabber] OCR re-search error:', chrome.runtime.lastError);
            }
          }
        );
      }
    }).catch(err => {
      console.warn('[ContextGrabber] OCR failed:', err);
    });
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
          return reject(chrome.runtime.lastError);
        }
        if (!response || !response.dataUrl) {
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