"""
Extension routes
Implements endpoints from BACKEND_INTEGRATION_GUIDE.md
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from utils.database import get_db, ensure_warehouse_resumed, qualified_table as qt, safe_variant
from routes.auth import get_current_user
from models.user import User
from models.session import Session as SessionModel
import uuid

router = APIRouter()


class StartSessionRequest(BaseModel):
    """Request model for starting a session"""
    url: str
    documentTitle: str
    documentType: str  # "google-doc" | "github" | "notion" | "confluence" | "other"


class StartSessionResponse(BaseModel):
    """Response model for starting a session"""
    sessionId: str
    startedAt: str


class StopSessionResponse(BaseModel):
    """Response model for stopping a session"""
    sessionId: str
    duration: int  # in seconds
    conceptsDetected: int


class StatusResponse(BaseModel):
    """Response model for extension status"""
    isActive: bool
    currentSessionId: Optional[str]
    isGazeTracking: bool
    hasWebcamAccess: bool


@router.post("/session/start", response_model=StartSessionResponse)
async def start_session(
    request: StartSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/extension/session/start
    Start a new learning session
    """
    await ensure_warehouse_resumed()
    
    session_id = str(uuid.uuid4())
    started_at = datetime.now()
    
    # Create session in database
    db.execute(text(f"""
        INSERT INTO {qt("SESSIONS")} 
        (SESSION_ID, USER_ID, DOC_ID, DOC_TITLE, DOC_TYPE, STARTED_AT, IS_COMPLETE)
        VALUES (:session_id, :user_id, :doc_id, :doc_title, :doc_type, :started_at, :is_complete)
    """), {
        "session_id": session_id,
        "user_id": current_user.user_id,
        "doc_id": request.url,  # Use URL as doc_id for now
        "doc_title": request.documentTitle,
        "doc_type": request.documentType,
        "started_at": started_at,
        "is_complete": False
    })
    db.commit()
    
    return StartSessionResponse(
        sessionId=session_id,
        startedAt=started_at.isoformat()
    )


@router.post("/session/{session_id}/stop", response_model=StopSessionResponse)
async def stop_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/extension/session/{session_id}/stop
    Stop current session
    """
    await ensure_warehouse_resumed()
    
    # Get session
    result = db.execute(text(f"""
        SELECT SESSION_ID, USER_ID, STARTED_AT, ENDED_AT
        FROM {qt("SESSIONS")}
        WHERE SESSION_ID = :session_id AND USER_ID = :user_id
        LIMIT 1
    """), {
        "session_id": session_id,
        "user_id": current_user.user_id
    })
    session_row = result.fetchone()
    
    if not session_row:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "SESSION_NOT_FOUND",
                    "message": "Session not found",
                    "details": {}
                }
            }
        )
    
    # Update session end time
    end_time = datetime.now()
    start_time = session_row[2]
    duration = int((end_time - start_time).total_seconds()) if start_time else 0
    
    # Count concepts detected (from notebook entries or interaction logs)
    concepts_result = db.execute(text(f"""
        SELECT COUNT(DISTINCT ENTRY_ID)
        FROM {qt("NOTEBOOK_ENTRIES")}
        WHERE SESSION_ID = :session_id
    """), {"session_id": session_id})
    concepts_detected = concepts_result.fetchone()[0] or 0
    
    # Update session
    db.execute(text(f"""
        UPDATE {qt("SESSIONS")}
        SET ENDED_AT = :ended_at,
            DURATION_SECONDS = :duration,
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE SESSION_ID = :session_id
    """), {
        "session_id": session_id,
        "ended_at": end_time,
        "duration": duration
    })
    db.commit()
    
    return StopSessionResponse(
        sessionId=session_id,
        duration=duration,
        conceptsDetected=concepts_detected
    )


@router.get("/status", response_model=StatusResponse)
async def get_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/extension/status
    Get extension status
    
    Note: According to BACKEND_INTEGRATION_GUIDE.md and user requirements,
    this endpoint should only return status fields (isGazeTracking, hasWebcamAccess)
    without backend integration. Gaze tracking is handled by the separate gaze2 service.
    """
    await ensure_warehouse_resumed()
    
    # Get current active session
    result = db.execute(text(f"""
        SELECT SESSION_ID
        FROM {qt("SESSIONS")}
        WHERE USER_ID = :user_id 
          AND ENDED_AT IS NULL
          AND IS_COMPLETE = FALSE
        ORDER BY STARTED_AT DESC
        LIMIT 1
    """), {"user_id": current_user.user_id})
    session_row = result.fetchone()
    
    current_session_id = session_row[0] if session_row else None
    is_active = current_session_id is not None
    
    # Gaze tracking status - these are frontend-only flags
    # The actual gaze tracking is handled by the separate gaze2 Flask service
    # These flags indicate whether the extension has access/permissions
    is_gaze_tracking = False  # Frontend will set this based on gaze2 service status
    has_webcam_access = False  # Frontend will set this based on browser permissions
    
    return StatusResponse(
        isActive=is_active,
        currentSessionId=current_session_id,
        isGazeTracking=is_gaze_tracking,
        hasWebcamAccess=has_webcam_access
    )


