"""
Enterprise Dashboard routes
Implements endpoints from BACKEND_INTEGRATION_GUIDE.md
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text, func, desc, and_
from utils.database import get_db, ensure_warehouse_resumed
from routes.auth import get_current_user
from models.user import User
from models.document import Document
from models.suggestion import Suggestion
from models.organization import Organization
import uuid

router = APIRouter()


class DocumentResponse(BaseModel):
    """Document response model"""
    id: str
    title: str
    googleDoc: dict
    confusionDensity: float
    totalTriggers: int
    usersAffected: int


class DocumentContentResponse(BaseModel):
    """Document content response with hotspots"""
    id: str
    title: str
    content: str
    googleDoc: dict
    hotspots: List[dict]


class SuggestionResponse(BaseModel):
    """Suggestion response model"""
    id: str
    documentId: str
    googleDoc: dict
    hotspotId: Optional[str]
    originalText: str
    suggestedText: str
    confidence: float
    reasoning: str
    googleDocRange: dict


class EnterpriseSuggestionResponse(BaseModel):
    """Enterprise suggestion response model"""
    id: str
    document: str
    section: str
    confusionType: str
    confidence: float
    diagnosis: str
    actions: List[str]


class KPIsResponse(BaseModel):
    """KPIs response model"""
    timeReclaimed: float
    totalTriggers: int
    topDocuments: List[dict]
    efficiencyData: List[dict]
    currentEfficiency: float
    predictedEfficiency: float
    timeframe: str


@router.get("/documents")
async def get_documents(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    folderPath: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/documents
    Get all documents with confusion metrics
    """
    ensure_warehouse_resumed()
    
    # TODO: Filter by org_id when organization membership is implemented
    query = """
        SELECT ASSET_ID, TITLE, GOOGLE_DOC, CONFUSION_DENSITY, 
               TOTAL_TRIGGERS, USERS_AFFECTED, CREATED_AT
        FROM THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS
        WHERE ASSET_TYPE = 'GOOGLE_DOC'
    """
    params = {}
    
    if folderPath:
        # Snowflake VARIANT column query syntax
        query += " AND GOOGLE_DOC['folderPath'] = :folder_path"
        params["folder_path"] = folderPath
    
    query += " ORDER BY CONFUSION_DENSITY DESC NULLS LAST LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
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
        FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
    """))
    total = count_result.fetchone()[0]
    
    return {
        "documents": documents,
        "total": total
    }


@router.get("/documents/{document_id}")
async def get_document_content(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/documents/{document_id}
    Get document content with hotspots
    """
    ensure_warehouse_resumed()
    
    result = db.execute(text("""
        SELECT DOC_ID, TITLE, CONTENT, GOOGLE_DOC, HOTSPOTS
        FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
        WHERE DOC_ID = :doc_id
        LIMIT 1
    """), {"doc_id": document_id})
    row = result.fetchone()
    
    if not row:
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
    
    google_doc = row[3] if isinstance(row[3], dict) else {}
    hotspots = row[4] if isinstance(row[4], list) else []
    
    return {
        "id": row[0],
        "title": row[1] or "",
        "content": row[2] or "",
        "googleDoc": {
            "fileId": google_doc.get("fileId", ""),
            "url": google_doc.get("url", ""),
            "name": google_doc.get("name", row[1] or ""),
            "folderPath": google_doc.get("folderPath", "")
        },
        "hotspots": hotspots
    }


