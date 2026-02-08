# _*_ coding: utf-8 _*_
"""
Gaze Cursor Display Script
Displays a red transparent circle at the gaze position in a fullscreen window.
Press ESC to exit.

Optional: run with --api to also start the Flask API (GET /gaze) in a background thread.
"""

import argparse
import pygame
from pygame.locals import KEYDOWN, K_ESCAPE, QUIT, K_UP, K_DOWN

from gazefollower import GazeFollower
from screeninfo import get_monitors

# Y-axis correction: Gaze trackers often have a downward bias due to camera position.
# Positive values move the circle UP (subtract from Y). Adjust as needed for your setup.
# Typical range: 0-150 pixels. Increase if the circle appears below where you're looking.
Y_OFFSET_CORRECTION = 50

# Optional: Y scale factor. 1.0 = no change. <1.0 compresses vertical range (reduces error at top/bottom).
# Try 0.85-0.95 if Y is less accurate at screen edges.
Y_SCALE = 1.0

# Initialize pygame
pygame.init()

# Get screen size
monitors = get_monitors()
screen_width = monitors[0].width
screen_height = monitors[0].height

# Create fullscreen window
win = pygame.display.set_mode((screen_width, screen_height), pygame.FULLSCREEN)
pygame.display.set_caption("Gaze Cursor")
pygame.mouse.set_visible(False)  # Hide mouse cursor

# Parse args (e.g. --api to run Flask API in background)
parser = argparse.ArgumentParser()
parser.add_argument("--api", action="store_true", help="Start Flask API in background (GET /gaze)")
parser.add_argument("--api-port", type=int, default=5000, help="Port for API (default: 5000)")
args = parser.parse_args()

# Start API in background thread if requested
if args.api:
    import threading
    from api import app
    def run_api():
        app.run(host="0.0.0.0", port=args.api_port, debug=False, use_reloader=False)
    api_thread = threading.Thread(target=run_api, daemon=True)
    api_thread.start()
    print(f"API running at http://127.0.0.1:{args.api_port}/gaze")

# Initialize GazeFollower
print("Initializing GazeFollower...")
gf = GazeFollower()

# Preview camera (optional - allows you to see yourself)
print("Starting camera preview. Close the preview window when ready.")
gf.preview(win=win)

# Calibrate the gaze tracker
print("Starting calibration. Please follow the calibration points.")
gf.calibrate(win=win)

# Start sampling gaze data
print("Starting gaze tracking. Press ESC to exit.")
print("UP/DOWN arrows: adjust Y correction in real-time (if circle appears too low)")
gf.start_sampling()
pygame.time.wait(100)  # Wait for tracker to cache some samples

# Main loop
clock = pygame.time.Clock()
running = True
gaze_x, gaze_y = screen_width // 2, screen_height // 2  # Default to center
y_offset = Y_OFFSET_CORRECTION  # Mutable for live adjustment
y_scale = Y_SCALE

while running:
    # Handle events
    for event in pygame.event.get():
        if event.type == QUIT:
            running = False
        elif event.type == KEYDOWN:
            if event.key == K_ESCAPE:
                running = False
            elif event.key == K_UP:
                y_offset += 10  # Move circle up (more correction)
                print(f"Y offset: {y_offset} (circle moves up)")
            elif event.key == K_DOWN:
                y_offset -= 10  # Move circle down (less correction)
                print(f"Y offset: {y_offset} (circle moves down)")
    
    # Get current gaze position
    gaze_info = gf.get_gaze_info()
    if gaze_info and gaze_info.status:
        gaze_x = gaze_info.filtered_gaze_coordinates[0]
        gaze_y = gaze_info.filtered_gaze_coordinates[1]
        # Apply Y-axis correction (gaze trackers often have downward bias)
        gaze_y = (gaze_y - screen_height / 2) * y_scale + screen_height / 2 - y_offset
        gaze_x = int(gaze_x)
        gaze_y = int(gaze_y)
        # Clamp to screen bounds
        gaze_x = max(0, min(screen_width, gaze_x))
        gaze_y = max(0, min(screen_height, gaze_y))
        # Push to API for /gaze endpoint (if api module is used)
        try:
            from api.app import set_gaze
            set_gaze(float(gaze_x), float(gaze_y), confidence=1.0)
        except ImportError:
            pass
    
    # Clear screen with black background
    win.fill((0, 0, 0))
    
    # Draw red transparent circle at gaze position
    # Create a surface for the circle
    circle_surface = pygame.Surface((100, 100))
    circle_surface.fill((0, 0, 0))  # Fill with black
    circle_surface.set_colorkey((0, 0, 0))  # Make black transparent
    # Draw filled circle (red)
    pygame.draw.circle(circle_surface, (255, 0, 0), (50, 50), 50)
    # Set transparency (0 = fully transparent, 255 = fully opaque)
    # 180 = about 70% opaque (semi-transparent)
    circle_surface.set_alpha(180)
    # Blit the transparent circle onto the main window
    win.blit(circle_surface, (gaze_x - 50, gaze_y - 50))
    
    # Update display
    pygame.display.flip()
    clock.tick(60)  # Limit to 60 FPS

# Cleanup
print(f"Final Y offset: {y_offset} (add to Y_OFFSET_CORRECTION in script for next time)")
print("Stopping gaze tracking...")
pygame.time.wait(100)  # Wait to capture ending samples
gf.stop_sampling()

# Save the gaze data (optional)
try:
    import os
    data_dir = "./data"
    os.makedirs(data_dir, exist_ok=True)
    file_name = "gaze_cursor_session.csv"
    gf.save_data(os.path.join(data_dir, file_name))
    print(f"Gaze data saved to {os.path.join(data_dir, file_name)}")
except Exception as e:
    print(f"Could not save gaze data: {e}")

# Release resources
gf.release()
pygame.quit()
print("Exiting...")

