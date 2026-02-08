/**
 * OFFSCREEN DOCUMENT - Camera + Gaze Inference
 *
 * Handles:
 * - getUserMedia for camera access
 * - MediaPipe Face Landmarker for face/iris detection
 * - Gaze estimation from landmarks → normalized { x: 0-1, y: 0-1 }
 * - Posts gaze updates to extension via chrome.runtime
 *
 * Data flow: Camera → MediaPipe → gaze coords → background → content script
 */

(function () {
  'use strict';

  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;

  let faceLandmarker = null;
  let video = null;
  let canvas = null;
  let ctx = null;
  let stream = null;
  let lastVideoTime = -1;
  let animId = null;
  let isRunning = false;

  // Gaze smoothing (EMA)
  let smoothedX = 0.5;
  let smoothedY = 0.5;
  const SMOOTH = 0.4;

  // Face landmark indices (MediaPipe Face Mesh)
  // Iris centers when output_face_blendshapes/iris enabled: 468-477
  // Fallback: nose tip (4), face center from eye corners
  const NOSE_TIP = 4;
  const LEFT_EYE_INNER = 133;
  const RIGHT_EYE_INNER = 362;
  const LEFT_EYE_OUTER = 33;
  const RIGHT_EYE_OUTER = 263;
  const FOREHEAD = 10;

  /**
   * Estimate gaze from face landmarks.
   * Maps face/iris position to normalized screen coordinates (0-1).
   * Webcam is mirrored: user looking left = face moves right in frame.
   */
  function landmarksToGaze(landmarks) {
    if (!landmarks || landmarks.length < 10) return null;

    const nl = landmarks.length;

    // Iris indices (468-477) if available; else use eye centers
    let gazeX, gazeY;

    if (nl >= 478) {
      // Iris centroids: left 468-472, right 473-477
      const leftIris = landmarks.slice(468, 473);
      const rightIris = landmarks.slice(473, 478);
      const lx = leftIris.reduce((s, p) => s + p.x, 0) / 5;
      const ly = leftIris.reduce((s, p) => s + p.y, 0) / 5;
      const rx = rightIris.reduce((s, p) => s + p.x, 0) / 5;
      const ry = rightIris.reduce((s, p) => s + p.y, 0) / 5;
      gazeX = (lx + rx) / 2;
      gazeY = (ly + ry) / 2;
    } else {
      // Fallback: midpoint of eye corners + nose
      const eyeCenterX = (landmarks[LEFT_EYE_INNER].x + landmarks[RIGHT_EYE_INNER].x) / 2;
      const eyeCenterY = (landmarks[LEFT_EYE_INNER].y + landmarks[RIGHT_EYE_INNER].y) / 2;
      gazeX = (eyeCenterX + landmarks[NOSE_TIP].x) / 2;
      gazeY = (eyeCenterY + landmarks[NOSE_TIP].y) / 2;
    }

    // Map from face/video coords to screen. Webcam is mirrored.
    // When user looks at left of screen, face center shifts right in video.
    const x = 1 - gazeX;  // Mirror horizontal
    const y = gazeY;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function processFrame() {
    if (!video || !faceLandmarker || !isRunning) return;

    const now = performance.now() / 1000;
    if (video.currentTime === lastVideoTime) {
      animId = requestAnimationFrame(processFrame);
      return;
    }
    lastVideoTime = video.currentTime;

    try {
      const result = faceLandmarker.detectForVideo(video, lastVideoTime * 1000);
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const gaze = landmarksToGaze(result.faceLandmarks[0]);
        if (gaze) {
          smoothedX = SMOOTH * gaze.x + (1 - SMOOTH) * smoothedX;
          smoothedY = SMOOTH * gaze.y + (1 - SMOOTH) * smoothedY;
          chrome.runtime.sendMessage({
            type: 'GAZE_UPDATE',
            gaze: { x: smoothedX, y: smoothedY },
            confidence: 0.9
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[ThirdEye Gaze] Detection error:', err);
    }

    animId = requestAnimationFrame(processFrame);
  }

  async function initCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      console.error('[ThirdEye Gaze] Camera error:', err);
      chrome.runtime.sendMessage({
        type: 'GAZE_ERROR',
        error: err.message || 'Camera access denied'
      }).catch(() => {});
      return false;
    }
  }

  async function initFaceLandmarker() {
    const vision = await globalThis.FilesetResolver.forVisionTasks(WASM_PATH);
    faceLandmarker = await globalThis.FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU'
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }

  async function start() {
    if (isRunning) return;
    video = document.getElementById('camera');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    if (typeof globalThis.FaceLandmarker === 'undefined' || typeof globalThis.FilesetResolver === 'undefined') {
      chrome.runtime.sendMessage({
        type: 'GAZE_ERROR',
        error: 'MediaPipe not loaded'
      }).catch(() => {});
      return;
    }

    try {
      await initFaceLandmarker();
      const ok = await initCamera();
      if (!ok) return;

      isRunning = true;
      lastVideoTime = -1;
      processFrame();

      chrome.runtime.sendMessage({ type: 'GAZE_STARTED' }).catch(() => {});
    } catch (err) {
      console.error('[ThirdEye Gaze] Init error:', err);
      chrome.runtime.sendMessage({
        type: 'GAZE_ERROR',
        error: err.message || 'Failed to start gaze'
      }).catch(() => {});
    }
  }

  function stop() {
    isRunning = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (video && video.srcObject)video.srcObject = null;
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
    }
    chrome.runtime.sendMessage({ type: 'GAZE_STOPPED' }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_GAZE') {
      start().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    if (msg.type === 'STOP_GAZE') {
      stop();
      sendResponse({ ok: true });
      return false;
    }
  });

  console.log('[ThirdEye Gaze] Offscreen document ready');
})();
