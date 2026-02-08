# _*_ coding: utf-8 _*_
"""
Production configuration for Gaze Tracker
Supports environment variables for easy deployment
"""

import os
from pathlib import Path

# Load environment variables from .env file if it exists (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, use system env vars only

# Base directory
BASE_DIR = Path(__file__).parent

# API Configuration
API_HOST = os.getenv("GAZE_API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("GAZE_API_PORT", "5000"))
API_DEBUG = os.getenv("GAZE_API_DEBUG", "false").lower() == "true"

# Gaze Tracker Configuration
Y_OFFSET_CORRECTION = float(os.getenv("GAZE_Y_OFFSET", "50"))
Y_SCALE = float(os.getenv("GAZE_Y_SCALE", "1.0"))
CALIBRATION_REQUIRED = os.getenv("GAZE_CALIBRATION_REQUIRED", "true").lower() == "true"
PREVIEW_REQUIRED = os.getenv("GAZE_PREVIEW_REQUIRED", "true").lower() == "true"

# Display Configuration
FULLSCREEN = os.getenv("GAZE_FULLSCREEN", "true").lower() == "true"
SHOW_CURSOR = os.getenv("GAZE_SHOW_CURSOR", "true").lower() == "true"
CURSOR_SIZE = int(os.getenv("GAZE_CURSOR_SIZE", "100"))
CURSOR_ALPHA = int(os.getenv("GAZE_CURSOR_ALPHA", "180"))

# Data Storage
DATA_DIR = Path(os.getenv("GAZE_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(exist_ok=True, parents=True)

# Logging
LOG_LEVEL = os.getenv("GAZE_LOG_LEVEL", "INFO")
LOG_FILE = os.getenv("GAZE_LOG_FILE", str(BASE_DIR / "logs" / "gaze_tracker.log"))

# Camera Configuration
CAMERA_ID = int(os.getenv("GAZE_CAMERA_ID", "0"))

# Model Configuration
MODEL_PATH = os.getenv("GAZE_MODEL_PATH", "")

# API Rate Limiting (requests per minute)
RATE_LIMIT_PER_MINUTE = int(os.getenv("GAZE_RATE_LIMIT", "60"))

# CORS Configuration
CORS_ORIGINS = os.getenv("GAZE_CORS_ORIGINS", "*").split(",")
