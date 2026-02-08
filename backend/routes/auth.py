"""
Authentication routes
Implements endpoints from BACKEND_INTEGRATION_GUIDE.md
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from pydantic import BaseModel
from google.auth.transport import requests
from google.oauth2 import id_token
from app.config import settings
from utils.auth import create_access_token, verify_token, get_user_id_from_token
from utils.database import get_db, ensure_warehouse_resumed
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.user import User
import uuid

router = APIRouter()
security = HTTPBearer()


class GoogleLoginRequest(BaseModel):
    """Request model for Google login"""
    credential: str  # JWT token from Google
    accountType: str  # "personal" | "enterprise"


class AuthResponse(BaseModel):
    """Response model for authentication"""
    user: dict
    token: str
    accountType: str
    hasEnterpriseAccess: bool


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get current authenticated user
    Used by protected routes
    """
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_TOKEN",
                    "message": "Invalid or expired token",
                    "details": {}
                }
            }
        )
    
    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_TOKEN",
                    "message": "Token missing user identifier",
                    "details": {}
                }
            }
        )
    
    ensure_warehouse_resumed()
    
    # Use raw SQL with fully qualified table name for reliability
    from sqlalchemy import text
    result = db.execute(text("""
        SELECT USER_ID, GOOGLE_SUB, EMAIL, NAME, PICTURE_URL, ACCOUNT_TYPE, 
               HAS_ENTERPRISE_ACCESS, PERSONA_CARD, CREATED_AT, UPDATED_AT, LAST_LOGIN
        FROM THIRDEYE_DEV.PUBLIC.USERS
        WHERE USER_ID = :user_id
        LIMIT 1
    """), {"user_id": user_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "USER_NOT_FOUND",
                    "message": "User not found",
                    "details": {}
                }
            }
        )
    
    # Convert row to User object
    user = User(
        user_id=row[0],
        google_sub=row[1],
        email=row[2],
        name=row[3],
        picture_url=row[4],
        account_type=row[5],
        has_enterprise_access=row[6],
        persona_card=row[7],
        created_at=row[8],
        updated_at=row[9],
        last_login=row[10]
    )
    
    return user


