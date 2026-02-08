"""
Personal Dashboard routes
Implements endpoints from BACKEND_INTEGRATION_GUIDE.md
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_, text
from utils.database import get_db, ensure_warehouse_resumed, qualified_table as qt, safe_variant
from utils.auth import get_user_id_from_token
from routes.auth import get_current_user
from models.user import User
from models.session import Session
from models.notebook_entry import NotebookEntry
import uuid
import json

router = APIRouter()


class ProfileResponse(BaseModel):
    """Profile response model"""
    name: str
    email: str
    googleConnected: bool
    timeSaved: dict
    personaCard: Optional[dict] = None


class SessionResponse(BaseModel):
    """Session response model"""
    id: str
    date: Optional[str]
    time: Optional[str]
    duration: Optional[str]
    concepts: int
    title: str
    docTitle: str
    triggers: List[str]
    gapLabels: List[str]
    isComplete: bool


class NotebookEntryResponse(BaseModel):
    """Notebook entry response model"""
    id: str
    sessionId: Optional[str]
    title: str
    date: str
    snippet: str
    preview: str


class NotebookEntryDetailResponse(BaseModel):
    """Notebook entry detail response model"""
    id: str
    sessionId: Optional[str]
    title: str
    date: str
    content: str
    snippet: str
    preview: str
    tags: List[str]
    relatedEntries: List[str]


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/profile
    Get user profile data with time saved stats
    """
    await ensure_warehouse_resumed()
    
    # Calculate time saved from sessions
    now = datetime.utcnow()
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    
    # Total hours (estimate: each session saves ~15 minutes on average)
    total_sessions = db.query(func.count(Session.session_id)).filter(
        Session.user_id == current_user.user_id
    ).scalar() or 0
    
    week_sessions = db.query(func.count(Session.session_id)).filter(
        and_(
            Session.user_id == current_user.user_id,
            Session.started_at >= week_start
        )
    ).scalar() or 0
    
    month_sessions = db.query(func.count(Session.session_id)).filter(
        and_(
            Session.user_id == current_user.user_id,
            Session.started_at >= month_start
        )
    ).scalar() or 0
    
    # Estimate: 15 minutes per session = 0.25 hours
    time_saved = {
        "totalHours": round(total_sessions * 0.25, 1),
        "thisWeek": round(week_sessions * 0.25, 1),
        "thisMonth": round(month_sessions * 0.25, 1),
        "breakdown": [
            {"label": "This Week", "hours": round(week_sessions * 0.25, 1)},
            {"label": "This Month", "hours": round(month_sessions * 0.25, 1)},
            {"label": "All Time", "hours": round(total_sessions * 0.25, 1)}
        ]
    }
    
    persona_card = current_user.persona_card if isinstance(current_user.persona_card, dict) else None
    
    return ProfileResponse(
        name=current_user.name or "",
        email=current_user.email,
        googleConnected=bool(current_user.google_sub),
        timeSaved=time_saved,
        personaCard=persona_card
    )


@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/sessions
    Get user's learning sessions
    """
    await ensure_warehouse_resumed()
    
    sessions = db.query(Session).filter(
        Session.user_id == current_user.user_id
    ).order_by(desc(Session.started_at)).offset(offset).limit(limit).all()
    
    return [SessionResponse(**session.to_dict()) for session in sessions]


@router.get("/notebook-entries", response_model=List[NotebookEntryResponse])
async def get_notebook_entries(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/notebook-entries
    Get user's notebook entries
    """
    await ensure_warehouse_resumed()
    
    entries = db.query(NotebookEntry).filter(
        NotebookEntry.user_id == current_user.user_id
    ).order_by(desc(NotebookEntry.date), desc(NotebookEntry.created_at)).offset(offset).limit(limit).all()
    
    return [NotebookEntryResponse(**entry.to_dict()) for entry in entries]


