/**
 * GAZE INFERENCE WORKER
 *
 * Runs MediaPipe Face Landmarker in-browser for gaze estimation.
 * Receives camera frames, outputs normalized gaze coordinates { x: 0-1, y: 0-1 }.
 *
 * NOTE: MediaPipe tasks-vision requires DOM/Canvas. This worker is a fallback
 * design; the main implementation runs in offscreen.js (offscreen document)
 * which has full DOM access. This file documents the expected output format.
 */

// Worker receives ImageBitmap, runs inference, posts { x, y }
// MediaPipe runs in offscreen document - see contentGrabber/offscreen.js

self.onmessage = (e) => {
  if (e.data.type === 'INIT') {
    self.postMessage({ type: 'READY', error: 'Use offscreen document for MediaPipe' });
  }
};
