#!/usr/bin/env python3
# _*_ coding: utf-8 _*_
"""
Gaze Cursor Display Script.

Displays a red transparent circle at the gaze position in a fullscreen window.
Press ESC to exit.

Optional:
- --api: start Flask API in a background thread (GET /gaze)
- --control-cursor: move the OS cursor to follow gaze (requires pyautogui)
"""

import argparse
import os
import sys
from pathlib import Path

# Suppress noisy MediaPipe C++ warnings (NORM_RECT without IMAGE_DIMENSIONS)
os.environ.setdefault("GLOG_minloglevel", "2")

# Allow running without installing gazefollower globally.
SCRIPT_DIR = Path(__file__).resolve().parent
LOCAL_GAZEFOLLOWER_ROOT = SCRIPT_DIR / "GazeFollower"
if LOCAL_GAZEFOLLOWER_ROOT.exists():
    sys.path.insert(0, str(LOCAL_GAZEFOLLOWER_ROOT))

try:
    import pygame
    from pygame.locals import KEYDOWN, K_ESCAPE, QUIT, K_UP, K_DOWN
except ModuleNotFoundError as e:
    missing = e.name or "pygame"
    raise SystemExit(
        f"Missing dependency: {missing}\n"
        "Install with:\n"
        "  python -m pip install -r gaze2/GazeFollower/requirements.txt"
    )

try:
    from screeninfo import get_monitors
except ModuleNotFoundError:
    raise SystemExit(
        "Missing dependency: screeninfo\n"
        "Install with:\n"
        "  python -m pip install -r gaze2/GazeFollower/requirements.txt"
    )

try:
    from gazefollower.GazeFollower import GazeFollower
except ModuleNotFoundError:
    raise SystemExit(
        "Could not import 'gazefollower'.\n"
        "Install local package with:\n"
        "  cd gaze2/GazeFollower && python -m pip install -e ."
    )

# Import shared config (Y_OFFSET, Y_SCALE, etc.) so there's a single source of truth.
try:
    from config import Y_OFFSET_CORRECTION, Y_SCALE
except ImportError:
    # Fallback defaults when config.py is not on the path.
    # Positive values move the circle UP (subtract from Y). Typical range: 0-150 pixels.
    Y_OFFSET_CORRECTION = 50
    # Y scale factor. 1.0 = no change. <1.0 compresses vertical range.
    Y_SCALE = 1.0

# Deadband: gaze must move at least this many pixels from the last reported
# position before a new position is published.  Eliminates micro-jitter that
# would otherwise reset dwell timers in the Chrome extension.
# Typical range: 15-40 pixels.  Increase if triggers are too sensitive.
GAZE_DEADBAND_PX = 25

# Gaze EMA smoothing factor (0-1).  Lower = smoother but laggier.
# Applied before the deadband check so the deadband operates on stable data.
GAZE_SMOOTH_FACTOR = 0.4

parser = argparse.ArgumentParser()
parser.add_argument("--api", action="store_true", help="Push gaze data to the unified FastAPI backend")
parser.add_argument("--api-port", type=int, default=8000, help="Backend port (default: 8000)")
parser.add_argument(
    "--control-cursor",
    action="store_true",
    help="Move the OS cursor to gaze position (requires pyautogui and OS permissions)",
)
parser.add_argument(
    "--cursor-smoothing",
    type=float,
    default=0.25,
    help="Smoothing factor for cursor control in [0.0, 1.0] (default: 0.25)",
)
parser.add_argument(
    "--deadband",
    type=int,
    default=GAZE_DEADBAND_PX,
    help=f"Deadband in pixels — gaze must move this far to update (default: {GAZE_DEADBAND_PX})",
)
args = parser.parse_args()
GAZE_DEADBAND_PX = args.deadband

# Validate smoothing range.
args.cursor_smoothing = max(0.0, min(1.0, args.cursor_smoothing))

# Initialize pygame
pygame.init()

# Get screen size
monitors = get_monitors()
screen_width = monitors[0].width
screen_height = monitors[0].height

# Create fullscreen window
win = pygame.display.set_mode((screen_width, screen_height), pygame.FULLSCREEN)
pygame.display.set_caption("Gaze Cursor")
pygame.mouse.set_visible(False)  # Hide mouse cursor inside pygame window

# Optional OS-level cursor control
pyautogui = None
if args.control_cursor:
    try:
        import pyautogui as _pyautogui
        _pyautogui.FAILSAFE = False
        pyautogui = _pyautogui
        print("OS cursor control: enabled")
    except ModuleNotFoundError:
        raise SystemExit(
            "Missing dependency: pyautogui\n"
            "Install with:\n"
            "  python -m pip install pyautogui"
        )
    except Exception as e:
        raise SystemExit(
            "OS cursor control could not start. "
            "On macOS, enable Accessibility permission for your terminal.\n"
            f"Details: {e}"
        )

# Set up HTTP POST to the unified FastAPI backend when --api is requested.
_gaze_post_url = None
_gaze_session = None
if args.api:
    import requests as _requests
    _gaze_session = _requests.Session()
    _gaze_post_url = f"http://127.0.0.1:{args.api_port}/api/gaze"
    print(f"Gaze data will be pushed to {_gaze_post_url}")

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
cursor_x, cursor_y = float(gaze_x), float(gaze_y)

# Deadband / smoothing state
smoothed_gaze_x, smoothed_gaze_y = float(gaze_x), float(gaze_y)
last_published_x, last_published_y = float(gaze_x), float(gaze_y)

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

        # EMA smoothing pass — reduces jitter before deadband check
        smoothed_gaze_x = GAZE_SMOOTH_FACTOR * gaze_x + (1 - GAZE_SMOOTH_FACTOR) * smoothed_gaze_x
        smoothed_gaze_y = GAZE_SMOOTH_FACTOR * gaze_y + (1 - GAZE_SMOOTH_FACTOR) * smoothed_gaze_y

        # Deadband: only publish a new position when gaze moves beyond threshold.
        # This prevents micro-jitter from resetting dwell timers in the extension.
        dx = smoothed_gaze_x - last_published_x
        dy = smoothed_gaze_y - last_published_y
        if (dx * dx + dy * dy) >= GAZE_DEADBAND_PX * GAZE_DEADBAND_PX:
            last_published_x = smoothed_gaze_x
            last_published_y = smoothed_gaze_y

        # Push gaze data to the unified FastAPI backend (if --api is active)
        if _gaze_post_url and _gaze_session:
            try:
                _gaze_session.post(_gaze_post_url, json={
                    "x": float(last_published_x),
                    "y": float(last_published_y),
                    "confidence": 1.0,
                    "screenWidth": screen_width,
                    "screenHeight": screen_height,
                }, timeout=0.05)
            except Exception:
                pass  # Non-blocking — don't stall the 60 FPS loop
        # Move OS cursor if enabled.
        if pyautogui is not None:
            alpha = args.cursor_smoothing
            cursor_x = (1 - alpha) * cursor_x + alpha * gaze_x
            cursor_y = (1 - alpha) * cursor_y + alpha * gaze_y
            pyautogui.moveTo(int(cursor_x), int(cursor_y), duration=0)
    
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