@router.get("/notebook-entries/{entry_id}", response_model=NotebookEntryDetailResponse)
async def get_notebook_entry_detail(
    entry_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/notebook-entries/{entry_id}
    Get detailed notebook entry
    """
    await ensure_warehouse_resumed()
    
    entry = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.entry_id == entry_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOTEBOOK_ENTRY_NOT_FOUND",
                    "message": "Notebook entry not found",
                    "details": {}
                }
            }
        )
    
    return NotebookEntryDetailResponse(**entry.to_detail_dict())


@router.post("/notebook-entries")
async def create_notebook_entry(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/notebook-entries
    Create a new notebook entry
    Supports agent data structure with agentData and relevantWebpages
    """
    await ensure_warehouse_resumed()
    
    # Parse date
    date_str = request.get("date", datetime.utcnow().isoformat())
    try:
        if isinstance(date_str, str):
            entry_date = datetime.strptime(date_str.split('T')[0], "%Y-%m-%d").date()
        else:
            entry_date = date_str
    except:
        entry_date = datetime.utcnow().date()
    
    # Handle tags - ensure it's a list
    tags = request.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    
    entry = NotebookEntry(
        entry_id=str(uuid.uuid4()),
        user_id=current_user.user_id,
        session_id=request.get("sessionId"),
        title=request.get("title", ""),
        content=request.get("content", ""),  # JSON string with agentData and relevantWebpages
        snippet=request.get("snippet", ""),
        preview=request.get("preview", ""),
        tags=tags,
        date=entry_date
    )
    
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    return entry.to_detail_dict()


@router.put("/notebook-entries/{entry_id}")
async def update_notebook_entry(
    entry_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PUT /api/personal/notebook-entries/{entry_id}
    Update a notebook entry
    """
    await ensure_warehouse_resumed()
    
    entry = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.entry_id == entry_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOTEBOOK_ENTRY_NOT_FOUND",
                    "message": "Notebook entry not found",
                    "details": {}
                }
            }
        )
    
    if "title" in request:
        entry.title = request["title"]
    if "content" in request:
        entry.content = request["content"]
    if "snippet" in request:
        entry.snippet = request["snippet"]
    if "preview" in request:
        entry.preview = request["preview"]
    if "tags" in request:
        entry.tags = request["tags"]
    if "date" in request:
        entry.date = datetime.strptime(request["date"], "%Y-%m-%d").date()
    
    db.commit()
    db.refresh(entry)
    
    return entry.to_detail_dict()


@router.delete("/notebook-entries/{entry_id}")
async def delete_notebook_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    DELETE /api/personal/notebook-entries/{entry_id}
    Delete a notebook entry
    """
    await ensure_warehouse_resumed()
    
    entry = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.entry_id == entry_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOTEBOOK_ENTRY_NOT_FOUND",
                    "message": "Notebook entry not found",
                    "details": {}
                }
            }
        )
    
    db.delete(entry)
    db.commit()
    
    return {"success": True}


@router.post("/ai-search")
async def ai_search(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/ai-search
    AI-powered search across sessions and notebook entries
    TODO: Integrate with Dedalus Labs and K2-Think for intelligent search
    """
    query = request.get("query", "")
    
    if not query:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_QUERY",
                    "message": "Search query is required",
                    "details": {}
                }
            }
        )
    
    # TODO: Implement AI search using Dedalus Labs
    # For now, return basic search results
    
    await ensure_warehouse_resumed()
    
    # Basic text search in notebook entries
    entries = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.user_id == current_user.user_id,
            or_(
                NotebookEntry.title.ilike(f"%{query}%"),
                NotebookEntry.content.ilike(f"%{query}%")
            )
        )
    ).limit(10).all()
    
    return {
        "query": query,
        "results": [
            {
                "type": "notebook_entry",
                "id": entry.entry_id,
                "title": entry.title,
                "snippet": entry.snippet or "",
                "date": entry.date.isoformat() if entry.date else None
            }
            for entry in entries
        ]
    }


# ============================================================================
# Analyze Route (called by extension for text analysis)
# ============================================================================

@router.post("/analyze")
async def analyze_text(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/analyze
    Analyze extracted text from the extension to identify confusion points
    and generate image search queries. Uses Gemini for analysis.
    """
    url = request.get("url", "")
    text_content = request.get("text", "")
    session_id = request.get("sessionId")

    if not text_content:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": "Text content is required for analysis",
                    "details": {}
                }
            }
        )

    try:
        from services.gemini_client import GeminiClient
        gemini = GeminiClient()

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a learning assistant that analyzes text to help students. "
                    "Given text that a student is reading, provide:\n"
                    "1. A concise summary (1-2 sentences)\n"
                    "2. Potential confusion points (concepts that may need clarification)\n"
                    "3. Suggested image search queries to help visualize concepts\n"
                    "Respond in JSON format: "
                    '{"summary": "...", "confusion_points": ["..."], "image_queries": ["..."]}'
                )
            },
            {
                "role": "user",
                "content": f"Analyze this text from {url}:\n\n{text_content[:3000]}"
            }
        ]

        response = await gemini.chat(
            messages=messages,
            temperature=0.5,
            max_tokens=1024,
            response_format={"type": "json_object"}
        )

        reply_text = response.get("text", response.get("content", "{}"))

        # Parse JSON from response
        try:
            result = json.loads(reply_text)
        except json.JSONDecodeError:
            result = {
                "summary": reply_text[:200] if reply_text else "Could not generate summary.",
                "confusion_points": [],
                "image_queries": []
            }

        # Ensure expected keys exist
        result.setdefault("summary", "")
        result.setdefault("confusion_points", [])
        result.setdefault("image_queries", [])

        return result

    except Exception as e:
        print(f"[Analyze] Error: {e}")
        # Return a graceful fallback
        text_preview = text_content[:100].strip()
        return {
            "summary": f"Content from {url}: \"{text_preview}...\"",
            "confusion_points": [
                "Analysis service is temporarily unavailable.",
                "The backend will retry automatically."
            ],
            "image_queries": []
        }


