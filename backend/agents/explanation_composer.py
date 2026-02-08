"""
Agent 4.0: Explanation Composer
"The Writer" - Response Generation
Crafts personalized explanations based on gap hypothesis using K2-Think
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.k2think_client import K2ThinkClient
from services.gemini_client import GeminiClient
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
        
        # Fallback to Gemini if K2-Think unavailable
        try:
            self.gemini = GeminiClient()
        except Exception as e:
            print(f"Warning: Gemini client initialization failed: {e}")
            self.gemini = None
    
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
        content_text = content.get('text', '')[:1000]  # Use more context
        
        prompt = f"""You are an expert teacher explaining concepts clearly. Generate a concise explanation that helps the user understand the content.

Content to Explain:
{content_text}

Gap Hypothesis: {hypothesis.get('hypothesis', 'Understanding this content')}
Learning Style: {learning_style}
Expertise Level: {expertise_level}

Requirements:
- Write a clear, educational explanation (2-4 sentences)
- Define key terms and concepts
- Explain the main ideas in simple terms
- Use {learning_style} learning style (visual = analogies/metaphors, reading = clear structured text)
- Appropriate for {expertise_level} level
- Friendly, helpful, educational tone
- CRITICAL: Do NOT mention any product names, tools, monitoring platforms, or software. Only explain the actual concepts and content.

