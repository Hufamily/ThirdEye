# Gaze2 - Gaze Tracking Cursor Display

A real-time gaze tracking application that displays a red transparent circle at your gaze position on screen.

## Features

- Fullscreen gaze cursor display
- Real-time gaze tracking using webcam
- Red transparent circle that follows your gaze
- ESC key to exit
- Automatic calibration
- Saves gaze data to CSV file

## Requirements

- Python 3.11-3.13 recommended (3.14 is not supported by all gaze dependencies)
- Webcam
- See `GazeFollower/requirements.txt` for dependencies

## Installation

1. Install dependencies:
```bash
python -m pip install --upgrade pip
pip install -r GazeFollower/requirements.txt
pip install -r requirements.txt  # Flask for API
pip install pyautogui            # optional: OS cursor control
```

2. Install the GazeFollower package:
```bash
cd GazeFollower
pip install .
```

## Usage

Run the gaze cursor script:
```bash
python gaze_cursor.py
```

To move your actual OS cursor with gaze:
```bash
python gaze_cursor.py --control-cursor
```

The application will:
1. Show a camera preview (close when ready)
2. Run calibration (follow the calibration points)
3. Start tracking and display the red circle at your gaze position
4. If `--control-cursor` is enabled, also moves the OS cursor
5. Press ESC to exit

Gaze data will be saved to `./data/gaze_cursor_session.csv`

## API

A Flask API exposes gaze coordinates at `GET /gaze`:

```python
# Reference from anywhere in the codebase
from api import app
```

**Endpoints:**
- `GET /gaze` → `{"x": 960.5, "y": 540.2, "confidence": 0.95}`
- `GET /health` → `{"status": "ok"}`

**Usage:**
- **Standalone** (mock data): `python run_api.py` — for development without camera
- **With live gaze**: `python gaze_cursor.py --api` — runs gaze cursor + API; `/gaze` returns real coordinates
- **With live gaze + OS cursor**: `python gaze_cursor.py --api --control-cursor`

## Project Structure

- `gaze_cursor.py` - Main application script
- `api/` - Flask API with `/gaze` endpoint
- `run_api.py` - Start the API server
- `GazeFollower/` - Gaze tracking library (based on [GazeFollower](https://github.com/GanchengZhu/GazeFollower))

## License

The GazeFollower library is licensed under CC-BY-NC-SA. See `GazeFollower/LICENSE-CC-BY-NC-SA` for details.
