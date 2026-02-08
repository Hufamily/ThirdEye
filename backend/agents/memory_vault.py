"""
Agent 5.0: Memory Vault
Tutor & Learning Tracker
Logs interactions for spaced repetition and habit tracking
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from utils.database import engine, ensure_warehouse_resumed, qualified_table as qt
from sqlalchemy import text
from datetime import datetime, timedelta
import json


class MemoryVault(BaseAgent):
    """
    Agent 5.0: Memory Vault
    Tracks learning interactions and manages spaced repetition
    """
    
    def __init__(self):
        super().__init__(
            agent_id="5.0",
            agent_name="Memory Vault",
            agent_version="1.0.0"
        )
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Log interaction and update learning metrics
        
        Input:
            {
                "user_id": str,
                "session_id": str (optional),
                "interaction": {
                    "doc_id": str (optional),
                    "anchor_id": str (optional),
                    "content": str,
                    "gap_hypothesis": Dict (optional),
                    "explanation_given": Dict (optional),
                    "user_feedback": str (optional) - "helpful" | "not_helpful" | "already_knew",
                    "reading_state": str (optional),
                    "dwell_time": int (optional),
                    "concepts": List[str]
                },
                "action": str (optional) - "log" | "get_metrics" | "get_reviews" | "get_habits"
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "interaction_logged": bool,
                    "learning_metrics": Dict (optional),
                    "spaced_repetition": List[Dict] (optional),
                    "habits": Dict (optional)
                }
            }
        """
        try:
            self.validate_input(input_data, ["user_id"])
            
            user_id = input_data["user_id"]
            action = input_data.get("action", "log")
            
            if action == "log":
                return await self._log_interaction(input_data)
            elif action == "get_metrics":
                return await self._get_learning_metrics(user_id, input_data.get("session_id"))
            elif action == "get_reviews":
                return await self._get_scheduled_reviews(user_id)
            elif action == "get_habits":
                return await self._get_learning_habits(user_id)
            else:
                return self.create_response(success=False, error=f"Unknown action: {action}")
                
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Memory vault operation failed: {str(e)}")
    
    async def _log_interaction(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Log interaction to database"""
        user_id = input_data["user_id"]
        interaction = input_data.get("interaction", {})
        session_id = input_data.get("session_id")
        
        # Prepare interaction data
        interaction_data = {
            "user_id": user_id,
            "session_id": session_id,
            "doc_id": interaction.get("doc_id"),
            "anchor_id": interaction.get("anchor_id"),
            "content": interaction.get("content", "")[:1000],  # Limit length
            "gap_hypothesis": json.dumps(interaction.get("gap_hypothesis", {})) if interaction.get("gap_hypothesis") else None,
            "explanation_given": json.dumps(interaction.get("explanation_given", {})) if interaction.get("explanation_given") else None,
            "user_feedback": interaction.get("user_feedback"),
            "reading_state": interaction.get("reading_state"),
            "dwell_time": interaction.get("dwell_time"),
            "concepts": json.dumps(interaction.get("concepts", [])),
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            # Store in INTERACTIONS table
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                # Insert interaction
                insert_query = text(f"""
                    INSERT INTO {qt("INTERACTIONS")} (
                        USER_ID, SESSION_ID, DOC_ID, ANCHOR_ID, CONTENT,
                        GAP_HYPOTHESIS, EXPLANATION_GIVEN, USER_FEEDBACK,
                        READING_STATE, DWELL_TIME, CONCEPTS, CREATED_AT
                    ) VALUES (
                        :user_id, :session_id, :doc_id, :anchor_id, :content,
                        :gap_hypothesis, :explanation_given, :user_feedback,
                        :reading_state, :dwell_time, :concepts, CURRENT_TIMESTAMP()
                    )
                """)
                
                conn.execute(insert_query, {
                    "user_id": interaction_data["user_id"],
                    "session_id": interaction_data["session_id"],
                    "doc_id": interaction_data["doc_id"],
                    "anchor_id": interaction_data["anchor_id"],
                    "content": interaction_data["content"],
                    "gap_hypothesis": interaction_data["gap_hypothesis"],
                    "explanation_given": interaction_data["explanation_given"],
                    "user_feedback": interaction_data["user_feedback"],
                    "reading_state": interaction_data["reading_state"],
                    "dwell_time": interaction_data["dwell_time"],
                    "concepts": interaction_data["concepts"]
                })
                conn.commit()
            
            # Update learning metrics
            concepts = interaction.get("concepts", [])
            if concepts:
                await self._update_mastery_progress(user_id, concepts, interaction.get("user_feedback"))
            
            # Schedule spaced repetition
            if concepts:
                await self._schedule_repetition(user_id, concepts, interaction)
            
            return self.create_response(success=True, data={
                "interaction_logged": True,
                "timestamp": interaction_data["timestamp"]
            })
            
        except Exception as e:
            print(f"Error logging interaction: {e}")
            return self.create_response(success=False, error=str(e))
    
    async def _update_mastery_progress(
        self,
        user_id: str,
        concepts: List[str],
        feedback: Optional[str]
    ):
        """Update mastery progress for concepts"""
        # Calculate mastery adjustment based on feedback
        mastery_delta = 0.0
        if feedback == "helpful":
            mastery_delta = 0.1
        elif feedback == "not_helpful":
            mastery_delta = -0.05
        elif feedback == "already_knew":
            mastery_delta = 0.15
        
        # In a full implementation, would update mastery scores in database
        # For now, this is a placeholder
        pass
    
    async def _schedule_repetition(
        self,
        user_id: str,
        concepts: List[str],
        interaction: Dict[str, Any]
    ):
        """Schedule spaced repetition review"""
        # Calculate next review time using spaced repetition algorithm
        # Simple implementation: 1 day, 3 days, 7 days, 14 days
        review_intervals = [1, 3, 7, 14]  # days
        
        # In a full implementation, would:
        # 1. Check current mastery level
        # 2. Calculate next review based on mastery
        # 3. Store review schedule in database
        # For now, this is a placeholder
        pass
    
    async def _get_learning_metrics(
        self,
        user_id: str,
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Get learning metrics for user"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                # Get interaction count
                count_query = text(f"""
                    SELECT COUNT(*) as count
                    FROM {qt("INTERACTIONS")}
                    WHERE USER_ID = :user_id
                    AND (:session_id IS NULL OR SESSION_ID = :session_id)
                """)
                
                result = conn.execute(count_query, {"user_id": user_id, "session_id": session_id})
                row = result.fetchone()
                interaction_count = row[0] if row else 0
                
                # Get concepts learned
                concepts_query = text(f"""
                    SELECT DISTINCT CONCEPTS
                    FROM {qt("INTERACTIONS")}
                    WHERE USER_ID = :user_id
                    AND CONCEPTS IS NOT NULL
                """)
                
                result = conn.execute(concepts_query, {"user_id": user_id})
                all_concepts = []
                for row in result:
                    if row[0]:
                        concepts = json.loads(row[0])
                        all_concepts.extend(concepts)
                
                unique_concepts = list(set(all_concepts))
            
            return self.create_response(success=True, data={
                "interactions_logged": interaction_count,
                "concepts_learned": unique_concepts,
                "mastery_progress": {},  # Placeholder
                "spaced_repetition_scheduled": []  # Placeholder
            })
            
        except Exception as e:
            print(f"Error getting metrics: {e}")
            return self.create_response(success=False, error=str(e))
    
    async def _get_scheduled_reviews(self, user_id: str) -> Dict[str, Any]:
        """Get scheduled spaced repetition reviews"""
        # In a full implementation, would query review schedule
        # For now, return empty list
        return self.create_response(success=True, data={
            "reviews": []
        })
    
    async def _get_learning_habits(self, user_id: str) -> Dict[str, Any]:
        """Get learning habit metrics"""
        try:
            await ensure_warehouse_resumed()
            with engine.connect() as conn:
                # Get sessions in last 30 days
                sessions_query = text(f"""
                    SELECT 
                        COUNT(DISTINCT SESSION_ID) as session_count,
                        AVG(DWELL_TIME) as avg_dwell_time,
                        COUNT(*) as total_interactions
                    FROM {qt("INTERACTIONS")}
                    WHERE USER_ID = :user_id
                    AND CREATED_AT >= DATEADD(day, -30, CURRENT_TIMESTAMP())
                """)
                
                result = conn.execute(sessions_query, {"user_id": user_id})
                row = result.fetchone()
                
                if row:
                    session_count = row[0] or 0
                    avg_dwell = row[1] or 0
                    total_interactions = row[2] or 0
                else:
                    session_count = 0
                    avg_dwell = 0
                    total_interactions = 0
            
            return self.create_response(success=True, data={
                "learning_streak": 0,  # Placeholder
                "average_session_length_minutes": int(avg_dwell / 60000) if avg_dwell else 0,
                "most_productive_time": "unknown",  # Placeholder
                "sessions_last_30_days": session_count,
                "total_interactions": total_interactions
            })
            
        except Exception as e:
            print(f"Error getting habits: {e}")
            return self.create_response(success=False, error=str(e))
