"""
Agent 4.0: Explanation Composer
"The Writer" - Response Generation
Crafts personalized explanations based on gap hypothesis using K2-Think
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.k2think_client import K2ThinkClient
from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
import json
import re
import uuid


class ExplanationComposer(BaseAgent):
    """
    Agent 4.0: Explanation Composer
    Uses K2-Think to generate personalized explanations
    """
    
    def __init__(self):
        super().__init__(
            agent_id="4.0",
            agent_name="Explanation Composer",
            agent_version="1.0.0"
        )
        try:
            self.k2think = K2ThinkClient()
        except Exception as e:
            print(f"Warning: K2-Think client initialization failed: {e}")
            self.k2think = None
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compose personalized explanation using K2-Think
        
        Input:
            {
                "winning_hypothesis": {
                    "id": str,
                    "hypothesis": str,
                    "prerequisites": List[str],
                    "impact": str
                },
                "original_content": {
                    "text": str,
                    "content_type": str
                },
                "persona_card": {
                    "learningStyle": str,
                    "expertiseLevels": Dict[str, str],
                    "knownGaps": List[str]
                },
                "reading_state": str (optional) - "confused" | "interested" | "skimming" | "revising"
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "instant_hud": Dict,
                    "deep_dive": Dict,
                    "action_cards": List[Dict]
                }
            }
        """
        try:
            self.validate_input(input_data, ["winning_hypothesis", "original_content", "persona_card"])
            
            hypothesis = input_data["winning_hypothesis"]
            content = input_data["original_content"]
            persona_card = input_data["persona_card"]
            reading_state = input_data.get("reading_state", "confused")
            
            # Generate instant HUD (short explanation)
            instant_hud = await self._generate_instant_hud(
                hypothesis, content, persona_card, reading_state
            )
            
            # Generate deep dive (detailed explanation)
            deep_dive = await self._generate_deep_dive(
                hypothesis, content, persona_card, reading_state
            )
            
            # Generate action cards
            action_cards = self._generate_action_cards(instant_hud, deep_dive, hypothesis)
            
            result_data = {
                "instant_hud": instant_hud,
                "deep_dive": deep_dive,
                "action_cards": action_cards
            }
            
            # Store explanation in database
            await self._store_explanation(
                result_data,
                input_data.get("user_id"),
                input_data.get("session_id"),
                input_data.get("winning_hypothesis", {}).get("id"),
                input_data.get("original_content", {}).get("metadata", {}).get("anchor_id"),
                input_data.get("original_content", {}).get("metadata", {}).get("doc_id")
            )
            
            return self.create_response(success=True, data=result_data)
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Explanation generation failed: {str(e)}")
    
    async def _generate_instant_hud(
        self,
        hypothesis: Dict[str, Any],
        content: Dict[str, Any],
        persona_card: Dict[str, Any],
        reading_state: str
    ) -> Dict[str, Any]:
        """Generate instant HUD overlay (2-3 sentences)"""
        
        learning_style = persona_card.get("learningStyle", "reading")
        expertise_level = self._get_relevant_expertise(persona_card, content)
        
        prompt = f"""Generate a concise 2-3 sentence explanation for an instant overlay.

Gap Hypothesis: {hypothesis.get('hypothesis', '')}
Original Content: {content.get('text', '')[:200]}
Learning Style: {learning_style}
Expertise Level: {expertise_level}
Reading State: {reading_state}

Requirements:
- Maximum 2-3 sentences
- Directly addresses the gap
- Uses {learning_style} learning style (visual = analogies, reading = clear text)
- Appropriate for {expertise_level} level
- Friendly, helpful tone

Output JSON:
{{
  "title": "Brief title",
  "body": "2-3 sentence explanation",
  "key_points": ["point1", "point2", "point3"]
}}"""
        
        if self.k2think:
            try:
                result = await self.k2think.reason(
                    query=prompt,
                    max_steps=3,
                    temperature=0.4
                )
                return self._parse_explanation_result(result, "instant")
            except Exception as e:
                print(f"K2-Think instant HUD failed: {e}")
        
        # Fallback
        return self._fallback_instant_hud(hypothesis, content, learning_style)
    
    async def _generate_deep_dive(
        self,
        hypothesis: Dict[str, Any],
        content: Dict[str, Any],
        persona_card: Dict[str, Any],
        reading_state: str
    ) -> Dict[str, Any]:
        """Generate deep dive explanation (detailed)"""
        
        learning_style = persona_card.get("learningStyle", "reading")
        expertise_level = self._get_relevant_expertise(persona_card, content)
        
        prompt = f"""Generate a detailed, personalized explanation.

Gap Hypothesis: {hypothesis.get('hypothesis', '')}
Prerequisites: {', '.join(hypothesis.get('prerequisites', []))}
Original Content: {content.get('text', '')[:500]}
Learning Style: {learning_style}
Expertise Level: {expertise_level}
Reading State: {reading_state}

Requirements:
1. Directly address the identified gap
2. Match {learning_style} learning style:
   - Visual: Use analogies, diagrams, visual metaphors
   - Reading: Clear, structured text with examples
   - Auditory: Conversational tone, step-by-step walkthrough
3. Assume {expertise_level} level knowledge
4. Include:
   - Concrete examples (code if technical)
   - Analogies/metaphors
   - Step-by-step breakdown
   - Common mistakes to avoid
   - Next steps for learning

Output JSON:
{{
  "full_explanation": "Detailed explanation text",
  "examples": [{{"type": "code|analogy|text", "content": "..."}}],
  "analogies": [{{"title": "...", "description": "..."}}],
  "step_by_step": ["step1", "step2", "step3"],
  "common_mistakes": ["mistake1", "mistake2"],
  "next_steps": ["step1", "step2"]
}}"""
        
        if self.k2think:
            try:
                result = await self.k2think.generate_explanation(
                    concept=hypothesis.get("hypothesis", ""),
                    gap_analysis=json.dumps(hypothesis),
                    user_context={
                        "learning_style": learning_style,
                        "expertise_level": expertise_level
                    }
                )
                return self._parse_explanation_result(result, "deep")
            except Exception as e:
                print(f"K2-Think deep dive failed: {e}")
        
        # Fallback
        return self._fallback_deep_dive(hypothesis, content, learning_style)
    
    def _parse_explanation_result(self, result: Dict[str, Any], explanation_type: str) -> Dict[str, Any]:
        """Parse K2-Think explanation result"""
        try:
            # Extract text from response
            text = ""
            if isinstance(result, dict):
                if "choices" in result:
                    text = result["choices"][0].get("message", {}).get("content", "")
                elif "text" in result:
                    text = result["text"]
                elif "content" in result:
                    text = result["content"]
                else:
                    text = str(result)
            
            if not text:
                return self._create_fallback_explanation(explanation_type)
            
            # Try to extract JSON
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                json_str = json_match.group(0)
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*', '', json_str)
                
                parsed = json.loads(json_str)
                
                if explanation_type == "instant":
                    return {
                        "title": parsed.get("title", "Explanation"),
                        "body": parsed.get("body", text[:200]),
                        "key_points": parsed.get("key_points", [])
                    }
                else:  # deep
                    return {
                        "full_explanation": parsed.get("full_explanation", text),
                        "examples": parsed.get("examples", []),
                        "analogies": parsed.get("analogies", []),
                        "step_by_step": parsed.get("step_by_step", []),
                        "common_mistakes": parsed.get("common_mistakes", []),
                        "next_steps": parsed.get("next_steps", [])
                    }
            
            # Fallback: use text as-is
            if explanation_type == "instant":
                return {
                    "title": "Explanation",
                    "body": text[:200],
                    "key_points": text.split('.')[:3]
                }
            else:
                return {
                    "full_explanation": text,
                    "examples": [],
                    "analogies": [],
                    "step_by_step": [],
                    "common_mistakes": [],
                    "next_steps": []
                }
                
        except Exception as e:
            print(f"Error parsing explanation: {e}")
            return self._create_fallback_explanation(explanation_type)
    
    def _create_fallback_explanation(self, explanation_type: str) -> Dict[str, Any]:
        """Create fallback explanation structure"""
        if explanation_type == "instant":
            return {
                "title": "Explanation",
                "body": "This concept requires prerequisite knowledge. Let me explain it step by step.",
                "key_points": ["Prerequisite knowledge needed", "Step-by-step explanation available"]
            }
        else:
            return {
                "full_explanation": "A detailed explanation would be generated here.",
                "examples": [],
                "analogies": [],
                "step_by_step": ["Step 1: Understand prerequisites", "Step 2: Learn concept", "Step 3: Practice"],
                "common_mistakes": [],
                "next_steps": ["Review prerequisites", "Practice with examples"]
            }
    
    def _fallback_instant_hud(
        self,
        hypothesis: Dict[str, Any],
        content: Dict[str, Any],
        learning_style: str
    ) -> Dict[str, Any]:
        """Fallback instant HUD generation"""
        hypothesis_text = hypothesis.get("hypothesis", "Missing prerequisite knowledge")
        
        return {
            "title": "Understanding Required",
            "body": f"{hypothesis_text}. This concept builds on prerequisite knowledge that may be missing.",
            "key_points": [
                hypothesis_text.split(':')[-1].strip() if ':' in hypothesis_text else hypothesis_text,
                "Prerequisite knowledge needed",
                "Detailed explanation available"
            ]
        }
    
    def _fallback_deep_dive(
        self,
        hypothesis: Dict[str, Any],
        content: Dict[str, Any],
        learning_style: str
    ) -> Dict[str, Any]:
        """Fallback deep dive generation"""
        prerequisites = hypothesis.get("prerequisites", [])
        
        return {
            "full_explanation": f"To understand this content, you need to know about: {', '.join(prerequisites)}. {hypothesis.get('hypothesis', '')}",
            "examples": [],
            "analogies": [],
            "step_by_step": [
                f"Step 1: Learn about {prerequisites[0] if prerequisites else 'prerequisites'}",
                "Step 2: Understand how it relates to the current concept",
                "Step 3: Practice applying the knowledge"
            ],
            "common_mistakes": [],
            "next_steps": [
                f"Review: {prerequisites[0] if prerequisites else 'prerequisites'}",
                "Read related documentation",
                "Try practice exercises"
            ]
        }
    
    def _generate_action_cards(
        self,
        instant_hud: Dict[str, Any],
        deep_dive: Dict[str, Any],
        hypothesis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Generate action cards for UI"""
        cards = [
            {
                "title": "Quick Explanation",
                "body": instant_hud.get("body", ""),
                "buttons": ["Explain Deeper", "Dismiss", "I Know This"]
            }
        ]
        
        if deep_dive.get("next_steps"):
            cards.append({
                "title": "Next Steps",
                "body": f"Recommended: {deep_dive['next_steps'][0] if deep_dive['next_steps'] else 'Review prerequisites'}",
                "buttons": ["Show Steps", "Skip"]
            })
        
        return cards
    
    def _get_relevant_expertise(
        self,
        persona_card: Dict[str, Any],
        content: Dict[str, Any]
    ) -> str:
        """Get relevant expertise level for content"""
        expertise_levels = persona_card.get("expertiseLevels", {})
        content_type = content.get("content_type", "general")
        
        # Try to match domain
        for domain, level in expertise_levels.items():
            if domain.lower() in content_type.lower():
                return level
        
        # Default to most common level or "intermediate"
        if expertise_levels:
            levels = list(expertise_levels.values())
            return max(set(levels), key=levels.count)
        
        return "intermediate"
    
    async def _store_explanation(
        self,
        explanation_data: Dict[str, Any],
        user_id: Optional[str],
        session_id: Optional[str],
        hypothesis_id: Optional[str],
        anchor_id: Optional[str],
        doc_id: Optional[str]
    ):
        """Store explanation in database"""
        if not user_id:
            return
        
        try:
            await ensure_warehouse_resumed()
            explanation_id = str(uuid.uuid4())
            
            with engine.connect() as conn:
                insert_query = text("""
                    INSERT INTO THIRDEYE_DEV.PUBLIC.EXPLANATIONS (
                        EXPLANATION_ID, USER_ID, SESSION_ID, ANCHOR_ID, DOC_ID,
                        HYPOTHESIS_ID, EXPLANATION_DATA, CREATED_AT
                    ) VALUES (
                        :explanation_id, :user_id, :session_id, :anchor_id, :doc_id,
                        :hypothesis_id, PARSE_JSON(:explanation_json), CURRENT_TIMESTAMP()
                    )
                """)
                
                conn.execute(insert_query, {
                    "explanation_id": explanation_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "anchor_id": anchor_id,
                    "doc_id": doc_id,
                    "hypothesis_id": hypothesis_id,
                    "explanation_json": json.dumps(explanation_data)
                })
                conn.commit()
                
        except Exception as e:
            print(f"Error storing explanation: {e}")
            # Don't fail the request if storage fails
