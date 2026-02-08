"""
Personal Dashboard routes
Implements endpoints from BACKEND_INTEGRATION_GUIDE.md
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_
from utils.database import get_db, ensure_warehouse_resumed
from utils.auth import get_user_id_from_token
from routes.auth import get_current_user
from models.user import User
from models.session import Session
from models.notebook_entry import NotebookEntry
import uuid

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
    ensure_warehouse_resumed()
    
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
    ensure_warehouse_resumed()
    
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
    ensure_warehouse_resumed()
    
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
    ensure_warehouse_resumed()
    
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
    """
    ensure_warehouse_resumed()
    
    entry = NotebookEntry(
        entry_id=str(uuid.uuid4()),
        user_id=current_user.user_id,
        session_id=request.get("sessionId"),
        title=request.get("title", ""),
        content=request.get("content", ""),
        snippet=request.get("snippet", ""),
        preview=request.get("preview", ""),
        tags=request.get("tags", []),
        date=datetime.strptime(request.get("date", datetime.utcnow().isoformat()), "%Y-%m-%d").date()
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
    ensure_warehouse_resumed()
    
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
    ensure_warehouse_resumed()
    
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
    
    ensure_warehouse_resumed()
    
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