class TrackHistoryRequest(BaseModel):
    """Request model for tracking browser history"""
    url: str
    title: str
    visitTime: int  # Unix timestamp in milliseconds
    transition: str  # 'link', 'typed', 'reload', etc.
    visitCount: int
    sessionId: Optional[str] = None


@router.post("/history/track")
async def track_history(
    request: TrackHistoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/extension/history/track
    Track browser history visit for learning context analysis
    """
    await ensure_warehouse_resumed()
    
    try:
        # Store history visit (could create BROWSER_HISTORY table or store in SESSIONS metadata)
        # For now, store in session metadata if sessionId provided
        
        if request.sessionId:
            # Update session metadata with history
            result = db.execute(text(f"""
                SELECT METADATA
                FROM {qt("SESSIONS")}
                WHERE SESSION_ID = :session_id AND USER_ID = :user_id
                LIMIT 1
            """), {
                "session_id": request.sessionId,
                "user_id": current_user.user_id
            })
            
            session_row = result.fetchone()
            if session_row:
                import json
                metadata = json.loads(session_row[0]) if session_row[0] else {}
                
                if "history_visits" not in metadata:
                    metadata["history_visits"] = []
                
                metadata["history_visits"].append({
                    "url": request.url,
                    "title": request.title,
                    "visitTime": request.visitTime,
                    "transition": request.transition,
                    "visitCount": request.visitCount
                })
                
                # Update session metadata
                db.execute(text(f"""
                    UPDATE {qt("SESSIONS")}
                    SET METADATA = :metadata,
                        UPDATED_AT = CURRENT_TIMESTAMP()
                    WHERE SESSION_ID = :session_id
                """), {
                    "session_id": request.sessionId,
                    "metadata": json.dumps(metadata)
                })
                db.commit()
        
        return {"success": True, "message": "History tracked"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "HISTORY_TRACKING_ERROR",
                    "message": f"Failed to track history: {str(e)}",
                    "details": {}
                }
            }
        )


@router.get("/history/analyze")
async def analyze_history(
    days_back: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/extension/history/analyze?days_back=7
    Analyze user's browsing patterns for learning context
    """
    await ensure_warehouse_resumed()
    
    try:
        # Get sessions with history data
        result = db.execute(text(f"""
            SELECT SESSION_ID, METADATA, STARTED_AT
            FROM {qt("SESSIONS")}
            WHERE USER_ID = :user_id
              AND STARTED_AT >= DATEADD(day, -:days_back, CURRENT_TIMESTAMP())
              AND METADATA IS NOT NULL
            ORDER BY STARTED_AT DESC
        """), {
            "user_id": current_user.user_id,
            "days_back": days_back
        })
        
        import json
        all_visits = []
        domain_groups = {}
        
        for row in result:
            metadata = json.loads(row[1]) if row[1] else {}
            visits = metadata.get("history_visits", [])
            
            for visit in visits:
                all_visits.append(visit)
                
                try:
                    from urllib.parse import urlparse
                    domain = urlparse(visit["url"]).netloc
                    
                    if domain not in domain_groups:
                        domain_groups[domain] = {
                            "domain": domain,
                            "visits": 0,
                            "urls": [],
                            "lastVisit": 0
                        }
                    
                    domain_groups[domain]["visits"] += 1
                    domain_groups[domain]["urls"].append(visit["url"])
                    if visit["visitTime"] > domain_groups[domain]["lastVisit"]:
                        domain_groups[domain]["lastVisit"] = visit["visitTime"]
                except Exception:
                    pass
        
        # Sort by visit count
        top_domains = sorted(
            domain_groups.values(),
            key=lambda x: x["visits"],
            reverse=True
        )[:20]
        
        # Identify learning sites
        learning_keywords = [
            'docs.google.com', 'github.com', 'stackoverflow.com',
            'developer.mozilla.org', 'medium.com', 'wikipedia.org',
            'youtube.com', 'coursera.org', 'udemy.com', 'khanacademy.org'
        ]
        
        learning_sites = [
            d for d in top_domains
            if any(keyword in d["domain"] for keyword in learning_keywords)
        ]
        
        return {
            "totalVisits": len(all_visits),
            "topDomains": top_domains,
            "learningSites": learning_sites,
            "daysAnalyzed": days_back
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "HISTORY_ANALYSIS_ERROR",
                    "message": f"Failed to analyze history: {str(e)}",
                    "details": {}
                }
            }
        )


