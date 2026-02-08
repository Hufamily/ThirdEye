# _*_ coding: utf-8 _*_
"""
Gaze Display Application
Visual display of gaze tracking with fullscreen overlay
"""

import argparse
import logging
import pygame
from pygame.locals import KEYDOWN, K_ESCAPE, QUIT, K_UP, K_DOWN
from screeninfo import get_monitors

from gaze_service import GazeService
from config import (
    FULLSCREEN,
    SHOW_CURSOR,
    CURSOR_SIZE,
    CURSOR_ALPHA,
    PREVIEW_REQUIRED,
    CALIBRATION_REQUIRED,
    Y_OFFSET_CORRECTION
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Gaze Tracker Display")
    parser.add_argument("--no-preview", action="store_true", help="Skip camera preview")
    parser.add_argument("--no-calibration", action="store_true", help="Skip calibration")
    parser.add_argument("--windowed", action="store_true", help="Run in windowed mode instead of fullscreen")
    args = parser.parse_args()
    
    # Initialize pygame
    pygame.init()
    
    # Get screen size
    monitors = get_monitors()
    screen_width = monitors[0].width if monitors else 1920
    screen_height = monitors[0].height if monitors else 1080
    
    # Create window
    if FULLSCREEN and not args.windowed:
        win = pygame.display.set_mode((screen_width, screen_height), pygame.FULLSCREEN)
    else:
        win = pygame.display.set_mode((screen_width, screen_height))
    
    pygame.display.set_caption("Gaze Cursor")
    pygame.mouse.set_visible(False)
    
    # Initialize gaze service (check if shared service exists from main.py)
    service = None
    if hasattr(gaze_display, '_shared_service'):
        service = gaze_display._shared_service
        logger.info("Using shared gaze service from main")
    
    if not service:
        # Running standalone - create new service
        service = GazeService()
        # Initialize
        if not service.initialize():
            logger.error("Failed to initialize gaze service")
            return 1
        
        # Preview
        if PREVIEW_REQUIRED and not args.no_preview:
            logger.info("Starting camera preview. Close the preview window when ready.")
            service.preview(win=win)
        
        # Calibrate
        if CALIBRATION_REQUIRED and not args.no_calibration:
            logger.info("Starting calibration. Please follow the calibration points.")
            service.calibrate(win=win)
        
        # Start tracking
        service.start_tracking()
    
    try:
        logger.info("Starting gaze tracking. Press ESC to exit.")
        logger.info("UP/DOWN arrows: adjust Y correction in real-time")
        
        # Main display loop
        clock = pygame.time.Clock()
        running = True
        y_offset = Y_OFFSET_CORRECTION
        gaze_x, gaze_y = screen_width // 2, screen_height // 2
        frame_count = 0
        last_gaze_update = 0
        
        logger.info(f"Display loop starting. Screen: {screen_width}x{screen_height}")
        logger.info(f"Service status: {service.get_status()}")
        
        while running:
            frame_count += 1
            # Handle events
            for event in pygame.event.get():
                if event.type == QUIT:
                    running = False
                elif event.type == KEYDOWN:
                    if event.key == K_ESCAPE:
                        running = False
                    elif event.key == K_UP:
                        y_offset += 10
                        logger.info(f"Y offset: {y_offset} (circle moves up)")
                    elif event.key == K_DOWN:
                        y_offset -= 10
                        logger.info(f"Y offset: {y_offset} (circle moves down)")
            
            # Get gaze position
            gaze_data = service.get_gaze()
            if gaze_data and len(gaze_data) >= 2:
                try:
                    gaze_x, gaze_y_raw, confidence = gaze_data
                    # Apply Y offset adjustment
                    gaze_y = (gaze_y_raw - screen_height / 2) + screen_height / 2 - y_offset
                    gaze_x = int(gaze_x)
                    gaze_y = int(gaze_y)
                    # Clamp to screen bounds
                    gaze_x = max(0, min(screen_width, gaze_x))
                    gaze_y = max(0, min(screen_height, gaze_y))
                    last_gaze_update = frame_count
                except (ValueError, TypeError, IndexError) as e:
                    logger.debug(f"Error parsing gaze data: {e}, data: {gaze_data}")
                    # Keep previous position
                    pass
            elif frame_count % 60 == 0:  # Log every second if no gaze data
                logger.debug(f"No gaze data available. Service status: {service.get_status()}")
            
            # Clear screen
            win.fill((0, 0, 0))
            
            # Draw cursor if enabled (always show if enabled, even if no gaze data yet)
            if SHOW_CURSOR:
                # Use different color if no recent gaze data
                circle_color = (255, 0, 0) if (frame_count - last_gaze_update) < 10 else (128, 0, 0)
                circle_surface = pygame.Surface((CURSOR_SIZE, CURSOR_SIZE), pygame.SRCALPHA)
                pygame.draw.circle(circle_surface, circle_color, (CURSOR_SIZE // 2, CURSOR_SIZE // 2), CURSOR_SIZE // 2)
                circle_surface.set_alpha(CURSOR_ALPHA)
                win.blit(circle_surface, (gaze_x - CURSOR_SIZE // 2, gaze_y - CURSOR_SIZE // 2))
                
                # Debug: Show status text (first 60 frames)
                if frame_count < 60:
                    font = pygame.font.Font(None, 36)
                    status_text = f"Gaze: {gaze_x},{gaze_y}" if gaze_data else "Waiting for gaze..."
                    text_surface = font.render(status_text, True, (255, 255, 255))
                    win.blit(text_surface, (10, 10))
            
            # Update display
            pygame.display.flip()
            clock.tick(60)
        
        logger.info(f"Final Y offset: {y_offset}")
        
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Error in display loop: {e}", exc_info=True)
        return 1
    finally:
        # Cleanup
        logger.info("Stopping gaze tracking...")
        service.save_data()
        service.release()
        pygame.quit()
        logger.info("Exiting...")
    
    return 0


if __name__ == "__main__":
    exit(main())
