# ThirdEye
Your third eye: the browser that reads your mind

## Features

- **Dwell-based context capture**: Hover over content for 2 seconds to automatically search for related information
- **Centered context window**: Captures text centered around your cursor position (10 lines before and after)
- **Toggle on/off**: Enable or disable the extension without reloading the page
  - Click the extension icon in the toolbar
  - Use keyboard shortcut: `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac)
  - Click the play/pause button in the overlay
- **Gaze tracking support**: Optionally use eye tracking API for hands-free browsing
- **Works on special pages**: Google Docs, Google Slides, and PDF.js viewers

## Configuration

Edit `content.js` to customize:
- `DWELL_TIME_MS`: How long to hover before triggering (default: 2000ms)
- `CONTEXT_LINES_BEFORE` / `CONTEXT_LINES_AFTER`: Context window size (default: 10 lines each)
- `ENABLE_GAZE_MODE`: Enable gaze tracking API (default: false)
- `GAZE_API_URL` / `ANALYZE_API_URL`: API endpoints
