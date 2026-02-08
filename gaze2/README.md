# Gaze Tracker - Production-Ready Eye Tracking System

A production-ready, real-time gaze tracking application with RESTful API support. Tracks eye movement using webcam and provides gaze coordinates via HTTP API or visual display.

## Features

- 🎯 **Real-time Gaze Tracking** - Accurate eye tracking using webcam
- 🌐 **RESTful API** - HTTP endpoints for integration
- 🖥️ **Visual Display** - Fullscreen gaze cursor overlay
- ⚙️ **Production Ready** - Docker support, logging, error handling
- 🔧 **Configurable** - Environment-based configuration
- 📊 **Data Logging** - CSV export of gaze data
- 🚀 **Multiple Modes** - API-only, display-only, or both

## Quick Start

- Python 3.11-3.13 recommended (3.14 is not supported by all gaze dependencies)
- Webcam
- Linux/macOS/Windows

### Installation

```bash
# Clone repository
cd gaze2

# Copy environment template
cp .env.example .env

# Install dependencies
pip install -r requirements.txt
pip install gazefollower
python -m pip install --upgrade pip
pip install -r GazeFollower/requirements.txt
pip install -r requirements.txt  # Flask for API
pip install pyautogui            # optional: OS cursor control
```

### Run

```bash
# Using startup script (recommended)
./start.sh

# Or directly
python3 main.py

# API-only mode (headless)
python3 main.py --mode api

# Display-only mode
python3 main.py --mode display
```

## API Endpoints

### GET /gaze
Get current gaze coordinates.

**Response:**
```json
{
  "x": 960.5,
  "y": 540.2,
  "confidence": 0.95,
  "timestamp": 1234567890.123
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": {
    "initialized": true,
    "running": true,
    "calibrated": true,
    "has_gaze": true
  }
}
```

### GET /status
Detailed status information.

### GET /
API information and available endpoints.

## Configuration

All settings are configured via environment variables. See `.env.example` for options:

```bash
# API Configuration
GAZE_API_HOST=0.0.0.0
GAZE_API_PORT=5000

# Gaze Settings
GAZE_Y_OFFSET=0
GAZE_Y_SCALE=1.0

# Display Settings
GAZE_FULLSCREEN=true
GAZE_SHOW_CURSOR=true
```

## Docker Deployment
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

### Build and Run

```bash
# Build
docker build -t gaze-tracker .

# Run
docker run -d \
  --name gaze-tracker \
  -p 5000:5000 \
  --device=/dev/video0 \
  -v $(pwd)/data:/app/data \
  gaze-tracker
```

### Docker Compose

```bash
docker-compose up -d
```

See [PRODUCTION.md](PRODUCTION.md) for detailed deployment guide.

## Project Structure

```
gaze2/
├── main.py              # Main entry point
├── gaze_service.py      # Core gaze tracking service
├── gaze_display.py      # Visual display application
├── config.py            # Configuration management
├── api/
│   └── app.py           # Flask API application
├── GazeFollower/        # Gaze tracking library
├── requirements.txt     # Python dependencies
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose config
└── PRODUCTION.md       # Production deployment guide
```

## Usage Examples

### Python Client

```python
import requests

# Get gaze coordinates
response = requests.get('http://localhost:5000/gaze')
data = response.json()
print(f"Gaze at: ({data['x']}, {data['y']})")
```

### JavaScript Client

```javascript
fetch('http://localhost:5000/gaze')
  .then(res => res.json())
  .then(data => {
    console.log(`Gaze at: (${data.x}, ${data.y})`);
  });
```
**Usage:**
- **Standalone** (mock data): `python run_api.py` — for development without camera
- **With live gaze**: `python gaze_cursor.py --api` — runs gaze cursor + API; `/gaze` returns real coordinates
- **With live gaze + OS cursor**: `python gaze_cursor.py --api --control-cursor`

**Chrome extension integration:** When run with `--api`, gaze_cursor also starts a WebSocket server at `ws://127.0.0.1:8765` that streams gaze coordinates at ~60 FPS. The ThirdEye Chrome extension connects to this stream for real-time red overlay and gaze-centered screenshot capture.

### cURL

```bash
curl http://localhost:5000/gaze
```

## Development

### Running Tests

```bash
# Test API
curl http://localhost:5000/health

# Test gaze endpoint
curl http://localhost:5000/gaze
```

### Debug Mode

```bash
# Enable debug logging
export GAZE_API_DEBUG=true
export GAZE_LOG_LEVEL=DEBUG
python3 main.py
```

## Production Deployment

See [PRODUCTION.md](PRODUCTION.md) for:
- Systemd service setup
- Nginx reverse proxy
- Gunicorn configuration
- Security best practices
- Monitoring and scaling

## Troubleshooting

### Camera Not Found
- Check device: `ls -la /dev/video*`
- Grant permissions: `sudo usermod -a -G video $USER`
- Docker: Use `--device=/dev/video0`

### Calibration Issues
- Ensure good lighting
- Face camera directly
- Adjust `GAZE_Y_OFFSET` if needed

### API Not Responding
- Check logs: `tail -f logs/gaze_tracker.log`
- Verify port: `lsof -i :5000`
- Test health: `curl http://localhost:5000/health`
- `gaze_cursor.py` - Main application script
- `api/` - Flask API with `/gaze` endpoint
- `gaze_websocket_server.py` - WebSocket server for real-time gaze streaming
- `run_api.py` - Start the API server
- `GazeFollower/` - Gaze tracking library (based on [GazeFollower](https://github.com/GanchengZhu/GazeFollower))

## License

The GazeFollower library is licensed under CC-BY-NC-SA. See `GazeFollower/LICENSE-CC-BY-NC-SA` for details.

## Credits

Built on [GazeFollower](https://github.com/GanchengZhu/GazeFollower) by GC Zhu.
