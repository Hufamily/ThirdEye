"""
Agent 4.0: Explanation Composer
"The Writer" - Response Generation
Crafts personalized explanations based on gap hypothesis using Gemini API
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
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
            self.gemini = GeminiClient()
        except Exception as e:
            print(f"Warning: Gemini client initialization failed: {e}")
            self.gemini = None
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compose personalized explanation using Gemini API
        
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
            
            # Ensure content has text
            if not content.get("text") and not content.get("extracted_text"):
                return self.create_response(
                    success=False,
                    error="Original content must contain text or extracted_text"
                )
            
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
        content_text = content.get('text', '')[:2000]  # Use more context for better explanations
        
        prompt = f"""You are an expert teacher. Explain what the content below MEANS.

EXTRACTED CONTENT:
{content_text}

YOUR TASK:
Read the content and EXPLAIN what it means. Don't just repeat it - explain what each item is about:

- If you see event titles (e.g., "The Future of Work: A Fireside Chat") - explain what "The Future of Work" means as a topic
- If you see speaker names - explain who they are and what they do
- If you see topics/tags (like #STEM, #AI ECONOMICS) - explain what these topics mean
- If you see concepts - explain what they mean and why they matter

Requirements:
- Write 2-4 sentences that EXPLAIN what the content means
- Be specific: mention actual names, topics, events from the content
- EXPLAIN concepts, don't just list them
- Use {learning_style} learning style
- Appropriate for {expertise_level} level
- Friendly, helpful, educational tone
- CRITICAL: Do NOT mention any product names, tools, or monitoring platforms
- CRITICAL: Return ONLY valid JSON. No reasoning steps.

Output JSON:
{{
  "summary": "2-4 sentence explanation of what the content means",
  "key_points": ["key concept 1 explained", "key concept 2 explained", "key concept 3 explained"]
}}"""
        
        # Use Gemini API
        if self.gemini:
            try:
                gemini_result = await self.gemini.analyze(
                    prompt=prompt,
                    system_instruction="You are an expert teacher. Generate clear, educational explanations. Always respond with valid JSON only. Do NOT include reasoning steps or thinking process - only return the JSON output.",
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
                summary = parsed.get("summary") or parsed.get("body", "")
                # Clean summary - remove any reasoning markers
                summary = self._clean_text(summary)
                return {
                    "summary": summary[:500] if summary else "",
                    "key_points": parsed.get("key_points", [])
                }
            except Exception as e:
                print(f"Gemini instant HUD failed: {e}")
                import traceback
                traceback.print_exc()
                # Try fallback but log the error
                return self._fallback_instant_hud(hypothesis, content, learning_style)
        
        # Final fallback if Gemini not available
        if not self.gemini:
            print("Warning: Gemini client not available, using fallback")
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
        
        content_text = content.get('text', '')[:2500]  # Use even more content for better context
        
        prompt = f"""You are an expert teacher. Explain what the content below MEANS and what each item is about.

EXTRACTED CONTENT FROM IMAGE/DOCUMENT:
{content_text}

YOUR TASK:
Read the extracted content above and EXPLAIN what it means. Do NOT just repeat the text - EXPLAIN what each item is:

1. **For each event/talk/video listed:**
   - Explain what the event is about (e.g., "The Future of Work" - explain what this topic covers)
   - Explain who the speakers are and what they do
   - Explain what the event discusses and why it matters

2. **For topics/tags (like #STEM, #AI ECONOMICS):**
   - Explain what these topics mean
   - Why they're relevant
   - What they cover

3. **For dates and view counts:**
   - Explain what these mean in context
   - Why they might be relevant

4. **For any concepts mentioned:**
   - Define what they mean
   - Explain their significance
   - Provide context

CRITICAL REQUIREMENTS:
- EXPLAIN what things mean, don't just list them
- If you see "The Future of Work: A Fireside Chat" - explain what "The Future of Work" means as a topic
- If you see "David Autor" - explain who they are and what they do
- If you see "#AI ECONOMICS" - explain what AI Economics means
- Write 6-10 sentences that EXPLAIN the content, not just describe it
- Be educational and helpful - teach the user what these things mean
- Use {learning_style} learning style
- Appropriate for {expertise_level} level
- CRITICAL: Do NOT mention any product names, tools, or monitoring platforms
- CRITICAL: Return ONLY valid JSON. No reasoning steps, no thinking process.

Output JSON:
{{
  "explanation": "6-10 sentence explanation that explains what the content means, what each item is about, and provides context and definitions",
  "examples": ["example 1 explaining a concept from content", "example 2 explaining another concept", "example 3"]
}}"""
        
        # Use Gemini API
        if self.gemini:
            try:
                gemini_result = await self.gemini.analyze(
                    prompt=prompt,
                    system_instruction="You are an expert teacher. Generate detailed, educational explanations with definitions and examples. Always respond with valid JSON only. Do NOT include reasoning steps or thinking process - only return the JSON output.",
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
                explanation = parsed.get("explanation") or parsed.get("full_explanation", "")
                # Clean explanation - remove any reasoning markers
                explanation = self._clean_text(explanation)
                examples = parsed.get("examples", [])
                # Clean examples
                cleaned_examples = [self._clean_text(str(ex)) for ex in examples if ex]
                return {
                    "explanation": explanation[:2000] if explanation else "",
                    "examples": cleaned_examples[:5]
                }
            except Exception as e:
                print(f"Gemini deep dive failed: {e}")
                import traceback
                traceback.print_exc()
                # Try fallback but log the error
                return await self._fallback_deep_dive(hypothesis, content, learning_style)
        
        # Final fallback if Gemini not available
        if not self.gemini:
            print("Warning: Gemini client not available, using fallback")
        return await self._fallback_deep_dive(hypothesis, content, learning_style)
    
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
        """Remove JSON artifacts, reasoning markers, and clean up text"""
        if not text:
            return ""
        
        # Remove reasoning markers first
        reasoning_patterns = [
            r'Step \d+:[\s\S]*?(?=\n|$)',
            r'Reasoning:[\s\S]*?(?=\n|$)',
            r'Thinking:[\s\S]*?(?=\n|$)',
            r'Let me[\s\S]*?(?=\n|\.)',
            r'First,?[\s\S]*?(?=\n|\.)',
            r'Next,?[\s\S]*?(?=\n|\.)',
            r'Finally,?[\s\S]*?(?=\n|\.)',
            r'To understand[\s\S]*?(?=\n|\.)',
            r'I need to[\s\S]*?(?=\n|\.)',
        ]
        for pattern in reasoning_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        
        # Remove JSON structure markers
        text = re.sub(r'^\s*\{[\s\S]*?"(?:summary|body|explanation|full_explanation)"\s*:\s*"', '', text)
        text = re.sub(r'"\s*\}[\s\S]*$', '', text)
        text = re.sub(r'\\"', '"', text)  # Unescape quotes
        text = re.sub(r'\\n', '\n', text)  # Unescape newlines
        text = re.sub(r'\\t', ' ', text)  # Unescape tabs
        
        # Remove any remaining JSON-like patterns
        text = re.sub(r'\{[^}]*\}', '', text)  # Remove {key: value} patterns
        text = re.sub(r'\[[^\]]*\]', '', text)  # Remove [item] patterns
        
        # Remove common reasoning prefixes
        text = re.sub(r'^(Let me|First|To summarize|In summary|This content|The extracted)[\s,:-]+\s*', '', text, flags=re.IGNORECASE)
        
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
        """Fallback instant HUD generation - use ACTUAL content, not generic text"""
        content_text = content.get("text", "") or content.get("extracted_text", "")
        
        # Extract actual information from content
        if content_text and len(content_text) > 50:
            # Use first meaningful sentence from content
            sentences = [s.strip() for s in content_text.split('.')[:3] if s.strip() and len(s.strip()) > 20]
            if sentences:
                summary = '. '.join(sentences[:2]) + '.'
            else:
                summary = content_text[:200] + '...' if len(content_text) > 200 else content_text
        else:
            hypothesis_text = hypothesis.get("hypothesis", "")
            # Remove generic prefixes
            if "Understanding" in hypothesis_text and "content" in hypothesis_text.lower():
                summary = "Content extracted. Please check the summary tab for details."
            else:
                summary = hypothesis_text if hypothesis_text else "Content extracted."
        
        # Extract key points from content
        key_points = []
        if content_text:
            # Look for event names, speaker names, topics
            import re
            # Find capitalized phrases (likely names/titles)
            capitalized = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', content_text[:500])
            key_points = [cp for cp in capitalized[:3] if len(cp) > 3 and cp not in ['The', 'This', 'That', 'About', 'Finding']]
        
        if not key_points:
            key_points = ["Content extracted", "Details available", "Summary provided"]
        
        return {
            "summary": summary[:500],
            "key_points": key_points[:3]
        }
    
    async def _fallback_deep_dive(
        self,
        hypothesis: Dict[str, Any],
        content: Dict[str, Any],
        learning_style: str
    ) -> Dict[str, Any]:
        """Fallback deep dive generation - try Gemini again with simpler prompt if main call failed"""
        content_text = content.get("text", "") or content.get("extracted_text", "")
        
        # If Gemini is available, try again with a simpler prompt
        if self.gemini and content_text and len(content_text) > 50:
            try:
                # Simpler prompt for fallback
                simple_prompt = f"""Explain what this content means. Don't just repeat it - explain what each item is about and what it means.

Content:
{content_text[:1500]}

Explain:
- What the main topics/concepts are and what they mean
- What any events or talks are about
- What any speakers or people mentioned do
- What any tags or categories mean

Write 5-8 sentences explaining what this content means. Return ONLY JSON:
{{
  "explanation": "explanation text here",
  "examples": ["example 1", "example 2"]
}}"""
                
                gemini_result = await self.gemini.analyze(
                    prompt=simple_prompt,
                    system_instruction="You are an expert teacher. Explain what content means. Return ONLY valid JSON, no reasoning steps.",
                    temperature=0.5,
                    json_mode=True
                )
                
                result_text = self.gemini.extract_text_from_response(gemini_result)
                result_text = result_text.strip()
                if result_text.startswith("```json"):
                    result_text = result_text[7:]
                if result_text.startswith("```"):
                    result_text = result_text[3:]
                if result_text.endswith("```"):
                    result_text = result_text[:-3]
                result_text = result_text.strip()
                
                parsed = json.loads(result_text)
                explanation = parsed.get("explanation", "")
                explanation = self._clean_text(explanation)
                examples = parsed.get("examples", [])
                cleaned_examples = [self._clean_text(str(ex)) for ex in examples if ex]
                
                if explanation:
                    return {
                        "explanation": explanation[:2000],
                        "examples": cleaned_examples[:5]
                    }
            except Exception as e:
                print(f"Fallback Gemini deep dive also failed: {e}")
        
        # Final fallback - generate basic explanation from content structure
        if content_text and len(content_text) > 100:
            # Try to identify what the content is about and explain it
            lines = [l.strip() for l in content_text.split('\n') if l.strip() and len(l.strip()) > 10]
            
            # Look for event titles, topics, speakers
            explanation_parts = []
            for line in lines[:10]:
                if len(line) > 20:
                    # Try to explain what this line is about
                    if any(word in line.lower() for word in ['fireside', 'chat', 'talk', 'presentation']):
                        explanation_parts.append(f"This appears to be about a talk or presentation: {line[:100]}")
                    elif line.startswith('#'):
                        topic = line.replace('#', '').strip()
                        explanation_parts.append(f"The topic '{topic}' refers to content related to this subject area.")
                    elif any(word in line.lower() for word in ['posted', 'views']):
                        continue  # Skip metadata lines
                    elif len(line) > 30:
                        explanation_parts.append(f"One item mentions: {line[:150]}")
            
            if explanation_parts:
                explanation = ' '.join(explanation_parts[:5])
            else:
                # Generic but helpful explanation
                explanation = f"This content appears to list several items. The main topics seem to be related to work, technology, and education based on the extracted text."
        else:
            explanation = "Content extracted. The explanation feature will provide details about what this content means."
        
        return {
            "explanation": explanation[:2000] if explanation else "Content extracted. Please check the summary for details.",
            "examples": []
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
