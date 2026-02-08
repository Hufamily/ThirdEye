"""
Agent 3.0: Gap Hypothesis
"The Predictor" - Knowledge Gap Analysis
Hypothesizes why the user is stuck using deep reasoning with K2-Think
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.k2think_client import K2ThinkClient
from utils.database import engine, ensure_warehouse_resumed, qualified_table as qt
from sqlalchemy import text
import json
import re
import uuid


class GapHypothesis(BaseAgent):
    """
    Agent 3.0: Gap Hypothesis
    Uses K2-Think to deeply reason about why user might be confused
    """
    
    def __init__(self):
        super().__init__(
            agent_id="3.0",
            agent_name="Gap Hypothesis",
            agent_version="1.0.0"
        )
        try:
            self.k2think = K2ThinkClient()
        except Exception as e:
            print(f"Warning: K2-Think client initialization failed: {e}")
            self.k2think = None
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Hypothesize knowledge gaps using K2-Think reasoning
        
        Input:
            {
                "classification_result": {
                    "text": str,
                    "content_type": str,
                    "complexity": str,
                    "concepts": List[str],
                    "relates_to_gap": bool,
                    "gap_label": str (optional)
                },
                "persona_card": {
                    "expertiseLevels": Dict[str, str],
                    "knownGaps": List[str],
                    "learningStyle": str
                },
                "session_history": List[Dict] (optional),
                "related_content": str (optional)
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "candidates": List[Dict],
                    "reasoning_steps": List[str],
                    "winning_hypothesis": str,
                    "overall_confidence": float
                }
            }
        """
        try:
            self.validate_input(input_data, ["classification_result", "persona_card"])
            
            classification = input_data["classification_result"]
            persona_card = input_data["persona_card"]
            session_history = input_data.get("session_history", [])
            related_content = input_data.get("related_content", "")
            
            # Build reasoning prompt
            prompt = self._build_reasoning_prompt(
                classification, persona_card, session_history, related_content
            )
            
            # Use K2-Think for deep reasoning
            if self.k2think:
                try:
                    # Use analyze_gap method for gap analysis
                    user_context = {
                        "persona": persona_card,
                        "learning_style": persona_card.get("learningStyle", "unknown"),
                        "expertise_level": classification.get("complexity", "unknown")
                    }
                    
                    reasoning_result = await self.k2think.analyze_gap(
                        user_content=classification.get("text", ""),
                        user_question=f"Understanding {classification.get('content_type', 'content')}",
                        user_context=user_context
                    )
                    
                    # Parse K2-Think response
                    hypotheses = self._parse_reasoning_result(reasoning_result)
                except Exception as e:
                    print(f"K2-Think reasoning failed: {e}, using fallback")
                    hypotheses = self._fallback_hypothesis(classification, persona_card)
            else:
                # Fallback to simpler heuristics
                hypotheses = self._fallback_hypothesis(classification, persona_card)
            
            # Determine winning hypothesis
            winning_hypothesis = self._select_winning_hypothesis(hypotheses)
            
            # Extract reasoning steps
            reasoning_steps = self._extract_reasoning_steps(hypotheses)
            
            # Calculate overall confidence
            overall_confidence = self._calculate_overall_confidence(hypotheses)
            
            result_data = {
                "candidates": hypotheses,
                "reasoning_steps": reasoning_steps,
                "winning_hypothesis": winning_hypothesis.get("id") if winning_hypothesis else None,
                "overall_confidence": overall_confidence
            }
            
            # Store hypotheses in database
            await self._store_hypotheses(
                result_data,
                input_data.get("user_id"),
                input_data.get("session_id"),
                input_data.get("classification_result", {}).get("metadata", {}).get("anchor_id"),
                input_data.get("classification_result", {}).get("metadata", {}).get("doc_id")
            )
            
            return self.create_response(success=True, data=result_data)
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Gap hypothesis failed: {str(e)}")
    
    def _build_reasoning_prompt(
        self,
        classification: Dict[str, Any],
        persona_card: Dict[str, Any],
        session_history: List[Dict],
        related_content: str
    ) -> str:
        """Build reasoning prompt for K2-Think"""
        
        content = classification.get("text", "")
        content_type = classification.get("content_type", "unknown")
        concepts = classification.get("concepts", [])
        complexity = classification.get("complexity", "unknown")
        
        expertise_levels = persona_card.get("expertiseLevels", {})
        known_gaps = persona_card.get("knownGaps", [])
        learning_style = persona_card.get("learningStyle", "unknown")
        
        # Format session history
        session_summary = ""
        if session_history:
            recent_sessions = session_history[-5:]  # Last 5 sessions
            session_summary = "\n".join([
                f"- {s.get('gap_label', 'unknown')}: {s.get('text', '')[:100]}"
                for s in recent_sessions
            ])
        
        prompt = f"""You are analyzing why a user might be confused about this content.

**Content:**
{content[:500]}

**Content Type:** {content_type}
**Complexity:** {complexity}
**Concepts:** {', '.join(concepts[:10])}

**User Profile:**
- Expertise Levels: {json.dumps(expertise_levels, indent=2)}
- Known Gaps: {', '.join(known_gaps[:10]) if known_gaps else 'None identified'}
- Learning Style: {learning_style}

**Previous Confusion Patterns:**
{session_summary if session_summary else 'No previous patterns'}

**Related Content:**
{related_content[:300] if related_content else 'None'}

**Your Task:**
Analyze why the user might be stuck. Follow these steps:

Step 1: Identify prerequisite knowledge needed to understand this content
Step 2: Compare prerequisites with user's known expertise levels
Step 3: Identify specific gaps that would cause confusion
Step 4: Rank gaps by likelihood and impact
Step 5: Generate 2-4 hypotheses with confidence scores

**Output Format (JSON):**
{{
  "candidates": [
    {{
      "id": "gap_1",
      "hypothesis": "Missing prerequisite: [specific knowledge]",
      "confidence": 0.0-1.0,
      "reasoning": "Explanation of why this gap causes confusion",
      "prerequisites": ["prereq1", "prereq2"],
      "impact": "high|medium|low",
      "evidence": ["evidence1", "evidence2"]
    }}
  ],
  "reasoning_steps": ["step1", "step2", "step3"]
}}

Show your reasoning step-by-step, then provide the JSON output."""
        
        return prompt
    
    def _parse_reasoning_result(self, reasoning_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse K2-Think reasoning result into hypotheses"""
        try:
            # Extract text from response
            text = ""
            if isinstance(reasoning_result, dict):
                # Try different response formats
                if "choices" in reasoning_result:
                    # OpenAI-style format
                    text = reasoning_result["choices"][0].get("message", {}).get("content", "")
                elif "text" in reasoning_result:
                    text = reasoning_result["text"]
                elif "content" in reasoning_result:
                    text = reasoning_result["content"]
                else:
                    # Try to find any text field
                    text = str(reasoning_result)
            
            if not text:
                return []
            
            # Try to extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                json_str = json_match.group(0)
                # Remove markdown code blocks if present
                json_str = re.sub(r'```json\s*', '', json_str)
                json_str = re.sub(r'```\s*', '', json_str)
                
                parsed = json.loads(json_str)
                candidates = parsed.get("candidates", [])
                
                # Ensure each candidate has required fields
                for i, candidate in enumerate(candidates):
                    if "id" not in candidate:
                        candidate["id"] = f"gap_{i+1}"
                    if "confidence" not in candidate:
                        candidate["confidence"] = 0.7
                    if "impact" not in candidate:
                        candidate["impact"] = "medium"
                
                return candidates
            
            # Fallback: extract hypotheses from text
            return self._extract_hypotheses_from_text(text)
            
        except Exception as e:
            print(f"Error parsing reasoning result: {e}")
            return []
    
    def _extract_hypotheses_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Extract hypotheses from unstructured text"""
        hypotheses = []
        
        # Look for hypothesis patterns
        pattern = r'(?:hypothesis|gap|prerequisite)[\s:]+(.+?)(?:\n|$)'
        matches = re.findall(pattern, text, re.IGNORECASE)
        
        for i, match in enumerate(matches[:4]):  # Max 4 hypotheses
            hypotheses.append({
                "id": f"gap_{i+1}",
                "hypothesis": match.strip(),
                "confidence": 0.7 - (i * 0.1),  # Decreasing confidence
                "reasoning": match.strip(),
                "prerequisites": [],
                "impact": "medium",
                "evidence": []
            })
        
        return hypotheses
    
    def _fallback_hypothesis(
        self,
        classification: Dict[str, Any],
        persona_card: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Fallback hypothesis generation using heuristics - ALWAYS generate at least one hypothesis"""
        hypotheses = []
        
        concepts = classification.get("concepts", [])
        known_gaps = persona_card.get("knownGaps", [])
        complexity = classification.get("complexity", "unknown")
        content_type = classification.get("content_type", "general")
        text = classification.get("text", "")[:500]  # Use text for better hypothesis
        
        # ALWAYS generate at least one hypothesis based on content
        if not hypotheses:
            # Generate a general hypothesis based on content type and concepts
            if concepts and len(concepts) > 0:
                main_concept = concepts[0] if concepts else "this topic"
                hypothesis_text = f"The user may need foundational understanding of {main_concept} to fully grasp this {content_type} content."
            else:
                hypothesis_text = f"The user may need additional context or background knowledge to understand this {content_type} content."
            
            hypotheses.append({
                "id": "gap_1",
                "hypothesis": hypothesis_text,
                "confidence": 0.6,
                "reasoning": f"Based on content type '{content_type}' and complexity '{complexity}'",
                "prerequisites": concepts[:3] if concepts else [],
                "impact": "medium",
                "evidence": [f"Content type: {content_type}", f"Complexity: {complexity}"]
            })
        
        # Check if concepts relate to known gaps
        for gap in known_gaps[:3]:  # Top 3 gaps
            if any(gap.lower() in concept.lower() or concept.lower() in gap.lower() 
                   for concept in concepts):
                hypotheses.append({
                    "id": f"gap_{len(hypotheses)+1}",
                    "hypothesis": f"Missing prerequisite: Understanding of {gap}",
                    "confidence": 0.8,
                    "reasoning": f"User has previously struggled with {gap}, and this content relates to it.",
                    "prerequisites": [gap],
                    "impact": "high",
                    "evidence": [f"Known gap: {gap}", f"Content complexity: {complexity}"]
                })
        
        # If no gap matches, create general hypothesis
        if not hypotheses:
            domain = self._infer_domain_from_concepts(concepts)
            hypotheses.append({
                "id": "gap_1",
                "hypothesis": f"Missing prerequisite knowledge in {domain or 'this domain'}",
                "confidence": 0.6,
                "reasoning": f"Content complexity ({complexity}) suggests prerequisite knowledge may be missing.",
                "prerequisites": concepts[:3] if concepts else [],
                "impact": "medium",
                "evidence": [f"Complexity: {complexity}", f"Concepts: {', '.join(concepts[:3])}"]
            })
        
        return hypotheses
    
    def _infer_domain_from_concepts(self, concepts: List[str]) -> Optional[str]:
        """Infer domain from concepts"""
        if not concepts:
            return None
        
        # Simple domain inference
        tech_keywords = {
            "react": ["react", "jsx", "component", "hook"],
            "javascript": ["javascript", "js", "function", "closure"],
            "python": ["python", "def", "import", "class"],
            "math": ["equation", "formula", "calculate", "solve"]
        }
        
        concept_text = " ".join(concepts).lower()
        for domain, keywords in tech_keywords.items():
            if any(keyword in concept_text for keyword in keywords):
                return domain
        
        return None
    
    def _select_winning_hypothesis(self, hypotheses: List[Dict[str, Any]]) -> Optional[str]:
        """Select the winning hypothesis (highest confidence)"""
        if not hypotheses:
            return None
        
        # Sort by confidence and impact
        def score(h):
            conf = h.get("confidence", 0.0)
            impact_mult = {"high": 1.0, "medium": 0.7, "low": 0.5}.get(h.get("impact", "medium"), 0.7)
            return conf * impact_mult
        
        sorted_hypotheses = sorted(hypotheses, key=score, reverse=True)
        return sorted_hypotheses[0].get("id")
    
    def _extract_reasoning_steps(self, hypotheses: List[Dict[str, Any]]) -> List[str]:
        """Extract reasoning steps from hypotheses"""
        steps = []
        
        if not hypotheses:
            return ["No hypotheses generated"]
        
        steps.append(f"Analyzed {len(hypotheses)} potential knowledge gaps")
        
        for h in hypotheses:
            hypothesis = h.get("hypothesis", "")
            confidence = h.get("confidence", 0.0)
            steps.append(f"Hypothesis: {hypothesis} (confidence: {confidence:.2f})")
        
        return steps
    
    def _calculate_overall_confidence(self, hypotheses: List[Dict[str, Any]]) -> float:
        """Calculate overall confidence from hypotheses"""
        if not hypotheses:
            return 0.0
        
        # Average confidence of top 2 hypotheses
        confidences = sorted([h.get("confidence", 0.0) for h in hypotheses], reverse=True)
        top_2 = confidences[:2]
        
        return sum(top_2) / len(top_2) if top_2 else 0.0
    
    async def _store_hypotheses(
        self,
        hypotheses_data: Dict[str, Any],
        user_id: Optional[str],
        session_id: Optional[str],
        anchor_id: Optional[str],
        doc_id: Optional[str]
    ):
        """Store gap hypotheses in database"""
        if not user_id:
            return
        
        try:
            await ensure_warehouse_resumed()
            hypothesis_id = str(uuid.uuid4())
            
            with engine.connect() as conn:
                insert_query = text(f"""
                    INSERT INTO {qt("GAP_HYPOTHESES")} (
                        HYPOTHESIS_ID, USER_ID, SESSION_ID, ANCHOR_ID, DOC_ID,
                        HYPOTHESES, CREATED_AT
                    ) VALUES (
                        :hypothesis_id, :user_id, :session_id, :anchor_id, :doc_id,
                        PARSE_JSON(:hypotheses_json), CURRENT_TIMESTAMP()
                    )
                """)
                
                conn.execute(insert_query, {
                    "hypothesis_id": hypothesis_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "anchor_id": anchor_id,
                    "doc_id": doc_id,
                    "hypotheses_json": json.dumps(hypotheses_data)
                })
                conn.commit()
                
        except Exception as e:
            print(f"Error storing hypotheses: {e}")
            # Don't fail the request if storage fails
