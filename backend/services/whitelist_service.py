"""
Whitelist Service
Manages enterprise document whitelisting based on folder paths
"""

from typing import List, Optional, Dict, Any
from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
from services.google_drive_client import GoogleDriveClient
import uuid
import re


class WhitelistService:
    """
    Service for managing whitelisted folders and checking document whitelist status
    """
    
    async def get_whitelisted_folders(self, org_id: str) -> List[Dict[str, Any]]:
        """
        Get all whitelisted folders for an organization
        
        Args:
            org_id: Organization ID
            
        Returns:
            List of whitelisted folder dictionaries
        """
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                query = text("""
                    SELECT 
                        FOLDER_ID,
                        ORG_ID,
                        FOLDER_PATH,
                        FOLDER_ID_GOOGLE,
                        CREATED_BY,
                        CREATED_AT,
                        UPDATED_AT,
                        IS_ACTIVE
                    FROM THIRDEYE_DEV.PUBLIC.WHITELISTED_FOLDERS
                    WHERE ORG_ID = :org_id
                    AND IS_ACTIVE = TRUE
                    ORDER BY FOLDER_PATH
                """)
                
                result = conn.execute(query, {"org_id": org_id})
                
                folders = []
                for row in result:
                    folders.append({
                        "folder_id": row[0],
                        "org_id": row[1],
                        "folder_path": row[2],
                        "folder_id_google": row[3],
                        "created_by": row[4],
                        "created_at": row[5].isoformat() if row[5] else None,
                        "updated_at": row[6].isoformat() if row[6] else None,
                        "is_active": row[7]
                    })
                
                return folders
                
        except Exception as e:
            print(f"Error getting whitelisted folders: {e}")
            return []
    
    async def is_document_whitelisted(
        self,
        doc_id: str,
        org_id: str,
        access_token: Optional[str] = None
    ) -> bool:
        """
        Check if a document is whitelisted based on its folder path
        
        Args:
            doc_id: Google Doc ID
            org_id: Organization ID
            access_token: Optional Google access token for folder lookup
            
        Returns:
            True if document is whitelisted, False otherwise
        """
        if not doc_id or not org_id:
            return False
        
        try:
            # First, check if folder path is cached in DOCUMENTS table
            folder_path = await self._get_cached_folder_path(doc_id)
            
            # If not cached and we have access token, fetch from Google Drive
            if not folder_path and access_token:
                folder_path = await self.get_document_folder_path(doc_id, access_token)
                
                # Cache the folder path
                if folder_path:
                    await self._cache_folder_path(doc_id, folder_path)
            
            if not folder_path:
                return False
            
            # Get whitelisted folders for org
            whitelisted_folders = await self.get_whitelisted_folders(org_id)
            
            if not whitelisted_folders:
                return False
            
            # Check if document's folder path matches any whitelisted folder
            for whitelisted in whitelisted_folders:
                whitelisted_path = whitelisted["folder_path"]
                
                # Exact match
                if folder_path == whitelisted_path:
                    return True
                
                # Prefix match (document is in subfolder of whitelisted folder)
                if folder_path.startswith(whitelisted_path + "/"):
                    return True
            
            return False
            
        except Exception as e:
            print(f"Error checking whitelist status: {e}")
            return False
    
    async def get_document_folder_path(
        self,
        doc_id: str,
        access_token: str
    ) -> Optional[str]:
        """
        Get document's folder path from Google Drive API
        
        Args:
            doc_id: Google Doc ID
            access_token: Google OAuth access token
            
        Returns:
            Folder path string (e.g., "/Engineering/Documentation") or None
        """
        try:
            drive_client = GoogleDriveClient(access_token)
            
            # Get file metadata
            file_metadata = drive_client.get_file_metadata(doc_id)
            if not file_metadata:
                return None
            
            # Get parent folder IDs
            parents = file_metadata.get("parents", [])
            if not parents:
                return "/"  # Root folder
            
            # Build folder path by traversing up the folder hierarchy
            folder_path_parts = []
            current_parent_id = parents[0]
            
            # Traverse up to root (max 10 levels to avoid infinite loops)
            max_levels = 10
            level = 0
            
            while current_parent_id and level < max_levels:
                parent_metadata = drive_client.get_file_metadata(current_parent_id)
                if not parent_metadata:
                    break
                
                parent_name = parent_metadata.get("name", "")
                if parent_name:
                    folder_path_parts.insert(0, parent_name)
                
                # Check if this is the root
                parent_parents = parent_metadata.get("parents", [])
                if not parent_parents:
                    break
                
                current_parent_id = parent_parents[0]
                level += 1
            
            # Build full path
            if folder_path_parts:
                return "/" + "/".join(folder_path_parts)
            else:
                return "/"
                
        except Exception as e:
            print(f"Error getting document folder path: {e}")
            return None
    
    async def _get_cached_folder_path(self, doc_id: str) -> Optional[str]:
        """Get cached folder path from DOCUMENTS table"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                query = text("""
                    SELECT FOLDER_PATH
                    FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
                    WHERE DOC_ID = :doc_id
                    AND FOLDER_PATH IS NOT NULL
                """)
                
                result = conn.execute(query, {"doc_id": doc_id})
                row = result.fetchone()
                
                return row[0] if row else None
                
        except Exception as e:
            print(f"Error getting cached folder path: {e}")
            return None
    
    async def _cache_folder_path(self, doc_id: str, folder_path: str):
        """Cache folder path in DOCUMENTS table"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                # Check if document exists
                check_query = text("""
                    SELECT DOC_ID FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS
                    WHERE DOC_ID = :doc_id
                """)
                
                result = conn.execute(check_query, {"doc_id": doc_id})
                exists = result.fetchone() is not None
                
                if exists:
                    # Update existing document
                    update_query = text("""
                        UPDATE THIRDEYE_DEV.PUBLIC.DOCUMENTS
                        SET FOLDER_PATH = :folder_path,
                            UPDATED_AT = CURRENT_TIMESTAMP()
                        WHERE DOC_ID = :doc_id
                    """)
                    conn.execute(update_query, {
                        "doc_id": doc_id,
                        "folder_path": folder_path
                    })
                else:
                    # Insert new document record (minimal)
                    insert_query = text("""
                        INSERT INTO THIRDEYE_DEV.PUBLIC.DOCUMENTS (
                            DOC_ID, FOLDER_PATH, CREATED_AT, UPDATED_AT
                        ) VALUES (
                            :doc_id, :folder_path, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
                        )
                    """)
                    conn.execute(insert_query, {
                        "doc_id": doc_id,
                        "folder_path": folder_path
                    })
                
                conn.commit()
                
        except Exception as e:
            print(f"Error caching folder path: {e}")
    
    async def add_whitelisted_folder(
        self,
        org_id: str,
        folder_path: str,
        created_by: str,
        folder_id_google: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Add a whitelisted folder
        
        Args:
            org_id: Organization ID
            folder_path: Folder path (e.g., "/Engineering/Documentation")
            created_by: User ID who created the whitelist
            folder_id_google: Optional Google Drive folder ID
            
        Returns:
            Created folder dictionary
        """
        try:
            await ensure_warehouse_resumed()
            folder_id = str(uuid.uuid4())
            
            with engine.connect() as conn:
                # Normalize folder path (ensure starts with /)
                normalized_path = folder_path if folder_path.startswith("/") else f"/{folder_path}"
                
                insert_query = text("""
                    INSERT INTO THIRDEYE_DEV.PUBLIC.WHITELISTED_FOLDERS (
                        FOLDER_ID, ORG_ID, FOLDER_PATH, FOLDER_ID_GOOGLE,
                        CREATED_BY, CREATED_AT, UPDATED_AT, IS_ACTIVE
                    ) VALUES (
                        :folder_id, :org_id, :folder_path, :folder_id_google,
                        :created_by, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), TRUE
                    )
                """)
                
                conn.execute(insert_query, {
                    "folder_id": folder_id,
                    "org_id": org_id,
                    "folder_path": normalized_path,
                    "folder_id_google": folder_id_google,
                    "created_by": created_by
                })
                conn.commit()
            
            return {
                "folder_id": folder_id,
                "org_id": org_id,
                "folder_path": normalized_path,
                "folder_id_google": folder_id_google,
                "created_by": created_by,
                "is_active": True
            }
            
        except Exception as e:
            print(f"Error adding whitelisted folder: {e}")
            raise
    
    async def remove_whitelisted_folder(
        self,
        org_id: str,
        folder_id: str
    ) -> bool:
        """
        Remove (deactivate) a whitelisted folder
        
        Args:
            org_id: Organization ID
            folder_id: Folder ID to remove
            
        Returns:
            True if successful
        """
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                update_query = text("""
                    UPDATE THIRDEYE_DEV.PUBLIC.WHITELISTED_FOLDERS
                    SET IS_ACTIVE = FALSE,
                        UPDATED_AT = CURRENT_TIMESTAMP()
                    WHERE FOLDER_ID = :folder_id
                    AND ORG_ID = :org_id
                """)
                
                result = conn.execute(update_query, {
                    "folder_id": folder_id,
                    "org_id": org_id
                })
                conn.commit()
                
                return result.rowcount > 0
                
        except Exception as e:
            print(f"Error removing whitelisted folder: {e}")
            return False
    
    async def check_document_whitelist_status(
        self,
        doc_id: str,
        org_id: str,
        access_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get detailed whitelist status for a document
        
        Args:
            doc_id: Google Doc ID
            org_id: Organization ID
            access_token: Optional Google access token
            
        Returns:
            Status dictionary with is_whitelisted, folder_path, matching_folders
        """
        folder_path = await self._get_cached_folder_path(doc_id)
        
        if not folder_path and access_token:
            folder_path = await self.get_document_folder_path(doc_id, access_token)
            if folder_path:
                await self._cache_folder_path(doc_id, folder_path)
        
        is_whitelisted = False
        matching_folders = []
        
        if folder_path:
            whitelisted_folders = await self.get_whitelisted_folders(org_id)
            
            for whitelisted in whitelisted_folders:
                whitelisted_path = whitelisted["folder_path"]
                
                if folder_path == whitelisted_path or folder_path.startswith(whitelisted_path + "/"):
                    is_whitelisted = True
                    matching_folders.append(whitelisted)
        
        return {
            "doc_id": doc_id,
            "is_whitelisted": is_whitelisted,
            "folder_path": folder_path,
            "matching_folders": matching_folders
        }
