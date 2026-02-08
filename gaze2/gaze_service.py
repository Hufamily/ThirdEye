# _*_ coding: utf-8 _*_
"""
Gaze Tracking Service
Core service that handles gaze tracking without display dependencies
Can run headless for API-only deployments
"""

import logging
import threading
import time
from typing import Optional, Tuple
from pathlib import Path

from gazefollower import GazeFollower
from config import (
    Y_OFFSET_CORRECTION,
    Y_SCALE,
    CAMERA_ID,
    MODEL_PATH,
    DATA_DIR,
    LOG_LEVEL
)

logger = logging.getLogger(__name__)


class GazeService:
    """Production-ready gaze tracking service"""
    
    def __init__(self):
        self.gf: Optional[GazeFollower] = None
        self.is_running = False
        self.is_calibrated = False
        self.current_gaze: Optional[Tuple[float, float, float]] = None  # (x, y, confidence)
        self.lock = threading.Lock()
        self._init_logging()
        
    def _init_logging(self):
        """Initialize logging"""
        logging.basicConfig(
            level=getattr(logging, LOG_LEVEL),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
    def initialize(self, skip_preview: bool = False, skip_calibration: bool = False):
        """Initialize the gaze tracker"""
        try:
            logger.info("Initializing GazeFollower...")
            
            # Initialize GazeFollower with optional model path
            if MODEL_PATH:
                from gazefollower.gaze_estimator import MGazeNetGazeEstimator
                gaze_estimator = MGazeNetGazeEstimator(model_path=MODEL_PATH)
                self.gf = GazeFollower(gaze_estimator=gaze_estimator)
            else:
                self.gf = GazeFollower()
            
            logger.info("GazeFollower initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize GazeFollower: {e}", exc_info=True)
            return False
    
    def preview(self, win=None):
        """Show camera preview"""
        if not self.gf:
            raise RuntimeError("GazeFollower not initialized")
        try:
            logger.info("Starting camera preview...")
            self.gf.preview(win=win)
            logger.info("Camera preview completed")
        except Exception as e:
            logger.error(f"Camera preview failed: {e}", exc_info=True)
            raise
    
    def calibrate(self, win=None):
        """Run calibration"""
        if not self.gf:
            raise RuntimeError("GazeFollower not initialized")
        try:
            logger.info("Starting calibration...")
            self.gf.calibrate(win=win)
            self.is_calibrated = True
            logger.info("Calibration completed successfully")
        except Exception as e:
            logger.error(f"Calibration failed: {e}", exc_info=True)
            self.is_calibrated = False
            raise
    
    def start_tracking(self):
        """Start gaze tracking"""
        if not self.gf:
            raise RuntimeError("GazeFollower not initialized")
        if not self.is_calibrated:
            raise RuntimeError("Calibration required before tracking")
        
        try:
            logger.info("Starting gaze tracking...")
            self.gf.start_sampling()
            self.is_running = True
            
            # Start update thread
            self.update_thread = threading.Thread(target=self._update_loop, daemon=True)
            self.update_thread.start()
            
            logger.info("Gaze tracking started")
        except Exception as e:
            logger.error(f"Failed to start tracking: {e}", exc_info=True)
            raise
    
    def _update_loop(self):
        """Internal loop to update gaze coordinates"""
        while self.is_running:
            try:
                gaze_info = self.gf.get_gaze_info()
                if gaze_info and gaze_info.status:
                    gaze_x = float(gaze_info.filtered_gaze_coordinates[0])
                    gaze_y = float(gaze_info.filtered_gaze_coordinates[1])
                    
                    # Apply Y-axis correction
                    from screeninfo import get_monitors
                    monitors = get_monitors()
                    screen_height = monitors[0].height if monitors else 1080
                    gaze_y = (gaze_y - screen_height / 2) * Y_SCALE + screen_height / 2 - Y_OFFSET_CORRECTION
                    
                    # Clamp to screen bounds
                    screen_width = monitors[0].width if monitors else 1920
                    gaze_x = max(0, min(screen_width, gaze_x))
                    gaze_y = max(0, min(screen_height, gaze_y))
                    
                    confidence = 1.0
                    if hasattr(gaze_info, 'confidence'):
                        confidence = float(gaze_info.confidence)
                    
                    with self.lock:
                        self.current_gaze = (gaze_x, gaze_y, confidence)
                else:
                    with self.lock:
                        self.current_gaze = None
                        
            except Exception as e:
                logger.error(f"Error in update loop: {e}", exc_info=True)
                time.sleep(0.1)
            
            time.sleep(1/60)  # ~60 FPS
    
    def get_gaze(self) -> Optional[Tuple[float, float, float]]:
        """Get current gaze coordinates (x, y, confidence)"""
        with self.lock:
            return self.current_gaze
    
    def stop_tracking(self):
        """Stop gaze tracking"""
        if not self.is_running:
            return
        
        try:
            logger.info("Stopping gaze tracking...")
            self.is_running = False
            
            if self.gf:
                self.gf.stop_sampling()
            
            logger.info("Gaze tracking stopped")
        except Exception as e:
            logger.error(f"Error stopping tracking: {e}", exc_info=True)
    
    def save_data(self, filename: Optional[str] = None):
        """Save gaze data to file"""
        if not self.gf:
            return False
        
        try:
            if filename is None:
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"gaze_session_{timestamp}.csv"
            
            filepath = DATA_DIR / filename
            self.gf.save_data(str(filepath))
            logger.info(f"Gaze data saved to {filepath}")
            return True
        except Exception as e:
            logger.error(f"Failed to save gaze data: {e}", exc_info=True)
            return False
    
    def release(self):
        """Release all resources"""
        try:
            self.stop_tracking()
            if self.gf:
                self.gf.release()
            logger.info("Resources released")
        except Exception as e:
            logger.error(f"Error releasing resources: {e}", exc_info=True)
    
    def get_status(self) -> dict:
        """Get service status"""
        return {
            "initialized": self.gf is not None,
            "running": self.is_running,
            "calibrated": self.is_calibrated,
            "has_gaze": self.current_gaze is not None
        }
