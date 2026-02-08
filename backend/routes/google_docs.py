"""
Google Docs API routes
Handles fetching documents from Google Drive and applying edits to Google Docs
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from utils.database import get_db, ensure_warehouse_resumed
from routes.auth import get_current_user
from models.user import User
from services.google_drive_client import GoogleDriveClient
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import json

router = APIRouter()


class ApplyEditRequest(BaseModel):
    """Request model for applying edit to Google Doc"""
    suggestionId: str
    googleDoc: dict
    originalText: str
    suggestedText: str
    range: Optional[dict] = None


class ApplyEditResponse(BaseModel):
    """Response model for applying edit"""
    success: bool
    message: str
    googleDocUrl: Optional[str] = None
    appliedAt: Optional[str] = None


class DocumentWithGoogleDoc(BaseModel):
    """Document with Google Doc metadata"""
    id: str
    title: str
    googleDoc: dict
    confusionDensity: float
    totalTriggers: int
    usersAffected: int


def get_google_access_token(user_id: str, db: Session) -> Optional[str]:
    """
    Get user's Google access token from database
    TODO: Implement token storage/retrieval from database
    For now, this is a placeholder
    """
    # Check if user has stored Google access token
    # This would typically be stored in a USER_TOKENS or similar table
    # For now, return None - frontend should pass token in request
    return None


@router.get("/documents")
async def get_google_docs_documents(
    folderPath: Optional[str] = Query(None),
    dateRange_start: Optional[str] = Query(None, alias="dateRange.start"),
    dateRange_end: Optional[str] = Query(None, alias="dateRange.end"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/google-docs/documents
    Fetch documents from Google Drive
    
    This endpoint can either:
    1. Use the enterprise documents endpoint (if documents are tracked)
    2. Fetch directly from Google Drive API (if access token provided)
    
    For now, we'll use the enterprise documents endpoint as a proxy
    since documents need to be tracked in the system first.
    """
    await ensure_warehouse_resumed()
    
    # Use enterprise documents endpoint logic
    query = """
        SELECT ASSET_ID, TITLE, GOOGLE_DOC, CONFUSION_DENSITY, 
               TOTAL_TRIGGERS, USERS_AFFECTED, CREATED_AT
        FROM THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS
        WHERE ASSET_TYPE = 'GOOGLE_DOC'
    """
    params = {}
    
    if folderPath:
        query += " AND GOOGLE_DOC['folderPath'] = :folder_path"
        params["folder_path"] = folderPath
    
    if dateRange_start and dateRange_end:
        # Filter by creation date if provided
        query += " AND CREATED_AT >= :date_start AND CREATED_AT <= :date_end"
        params["date_start"] = dateRange_start
        params["date_end"] = dateRange_end
    
    query += " ORDER BY CONFUSION_DENSITY DESC NULLS LAST LIMIT 100"
    
    result = db.execute(text(query), params)
    rows = result.fetchall()
    
    documents = []
    for row in rows:
        google_doc = row[2] if isinstance(row[2], dict) else {}
        documents.append({
            "id": row[0],
            "title": row[1] or "",
            "googleDoc": {
                "fileId": google_doc.get("fileId", ""),
                "url": google_doc.get("url", ""),
                "name": google_doc.get("name", row[1] or ""),
                "folderPath": google_doc.get("folderPath", ""),
                "lastModified": google_doc.get("lastModified")
            },
            "confusionDensity": float(row[3]) if row[3] else 0.0,
            "totalTriggers": int(row[4]) if row[4] else 0,
            "usersAffected": int(row[5]) if row[5] else 0
        })
    
    # Get total count
    count_result = db.execute(text("""
        SELECT COUNT(*) 
        FROM THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS
        WHERE ASSET_TYPE = 'GOOGLE_DOC'
    """))
    total = count_result.fetchone()[0]
    
    return {
        "documents": documents,
        "total": total
    }


