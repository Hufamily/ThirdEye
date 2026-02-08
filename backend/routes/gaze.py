"""
Gaze tracking routes
Provides HTTP and WebSocket endpoints for gaze data.

gaze_cursor.py POSTs updates here; the extension reads via GET or WebSocket.
"""

import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory gaze state (updated by gaze_cursor.py via POST /api/gaze)
# ---------------------------------------------------------------------------
_gaze_data = {
    "x": 0.0,
    "y": 0.0,
    "confidence": 0.0,
    "available": False,
    "screenWidth": 1920,
    "screenHeight": 1080,
}

# Connected WebSocket clients
_ws_clients: set[WebSocket] = set()


class GazeUpdate(BaseModel):
    """Request body for POST /api/gaze"""
    model_config = {"populate_by_name": True}

    x: float
    y: float
    confidence: float = 1.0
    screenWidth: Optional[int] = None
    screenHeight: Optional[int] = None
    # Accept snake_case aliases from gaze_cursor.py
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None


@router.get("")
async def get_gaze():
    """
    GET /api/gaze
    Returns the latest gaze coordinates.
    Called by the extension as an HTTP-polling fallback.
    """
    data = _gaze_data
    return {
        "x": data["x"],
        "y": data["y"],
        "confidence": data["confidence"],
        "screenWidth": data.get("screenWidth", 1920),
        "screenHeight": data.get("screenHeight", 1080),
        "available": data.get("available", False),
        "timestamp": time.time(),
    }


@router.post("")
async def update_gaze(update: GazeUpdate):
    """
    POST /api/gaze
    Called by gaze_cursor.py to push new gaze coordinates.
    Also broadcasts to all connected WebSocket clients.
    """
    global _gaze_data
    # Accept both camelCase (screenWidth) and snake_case (screen_width) fields
    sw = update.screenWidth or update.screen_width or _gaze_data.get("screenWidth", 1920)
    sh = update.screenHeight or update.screen_height or _gaze_data.get("screenHeight", 1080)
    _gaze_data = {
        "x": update.x,
        "y": update.y,
        "confidence": update.confidence,
        "available": True,
        "screenWidth": sw,
        "screenHeight": sh,
    }

    # Broadcast to all WebSocket clients
    payload = json.dumps({
        **_gaze_data,
        "timestamp": time.time(),
    })
    dead: list[WebSocket] = []
    for ws in _ws_clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.discard(ws)

    return {"ok": True}


@router.websocket("/ws")
async def gaze_websocket(websocket: WebSocket):
    """
    WebSocket /api/gaze/ws
    Streams gaze data at ~60 FPS to connected clients.
    The extension prefers this over HTTP polling.
    """
    await websocket.accept()
    _ws_clients.add(websocket)
    try:
        # Keep connection alive; actual data is pushed by POST handler above.
        # We also do a polling loop so standalone clients that don't POST still
        # get periodic updates (e.g. when the POST comes from a separate process).
        while True:
            # Send current state at ~60 FPS
            payload = json.dumps({
                **_gaze_data,
                "timestamp": time.time(),
            })
            await websocket.send_text(payload)
            await asyncio.sleep(1 / 60)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _ws_clients.discard(websocket)
