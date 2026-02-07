/**
 * OVERLAY MODULE - Handles UI display and user interactions
 * 
 * This file contains extracted overlay functionality for better code organization.
 * It's primarily for reference; the actual implementation is integrated into content.js
 * 
 * OPTIONAL: If you want to use this as a separate module:
 * 1. Remove showOverlay(), getOverlayStyles(), and escapeHtml() from content.js
 * 2. Import these functions from overlay.js
 * 3. Update content script references to use imported functions
 */

let currentOverlay = null;

/**
 * Creates and displays the overlay with analysis results
 * Automatically dismisses after 15 seconds or when user clicks close
 * 
 * @param {Object} result - Analysis result from backend
 * @param {string} result.summary - Summary text
 * @param {string[]} result.confusion_points - List of confusion points
 * @param {string[]} result.image_queries - List of image queries
 */
function showOverlay(result) {
  // Remove existing overlay
  if (currentOverlay) {
    currentOverlay.remove();
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'context-grabber-overlay';
  overlay.className = 'cg-overlay';

  // Build HTML content
  let html = '<div class="cg-overlay-content">';
  
  // Close button
  html += '<button class="cg-close-btn" aria-label="Close">✕</button>';

  // Summary
  if (result.summary) {
    html += `<div class="cg-section"><strong>Summary</strong><p>${escapeHtml(result.summary)}</p></div>`;
  }

  // Confusion points
  if (result.confusion_points && result.confusion_points.length > 0) {
    html += '<div class="cg-section"><strong>Questions/Confusion</strong><ul>';
    result.confusion_points.forEach(point => {
      html += `<li>${escapeHtml(point)}</li>`;
    });
    html += '</ul></div>';
  }

  // Image queries
  if (result.image_queries && result.image_queries.length > 0) {
    html += '<div class="cg-section"><strong>Helpful Images</strong><ul>';
    result.image_queries.forEach(query => {
      html += `<li><em>${escapeHtml(query)}</em></li>`;
    });
    html += '</ul></div>';
  }

  html += '</div>';
  overlay.innerHTML = html;

  // Inject styles if not already present
  if (!document.getElementById('context-grabber-styles')) {
    const style = document.createElement('style');
    style.id = 'context-grabber-styles';
    style.textContent = getOverlayStyles();
    document.head.appendChild(style);
  }

  // Add to page
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  // Close button handler
  const closeBtn = overlay.querySelector('.cg-close-btn');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    currentOverlay = null;
  });

  // Auto-close after 15 seconds
  setTimeout(() => {
    if (currentOverlay === overlay) {
      overlay.remove();
      currentOverlay = null;
    }
  }, 15000);
}

/**
 * Gets the CSS styles for the overlay
 * Returned as a string to be injected as a <style> element
 * 
 * Positioning: Fixed top-right, doesn't block page interaction
 * Styling: Clean, modern appearance matching material design principles
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
  `;
}

/**
 * Escapes HTML special characters to prevent injection
 * Prevents XSS attacks when displaying user-generated content
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML-safe text
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

/**
 * Hides the current overlay without removing it
 * Useful if you want to toggle overlay visibility
 */
function hideOverlay() {
  if (currentOverlay) {
    currentOverlay.style.display = 'none';
  }
}

/**
 * Shows the currently hidden overlay
 * Complements hideOverlay() for toggle functionality
 */
function showCurrentOverlay() {
  if (currentOverlay) {
    currentOverlay.style.display = 'block';
  }
}

/**
 * Removes the overlay from the DOM
 */
function removeOverlay() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}

/**
 * Gets reference to the current overlay element (if any)
 * @returns {Element | null} The current overlay element or null
 */
function getCurrentOverlay() {
  return currentOverlay;
}