# _*_ coding: utf-8 _*_
"""
Flask API for Gaze Tracker
Provides RESTful endpoints for gaze tracking data.

The canonical gaze state lives in `_gaze_data` (a plain dict).
`gaze_cursor.py` calls `set_gaze()` to push new coordinates,
and `gaze_websocket_server.py` calls `get_gaze()` to read them.
"""

import logging
import time
from flask import Flask, jsonify, request
from datetime import datetime, timedelta

# Try to import CORS, make it optional
try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False

from config import API_HOST, API_PORT, API_DEBUG, CORS_ORIGINS, RATE_LIMIT_PER_MINUTE

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
if CORS_AVAILABLE:
    CORS(app, origins=CORS_ORIGINS)
else:
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        return response

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
_rate_limit_store = {}
_rate_limit_window = timedelta(minutes=1)


def _rate_limit_check(client_id: str) -> bool:
    """Simple in-memory rate limiter."""
    now = datetime.now()
    if client_id not in _rate_limit_store:
        _rate_limit_store[client_id] = []
    _rate_limit_store[client_id] = [
        ts for ts in _rate_limit_store[client_id]
        if now - ts < _rate_limit_window
    ]
    if len(_rate_limit_store[client_id]) >= RATE_LIMIT_PER_MINUTE:
        return False
    _rate_limit_store[client_id].append(now)
    return True


def _get_client_id() -> str:
    return request.remote_addr or "unknown"

# ---------------------------------------------------------------------------
# Shared gaze state (updated by gaze_cursor.py, read by WebSocket server)
# ---------------------------------------------------------------------------
_gaze_data = {
    "x": 0.0,
    "y": 0.0,
    "confidence": 0.0,
    "available": False,
    "screenWidth": 1920,
    "screenHeight": 1080,
}


def set_gaze(x: float, y: float, confidence: float = 1.0,
             screen_width: int = None, screen_height: int = None) -> None:
    """Update the shared gaze state.  Called from gaze_cursor.py."""
    global _gaze_data
    _gaze_data = {"x": x, "y": y, "confidence": confidence, "available": True}
    if screen_width is not None:
        _gaze_data["screenWidth"] = screen_width
    if screen_height is not None:
        _gaze_data["screenHeight"] = screen_height


def get_gaze() -> dict:
    """Read the current gaze state.  Called by gaze_websocket_server.py."""
    return _gaze_data

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/gaze", methods=["GET"])
def gaze():
    """Return current gaze coordinates."""
    try:
        if not _rate_limit_check(_get_client_id()):
            return jsonify({
                "error": "Rate limit exceeded",
                "message": f"Maximum {RATE_LIMIT_PER_MINUTE} requests per minute"
            }), 429

        data = _gaze_data
        if data.get("available"):
            return jsonify({
                "x": data["x"],
                "y": data["y"],
                "confidence": data["confidence"],
                "screenWidth": data.get("screenWidth", 1920),
                "screenHeight": data.get("screenHeight", 1080),
                "timestamp": time.time(),
            })

        # No live gaze source yet – return zeros with available=False
        return jsonify({
            "x": 0.0,
            "y": 0.0,
            "confidence": 0.0,
            "screenWidth": data.get("screenWidth", 1920),
            "screenHeight": data.get("screenHeight", 1080),
            "available": False,
        })

    except Exception as e:
        logger.error(f"Error in /gaze endpoint: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy" if _gaze_data.get("available") else "degraded",
        "gaze_available": _gaze_data.get("available", False),
        "timestamp": time.time(),
    })


@app.route("/status", methods=["GET"])
def status():
    """Detailed status endpoint."""
    return jsonify({
        "gaze": {
            "available": _gaze_data.get("available", False),
            "x": _gaze_data["x"],
            "y": _gaze_data["y"],
            "confidence": _gaze_data["confidence"],
        },
        "timestamp": time.time(),
    })


@app.route("/", methods=["GET"])
def index():
    """API information endpoint."""
    return jsonify({
        "name": "Gaze Tracker API",
        "version": "1.0.0",
        "endpoints": {
            "/gaze": "GET - Get current gaze coordinates",
            "/health": "GET - Health check",
            "/status": "GET - Detailed status",
            "/": "GET - API information"
        }
    })


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found", "message": "The requested endpoint does not exist"}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}", exc_info=True)
    return jsonify({"error": "Internal server error", "message": "An unexpected error occurred"}), 500


if __name__ == "__main__":
    logger.warning("Running Flask development server. Use gunicorn for production.")
    app.run(host=API_HOST, port=API_PORT, debug=API_DEBUG)
