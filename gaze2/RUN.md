# How to Run the Gaze Tracker

## Quick Start

### 1. First Time Setup

```bash
cd /Users/jy/Desktop/ThirdEye/gaze2

# Install dependencies
pip install -r requirements.txt
pip install gazefollower

# Copy environment file (optional - has defaults)
cp .env.example .env
```

### 2. Run the Application

#### Option A: Display Mode (Recommended for first time)
Shows visual gaze cursor on screen:

```bash
python3 main.py --mode display
```

**What happens:**
1. Camera preview window opens → Close it when ready
2. Calibration screen appears → Follow the calibration points with your eyes
3. Fullscreen black window with red circle → Circle follows your gaze
4. Press **ESC** to exit

#### Option B: API + Display Mode
Runs both the visual display AND the API server:

```bash
python3 main.py --mode both
```

Then in another terminal, test the API:
```bash
curl http://localhost:5000/gaze
curl http://localhost:5000/health
```

#### Option C: API Only (Headless)
For server deployments without display:

```bash
python3 main.py --mode api --skip-init
```

### 3. Using the Startup Script

```bash
# Make executable (first time only)
chmod +x start.sh

# Run
./start.sh --mode display
./start.sh --mode both
./start.sh --mode api
```

## Command Line Options

```bash
python3 main.py [OPTIONS]

Options:
  --mode {api,display,both}    Run mode (default: both)
  --no-preview                  Skip camera preview
  --no-calibration              Skip calibration
  --skip-init                   Skip initialization (API-only)
```

## Examples

### Skip Preview (if already tested)
```bash
python3 main.py --mode display --no-preview
```

### Skip Calibration (if already calibrated)
```bash
python3 main.py --mode display --no-calibration
```

### Windowed Mode (not fullscreen)
```bash
python3 gaze_display.py --windowed
```

## Testing the API

While running with `--mode both`:

```bash
# Get current gaze coordinates
curl http://localhost:5000/gaze

# Health check
curl http://localhost:5000/health

# Detailed status
curl http://localhost:5000/status

# API information
curl http://localhost:5000/
```

## Troubleshooting

### Port 5000 Already in Use
Use a different port:
```bash
GAZE_API_PORT=5001 python3 main.py --mode both
```

### Camera Not Found
- Check camera permissions
- On Linux: `sudo usermod -a -G video $USER` then logout/login
- List cameras: `ls -la /dev/video*`

### Calibration Issues
- Ensure good lighting
- Face camera directly
- Follow calibration points carefully
- Adjust `GAZE_Y_OFFSET` in `.env` if cursor is offset

## Next Steps

- See `README.md` for full documentation
- See `PRODUCTION.md` for deployment guide
- See `QUICKSTART.md` for quick reference
