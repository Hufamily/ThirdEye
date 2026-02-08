# _*_ coding: utf-8 _*_
"""
Production-ready Flask API for Gaze Tracker
Provides RESTful endpoints for gaze tracking data
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

# Initialize Flask app
app = Flask(__name__)
if CORS_AVAILABLE:
    CORS(app, origins=CORS_ORIGINS)
else:
    # Basic CORS headers manually if flask-cors not available
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        return response

# Rate limiting storage
_rate_limit_store = {}
_rate_limit_window = timedelta(minutes=1)

# Initialize logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global gaze service (will be set by main application)
_gaze_service = None


def set_gaze_service(service):
    """Set the gaze service instance"""
    global _gaze_service
    _gaze_service = service
# Shared gaze state - can be updated by gaze_cursor.py or other modules
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
    """Update the shared gaze state. Call from gaze_cursor or other tracking code."""
    global _gaze_data
    _gaze_data = {"x": x, "y": y, "confidence": confidence, "available": True}
    if screen_width is not None:
        _gaze_data["screenWidth"] = screen_width
    if screen_height is not None:
        _gaze_data["screenHeight"] = screen_height


def _rate_limit_check(client_id: str) -> bool:
    """Simple rate limiting check"""
    now = datetime.now()
    
    if client_id not in _rate_limit_store:
        _rate_limit_store[client_id] = []
    
    # Clean old entries
    _rate_limit_store[client_id] = [
        ts for ts in _rate_limit_store[client_id]
        if now - ts < _rate_limit_window
    ]
    
    # Check limit
    if len(_rate_limit_store[client_id]) >= RATE_LIMIT_PER_MINUTE:
        return False
    
    # Add current request
    _rate_limit_store[client_id].append(now)
    return True


def _get_client_id() -> str:
    """Get client identifier for rate limiting"""
    return request.remote_addr or "unknown"


@app.route("/gaze", methods=["GET"])
def gaze():
    """
    Get current gaze coordinates
    Returns: {"x": float, "y": float, "confidence": float} or error
    """
    try:
        # Rate limiting
        if not _rate_limit_check(_get_client_id()):
            return jsonify({
                "error": "Rate limit exceeded",
                "message": f"Maximum {RATE_LIMIT_PER_MINUTE} requests per minute"
            }), 429
        
        if not _gaze_service:
            return jsonify({
                "error": "Service not available",
                "message": "Gaze tracking service is not initialized"
            }), 503
        
        status = _gaze_service.get_status()
        if not status["running"]:
            return jsonify({
                "error": "Service not running",
                "message": "Gaze tracking is not currently active"
            }), 503
        
        gaze_data = _gaze_service.get_gaze()
        
        if gaze_data is None:
            return jsonify({
                "error": "No gaze data",
                "message": "Gaze tracking is active but no gaze data is available",
                "status": status
            }), 204
        
        x, y, confidence = gaze_data
        
        return jsonify({
            "x": float(x),
            "y": float(y),
            "confidence": float(confidence),
            "timestamp": time.time()
        })
        
    except Exception as e:
        logger.error(f"Error in /gaze endpoint: {e}", exc_info=True)
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500
            "x": data["x"],
            "y": data["y"],
            "confidence": data["confidence"],
            "screenWidth": data.get("screenWidth", 1920),
            "screenHeight": data.get("screenHeight", 1080),
        })
    # Fallback to mock data when no live gaze source (e.g. for development)
    return jsonify({
        "x": random.uniform(0, 1920),
        "y": random.uniform(0, 1080),
        "confidence": random.uniform(0.85, 1.0),
        "screenWidth": 1920,
        "screenHeight": 1080,
        "available": False,
    })


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    try:
        if not _gaze_service:
            return jsonify({
                "status": "degraded",
                "message": "Gaze service not initialized"
            }), 503
        
        status = _gaze_service.get_status()
        
        return jsonify({
            "status": "healthy" if status["running"] else "degraded",
            "service": status,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error in /health endpoint: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/status", methods=["GET"])
def status():
    """Detailed status endpoint"""
    try:
        if not _gaze_service:
            return jsonify({
                "error": "Service not available"
            }), 503
        
        service_status = _gaze_service.get_status()
        gaze_data = _gaze_service.get_gaze()
        
        return jsonify({
            "service": service_status,
            "gaze": {
                "available": gaze_data is not None,
                "x": float(gaze_data[0]) if gaze_data else None,
                "y": float(gaze_data[1]) if gaze_data else None,
                "confidence": float(gaze_data[2]) if gaze_data else None
            },
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error in /status endpoint: {e}", exc_info=True)
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500


@app.route("/", methods=["GET"])
def index():
    """API information endpoint"""
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
    """Handle 404 errors"""
    return jsonify({
        "error": "Not found",
        "message": "The requested endpoint does not exist"
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}", exc_info=True)
    return jsonify({
        "error": "Internal server error",
        "message": "An unexpected error occurred"
    }), 500


if __name__ == "__main__":
    logger.warning("Running Flask development server. Use gunicorn for production.")
    app.run(host=API_HOST, port=API_PORT, debug=API_DEBUG)
