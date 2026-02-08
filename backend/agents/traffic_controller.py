"""
Agent 0.5: Traffic Controller
Determines operational mode based on page context
"""

from typing import Dict, Any, Optional
from enum import Enum
from .base_agent import BaseAgent
from services.whitelist_service import WhitelistService


class Mode(str, Enum):
    """Operational modes"""
    EDITABLE = "EDITABLE"
    READ_ONLY = "READ_ONLY"


class TrafficController(BaseAgent):
    """
    Agent 0.5: Traffic Controller
    Routes requests and determines operational mode
    """
    
    def __init__(self):
        super().__init__(
            agent_id="0.5",
            agent_name="Traffic Controller",
            agent_version="1.0.0"
        )
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detect mode and route request
        
        Input:
            {
                "url": "string",
                "page_content": {
                    "is_editable": bool (optional),
                    "title": "string" (optional),
                    "content_type": "string" (optional)
                },
                "user_permissions": List[str] (optional),
                "org_id": str (optional) - Organization ID for whitelist check,
                "google_access_token": str (optional) - For folder path lookup,
                "whitelisted_folders": List[str] (optional) - Deprecated, will be fetched from DB
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "mode": "EDITABLE" | "READ_ONLY",
                    "url": "string",
                    "docId": "string" (optional),
                    "isWhitelisted": bool,
                    "permissions": List[str],
                    "detectedAt": "ISO timestamp",
                    "routing": {
                        "agent_6_0_active": bool,
                        "can_edit": bool,
                        "focus": "string"
                    }
                }
            }
        """
        try:
            self.validate_input(input_data, ["url"])
            url = input_data["url"]
            page_content = input_data.get("page_content", {})
            user_permissions = input_data.get("user_permissions", [])
            org_id = input_data.get("org_id")
            google_access_token = input_data.get("google_access_token")
            
            # Detect mode
            mode_result = await self._detect_mode(
                url, page_content, user_permissions, org_id, google_access_token
            )
            
            return self.create_response(success=True, data=mode_result)
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Mode detection failed: {str(e)}")
    
    async def _detect_mode(
        self,
        url: str,
        page_content: Dict[str, Any],
        user_permissions: list,
        org_id: Optional[str],
        google_access_token: Optional[str]
    ) -> Dict[str, Any]:
        """Detect operational mode from URL and page content"""
        from datetime import datetime
        
        # Extract doc ID from URL if it's a Google Doc
        doc_id = self._extract_doc_id(url)
        
        # Check URL patterns
        is_google_doc = "docs.google.com" in url.lower()
        is_editable_url = "/edit" in url.lower() or "edit=true" in url.lower()
        is_view_only = "/view" in url.lower() or "viewonly=true" in url.lower()
        
        # Check page content
        is_editable_content = page_content.get("is_editable", False)
        
        # Determine mode
        if is_google_doc:
            if is_editable_url and not is_view_only:
                # Check if user has edit permissions
                if "write" in user_permissions or "edit" in user_permissions:
                    mode = Mode.EDITABLE
                else:
                    mode = Mode.READ_ONLY
            else:
                mode = Mode.READ_ONLY
        elif "notion.so" in url.lower() or "confluence.atlassian.com" in url.lower():
            # Collaborative platforms - check permissions
            if is_editable_content or "write" in user_permissions:
                mode = Mode.EDITABLE
            else:
                mode = Mode.READ_ONLY
        else:
            # Default to read-only for static websites
            mode = Mode.READ_ONLY
        
        # Check if document is whitelisted (for enterprise)
        is_whitelisted = False
        if doc_id and org_id:
            # Use WhitelistService to check if document is whitelisted
            whitelist_service = WhitelistService()
            is_whitelisted = await whitelist_service.is_document_whitelisted(
                doc_id=doc_id,
                org_id=org_id,
                access_token=google_access_token
            )
        
        # Determine routing
        agent_6_0_active = mode == Mode.EDITABLE and is_whitelisted
        can_edit = mode == Mode.EDITABLE
        focus = "document_editing" if agent_6_0_active else "personal_learning"
        
        return {
            "mode": mode.value,
            "url": url,
            "docId": doc_id,
            "isWhitelisted": is_whitelisted,
            "permissions": user_permissions if user_permissions else (["read", "write"] if mode == Mode.EDITABLE else ["read"]),
            "detectedAt": datetime.now().isoformat(),
            "routing": {
                "agent_6_0_active": agent_6_0_active,
                "can_edit": can_edit,
                "focus": focus
            }
        }
    
    def _extract_doc_id(self, url: str) -> Optional[str]:
        """Extract document ID from URL"""
        import re
        
        # Google Docs pattern: /document/d/{doc_id}/edit
        match = re.search(r'/document/d/([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
        
        # Other patterns can be added here
        return None
    
    async def route_request(
        self,
        request_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Route request to appropriate agent
        
        Args:
            request_type: Type of request ("analyze", "explain", "edit", etc.)
            context: Request context
            
        Returns:
            Routing decision
        """
        mode_result = await self.process({
            "url": context.get("url", ""),
            "page_content": context.get("page_content", {}),
            "user_permissions": context.get("user_permissions", []),
            "org_id": context.get("org_id"),
            "google_access_token": context.get("google_access_token")
        })
        
        if not mode_result.get("success"):
            return mode_result
        
        mode_data = mode_result.get("data", {})
        mode = mode_data.get("mode")
        routing = mode_data.get("routing", {})
        
        # Determine which agents should be active
        agents_to_activate = []
        
        if request_type == "analyze_confusion":
            agents_to_activate = ["2.0", "3.0"]  # Target Interpreter + Gap Hypothesis
        elif request_type == "generate_explanation":
            agents_to_activate = ["4.0"]  # Explanation Composer
        elif request_type == "apply_suggestion":
            if routing.get("agent_6_0_active"):
                agents_to_activate = ["6.0"]  # Document Surgeon
            else:
                return self.create_response(
                    success=False,
                    error="Document editing not available in READ_ONLY mode"
                )
        elif request_type == "capture_content":
            agents_to_activate = ["1.0"]  # Capture & Scrape
        
        return self.create_response(success=True, data={
            "mode": mode,
            "agents_to_activate": agents_to_activate,
            "routing": routing
        })
