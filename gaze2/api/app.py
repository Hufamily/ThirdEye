# _*_ coding: utf-8 _*_
"""
Gaze2 Flask API
Provides a /gaze endpoint that returns gaze coordinates (x, y, confidence).
Referenceable from the entire gaze2 codebase via: from api import app
"""

import random
from flask import Flask, jsonify

app = Flask(__name__)

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
