# _*_ coding: utf-8 _*_
"""
Gaze WebSocket Server - Streams gaze coordinates at ~60 FPS to connected clients.
Run alongside gaze_cursor.py with --api to enable real-time gaze streaming.

Usage: Started automatically by gaze_cursor.py when --api is used.
Or run standalone: python gaze_websocket_server.py (reads from Flask API shared state)
"""

import asyncio
import json
import threading

try:
    from api.app import get_gaze
except ImportError:
    get_gaze = None


def run_websocket_server(host="127.0.0.1", port=8765, screen_width=1920, screen_height=1080):
    """
    Runs the WebSocket server. Pass screen_width/height for metadata.
    """
    import websockets

    async def _handler(websocket, path):
        if get_gaze is None:
            await websocket.send(json.dumps({
                "error": "Gaze API not available",
                "available": False
            }))
            return
        try:
            while True:
                data = get_gaze()
                payload = {
                    "x": data["x"],
                    "y": data["y"],
                    "confidence": data.get("confidence", 1.0),
                    "screenWidth": data.get("screenWidth", screen_width),
                    "screenHeight": data.get("screenHeight", screen_height),
                    "available": data.get("available", False),
                }
                await websocket.send(json.dumps(payload))
                await asyncio.sleep(1 / 60)
        except Exception as e:
            print(f"[GazeWS] Client disconnected: {e}")

    async def main():
        async with websockets.serve(_handler, host, port, ping_interval=20, ping_timeout=10):
            print(f"[GazeWS] WebSocket server running at ws://{host}:{port}")
            await asyncio.Future()  # run forever

    asyncio.run(main())


def start_websocket_thread(host="127.0.0.1", port=8765, screen_width=1920, screen_height=1080):
    """Starts the WebSocket server in a background thread."""
    def run():
        run_websocket_server(host, port, screen_width, screen_height)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread


if __name__ == "__main__":
    # Standalone: run WebSocket server only (reads from Flask API shared state)
    # Requires: run_api.py or gaze_cursor.py --api in another process
    print("Starting gaze WebSocket server. Ensure gaze_cursor.py --api or run_api.py is running.")
    run_websocket_server(port=8765)
