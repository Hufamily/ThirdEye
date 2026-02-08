"""
Google Chat/Gmail API Client
Access user's chat history and email for learning context
"""

from typing import Dict, Any, Optional, List
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import base64
import json


class GoogleChatClient:
    """
    Client for Google Chat and Gmail APIs
    Handles message retrieval for learning context
    """
    
    def __init__(self, access_token: str):
        """
        Initialize Google Chat/Gmail client
        
        Args:
            access_token: OAuth access token from user
        """
        self.credentials = Credentials(token=access_token)
        self.gmail_service = build('gmail', 'v1', credentials=self.credentials)
        # Note: Chat API may require different setup
        # self.chat_service = build('chat', 'v1', credentials=self.credentials)
    
    def get_recent_emails(
        self,
        max_results: int = 50,
        query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get recent emails from Gmail
        
        Args:
            max_results: Maximum number of emails to retrieve
            query: Optional Gmail search query
            
        Returns:
            List of email metadata
        """
        try:
            query_string = query or "is:unread OR is:important"
            
            results = self.gmail_service.users().messages().list(
                userId='me',
                maxResults=max_results,
                q=query_string
            ).execute()
            
            messages = []
            for msg in results.get('messages', []):
                message = self.gmail_service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='metadata',
                    metadataHeaders=['Subject', 'From', 'Date']
                ).execute()
                
                headers = {h['name']: h['value'] for h in message.get('payload', {}).get('headers', [])}
                
                messages.append({
                    "id": message['id'],
                    "threadId": message.get('threadId'),
                    "subject": headers.get('Subject', ''),
                    "from": headers.get('From', ''),
                    "date": headers.get('Date', ''),
                    "snippet": message.get('snippet', '')
                })
            
            return messages
            
        except HttpError as e:
            print(f"Error getting emails: {e}")
            return []
    
    def get_email_content(self, message_id: str) -> Optional[Dict[str, Any]]:
        """
        Get full email content
        
        Args:
            message_id: Gmail message ID
            
        Returns:
            Email content dictionary
        """
        try:
            message = self.gmail_service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute()
            
            payload = message.get('payload', {})
            body = payload.get('body', {})
            
            # Extract text content
            text_content = ""
            if 'data' in body:
                text_content = base64.urlsafe_b64decode(body['data']).decode('utf-8')
            
            return {
                "id": message['id'],
                "subject": next((h['value'] for h in payload.get('headers', []) if h['name'] == 'Subject'), ''),
                "from": next((h['value'] for h in payload.get('headers', []) if h['name'] == 'From'), ''),
                "body": text_content,
                "snippet": message.get('snippet', '')
            }
        except HttpError as e:
            print(f"Error getting email content: {e}")
            return None
