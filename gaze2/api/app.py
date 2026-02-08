# _*_ coding: utf-8 _*_
"""
Gaze2 Flask API
Provides a /gaze endpoint that returns gaze coordinates (x, y, confidence).
Referenceable from the entire gaze2 codebase via: from api import app
CORS enabled for Chrome extension (contentGrabber) integration.
"""

import random
from flask import Flask, jsonify, request

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    """Allow Chrome extension and localhost to fetch gaze data."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/gaze", methods=["OPTIONS"])
def gaze_options():
    """Handle CORS preflight for /gaze."""
    return "", 204


@app.route("/gaze", methods=["POST"])
def gaze_update():
    """Receive gaze updates from gaze_cursor (e.g. when run as subprocess)."""
    try:
        data = request.get_json()
        if data and "x" in data and "y" in data:
            set_gaze(
                float(data["x"]),
                float(data["y"]),
                float(data.get("confidence", 1.0)),
            )
            return jsonify({"status": "ok"})
    except Exception:
        pass
    return jsonify({"status": "error"}), 400


# Shared gaze state - can be updated by gaze_cursor.py or other modules
_gaze_data = {
    "x": 0.0,
    "y": 0.0,
    "confidence": 0.0,
    "available": False,
}


def set_gaze(x: float, y: float, confidence: float = 1.0) -> None:
    """Update the shared gaze state. Call from gaze_cursor or other tracking code."""
    global _gaze_data
    _gaze_data = {"x": x, "y": y, "confidence": confidence, "available": True}


def get_gaze():
    """Get current gaze data. Used internally by /gaze endpoint."""
    return _gaze_data


@app.route("/gaze", methods=["GET"])
def gaze():
    data = get_gaze()
    if data["available"]:
        return jsonify({
            "x": data["x"],
            "y": data["y"],
            "confidence": data["confidence"],
        })
    # Fallback to mock data when no live gaze source (e.g. for development)
    return jsonify({
        "x": random.uniform(0, 1920),
        "y": random.uniform(0, 1080),
        "confidence": random.uniform(0.85, 1.0),
    })


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