@router.get("/suggestions")
async def get_suggestions(
    documentId: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/suggestions
    Get AI suggestions for documents
    """
    ensure_warehouse_resumed()
    
    query = """
        SELECT SUGGESTION_ID, DOC_ID, HOTSPOT_ID, ORIGINAL_TEXT, SUGGESTED_TEXT,
               CONFIDENCE, REASONING, GOOGLE_DOC_RANGE, STATUS
        FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        WHERE 1=1
    """
    params = {}
    
    if documentId:
        query += " AND DOC_ID = :doc_id"
        params["doc_id"] = documentId
    
    query += " ORDER BY CREATED_AT DESC LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
    result = db.execute(text(query), params)
    rows = result.fetchall()
    
    # Get document info for each suggestion
    suggestions = []
    for row in rows:
        doc_result = db.execute(text("""
            SELECT TITLE, GOOGLE_DOC
            FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
            WHERE DOC_ID = :doc_id
            LIMIT 1
        """), {"doc_id": row[1]})
        doc_row = doc_result.fetchone()
        
        google_doc = doc_row[1] if doc_row and isinstance(doc_row[1], dict) else {}
        google_doc_range = row[7] if isinstance(row[7], dict) else {}
        
        suggestions.append({
            "id": row[0],
            "documentId": row[1],
            "googleDoc": {
                "fileId": google_doc.get("fileId", ""),
                "url": google_doc.get("url", ""),
                "name": google_doc.get("name", doc_row[0] if doc_row else "")
            },
            "hotspotId": row[2],
            "originalText": row[3],
            "suggestedText": row[4],
            "confidence": float(row[5]) if row[5] else 0.0,
            "reasoning": row[6] or "",
            "googleDocRange": {
                "startIndex": google_doc_range.get("startIndex", 0),
                "endIndex": google_doc_range.get("endIndex", 0)
            }
        })
    
    # Get total count
    count_query = "SELECT COUNT(*) FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS WHERE 1=1"
    count_params = {}
    if documentId:
        count_query += " AND DOC_ID = :doc_id"
        count_params["doc_id"] = documentId
    
    count_result = db.execute(text(count_query), count_params)
    total = count_result.fetchone()[0]
    
    return {
        "suggestions": suggestions,
        "total": total
    }


@router.get("/suggestions/enterprise")
async def get_enterprise_suggestions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/suggestions (enterprise format)
    Get all AI suggestions with diagnosis
    """
    ensure_warehouse_resumed()
    
    result = db.execute(text("""
        SELECT S.SUGGESTION_ID, S.DOC_ID, S.HOTSPOT_ID, S.CONFUSION_TYPE,
               S.CONFIDENCE, S.DIAGNOSIS, S.ACTIONS, D.TITLE
        FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS S
        LEFT JOIN THIRDEYE_DEV.PUBLIC.DOCUMENTS D ON S.DOC_ID = D.DOC_ID
        ORDER BY S.CREATED_AT DESC
        LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": offset})
    rows = result.fetchall()
    
    suggestions = []
    for row in rows:
        actions = row[6] if isinstance(row[6], list) else []
        suggestions.append({
            "id": row[0],
            "document": row[7] or row[1],  # Use title or doc_id
            "section": row[2] or "",  # hotspot_id as section identifier
            "confusionType": row[3] or "concept",
            "confidence": float(row[4]) if row[4] else 0.0,
            "diagnosis": row[5] or "",
            "actions": actions
        })
    
    # Get total count
    count_result = db.execute(text("SELECT COUNT(*) FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS"))
    total = count_result.fetchone()[0]
    
    return {
        "suggestions": suggestions,
        "total": total
    }


@router.get("/kpis")
async def get_kpis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/kpis
    Get diagnostic KPIs
    """
    ensure_warehouse_resumed()
    
    # Calculate time reclaimed (estimate: 15 min per trigger = 0.25 hours)
    triggers_result = db.execute(text("""
        SELECT COUNT(*) 
        FROM THIRDEYE_DEV.PUBLIC.INTERACTIONS
        WHERE READING_STATE = 'READ_ONLY'
    """))
    total_triggers = triggers_result.fetchone()[0] or 0
    time_reclaimed = round(total_triggers * 0.25, 1)
    
    # Get top documents by confusion density
    top_docs_result = db.execute(text("""
        SELECT ASSET_ID, TITLE, CONFUSION_DENSITY, TOTAL_TRIGGERS, USERS_AFFECTED
        FROM THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS
        WHERE ASSET_TYPE = 'GOOGLE_DOC'
          AND CONFUSION_DENSITY IS NOT NULL
        ORDER BY CONFUSION_DENSITY DESC
        LIMIT 5
    """))
    top_docs_rows = top_docs_result.fetchall()
    
    top_documents = []
    for row in top_docs_rows:
        triggers_per_user = row[3] / row[4] if row[4] > 0 else 0
        top_documents.append({
            "id": row[0],
            "title": row[1] or "",
            "frictionScore": float(row[2]) if row[2] else 0.0,
            "triggersPerUser": round(triggers_per_user, 2)
        })
    
    # Calculate efficiency data (mock for now - would come from analytics tables)
    efficiency_data = []
    base_date = datetime.now().date()
    for i in range(7):  # Last 7 days
        date_str = (base_date - timedelta(days=6-i)).isoformat()
        efficiency_data.append({
            "date": date_str,
            "actual": round(75 + (i * 2), 1),  # Mock data
            "predicted": round(73 + (i * 2.5), 1)  # Mock data
        })
    
    current_efficiency = 87.5  # Mock
    predicted_efficiency = 89.2  # Mock
    
    return {
        "timeReclaimed": time_reclaimed,
        "totalTriggers": total_triggers,
        "topDocuments": top_documents,
        "efficiencyData": efficiency_data,
        "currentEfficiency": current_efficiency,
        "predictedEfficiency": predicted_efficiency,
        "timeframe": "7 days"
    }


@router.post("/suggestions/{suggestion_id}/accept")
async def accept_suggestion(
    suggestion_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/enterprise/suggestions/{suggestion_id}/accept
    Accept a suggestion
    """
    ensure_warehouse_resumed()
    
    db.execute(text("""
        UPDATE THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        SET STATUS = 'accepted',
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE SUGGESTION_ID = :suggestion_id
    """), {"suggestion_id": suggestion_id})
    db.commit()
    
    return {"success": True}


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/enterprise/suggestions/{suggestion_id}/reject
    Reject a suggestion
    """
    ensure_warehouse_resumed()
    
    db.execute(text("""
        UPDATE THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        SET STATUS = 'rejected',
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE SUGGESTION_ID = :suggestion_id
    """), {"suggestion_id": suggestion_id})
    db.commit()
    
    return {"success": True}


@router.post("/suggestions/{suggestion_id}/apply")
async def apply_suggestion(
    suggestion_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/enterprise/suggestions/{suggestion_id}/apply
    Apply suggestion actions
    """
    ensure_warehouse_resumed()
    
    # Update suggestion status
    db.execute(text("""
        UPDATE THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        SET STATUS = 'applied',
            APPLIED_AT = CURRENT_TIMESTAMP(),
            APPLIED_BY = :user_id,
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE SUGGESTION_ID = :suggestion_id
    """), {
        "suggestion_id": suggestion_id,
        "user_id": current_user.user_id
    })
    db.commit()
    
    return {"success": True}


@router.post("/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion(
    suggestion_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/enterprise/suggestions/{suggestion_id}/dismiss
    Dismiss suggestion
    """
    ensure_warehouse_resumed()
    
    db.execute(text("""
        UPDATE THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        SET STATUS = 'rejected',
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE SUGGESTION_ID = :suggestion_id
    """), {"suggestion_id": suggestion_id})
    db.commit()
    
    return {"success": True}


# Analytics routes
@router.get("/analytics/growth")
async def get_growth_analytics(
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/analytics/growth
    Get growth trends data
    """
    ensure_warehouse_resumed()
    
    # TODO: Implement real analytics from SESSIONS and USERS tables
    # For now, return mock data
    data = []
    base_date = datetime.now().date()
    for i in range(6):  # Last 6 months
        month_date = base_date - timedelta(days=30 * (5 - i))
        month_str = month_date.strftime("%Y-%m")
        data.append({
            "month": month_str,
            "users": 10 + (i * 5),  # Mock
            "sessions": 50 + (i * 20)  # Mock
        })
    
    return {"data": data}


@router.get("/analytics/departments")
async def get_department_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/analytics/departments
    Get department performance data
    """
    ensure_warehouse_resumed()
    
    # TODO: Implement real department analytics
    # For now, return mock data
    data = [
        {"department": "Engineering", "concepts": 45, "engagement": 87.5},
        {"department": "Product", "concepts": 32, "engagement": 82.3},
        {"department": "Design", "concepts": 28, "engagement": 79.1},
        {"department": "Marketing", "concepts": 21, "engagement": 75.8}
    ]
    
    return {"data": data}


@router.get("/analytics/topics")
async def get_topic_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/analytics/topics
    Get topic distribution data
    """
    ensure_warehouse_resumed()
    
    # TODO: Implement real topic analytics from NOTEBOOK_ENTRIES or INTERACTION_LOGS
    # For now, return mock data
    data = [
        {"name": "API Design", "value": 35},
        {"name": "Database Schema", "value": 28},
        {"name": "Authentication", "value": 22},
        {"name": "Frontend Architecture", "value": 15}
    ]
    
    return {"data": data}


# Organization routes
@router.get("/organization")
async def get_organization(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/organization
    Get organization info
    """
    ensure_warehouse_resumed()
    
    # Get user's organization from ORG_MEMBERSHIPS table
    result = db.execute(text("""
        SELECT ORG_ID, ORG_NAME, ADMIN_EMAIL, CREATED_AT
        FROM THIRDEYE_DEV.PUBLIC.ORGANIZATIONS
        WHERE ORG_ID IN (
            SELECT ORG_ID FROM THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS
            WHERE USER_ID = :user_id
        )
        LIMIT 1
    """), {"user_id": current_user.user_id})
    org_row = result.fetchone()
    
    if not org_row:
        # Return empty org structure
        return {
            "orgName": "",
            "adminEmail": "",
            "memberCount": 0,
            "createdAt": None,
            "driveSources": [],
            "members": [],
            "metrics": {
                "confusionDensity": 0.0,
                "totalTimeSaved": 0.0,
                "activeUsers": 0,
                "documentsProcessed": 0
            }
        }
    
    org_id = org_row[0]
    
    # Get members
    members_result = db.execute(text("""
        SELECT U.USER_ID, U.NAME, U.EMAIL, OM.ROLE
        FROM THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS OM
        JOIN THIRDEYE_DEV.PUBLIC.USERS U ON OM.USER_ID = U.USER_ID
        WHERE OM.ORG_ID = :org_id
    """), {"org_id": org_id})
    members_rows = members_result.fetchall()
    
    members = []
    for m_row in members_rows:
        members.append({
            "id": m_row[0],
            "name": m_row[1] or "",
            "email": m_row[2],
            "role": m_row[3] or "member"
        })
    
    # Get drive sources (from ORGANIZATIONS table DRIVE_SOURCES column)
    drive_sources = org_row[3] if isinstance(org_row[3], list) else []
    
    # Calculate metrics
    metrics_result = db.execute(text("""
        SELECT 
            COUNT(DISTINCT D.DOC_ID) as documents_processed,
            AVG(D.CONFUSION_DENSITY) as confusion_density,
            COUNT(DISTINCT I.USER_ID) as active_users
        FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS D
        LEFT JOIN THIRDEYE_DEV.PUBLIC.INTERACTIONS I ON D.DOC_ID = I.DOC_ID
        WHERE D.ORG_ID = :org_id
    """), {"org_id": org_id})
    metrics_row = metrics_result.fetchone()
    
    time_saved_result = db.execute(text("""
        SELECT COUNT(*) * 0.25
        FROM THIRDEYE_DEV.PUBLIC.INTERACTIONS I
        JOIN THIRDEYE_DEV.PUBLIC.DOCUMENTS D ON I.DOC_ID = D.DOC_ID
        WHERE D.ORG_ID = :org_id AND I.READING_STATE = 'READ_ONLY'
    """), {"org_id": org_id})
    time_saved = time_saved_result.fetchone()[0] or 0.0
    
    return {
        "orgName": org_row[1] or "",
        "adminEmail": org_row[2] or "",
        "memberCount": len(members),
        "createdAt": org_row[3].isoformat() if org_row[3] else None,
        "driveSources": drive_sources,
        "members": members,
        "metrics": {
            "confusionDensity": float(metrics_row[1]) if metrics_row[1] else 0.0,
            "totalTimeSaved": float(time_saved),
            "activeUsers": int(metrics_row[2]) if metrics_row[2] else 0,
            "documentsProcessed": int(metrics_row[0]) if metrics_row[0] else 0
        }
    }


@router.put("/organization")
async def update_organization(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PUT /api/enterprise/organization
    Update organization info (admin only)
    """
    ensure_warehouse_resumed()
    
    # Check if user is admin
    admin_check = db.execute(text("""
        SELECT ROLE FROM THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS
        WHERE USER_ID = :user_id AND ROLE = 'admin'
        LIMIT 1
    """), {"user_id": current_user.user_id})
    
    if not admin_check.fetchone():
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Only admins can update organization",
                    "details": {}
                }
            }
        )
    
    # Get org_id
    org_result = db.execute(text("""
        SELECT ORG_ID FROM THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS
        WHERE USER_ID = :user_id
        LIMIT 1
    """), {"user_id": current_user.user_id})
    org_row = org_result.fetchone()
    
    if not org_row:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "ORGANIZATION_NOT_FOUND",
                    "message": "User is not a member of any organization",
                    "details": {}
                }
            }
        )
    
    org_id = org_row[0]
    
    # Update organization
    db.execute(text("""
        UPDATE THIRDEYE_DEV.PUBLIC.ORGANIZATIONS
        SET ORG_NAME = :org_name,
            ADMIN_EMAIL = :admin_email,
            UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE ORG_ID = :org_id
    """), {
        "org_id": org_id,
        "org_name": request.get("orgName", ""),
        "admin_email": request.get("adminEmail", "")
    })
    db.commit()
    
    return {"success": True}


# Export routes
@router.post("/exports/generate-report")
async def generate_report(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/enterprise/exports/generate-report
    Generate clarity report from selected suggestions
    """
    ensure_warehouse_resumed()
    
    document_id = request.get("documentId")
    suggestion_ids = request.get("suggestionIds", [])
    
    # Get document
    doc_result = db.execute(text("""
        SELECT TITLE FROM THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS
        WHERE ASSET_ID = :doc_id
        LIMIT 1
    """), {"doc_id": document_id})
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
    
    # Get suggestions
    placeholders = ",".join([f":id_{i}" for i in range(len(suggestion_ids))])
    params = {f"id_{i}": sid for i, sid in enumerate(suggestion_ids)}
    
    suggestions_result = db.execute(text(f"""
        SELECT SUGGESTION_ID, ORIGINAL_TEXT, SUGGESTED_TEXT, CONFIDENCE, REASONING, HOTSPOT_ID
        FROM THIRDEYE_DEV.PUBLIC.SUGGESTIONS
        WHERE SUGGESTION_ID IN ({placeholders})
    """), params)
    suggestions_rows = suggestions_result.fetchall()
    
    suggestions = []
    for s_row in suggestions_rows:
        suggestions.append({
            "id": s_row[0],
            "originalText": s_row[1] or "",
            "suggestedText": s_row[2] or "",
            "confidence": float(s_row[3]) if s_row[3] else 0.0,
            "reasoning": s_row[4] or "",
            "hotspotInfo": s_row[5] or ""
        })
    
    export_id = str(uuid.uuid4())
    
    return {
        "exportId": export_id,
        "documentTitle": doc_row[0] or "",
        "suggestions": suggestions,
        "generatedAt": datetime.now().isoformat()
    }


@router.get("/exports/{export_id}/download")
async def download_report(
    export_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/enterprise/exports/{export_id}/download
    Download report as markdown
    """
    # TODO: Store exports in database and retrieve here
    # For now, return a simple markdown response
    from fastapi.responses import Response
    
    markdown_content = f"# Clarity Report\n\nExport ID: {export_id}\n\n*Report generation in progress...*"
    
    return Response(
        content=markdown_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="report-{export_id}.md"'}
    )