# ============================================================================
# Chat Routes
# ============================================================================

class ChatMessageRequest(BaseModel):
    """Request model for chat messages"""
    message: str
    sessionId: Optional[str] = None
    context: Optional[dict] = None


class ChatMessageResponse(BaseModel):
    """Response model for chat messages"""
    reply: str
    sessionId: Optional[str] = None
    timestamp: str


@router.post("/chat", response_model=ChatMessageResponse)
async def send_chat_message(
    request: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/extension/chat
    Send a chat message and get an AI response.
    Uses Gemini for conversational responses about the user's learning context.
    """
    await ensure_warehouse_resumed()

    try:
        from services.gemini_client import GeminiClient
        gemini = GeminiClient()

        # Build context from session if available
        context_text = ""
        if request.sessionId:
            result = db.execute(text(f"""
                SELECT DOC_TITLE, DOC_TYPE, METADATA
                FROM {qt("SESSIONS")}
                WHERE SESSION_ID = :session_id AND USER_ID = :user_id
                LIMIT 1
            """), {
                "session_id": request.sessionId,
                "user_id": current_user.user_id
            })
            row = result.fetchone()
            if row:
                context_text = f"The user is studying: {row[0]} ({row[1]}). "

        if request.context:
            import json as _json
            context_text += f"Additional context: {_json.dumps(request.context)[:500]}"

        messages = [
            {
                "role": "system",
                "content": (
                    "You are ThirdEye, a helpful learning assistant. "
                    "Help the user understand what they are reading. "
                    "Keep answers concise and educational. "
                    + context_text
                )
            },
            {"role": "user", "content": request.message}
        ]

        response = await gemini.chat(messages=messages, temperature=0.7, max_tokens=1024)
        reply_text = response.get("text", response.get("content", "I'm sorry, I couldn't generate a response."))

        # Persist the exchange in session metadata
        if request.sessionId:
            try:
                import json as _json
                meta_result = db.execute(text(f"""
                    SELECT METADATA FROM {qt("SESSIONS")}
                    WHERE SESSION_ID = :sid AND USER_ID = :uid LIMIT 1
                """), {"sid": request.sessionId, "uid": current_user.user_id})
                meta_row = meta_result.fetchone()
                metadata = _json.loads(meta_row[0]) if meta_row and meta_row[0] else {}
                if "chat_history" not in metadata:
                    metadata["chat_history"] = []
                metadata["chat_history"].append({
                    "role": "user",
                    "content": request.message,
                    "timestamp": datetime.now().isoformat()
                })
                metadata["chat_history"].append({
                    "role": "assistant",
                    "content": reply_text,
                    "timestamp": datetime.now().isoformat()
                })
                # Keep last 100 messages to avoid unbounded growth
                metadata["chat_history"] = metadata["chat_history"][-100:]
                db.execute(text(f"""
                    UPDATE {qt("SESSIONS")}
                    SET METADATA = :metadata, UPDATED_AT = CURRENT_TIMESTAMP()
                    WHERE SESSION_ID = :sid
                """), {"metadata": _json.dumps(metadata), "sid": request.sessionId})
                db.commit()
            except Exception as persist_err:
                print(f"[Chat] Could not persist chat history: {persist_err}")

        return ChatMessageResponse(
            reply=reply_text,
            sessionId=request.sessionId,
            timestamp=datetime.now().isoformat()
        )

    except Exception as e:
        # Fallback when Gemini is unavailable
        print(f"[Chat] Gemini error: {e}")
        return ChatMessageResponse(
            reply="I'm currently unable to respond. Please make sure the Gemini API key is configured.",
            sessionId=request.sessionId,
            timestamp=datetime.now().isoformat()
        )


@router.get("/chat/history")
async def get_chat_history(
    sessionId: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/extension/chat/history?sessionId=...&limit=50
    Get chat history for a session
    """
    await ensure_warehouse_resumed()

    try:
        import json as _json
        result = db.execute(text(f"""
            SELECT METADATA FROM {qt("SESSIONS")}
            WHERE SESSION_ID = :sid AND USER_ID = :uid LIMIT 1
        """), {"sid": sessionId, "uid": current_user.user_id})
        row = result.fetchone()
        if not row or not row[0]:
            return {"messages": [], "sessionId": sessionId}

        metadata = _json.loads(row[0])
        messages = metadata.get("chat_history", [])[-limit:]
        return {"messages": messages, "sessionId": sessionId}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "CHAT_HISTORY_ERROR",
                    "message": f"Failed to get chat history: {str(e)}",
                    "details": {}
                }
            }
        )
