/**
 * GAZE OVERLAY - Red circle at gaze position
 *
 * Injected by content.js when gaze tracking is active.
 * Renders position: fixed, pointer-events: none.
 * Scaled to window.innerWidth / innerHeight.
 * Updates on every GAZE_UPDATE message.
 */

(function () {
  'use strict';

  const CIRCLE_SIZE = 24;
  const CIRCLE_COLOR = 'rgba(255, 0, 0, 0.6)';
  const CIRCLE_BORDER = '2px solid rgba(255, 0, 0, 0.9)';

  let overlay = null;
  let circle = null;
  let isVisible = false;

  function createOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'thirdeye-gaze-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483645;
    `;

    circle = document.createElement('div');
    circle.style.cssText = `
      position: absolute;
      width: ${CIRCLE_SIZE}px;
      height: ${CIRCLE_SIZE}px;
      border-radius: 50%;
      background: ${CIRCLE_COLOR};
      border: ${CIRCLE_BORDER};
      transform: translate(-50%, -50%);
      left: 50%;
      top: 50%;
      transition: left 0.05s ease-out, top 0.05s ease-out;
    `;

    overlay.appendChild(circle);
    return overlay;
  }

  function showOverlay() {
    createOverlay();
    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'block';
    isVisible = true;
  }

  function hideOverlay() {
    if (overlay) {
      overlay.style.display = 'none';
    }
    isVisible = false;
  }

  function updatePosition(normalizedX, normalizedY) {
    if (!circle || !isVisible) return;

    const x = normalizedX * window.innerWidth;
    const y = normalizedY * window.innerHeight;

    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GAZE_UPDATE' && msg.gaze) {
      if (!isVisible) showOverlay();
      updatePosition(msg.gaze.x, msg.gaze.y);
    }
    if (msg.type === 'GAZE_STOPPED' || msg.type === 'GAZE_ERROR') {
      hideOverlay();
    }
  });

  window.addEventListener('resize', () => {
    if (circle && isVisible) {
      const left = parseFloat(circle.style.left);
      const top = parseFloat(circle.style.top);
      if (!isNaN(left) && !isNaN(top)) {
        const nx = left / window.innerWidth;
        const ny = top / window.innerHeight;
        updatePosition(nx, ny);
      }
    }
  });

  window.thirdeyeGazeOverlay = {
    show: showOverlay,
    hide: hideOverlay,
    update: updatePosition
  };

  console.log('[ThirdEye Gaze] Overlay script loaded');
})();
