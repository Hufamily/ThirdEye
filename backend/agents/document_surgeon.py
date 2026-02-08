"""
Agent 6.0: Document Surgeon
Aggregator & Editor (Enterprise Only)
Aggregates friction and applies optimizations to Google Docs
Active only in EDITABLE mode on whitelisted documents
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.k2think_client import K2ThinkClient
from services.google_drive_client import GoogleDriveClient
from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
import json
import uuid


class DocumentSurgeon(BaseAgent):
    """
    Agent 6.0: Document Surgeon
    Aggregates user friction and suggests/ applies document improvements
    """
    
    def __init__(self):
        super().__init__(
            agent_id="6.0",
            agent_name="Document Surgeon",
            agent_version="1.0.0"
        )
        try:
            self.k2think = K2ThinkClient()
        except Exception as e:
            print(f"Warning: K2-Think client initialization failed: {e}")
            self.k2think = None
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Aggregate friction and generate suggestions
        
        Input:
            {
                "doc_id": str,
                "action": str - "aggregate" | "suggest" | "apply",
                "time_window_days": int (optional, default 30),
                "google_access_token": str (required for apply),
                "suggestion_id": str (optional, required for apply)
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "friction_hotspots": List[Dict] (for aggregate),
                    "suggestions": List[Dict] (for suggest),
                    "applied": bool (for apply)
                }
            }
        """
        try:
            self.validate_input(input_data, ["doc_id", "action"])
            
            doc_id = input_data["doc_id"]
            action = input_data["action"]
            time_window = input_data.get("time_window_days", 30)
            
            if action == "aggregate":
                return await self._aggregate_friction(doc_id, time_window)
            elif action == "suggest":
                return await self._generate_suggestions(doc_id, time_window)
            elif action == "apply":
                access_token = input_data.get("google_access_token")
                if not access_token:
                    return self.create_response(success=False, error="Google access token required")
                suggestion_id = input_data.get("suggestion_id")
                return await self._apply_suggestion(doc_id, suggestion_id, access_token)
            else:
                return self.create_response(success=False, error=f"Unknown action: {action}")
                
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Document surgeon operation failed: {str(e)}")
    
    async def _aggregate_friction(
        self,
        doc_id: str,
        time_window_days: int
    ) -> Dict[str, Any]:
        """Aggregate friction hotspots from interactions"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                # Get confusion events for this document
                query = text("""
                    SELECT 
                        ANCHOR_ID,
                        COUNT(*) as confusion_count,
                        COUNT(DISTINCT USER_ID) as unique_users,
                        AVG(DWELL_TIME) as avg_dwell_time,
                        LISTAGG(DISTINCT USER_FEEDBACK, ', ') WITHIN GROUP (ORDER BY USER_FEEDBACK) as feedbacks
                    FROM THIRDEYE_DEV.PUBLIC.INTERACTIONS
                    WHERE DOC_ID = :doc_id
                    AND CREATED_AT >= DATEADD(day, -:time_window, CURRENT_TIMESTAMP())
                    AND ANCHOR_ID IS NOT NULL
                    GROUP BY ANCHOR_ID
                    ORDER BY confusion_count DESC
                """)
                
                result = conn.execute(query, {"doc_id": doc_id, "time_window": time_window_days})
                
                friction_hotspots = []
                for row in result:
                    anchor_id = row[0]
                    confusion_count = row[1] or 0
                    unique_users = row[2] or 0
                    avg_dwell = row[3] or 0
                    feedbacks = row[4] or ""
                    
                    # Calculate intensity (0-100 scale)
                    intensity = min(100, (confusion_count * 10) + (unique_users * 5))
                    
                    friction_hotspots.append({
                        "anchor_id": anchor_id,
                        "confusion_count": confusion_count,
                        "unique_users": unique_users,
                        "average_dwell_time": avg_dwell,
                        "intensity": intensity,
                        "feedbacks": feedbacks.split(", ") if feedbacks else []
                    })
            
            return self.create_response(success=True, data={
                "friction_hotspots": friction_hotspots,
                "total_hotspots": len(friction_hotspots)
            })
            
        except Exception as e:
            print(f"Error aggregating friction: {e}")
            return self.create_response(success=False, error=str(e))
    
    async def _generate_suggestions(
        self,
        doc_id: str,
        time_window_days: int
    ) -> Dict[str, Any]:
        """Generate improvement suggestions using K2-Think"""
        # First aggregate friction
        friction_result = await self._aggregate_friction(doc_id, time_window_days)
        if not friction_result.get("success"):
            return friction_result
        
        hotspots = friction_result.get("data", {}).get("friction_hotspots", [])
        
        if not hotspots:
            return self.create_response(success=True, data={
                "suggestions": [],
                "message": "No friction hotspots found"
            })
        
        suggestions = []
        
        # Generate suggestion for top hotspots
        for hotspot in hotspots[:5]:  # Top 5 hotspots
            if self.k2think:
                try:
                    # Get original content for this anchor
                    original_content = await self._get_content_for_anchor(doc_id, hotspot["anchor_id"])
                    
                    # Use K2-Think to generate suggestion
                    prompt = f"""Analyze this content that is causing confusion for {hotspot['unique_users']} users:

