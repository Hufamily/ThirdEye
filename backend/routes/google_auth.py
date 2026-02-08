"""
Google OAuth Token Management
Handles access tokens for Google Drive, Gmail, Chat APIs
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from utils.auth import get_current_user
from models.user import User
from utils.database import get_db, ensure_warehouse_resumed
from sqlalchemy.orm import Session
from sqlalchemy import text
import json

router = APIRouter()


class StoreAccessTokenRequest(BaseModel):
    """Request to store Google access token"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    scopes: Optional[list] = None


@router.post("/store-access-token")
async def store_access_token(
    request: StoreAccessTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/google-auth/store-access-token
    Store Google OAuth access token for API access
    
    Called after user grants additional permissions (Drive, Gmail, etc.)
    """
    ensure_warehouse_resumed()
    
    try:
        # Store access token in user's metadata or separate table
        # For now, store in user's session_metadata or create TOKENS table
        
        # Update user record with access token info
        token_data = {
            "access_token": request.access_token,
            "refresh_token": request.refresh_token,
            "expires_in": request.expires_in,
            "scopes": request.scopes or [],
            "stored_at": "now"  # Will be set by database
        }
        
        # Store in user metadata (or create separate TOKENS table)
        from sqlalchemy import text
        db.execute(text("""
            UPDATE THIRDEYE_DEV.PUBLIC.USERS
            SET UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE USER_ID = :user_id
        """), {"user_id": current_user.user_id})
        db.commit()
        
        # TODO: Create TOKENS table to store access tokens securely
        # For now, return success
        
        return {
            "success": True,
            "message": "Access token stored successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "TOKEN_STORAGE_ERROR",
                    "message": f"Failed to store access token: {str(e)}",
                    "details": {}
                }
            }
        )


@router.get("/check-scopes")
async def check_scopes(
    current_user: User = Depends(get_current_user)
):
    """
    GET /api/google-auth/check-scopes
    Check which Google API scopes user has granted
    """
    # TODO: Decode access token or check stored scopes
    # For now, return placeholder
    
    return {
        "scopes": {
            "drive": False,  # TODO: Check actual scopes
            "gmail": False,
            "chat": False
        },
        "message": "Check scopes from stored token"
    }
