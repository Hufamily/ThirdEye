# _*_ coding: utf-8 _*_
"""
Gaze Server - Integrates gaze_cursor.py with the contentGrabber Chrome extension.

Runs the gaze API on port 8000 (matching contentGrabber's GAZE_API_URL) with CORS enabled.
Supports two modes:
  1. Full mode: API + gaze tracking (calibration, camera, overlay)
  2. API-only mode: Just the API with mock data (for testing without camera)

Usage:
  python gaze_server.py              # Full: API + gaze tracking
  python gaze_server.py --api-only    # API only (mock data, no camera)
  python gaze_server.py --port 9000  # Custom port

The contentGrabber extension polls GET http://127.0.0.1:8000/gaze for {x, y, confidence}.
"""

import argparse
import subprocess
import sys
import threading
from pathlib import Path

# Port that contentGrabber expects (GAZE_API_URL in content.js)
DEFAULT_PORT = 8000


def run_api_server(port: int) -> None:
    """Run the Flask API in the current thread (blocking)."""
    from api import app
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


def run_gaze_cursor(api_base_url: str) -> subprocess.Popen:
    """Start gaze_cursor.py as subprocess, POSTing gaze data to the API."""
    script_dir = Path(__file__).resolve().parent
    gaze_cursor = script_dir / "gaze_cursor.py"
    cmd = [
        sys.executable,
        str(gaze_cursor),
        "--no-api",
        "--api-url", api_base_url,
    ]
    return subprocess.Popen(cmd, cwd=str(script_dir))


def main():
    parser = argparse.ArgumentParser(
        description="Gaze server for contentGrabber Chrome extension"
    )
    parser.add_argument(
        "--api-only",
        action="store_true",
        help="Run only the API with mock data (no camera, for testing)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port for the gaze API (default: {DEFAULT_PORT})",
    )
    args = parser.parse_args()

    api_url = f"http://127.0.0.1:{args.port}"

    if args.api_only:
        print(f"[Gaze Server] API-only mode on {api_url}")
        print(f"[Gaze Server] GET {api_url}/gaze - returns mock gaze data")
        print("[Gaze Server] No camera needed. Press Ctrl+C to stop.")
        run_api_server(args.port)
        return

    # Full mode: start API in background thread, then run gaze_cursor
    print(f"[Gaze Server] Starting API on {api_url}")
    api_thread = threading.Thread(
        target=run_api_server,
        args=(args.port,),
        daemon=True,
    )
    api_thread.start()

    # Give the API a moment to bind
    import time
    time.sleep(1)

    print("[Gaze Server] Starting gaze tracking (gaze_cursor.py)...")
    print("[Gaze Server] Complete calibration when prompted, then browse with contentGrabber.")
    proc = run_gaze_cursor(api_url)

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()
    finally:
        print("[Gaze Server] Stopped.")


if __name__ == "__main__":
    main()
