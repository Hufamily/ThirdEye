# Quick Start Guide

## Installation

```bash
# 1. Install dependencies
pip install -r requirements.txt
pip install gazefollower

# 2. Copy environment template
cp .env.example .env

# 3. Run!
python3 main.py
```

## Common Commands

### Run Modes

```bash
# API + Display (default)
python3 main.py

# API only (headless, no display)
python3 main.py --mode api

# Display only (no API)
python3 main.py --mode display

# Skip calibration (if already calibrated)
python3 main.py --no-calibration

# Skip preview
python3 main.py --no-preview
```

### Using Startup Script

```bash
./start.sh --mode api
./start.sh --mode display
./start.sh --mode both
```

### Docker

```bash
# Build
docker build -t gaze-tracker .

# Run
docker run -d -p 5000:5000 --device=/dev/video0 gaze-tracker

# Or use docker-compose
docker-compose up -d
```

## Testing API

```bash
# Health check
curl http://localhost:5000/health

# Get gaze coordinates
curl http://localhost:5000/gaze

# Status
curl http://localhost:5000/status
```

## Configuration

Edit `.env` file:

```bash
# API
GAZE_API_PORT=5000

# Gaze offset (adjust if cursor is off)
GAZE_Y_OFFSET=0

# Display
GAZE_SHOW_CURSOR=true
GAZE_CURSOR_SIZE=100
```

## Troubleshooting

**Camera not found?**
- Linux: `sudo usermod -a -G video $USER` then logout/login
- Docker: Add `--device=/dev/video0`
- Check: `ls -la /dev/video*`

**API not responding?**
- Check logs: `tail -f logs/gaze_tracker.log`
- Check port: `lsof -i :5000`
- Test: `curl http://localhost:5000/health`

**Calibration issues?**
- Ensure good lighting
- Face camera directly
- Adjust `GAZE_Y_OFFSET` in `.env`

## Next Steps

- See [README.md](README.md) for full documentation
- See [PRODUCTION.md](PRODUCTION.md) for production deployment