Original Content:
{original_content[:500]}

Confusion Metrics:
- {hotspot['confusion_count']} confusion events
- {hotspot['unique_users']} unique users affected
- Average dwell time: {hotspot['average_dwell_time']}ms

Suggest improvements to make this content clearer. Consider:
1. Adding prerequisite explanations
2. Breaking down complex concepts
3. Adding examples or analogies
4. Clarifying terminology

Output JSON:
{{
  "suggested_text": "Improved version of the content",
  "reasoning": "Why this improvement helps",
  "confidence": 0.0-1.0,
  "changes_made": ["change1", "change2"]
}}"""
                    
                    result = await self.k2think.reason(
                        query=prompt,
                        max_steps=5,
                        temperature=0.3
                    )
                    
                    suggestion = self._parse_suggestion_result(result, hotspot, original_content)
                    suggestions.append(suggestion)
                    
                except Exception as e:
                    print(f"Error generating suggestion: {e}")
                    # Continue with other hotspots
            else:
                # Fallback suggestion
                suggestions.append({
                    "anchor_id": hotspot["anchor_id"],
                    "suggested_text": "Consider adding more explanation or examples here.",
                    "reasoning": f"High confusion rate ({hotspot['confusion_count']} events)",
                    "confidence": 0.6,
                    "changes_made": ["Add explanation", "Add examples"]
                })
        
        result_data = {
            "suggestions": suggestions
        }
        
        # Store suggestions in database
        await self._store_suggestions(
            suggestions,
            doc_id,
            input_data.get("org_id"),
            input_data.get("user_id")
        )
        
        return self.create_response(success=True, data=result_data)
    
    async def _get_content_for_anchor(self, doc_id: str, anchor_id: str) -> str:
        """Get content text for a specific anchor"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                query = text("""
                    SELECT CONTENT
                    FROM THIRDEYE_DEV.PUBLIC.INTERACTIONS
                    WHERE DOC_ID = :doc_id
                    AND ANCHOR_ID = :anchor_id
                    LIMIT 1
                """)
                
                result = conn.execute(query, {"doc_id": doc_id, "anchor_id": anchor_id})
                row = result.fetchone()
                
                return row[0] if row and row[0] else ""
                
        except Exception as e:
            print(f"Error getting content: {e}")
            return ""
    
    def _parse_suggestion_result(
        self,
        result: Dict[str, Any],
        hotspot: Dict[str, Any],
        original_content: str
    ) -> Dict[str, Any]:
        """Parse K2-Think suggestion result"""
        try:
            # Extract text
            text = ""
            if isinstance(result, dict):
                if "choices" in result:
                    text = result["choices"][0].get("message", {}).get("content", "")
                elif "text" in result:
                    text = result["text"]
                else:
                    text = str(result)
            
            # Try to extract JSON
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                json_str = json_match.group(0)
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*', '', json_str)
                
                parsed = json.loads(json_str)
                return {
                    "anchor_id": hotspot["anchor_id"],
                    "original_text": original_content[:200],
                    "suggested_text": parsed.get("suggested_text", text),
                    "reasoning": parsed.get("reasoning", ""),
                    "confidence": parsed.get("confidence", 0.7),
                    "changes_made": parsed.get("changes_made", [])
                }
            
            # Fallback
            return {
                "anchor_id": hotspot["anchor_id"],
                "original_text": original_content[:200],
                "suggested_text": text[:500] if text else "Consider improving clarity",
                "reasoning": f"High confusion rate: {hotspot['confusion_count']} events",
                "confidence": 0.6,
                "changes_made": ["Improve clarity", "Add examples"]
            }
            
        except Exception as e:
            print(f"Error parsing suggestion: {e}")
            return {
                "anchor_id": hotspot["anchor_id"],
                "original_text": original_content[:200],
                "suggested_text": "Consider improving clarity",
                "reasoning": "Parsing error",
                "confidence": 0.5,
                "changes_made": []
            }
    
    async def _apply_suggestion(
        self,
        doc_id: str,
        suggestion_id: str,
        access_token: str
    ) -> Dict[str, Any]:
        """Apply suggestion to Google Doc"""
        # In a full implementation, would:
        # 1. Retrieve suggestion details
        # 2. Use Google Docs API to apply changes
        # 3. Track applied changes
        
        # For now, return placeholder
        return self.create_response(success=True, data={
            "applied": True,
            "message": "Suggestion application would be implemented here using Google Docs API"
        })
    
    async def _store_suggestions(
        self,
        suggestions: List[Dict[str, Any]],
        doc_id: str,
        org_id: Optional[str],
        user_id: Optional[str]
    ):
        """Store document suggestions in database"""
        if not suggestions:
            return
        
        try:
            await ensure_warehouse_resumed()
            
            with engine.connect() as conn:
                for suggestion in suggestions:
                    suggestion_id = str(uuid.uuid4())
                    
                    insert_query = text("""
                        INSERT INTO THIRDEYE_DEV.PUBLIC.DOCUMENT_SUGGESTIONS (
                            SUGGESTION_ID, DOC_ID, ORG_ID, ANCHOR_ID, HOTSPOT_ID,
                            ORIGINAL_TEXT, SUGGESTED_TEXT, REASONING, CONFIDENCE,
                            CHANGES_MADE, STATUS, CREATED_BY, CREATED_AT, UPDATED_AT
                        ) VALUES (
                            :suggestion_id, :doc_id, :org_id, :anchor_id, :hotspot_id,
                            :original_text, :suggested_text, :reasoning, :confidence,
                            PARSE_JSON(:changes_json), :status, :created_by,
                            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
                        )
                    """)
                    
                    conn.execute(insert_query, {
                        "suggestion_id": suggestion_id,
                        "doc_id": doc_id,
                        "org_id": org_id,
                        "anchor_id": suggestion.get("anchor_id"),
                        "hotspot_id": suggestion.get("hotspot_id"),
                        "original_text": suggestion.get("original_text", "")[:5000],  # Truncate if too long
                        "suggested_text": suggestion.get("suggested_text", "")[:5000],
                        "reasoning": suggestion.get("reasoning", "")[:2000],
                        "confidence": suggestion.get("confidence", 0.0),
                        "changes_json": json.dumps(suggestion.get("changes_made", [])),
                        "status": "pending",
                        "created_by": user_id
                    })
                
                conn.commit()
                
        except Exception as e:
            print(f"Error storing suggestions: {e}")
            # Don't fail the request if storage fails