@router.get("/suggestions")
async def get_suggestions_for_document(
    documentId: str = Query(..., alias="documentId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/suggestions?documentId=xxx
    Get suggestions for a specific document along with document content
    
    This is a convenience endpoint that combines:
    - GET /api/enterprise/suggestions?documentId=xxx
    - GET /api/enterprise/documents/{documentId}
    """
    await ensure_warehouse_resumed()
    
    # Get document content
    doc_result = db.execute(text("""
        SELECT DOC_ID, TITLE, CONTENT, GOOGLE_DOC, HOTSPOTS
        FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
        WHERE DOC_ID = :doc_id
        LIMIT 1
    """), {"doc_id": documentId})
    doc_row = doc_result.fetchone()
    
    if not doc_row:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "DOCUMENT_NOT_FOUND",
                    "message": "Document not found",
                    "details": {}
                }
            }
        )
    
    google_doc = doc_row[3] if isinstance(doc_row[3], dict) else {}
    hotspots = doc_row[4] if isinstance(doc_row[4], list) else []
    
    document_content = {
        "id": doc_row[0],
        "title": doc_row[1] or "",
        "content": doc_row[2] or "",
        "googleDoc": {
            "fileId": google_doc.get("fileId", ""),
            "url": google_doc.get("url", ""),
            "name": google_doc.get("name", doc_row[1] or ""),
            "folderPath": google_doc.get("folderPath", "")
        },
        "hotspots": hotspots
    }
    
    # Get suggestions for this document
    suggestions_result = db.execute(text("""
        SELECT SUGGESTION_ID, DOC_ID, HOTSPOT_ID, ORIGINAL_TEXT, SUGGESTED_TEXT,
               CONFIDENCE, REASONING, GOOGLE_DOC_RANGE, STATUS
        FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        WHERE DOC_ID = :doc_id
        ORDER BY CREATED_AT DESC
    """), {"doc_id": documentId})
    suggestions_rows = suggestions_result.fetchall()
    
    suggestions = []
    for row in suggestions_rows:
        google_doc_range = row[7] if isinstance(row[7], dict) else {}
        suggestions.append({
            "id": row[0],
            "documentId": row[1],
            "googleDoc": {
                "fileId": google_doc.get("fileId", ""),
                "url": google_doc.get("url", ""),
                "name": google_doc.get("name", doc_row[1] or "")
            },
            "hotspotId": row[2],
            "originalText": row[3] or "",
            "suggestedText": row[4] or "",
            "confidence": float(row[5]) if row[5] else 0.0,
            "reasoning": row[6] or "",
            "googleDocRange": {
                "startIndex": google_doc_range.get("startIndex", 0),
                "endIndex": google_doc_range.get("endIndex", 0)
            }
        })
    
    return {
        "suggestions": suggestions,
        "document": document_content
    }


@router.post("/apply-edit", response_model=ApplyEditResponse)
async def apply_edit_to_google_doc(
    request: ApplyEditRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    google_access_token: Optional[str] = Query(None, alias="google_access_token")
):
    """
    POST /api/google-docs/apply-edit
    Apply suggestion edit to Google Doc using Google Docs API
    
    Requires Google access token (passed as query param or retrieved from user's stored tokens)
    """
    await ensure_warehouse_resumed()
    
    file_id = request.googleDoc.get("fileId")
    if not file_id:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "MISSING_FILE_ID",
                    "message": "Google Doc fileId is required",
                    "details": {}
                }
            }
        )
    
    # Get Google access token
    access_token = google_access_token
    if not access_token:
        # Try to get from user's stored tokens (TODO: implement token storage)
        access_token = get_google_access_token(current_user.user_id, db)
    
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "MISSING_GOOGLE_TOKEN",
                    "message": "Google access token is required. Please provide google_access_token query parameter or ensure your Google account is connected.",
                    "details": {}
                }
            }
        )
    
    try:
        # Initialize Google Docs API client
        credentials = Credentials(token=access_token)
        docs_service = build('docs', 'v1', credentials=credentials)
        
        # Get current document to find the text range
        # If range is provided, use it; otherwise, search for originalText
        start_index = request.range.get("startIndex") if request.range else None
        end_index = request.range.get("endIndex") if request.range else None
        
        if not start_index or not end_index:
            # Need to find the text in the document
            # Get document content
            doc = docs_service.documents().get(documentId=file_id).execute()
            content = doc.get('body', {}).get('content', [])
            
            # Search for originalText in the document
            # This is a simplified approach - in production, you'd want more robust text matching
            full_text = ""
            for element in content:
                if 'paragraph' in element:
                    for para_element in element.get('paragraph', {}).get('elements', []):
                        if 'textRun' in para_element:
                            full_text += para_element['textRun'].get('content', '')
            
            # Find originalText in full_text
            text_index = full_text.find(request.originalText)
            if text_index == -1:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": {
                            "code": "TEXT_NOT_FOUND",
                            "message": "Original text not found in document",
                            "details": {}
                        }
                    }
                )
            
            start_index = text_index
            end_index = text_index + len(request.originalText)
        
        # Prepare batch update request
        # Delete old text and insert new text
        requests = [
            {
                "deleteContent": {
                    "range": {
                        "startIndex": start_index,
                        "endIndex": end_index
                    }
                }
            },
            {
                "insertText": {
                    "location": {
                        "index": start_index
                    },
                    "text": request.suggestedText
                }
            }
        ]
        
        # Execute batch update
        result = docs_service.documents().batchUpdate(
            documentId=file_id,
            body={'requests': requests}
        ).execute()
        
        # Update suggestion status in database
        db.execute(text("""
            UPDATE THIRDEYE_DEV.PUBLIC.SUGGESTIONS
            SET STATUS = 'applied',
                APPLIED_AT = CURRENT_TIMESTAMP(),
                APPLIED_BY = :user_id,
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE SUGGESTION_ID = :suggestion_id
        """), {
            "suggestion_id": request.suggestionId,
            "user_id": current_user.user_id
        })
        db.commit()
        
        return ApplyEditResponse(
            success=True,
            message="Edit applied successfully",
            googleDocUrl=request.googleDoc.get("url"),
            appliedAt=datetime.now().isoformat()
        )
        
    except HttpError as e:
        error_details = json.loads(e.content.decode('utf-8'))
        raise HTTPException(
            status_code=e.resp.status,
            detail={
                "error": {
                    "code": "GOOGLE_DOCS_API_ERROR",
                    "message": f"Google Docs API error: {error_details.get('error', {}).get('message', str(e))}",
                    "details": error_details
                }
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "APPLY_EDIT_ERROR",
                    "message": f"Failed to apply edit: {str(e)}",
                    "details": {}
                }
            }
        )
