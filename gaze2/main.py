# _*_ coding: utf-8 _*_
"""
Main entry point for Gaze Tracker
Supports both API-only and display modes
"""

import argparse
import logging
import signal
import sys
import threading
import time

from gaze_service import GazeService
from api.app import app, set_gaze_service
from config import (
    API_HOST,
    API_PORT,
    API_DEBUG,
    PREVIEW_REQUIRED,
    CALIBRATION_REQUIRED
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global service instance
gaze_service = None


def signal_handler(sig, frame):
    """Handle shutdown signals"""
    logger.info("Shutdown signal received, cleaning up...")
    if gaze_service:
        gaze_service.save_data()
        gaze_service.release()
    sys.exit(0)


def run_api_server():
    """Run Flask API server"""
    logger.info(f"Starting API server on {API_HOST}:{API_PORT}")
    if API_DEBUG:
        app.run(host=API_HOST, port=API_PORT, debug=True, use_reloader=False)
    else:
        # For production, use gunicorn (imported here to avoid dependency if not needed)
        try:
            import gunicorn.app.base
            
            class StandaloneApplication(gunicorn.app.base.BaseApplication):
                def __init__(self, app, options=None):
                    self.options = options or {}
                    self.application = app
                    super().__init__()
                
                def load_config(self):
                    for key, value in self.options.items():
                        self.cfg.set(key.lower(), value)
                
                def load(self):
                    return self.application
            
            options = {
                'bind': f'{API_HOST}:{API_PORT}',
                'workers': 2,
                'worker_class': 'sync',
                'timeout': 120,
                'keepalive': 5,
            }
            StandaloneApplication(app, options).run()
        except ImportError:
            logger.warning("gunicorn not installed, using Flask dev server")
            app.run(host=API_HOST, port=API_PORT, debug=False, use_reloader=False)


def main():
    global gaze_service
    
    parser = argparse.ArgumentParser(description="Gaze Tracker - Production Server")
    parser.add_argument("--mode", choices=["api", "display", "both"], default="both",
                       help="Run mode: api-only, display-only, or both")
    parser.add_argument("--no-preview", action="store_true", help="Skip camera preview")
    parser.add_argument("--no-calibration", action="store_true", help="Skip calibration")
    parser.add_argument("--skip-init", action="store_true", 
                       help="Skip initialization (for API-only mode without camera)")
    args = parser.parse_args()
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize gaze service
    if not args.skip_init:
        gaze_service = GazeService()
        
        try:
            if not gaze_service.initialize():
                logger.error("Failed to initialize gaze service")
                return 1
            
            # Preview
            if PREVIEW_REQUIRED and not args.no_preview and args.mode != "api":
                logger.info("Starting camera preview...")
                try:
                    import pygame
                    from screeninfo import get_monitors
                    pygame.init()
                    monitors = get_monitors()
                    screen_width = monitors[0].width if monitors else 1920
                    screen_height = monitors[0].height if monitors else 1080
                    win = pygame.display.set_mode((screen_width, screen_height))
                    gaze_service.preview(win=win)
                    pygame.quit()
                except Exception as e:
                    logger.warning(f"Preview failed: {e}")
            
            # Calibrate
            if CALIBRATION_REQUIRED and not args.no_calibration and args.mode != "api":
                logger.info("Starting calibration...")
                try:
                    import pygame
                    from screeninfo import get_monitors
                    pygame.init()
                    monitors = get_monitors()
                    screen_width = monitors[0].width if monitors else 1920
                    screen_height = monitors[0].height if monitors else 1080
                    win = pygame.display.set_mode((screen_width, screen_height))
                    gaze_service.calibrate(win=win)
                    pygame.quit()
                except Exception as e:
                    logger.error(f"Calibration failed: {e}")
                    if CALIBRATION_REQUIRED:
                        return 1
            
            # Start tracking
            if args.mode != "api":
                gaze_service.start_tracking()
            
        except Exception as e:
            logger.error(f"Failed to setup gaze service: {e}", exc_info=True)
            return 1
    
    # Set service in API
    set_gaze_service(gaze_service)
    
    # Start API server
    if args.mode in ["api", "both"]:
        if args.mode == "both":
            # Run API in background thread
            api_thread = threading.Thread(target=run_api_server, daemon=True)
            api_thread.start()
            logger.info("API server started in background thread")
            time.sleep(1)  # Give API time to start
        
        if args.mode == "api":
            # Run API in main thread
            run_api_server()
            return 0
    
    # Run display
    if args.mode in ["display", "both"]:
        try:
            # Import and run display with the initialized service
            import sys
            import gaze_display
            # Make service available to display module
            gaze_display._shared_service = gaze_service
            # Temporarily modify sys.argv to remove --mode argument
            original_argv = sys.argv[:]
            sys.argv = [sys.argv[0]]
            if args.no_preview:
                sys.argv.append('--no-preview')
            if args.no_calibration:
                sys.argv.append('--no-calibration')
            try:
                result = gaze_display.main()
            finally:
                sys.argv = original_argv
            return result
        except ImportError:
            logger.error("Display mode requires pygame")
            return 1
        except Exception as e:
            logger.error(f"Error running display: {e}", exc_info=True)
            return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