@router.post("/google-login", response_model=AuthResponse)
async def google_login(
    request: GoogleLoginRequest,
    db: Session = Depends(get_db)
):
    """
    POST /api/auth/google-login
    Authenticate user with Google OAuth token
    
    Matches BACKEND_INTEGRATION_GUIDE.md specification exactly
    """
    try:
        # Verify Google JWT token
        idinfo = id_token.verify_oauth2_token(
            request.credential,
            requests.Request(),
            settings.google_client_id
        )
        
        # Extract user info from Google token
        google_sub = idinfo.get("sub")
        email = idinfo.get("email")
        name = idinfo.get("name", "")
        picture = idinfo.get("picture", "")
        
        if not google_sub or not email:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_GOOGLE_TOKEN",
                        "message": "Google token missing required fields",
                        "details": {}
                    }
                }
            )
        
        ensure_warehouse_resumed()
        
        # Find or create user using raw SQL with fully qualified table name
        from sqlalchemy import text
        
        # Check if user exists
        result = db.execute(text("""
            SELECT USER_ID, GOOGLE_SUB, EMAIL, NAME, PICTURE_URL, ACCOUNT_TYPE, 
                   HAS_ENTERPRISE_ACCESS, PERSONA_CARD, CREATED_AT, UPDATED_AT, LAST_LOGIN
            FROM THIRDEYE_DEV.PUBLIC.USERS
            WHERE GOOGLE_SUB = :google_sub
            LIMIT 1
        """), {"google_sub": google_sub})
        row = result.fetchone()
        
        if not row:
            # Create new user
            user_id = str(uuid.uuid4())
            db.execute(text("""
                INSERT INTO THIRDEYE_DEV.PUBLIC.USERS 
                (USER_ID, GOOGLE_SUB, EMAIL, NAME, PICTURE_URL, ACCOUNT_TYPE, HAS_ENTERPRISE_ACCESS)
                VALUES (:user_id, :google_sub, :email, :name, :picture_url, :account_type, :has_enterprise_access)
            """), {
                "user_id": user_id,
                "google_sub": google_sub,
                "email": email,
                "name": name,
                "picture_url": picture,
                "account_type": request.accountType,
                "has_enterprise_access": False
            })
            db.commit()
            
            # Fetch the created user
            result = db.execute(text("""
                SELECT USER_ID, GOOGLE_SUB, EMAIL, NAME, PICTURE_URL, ACCOUNT_TYPE, 
                       HAS_ENTERPRISE_ACCESS, PERSONA_CARD, CREATED_AT, UPDATED_AT, LAST_LOGIN
                FROM THIRDEYE_DEV.PUBLIC.USERS
                WHERE USER_ID = :user_id
            """), {"user_id": user_id})
            row = result.fetchone()
        else:
            # Update existing user
            db.execute(text("""
                UPDATE THIRDEYE_DEV.PUBLIC.USERS
                SET EMAIL = :email,
                    NAME = :name,
                    PICTURE_URL = :picture_url,
                    ACCOUNT_TYPE = :account_type,
                    LAST_LOGIN = CURRENT_TIMESTAMP(),
                    UPDATED_AT = CURRENT_TIMESTAMP()
                WHERE GOOGLE_SUB = :google_sub
            """), {
                "email": email,
                "name": name,
                "picture_url": picture,
                "account_type": request.accountType,
                "google_sub": google_sub
            })
            db.commit()
            
            # Fetch updated user
            result = db.execute(text("""
                SELECT USER_ID, GOOGLE_SUB, EMAIL, NAME, PICTURE_URL, ACCOUNT_TYPE, 
                       HAS_ENTERPRISE_ACCESS, PERSONA_CARD, CREATED_AT, UPDATED_AT, LAST_LOGIN
                FROM THIRDEYE_DEV.PUBLIC.USERS
                WHERE GOOGLE_SUB = :google_sub
            """), {"google_sub": google_sub})
            row = result.fetchone()
        
        # Convert row to User object
        user = User(
            user_id=row[0],
            google_sub=row[1],
            email=row[2],
            name=row[3],
            picture_url=row[4],
            account_type=row[5],
            has_enterprise_access=row[6],
            persona_card=row[7],
            created_at=row[8],
            updated_at=row[9],
            last_login=row[10]
        )
        
        # Create JWT token for our API
        token_data = {
            "sub": user.user_id,
            "email": user.email,
            "account_type": user.account_type
        }
        access_token = create_access_token(token_data)
        
        return AuthResponse(
            user=user.to_dict(),
            token=access_token,
            accountType=user.account_type,
            hasEnterpriseAccess=user.has_enterprise_access
        )
        
    except ValueError as e:
        # Invalid Google token
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_GOOGLE_TOKEN",
                    "message": "Invalid Google token",
                    "details": {"error": str(e)}
                }
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "LOGIN_ERROR",
                    "message": "Error during login",
                    "details": {"error": str(e)}
                }
            }
        )


@router.get("/me", response_model=AuthResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    GET /api/auth/me
    Get current authenticated user info
    
    Matches BACKEND_INTEGRATION_GUIDE.md specification exactly
    """
    # Get fresh token
    token_data = {
        "sub": current_user.user_id,
        "email": current_user.email,
        "account_type": current_user.account_type
    }
    access_token = create_access_token(token_data)
    
    return AuthResponse(
        user=current_user.to_dict(),
        token=access_token,
        accountType=current_user.account_type,
        hasEnterpriseAccess=current_user.has_enterprise_access
    )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user)
):
    """
    POST /api/auth/logout
    Logout user (invalidate token)
    
    Note: With JWT, we can't truly invalidate tokens server-side without
    maintaining a blacklist. For now, we just return success.
    In production, consider implementing token blacklisting or using refresh tokens.
    
    Matches BACKEND_INTEGRATION_GUIDE.md specification exactly
    """
    return {"success": True}
