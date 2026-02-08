"""
Agent API Routes
Expose agents as API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from routes.auth import get_current_user
from models.user import User
from agents.persona_architect import PersonaArchitect
from agents.traffic_controller import TrafficController
from agents.capture_scrape import CaptureScrape
from agents.target_interpreter import TargetInterpreter

router = APIRouter()


@router.post("/persona-architect")
async def build_persona(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/persona-architect
    Build or update user persona card using Agent 0.0
    """
    agent = PersonaArchitect()
    
    # Use current user's ID
    input_data = {
        "user_id": current_user.user_id,
        "include_docs": request.get("include_docs", True),
        "include_sessions": request.get("include_sessions", True),
        "include_searches": request.get("include_searches", True),
        "include_history": request.get("include_history", True),  # Include browser history by default
        "google_access_token": request.get("google_access_token")  # Optional: if provided, fetches actual Google Docs content
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Persona analysis failed")
        )
    
    # Optionally save persona card to user record
    # This would be done in a separate update endpoint
    
    return result


@router.post("/traffic-controller")
async def detect_mode(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/traffic-controller
    Detect operational mode and route requests using Agent 0.5
    """
    agent = TrafficController()
    
    # Get user's organization for whitelist check
    whitelisted_folders = []  # TODO: Fetch from organization settings
    
    input_data = {
        "url": request.get("url", ""),
        "page_content": request.get("page_content", {}),
        "user_permissions": request.get("user_permissions", []),
        "whitelisted_folders": whitelisted_folders
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Mode detection failed")
        )
    
    return result


@router.post("/traffic-controller/route")
async def route_request(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/traffic-controller/route
    Route request to appropriate agents using Agent 0.5
    """
    agent = TrafficController()
    
    result = await agent.route_request(
        request_type=request.get("request_type", ""),
        context=request.get("context", {})
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Routing failed")
        )
    
    return result


@router.post("/capture-scrape")
async def capture_content(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/capture-scrape
    Extract content from page based on cursor position using Agent 1.0
    
    Accepts:
    - url: Page URL
    - cursor_position: {"x": int, "y": int}
    - screenshot: Base64 data URL (data:image/png;base64,...) - optional
    - text_extraction: Pre-extracted text from DOM - optional
    - page_content: DOM structure or page text - optional
    - google_access_token: For Google Docs - optional
    - dwell_time_ms: Dwell time in ms - optional
    - context_lines: Number of context lines - optional
    """
    agent = CaptureScrape()
    
    input_data = {
        "url": request.get("url", ""),
        "cursor_position": request.get("cursor_position", {"x": 0, "y": 0}),
        "dwell_time_ms": request.get("dwell_time_ms", 2000),
        "context_lines": request.get("context_lines", 10),
        "page_content": request.get("page_content"),
        "google_access_token": request.get("google_access_token"),
        "screenshot": request.get("screenshot"),  # Base64 data URL
        "text_extraction": request.get("text_extraction")  # Pre-extracted text
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Content extraction failed")
        )
    
    return result


@router.post("/target-interpreter")
async def classify_content(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/target-interpreter
    Classify content using PersonaCard with Agent 2.0
    """
    agent = TargetInterpreter()
    
    input_data = {
        "capture_result": request.get("capture_result", {}),
        "persona_card": request.get("persona_card", {}),
        "session_history": request.get("session_history", [])
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Content classification failed")
        )
    
    return result
