"""
Google Drive API Client
Access user's Google Drive files and folders
"""

from typing import Dict, Any, Optional, List
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import json


class GoogleDriveClient:
    """
    Client for Google Drive API
    Handles file listing, content extraction, and folder navigation
    """
    
    def __init__(self, access_token: str):
        """
        Initialize Google Drive client
        
        Args:
            access_token: OAuth access token from user
        """
        self.credentials = Credentials(token=access_token)
        self.service = build('drive', 'v3', credentials=self.credentials)
    
    def list_files(
        self,
        folder_id: Optional[str] = None,
        mime_type: Optional[str] = None,
        page_size: int = 50
    ) -> List[Dict[str, Any]]:
        """
        List files in Drive
        
        Args:
            folder_id: Optional folder ID to list files from
            mime_type: Optional MIME type filter (e.g., 'application/vnd.google-apps.document')
            page_size: Number of files to return
            
        Returns:
            List of file metadata dictionaries
        """
        try:
            query = "trashed=false"
            
            if folder_id:
                query += f" and '{folder_id}' in parents"
            
            if mime_type:
                query += f" and mimeType='{mime_type}'"
            
            results = self.service.files().list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, modifiedTime, createdTime, parents, webViewLink, webContentLink)"
            ).execute()
            
            files = []
            for file in results.get('files', []):
                files.append({
                    "fileId": file.get('id'),
                    "name": file.get('name'),
                    "mimeType": file.get('mimeType'),
                    "modifiedTime": file.get('modifiedTime'),
                    "createdTime": file.get('createdTime'),
                    "parents": file.get('parents', []),
                    "url": file.get('webViewLink'),
                    "downloadUrl": file.get('webContentLink')
                })
            
            return files
            
        except HttpError as e:
            print(f"Error listing files: {e}")
            return []
    
    def get_file_content(self, file_id: str) -> Optional[str]:
        """
        Get content of a Google Doc
        
        Args:
            file_id: Google Doc file ID
            
        Returns:
            Document content as text, or None if error
        """
        try:
            # For Google Docs, use the export API
            request = self.service.files().export_media(
                fileId=file_id,
                mimeType='text/plain'
            )
            content = request.execute()
            return content.decode('utf-8')
        except HttpError as e:
            print(f"Error getting file content: {e}")
            return None
    
    def get_folder_path(self, folder_id: str) -> str:
        """
        Get full folder path for a folder ID
        
        Args:
            folder_id: Folder ID
            
        Returns:
            Full path string (e.g., "/My Drive/Folder1/Subfolder")
        """
        try:
            path_parts = []
            current_id = folder_id
            
            while current_id:
                folder = self.service.files().get(
                    fileId=current_id,
                    fields="id, name, parents"
                ).execute()
                
                path_parts.insert(0, folder.get('name', 'Unknown'))
                parents = folder.get('parents', [])
                current_id = parents[0] if parents else None
            
            return "/" + "/".join(path_parts)
        except HttpError as e:
            print(f"Error getting folder path: {e}")
            return ""
    
    def list_folders(self) -> List[Dict[str, Any]]:
        """
        List all folders in Drive
        
        Returns:
            List of folder metadata
        """
        return self.list_files(
            mime_type='application/vnd.google-apps.folder'
        )
