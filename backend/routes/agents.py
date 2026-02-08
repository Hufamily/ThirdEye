"""
Agent API Routes
Expose agents as API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from routes.auth import get_current_user
from models.user import User
from agents.persona_architect import PersonaArchitect
from agents.traffic_controller import TrafficController
from agents.capture_scrape import CaptureScrape
from agents.target_interpreter import TargetInterpreter
from agents.gap_hypothesis import GapHypothesis
from agents.explanation_composer import ExplanationComposer
from agents.memory_vault import MemoryVault
from agents.document_surgeon import DocumentSurgeon
from services.agent_orchestrator import AgentOrchestrator
from utils.database import engine, ensure_warehouse_resumed, qualified_table as qt
from sqlalchemy import text

router = APIRouter()


async def _get_user_org_id(user_id: str) -> Optional[str]:
    """Get user's organization ID from ORG_MEMBERSHIPS table"""
    try:
        await ensure_warehouse_resumed()
        with engine.connect() as conn:
            query = text(f"""
                SELECT ORG_ID
                FROM {qt("ORG_MEMBERSHIPS")}
                WHERE USER_ID = :user_id
                LIMIT 1
            """)
            
            result = conn.execute(query, {"user_id": user_id})
            row = result.fetchone()
            
            return row[0] if row else None
            
    except Exception as e:
        print(f"Error getting user org_id: {e}")
        return None


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
    
    # Get user's organization ID for whitelist check
    org_id = await _get_user_org_id(current_user.user_id)
    
    input_data = {
        "url": request.get("url", ""),
        "page_content": request.get("page_content", {}),
        "user_permissions": request.get("user_permissions", []),
        "org_id": org_id,
        "google_access_token": request.get("google_access_token")
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
        "text_extraction": request.get("text_extraction"),  # Pre-extracted text
        "user_id": request.get("user_id") or current_user.user_id,
        "session_id": request.get("session_id")
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


@router.post("/gap-hypothesis")
async def hypothesize_gaps(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/gap-hypothesis
    Hypothesize knowledge gaps using Agent 3.0 (K2-Think)
    """
    agent = GapHypothesis()
    
    input_data = {
        "classification_result": request.get("classification_result", {}),
        "persona_card": request.get("persona_card", {}),
        "session_history": request.get("session_history", []),
        "related_content": request.get("related_content", ""),
        "user_id": request.get("user_id") or current_user.user_id,
        "session_id": request.get("session_id")
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Gap hypothesis failed")
        )
    
    return result


@router.post("/explanation-composer")
async def compose_explanation(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/explanation-composer
    Compose personalized explanation using Agent 4.0 (K2-Think)
    """
    agent = ExplanationComposer()
    
    input_data = {
        "winning_hypothesis": request.get("winning_hypothesis", {}),
        "original_content": request.get("original_content", {}),
        "persona_card": request.get("persona_card", {}),
        "reading_state": request.get("reading_state", "confused")
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Explanation generation failed")
        )
    
    return result


@router.post("/memory-vault")
async def memory_vault_operation(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/memory-vault
    Log interactions and get learning metrics using Agent 5.0
    
    Actions:
    - "log": Log an interaction
    - "get_metrics": Get learning metrics
    - "get_reviews": Get scheduled reviews
    - "get_habits": Get learning habits
    """
    agent = MemoryVault()
    
    input_data = {
        "user_id": current_user.user_id,
        "session_id": request.get("session_id"),
        "interaction": request.get("interaction", {}),
        "action": request.get("action", "log")
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Memory vault operation failed")
        )
    
    return result


@router.post("/document-surgeon")
async def document_surgeon_operation(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/document-surgeon
    Aggregate friction and generate suggestions using Agent 6.0 (Enterprise Only)
    
    Actions:
    - "aggregate": Aggregate friction hotspots
    - "suggest": Generate improvement suggestions
    - "apply": Apply suggestion to document (requires google_access_token)
    """
    agent = DocumentSurgeon()
    
    # Get user's organization ID
    org_id = await _get_user_org_id(current_user.user_id)
    
    input_data = {
        "doc_id": request.get("doc_id", ""),
        "action": request.get("action", "aggregate"),
        "time_window_days": request.get("time_window_days", 30),
        "google_access_token": request.get("google_access_token"),
        "suggestion_id": request.get("suggestion_id"),
        "org_id": org_id,
        "user_id": current_user.user_id
    }
    
    result = await agent.process(input_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Document surgeon operation failed")
        )
    
    return result


@router.post("/orchestrate")
async def orchestrate_agents(
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/agents/orchestrate
    Orchestrate full agent pipeline using Dedalus
    
    Request body:
    {
        "user_id": str (optional, defaults to current_user),
        "capture_result": Dict - Result from Agent 1.0,
        "persona_card": Dict (optional) - Will fetch if not provided,
        "session_id": str (optional)
    }
    """
    try:
        from services.agent_orchestrator import AgentOrchestrator
        
        user_id = request.get("user_id") or current_user.user_id
        capture_result = request.get("capture_result")
        persona_card = request.get("persona_card")
        session_id = request.get("session_id")
        
        if not capture_result:
            raise HTTPException(
                status_code=400,
                detail="capture_result is required"
            )
        
        orchestrator = AgentOrchestrator()
        result = await orchestrator.process_user_interaction(
            user_id=user_id,
            capture_result=capture_result,
            persona_card=persona_card,
            session_id=session_id
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Orchestration failed")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Orchestration error: {str(e)}"
        )