# ============================================================================
# Session Triggers Routes
# ============================================================================

@router.post("/sessions/{session_id}/triggers")
async def record_trigger(
    session_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/sessions/{session_id}/triggers
    Record a confusion trigger (hover, scroll, click) for a session.
    Stored in session metadata.
    """
    await ensure_warehouse_resumed()

    trigger_type = request.get("triggerType", "unknown")
    location = request.get("location", {})
    trigger_text = request.get("text", "")
    timestamp = request.get("timestamp", datetime.now().isoformat())

    try:
        result = db.execute(text(f"""
            SELECT METADATA FROM {qt("SESSIONS")}
            WHERE SESSION_ID = :sid AND USER_ID = :uid LIMIT 1
        """), {"sid": session_id, "uid": current_user.user_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "SESSION_NOT_FOUND", "message": "Session not found", "details": {}}
            })

        metadata = json.loads(row[0]) if row[0] else {}
        if "triggers" not in metadata:
            metadata["triggers"] = []

        metadata["triggers"].append({
            "type": trigger_type,
            "location": location,
            "text": trigger_text[:500],  # Cap text length
            "timestamp": timestamp
        })

        # Keep last 200 triggers per session to avoid unbounded growth
        metadata["triggers"] = metadata["triggers"][-200:]

        db.execute(text(f"""
            UPDATE {qt("SESSIONS")}
            SET METADATA = :metadata, UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE SESSION_ID = :sid
        """), {"metadata": json.dumps(metadata), "sid": session_id})
        db.commit()

        return {"success": True, "triggerCount": len(metadata["triggers"])}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error": {
                "code": "TRIGGER_RECORD_ERROR",
                "message": f"Failed to record trigger: {str(e)}",
                "details": {}
            }
        })


@router.get("/sessions/{session_id}/triggers")
async def get_triggers(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/sessions/{session_id}/triggers
    Get confusion triggers recorded for a session.
    """
    await ensure_warehouse_resumed()

    try:
        result = db.execute(text(f"""
            SELECT METADATA FROM {qt("SESSIONS")}
            WHERE SESSION_ID = :sid AND USER_ID = :uid LIMIT 1
        """), {"sid": session_id, "uid": current_user.user_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail={
                "error": {"code": "SESSION_NOT_FOUND", "message": "Session not found", "details": {}}
            })

        metadata = json.loads(row[0]) if row[0] else {}
        triggers = metadata.get("triggers", [])

        return {"triggers": triggers, "count": len(triggers), "sessionId": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "error": {
                "code": "TRIGGER_FETCH_ERROR",
                "message": f"Failed to get triggers: {str(e)}",
                "details": {}
            }
        })


# ============================================================================
# Session Management Routes
# ============================================================================

@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PATCH /api/personal/sessions/{session_id}
    Update session (title, isComplete)
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    if "title" in request:
        # Update title - use title field directly if available, otherwise store in metadata
        if hasattr(session, 'title'):
            session.title = request["title"]
        else:
            # Fallback to metadata
            metadata = json.loads(session.session_metadata) if session.session_metadata else {}
            metadata["title"] = request["title"]
            session.session_metadata = json.dumps(metadata)
    
    if "isComplete" in request:
        session.is_complete = request["isComplete"]
    
    db.commit()
    db.refresh(session)
    
    return SessionResponse(**session.to_dict())


@router.post("/sessions/{session_id}/regenerate-summary")
async def regenerate_session_summary(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/sessions/{session_id}/regenerate-summary
    Regenerate session summary with merge rules
    TODO: Implement AI summary regeneration using agents
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # TODO: Call AI agent to regenerate summary
    # For now, return success
    return {
        "success": True,
        "session": SessionResponse(**session.to_dict())
    }


class SessionNotesResponse(BaseModel):
    """Session notes response model"""
    id: str
    title: str
    lastUpdated: str
    entries: List[dict]


@router.get("/sessions/{session_id}/notes", response_model=SessionNotesResponse)
async def get_session_notes(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/sessions/{session_id}/notes
    Get session notes/entries
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # Get notebook entries for this session
    entries = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.session_id == session_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).order_by(NotebookEntry.created_at).all()
    
    # Convert entries to chronological format
    chronological_entries = []
    for entry in entries:
        chronological_entries.append({
            "id": entry.entry_id,
            "timestamp": entry.created_at.isoformat() if entry.created_at else datetime.utcnow().isoformat(),
            "searchQuery": entry.title,  # Use title as search query
            "document": {
                "title": session.doc_title or "",
                "url": session.doc_id or "",
                "type": session.doc_type or "other"
            },
            "context": entry.preview or "",
            "agentAction": "Generated entry",
            "agentResponse": entry.content or "",
            "links": []  # TODO: Extract links from content if needed
        })
    
    # Get title from session.title or metadata
    title = session.title or session.doc_title or f"Session {session_id[:8]}"
    if not title and session.session_metadata:
        metadata = json.loads(session.session_metadata) if isinstance(session.session_metadata, str) else session.session_metadata
        if isinstance(metadata, dict):
            title = metadata.get("title") or title
    
    return SessionNotesResponse(
        id=session_id,
        title=title,
        lastUpdated=session.updated_at.isoformat() if session.updated_at else session.started_at.isoformat() if session.started_at else datetime.utcnow().isoformat(),
        entries=chronological_entries
    )


@router.put("/sessions/{session_id}/notes")
async def save_session_notes(
    session_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PUT /api/personal/sessions/{session_id}/notes
    Save session notes
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # Update session title
    if "title" in request:
        if hasattr(session, 'title'):
            session.title = request["title"]
        else:
            # Fallback to metadata
            metadata = json.loads(session.session_metadata) if isinstance(session.session_metadata, str) else (session.session_metadata or {})
            if not isinstance(metadata, dict):
                metadata = {}
            metadata["title"] = request["title"]
            session.session_metadata = json.dumps(metadata) if isinstance(metadata, dict) else metadata
    
    # Update or create notebook entries from request entries
    if "entries" in request:
        for entry_data in request.get("entries", []):
            entry_id = entry_data.get("id")
            if entry_id:
                # Update existing entry
                entry = db.query(NotebookEntry).filter(
                    and_(
                        NotebookEntry.entry_id == entry_id,
                        NotebookEntry.user_id == current_user.user_id
                    )
                ).first()
                
                if entry:
                    if "content" in entry_data:
                        entry.content = entry_data["content"]
                    if "title" in entry_data:
                        entry.title = entry_data["title"]
                    if "preview" in entry_data:
                        entry.preview = entry_data["preview"]
            else:
                # Create new entry
                entry = NotebookEntry(
                    entry_id=str(uuid.uuid4()),
                    user_id=current_user.user_id,
                    session_id=session_id,
                    title=entry_data.get("title", ""),
                    content=entry_data.get("agentResponse", ""),
                    preview=entry_data.get("context", ""),
                    date=datetime.utcnow().date()
                )
                db.add(entry)
    
    db.commit()
    db.refresh(session)
    
    return await get_session_notes(session_id, current_user, db)


@router.post("/sessions/{session_id}/generate-summary")
async def generate_session_summary(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/sessions/{session_id}/generate-summary
    Generate AI summary of session
    TODO: Implement AI summary generation using agents
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # Get notebook entries for summary
    entries = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.session_id == session_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).all()
    
    # TODO: Call AI agent to generate summary
    # For now, return a basic summary
    summary_text = f"Session summary for {session.doc_title or 'Untitled Session'}\n\n"
    summary_text += f"Total entries: {len(entries)}\n"
    summary_text += f"Duration: {session.duration_seconds or 0} seconds\n"
    
    key_concepts = []
    for entry in entries[:5]:  # Top 5 entries
        if entry.title:
            key_concepts.append(entry.title)
    
    return {
        "summary": summary_text,
        "keyConcepts": key_concepts,
        "generatedAt": datetime.utcnow().isoformat()
    }


@router.post("/sessions/{session_id}/export/google-doc")
async def export_session_to_google_doc(
    session_id: str,
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/personal/sessions/{session_id}/export/google-doc
    Export session notes to Google Doc
    TODO: Implement Google Docs API integration
    """
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # TODO: Implement Google Docs API integration
    # For now, return a placeholder response
    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "NOT_IMPLEMENTED",
                "message": "Google Doc export not yet implemented. Requires Google Docs API integration.",
                "details": {}
            }
        }
    )


@router.get("/sessions/{session_id}/export/markdown")
async def download_session_markdown(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/sessions/{session_id}/export/markdown
    Download session notes as markdown file
    """
    from fastapi.responses import Response
    
    await ensure_warehouse_resumed()
    
    session = db.query(Session).filter(
        and_(
            Session.session_id == session_id,
            Session.user_id == current_user.user_id
        )
    ).first()
    
    if not session:
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
    
    # Get notebook entries
    entries = db.query(NotebookEntry).filter(
        and_(
            NotebookEntry.session_id == session_id,
            NotebookEntry.user_id == current_user.user_id
        )
    ).order_by(NotebookEntry.created_at).all()
    
    # Generate markdown content
    # Get title from session.title or metadata
    title = session.title or session.doc_title or f"Session {session_id[:8]}"
    if not title and session.session_metadata:
        metadata = json.loads(session.session_metadata) if isinstance(session.session_metadata, str) else session.session_metadata
        if isinstance(metadata, dict):
            title = metadata.get("title") or title
    
    markdown = f"# {title}\n\n"
    markdown += f"**Session ID:** {session_id}\n"
    markdown += f"**Date:** {session.started_at.date().isoformat() if session.started_at else 'Unknown'}\n"
    markdown += f"**Duration:** {session.duration_seconds or 0} seconds\n\n"
    markdown += "---\n\n"
    
    for entry in entries:
        markdown += f"## {entry.title}\n\n"
        markdown += f"{entry.content or entry.preview or ''}\n\n"
        if entry.tags:
            markdown += f"**Tags:** {', '.join(entry.tags)}\n\n"
        markdown += "---\n\n"
    
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="session-{session_id[:8]}.md"'}
    )


# ============================================================================
# Persona and Privacy Settings Routes
# ============================================================================

class PersonaSettings(BaseModel):
    """Persona settings model"""
    experience: str
    learningStyle: str
    goals: List[str]
    timeCommitment: str
    preferredTopics: List[str]
    challenges: List[str]


class PrivacySettings(BaseModel):
    """Privacy settings model"""
    dataSharing: bool
    analytics: bool
    sessionTracking: bool
    aiTraining: bool


@router.get("/persona", response_model=PersonaSettings)
async def get_persona_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/persona
    Get user persona settings
    """
    await ensure_warehouse_resumed()
    
    persona_card = current_user.persona_card
    if isinstance(persona_card, dict):
        return PersonaSettings(**persona_card)
    
    # Return default persona settings
    return PersonaSettings(
        experience="intermediate",
        learningStyle="visual",
        goals=[],
        timeCommitment="3-5h",
        preferredTopics=[],
        challenges=[]
    )


@router.put("/persona", response_model=PersonaSettings)
async def update_persona_settings(
    request: PersonaSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PUT /api/personal/persona
    Update persona settings
    """
    await ensure_warehouse_resumed()
    
    # Update persona_card in user record
    db.execute(text(f"""
        UPDATE {qt("USERS")}
        SET PERSONA_CARD = :persona_card,
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE USER_ID = :user_id
    """), {
        "user_id": current_user.user_id,
        "persona_card": json.dumps(request.dict())
    })
    db.commit()
    
    return request


@router.get("/privacy-settings", response_model=PrivacySettings)
async def get_privacy_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/personal/privacy-settings
    Get privacy settings
    """
    await ensure_warehouse_resumed()
    
    # TODO: Store privacy settings in database
    # For now, return default settings
    return PrivacySettings(
        dataSharing=True,
        analytics=True,
        sessionTracking=True,
        aiTraining=False
    )


@router.put("/privacy-settings", response_model=PrivacySettings)
async def update_privacy_settings(
    request: PrivacySettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PUT /api/personal/privacy-settings
    Update privacy settings
    """
    await ensure_warehouse_resumed()
    
    # TODO: Store privacy settings in database
    # For now, just return the request
    return request
