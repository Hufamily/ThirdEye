# Gaze Tracking + Chrome Extension Integration

This document describes the end-to-end pipeline for real-time gaze tracking with the ThirdEye Chrome extension.

## Architecture

1. **gaze2** (Python) – Computer vision model estimates gaze position on screen
2. **WebSocket server** (ws://127.0.0.1:8765) – Streams gaze coordinates at ~60 FPS
3. **Chrome extension** – Receives gaze, shows red overlay, captures gaze-centered screenshots

## Quick Start

### 1. Start the gaze tracking system

```bash
cd gaze2
pip install -r requirements.txt
pip install -r GazeFollower/requirements.txt
cd GazeFollower && pip install . && cd ..

# Run gaze cursor with API + WebSocket (requires webcam)
python gaze_cursor.py --api
```

This will:
- Show camera preview and calibration
- Display a red circle at your gaze position (pygame fullscreen)
- Start Flask API at http://127.0.0.1:5000/gaze
- Start WebSocket server at ws://127.0.0.1:8765

### 2. Load the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `contentGrabber` folder

### 3. Use the extension

1. Navigate to any webpage (http/https)
2. Click the ThirdEye extension icon to enable
3. With gaze_cursor running, you should see a **red dot** following your gaze
4. When you dwell (gaze at one spot for ~2 seconds), the extension captures a 200×200 px screenshot centered on the gaze point and processes it

## Components

| Component | Port | Purpose |
|-----------|------|---------|
| Gaze cursor | — | Fullscreen pygame window, calibration, gaze estimation |
| Flask API | 5000 | HTTP GET /gaze (fallback for polling) |
| WebSocket | 8765 | Real-time gaze stream (~60 FPS) |
| Chrome extension | — | Red overlay, dwell detection, screenshot capture |

## Edge Cases Handled

- **Extension disabled** – Red overlay hidden
- **CV offline** – Extension falls back to mouse cursor for dwell
- **Page reload** – Overlay recreated when GAZE_UPDATE arrives
- **Gaze near screen edges** – Coordinates clamped to viewport

## Troubleshooting

- **No red dot**:
  1. Make sure you're on a normal webpage (http/https) — the content script doesn't run on chrome:// pages
  2. Click the ThirdEye extension icon to ensure it's enabled (green badge)
  3. Run `python gaze_cursor.py --api` and complete calibration
  4. Keep your face visible to the camera — gaze data only streams when the model detects your face
  5. Check the extension's background: chrome://extensions → find ThirdEye → click "Service worker" → look for "Gaze WebSocket connected" or "Gaze HTTP polling started"
  6. The extension uses HTTP polling (every 200ms) as fallback when WebSocket is not connected
- **Red dot in wrong place**: Browser window position affects mapping; try fullscreen browser for best accuracy
- **Screenshot not capturing**: Click the extension icon first to grant activeTab permission