Output JSON:
{{
  "summary": "2-4 sentence clear explanation with definitions",
  "key_points": ["key concept 1", "key concept 2", "key concept 3"]
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
                print(f"K2-Think instant HUD failed: {e}, trying Gemini fallback")
        
        # Try Gemini fallback
        if self.gemini:
            try:
                gemini_result = await self.gemini.analyze(
                    prompt=prompt,
                    system_instruction="You are an expert teacher. Generate clear, educational explanations. Always respond with valid JSON only.",
                    temperature=0.5,
                    json_mode=True
                )
                content = self.gemini.extract_text_from_response(gemini_result)
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                parsed = json.loads(content)
                return {
                    "summary": parsed.get("summary") or parsed.get("body", ""),
                    "key_points": parsed.get("key_points", [])
                }
            except Exception as e:
                print(f"Gemini instant HUD fallback failed: {e}")
        
        # Final fallback
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
        
        content_text = content.get('text', '')[:1500]  # Use more content
        
        prompt = f"""You are an expert teacher. Write a comprehensive, educational explanation that helps the user understand this content deeply.

Content to Explain:
{content_text}

Gap Hypothesis: {hypothesis.get('hypothesis', 'Understanding this content')}
Prerequisites: {', '.join(hypothesis.get('prerequisites', [])) if hypothesis.get('prerequisites') else 'None specified'}
Learning Style: {learning_style}
Expertise Level: {expertise_level}

Requirements:
1. Write a clear, detailed explanation (4-8 sentences) that explains the main concepts
2. Define key terms and concepts clearly
3. Explain WHY things work the way they do, not just WHAT they are
4. Match {learning_style} learning style:
   - Visual: Use analogies, metaphors, visual descriptions
   - Reading: Clear, structured text with examples
   - Auditory: Conversational, step-by-step walkthrough
5. Appropriate for {expertise_level} level - explain concepts they might not know
6. Include concrete examples to illustrate points
7. Educational, helpful, friendly tone
8. CRITICAL: Do NOT mention any product names, tools, monitoring platforms, analytics tools, or software. Only explain the actual subject matter, concepts, and ideas from the content.

Output JSON:
{{
  "explanation": "Detailed 4-8 sentence explanation with definitions and context",
  "examples": ["example 1", "example 2", "example 3"]
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
                print(f"K2-Think deep dive failed: {e}, trying Gemini fallback")
        
        # Try Gemini fallback
        if self.gemini:
            try:
                gemini_result = await self.gemini.analyze(
                    prompt=prompt,
                    system_instruction="You are an expert teacher. Generate detailed, educational explanations with definitions and examples. Always respond with valid JSON only.",
                    temperature=0.5,
                    json_mode=True
                )
                content_text = self.gemini.extract_text_from_response(gemini_result)
                content_text = content_text.strip()
                if content_text.startswith("```json"):
                    content_text = content_text[7:]
                if content_text.startswith("```"):
                    content_text = content_text[3:]
                if content_text.endswith("```"):
                    content_text = content_text[:-3]
                content_text = content_text.strip()
                parsed = json.loads(content_text)
                return {
                    "explanation": parsed.get("explanation") or parsed.get("full_explanation", content_text),
                    "examples": parsed.get("examples", [])
                }
            except Exception as e:
                print(f"Gemini deep dive fallback failed: {e}")
        
        # Final fallback
        return self._fallback_deep_dive(hypothesis, content, learning_style)
    
    def _parse_explanation_result(self, result: Dict[str, Any], explanation_type: str) -> Dict[str, Any]:
        """Parse K2-Think explanation result - extract clean text, remove JSON formatting"""
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
            elif isinstance(result, str):
                text = result
            
            if not text:
                return self._create_fallback_explanation(explanation_type)
            
            # Clean up text - remove markdown code blocks
            text = text.strip()
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            text = re.sub(r'```', '', text)
            
            # Try to extract JSON and parse it
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    json_str = json_match.group(0)
                    parsed = json.loads(json_str)
                    
                    if explanation_type == "instant":
                        summary = parsed.get("summary") or parsed.get("body", "")
                        # Clean summary - remove any remaining JSON artifacts
                        summary = self._clean_text(summary)
                        return {
                            "summary": summary[:500] if summary else text[:300],
                            "key_points": parsed.get("key_points", [])
                        }
                    else:  # deep
                        explanation = parsed.get("explanation") or parsed.get("full_explanation", "")
                        # Clean explanation - remove any remaining JSON artifacts
                        explanation = self._clean_text(explanation)
                        examples = parsed.get("examples", [])
                        # Clean examples
                        cleaned_examples = [self._clean_text(str(ex)) for ex in examples if ex]
                        return {
                            "explanation": explanation[:2000] if explanation else text[:1000],
                            "examples": cleaned_examples[:5]
                        }
                except json.JSONDecodeError as e:
                    print(f"JSON parse error: {e}, using text directly")
                    # If JSON parsing fails, extract text content
                    text = self._extract_text_from_json_like_string(text)
            
            # Fallback: clean and use text as-is
            cleaned_text = self._clean_text(text)
            if explanation_type == "instant":
                return {
                    "summary": cleaned_text[:500],
                    "key_points": [s.strip() for s in cleaned_text.split('.')[:3] if s.strip() and len(s.strip()) > 10]
                }
            else:
                return {
                    "explanation": cleaned_text[:2000],
                    "examples": [s.strip() for s in cleaned_text.split('.')[:5] if s.strip() and len(s.strip()) > 30]
                }
                
        except Exception as e:
            print(f"Error parsing explanation: {e}")
            import traceback
            traceback.print_exc()
            return self._create_fallback_explanation(explanation_type)
    
    def _clean_text(self, text: str) -> str:
        """Remove JSON artifacts and clean up text"""
        if not text:
            return ""
        
        # Remove JSON structure markers
        text = re.sub(r'^\s*\{[\s\S]*?"(?:summary|body|explanation|full_explanation)"\s*:\s*"', '', text)
        text = re.sub(r'"\s*\}[\s\S]*$', '', text)
        text = re.sub(r'\\"', '"', text)  # Unescape quotes
        text = re.sub(r'\\n', '\n', text)  # Unescape newlines
        text = re.sub(r'\\t', ' ', text)  # Unescape tabs
        
        # Remove any remaining JSON-like patterns
        text = re.sub(r'\{[^}]*\}', '', text)  # Remove {key: value} patterns
        text = re.sub(r'\[[^\]]*\]', '', text)  # Remove [item] patterns
        
        return text.strip()
    
    def _extract_text_from_json_like_string(self, text: str) -> str:
        """Extract readable text from JSON-like string"""
        # Try to find text content between quotes
        quoted_text = re.findall(r'"(?:summary|body|explanation|full_explanation)"\s*:\s*"([^"]+)"', text)
        if quoted_text:
            return quoted_text[0]
        
        # Try to find any quoted strings that look like explanations
        all_quoted = re.findall(r'"([^"]{20,})"', text)  # Quotes with at least 20 chars
        if all_quoted:
            # Return the longest one (likely the explanation)
            return max(all_quoted, key=len)
        
        return text
    
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
        content_text = content.get("text", "")[:500]
        hypothesis_text = hypothesis.get("hypothesis", "Understanding this content")
        
        # Generate a basic explanation from the content
        explanation = f"{hypothesis_text}. "
        if prerequisites:
            explanation += f"This concept builds on: {', '.join(prerequisites[:3])}. "
        if content_text:
            # Extract first few sentences as explanation
            sentences = [s.strip() for s in content_text.split('.')[:3] if s.strip()]
            if sentences:
                explanation += " ".join(sentences) + "."
        
        return {
            "explanation": explanation or f"To understand this content, you need to know about: {', '.join(prerequisites) if prerequisites else 'the fundamentals'}. {hypothesis_text}",
            "examples": prerequisites[:3] if prerequisites else []
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
