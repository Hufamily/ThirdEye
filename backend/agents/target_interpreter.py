"""
Agent 2.0: Target Interpreter
Content Classification
Classifies captured content using PersonaCard to understand context
Uses Gemini API for all LLM operations
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.gemini_client import GeminiClient
import re


class TargetInterpreter(BaseAgent):
    """
    Agent 2.0: Target Interpreter
    Classifies content and determines complexity relative to user's expertise
    """
    
    def __init__(self):
        super().__init__(
            agent_id="2.0",
            agent_name="Target Interpreter",
            agent_version="1.0.0"
        )
        self.gemini = GeminiClient()
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classify content using PersonaCard
        
        Input:
            {
                "capture_result": {
                    "text": str,
                    "aoi_type": str (optional),
                    "metadata": Dict
                },
                "persona_card": {
                    "expertiseLevels": Dict[str, str],
                    "learningStyle": str,
                    "knownGaps": List[str],
                    "activeProjects": List[Dict]
                },
                "session_history": List[Dict] (optional)
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "content_type": str,
                    "aoi_type": str,
                    "complexity": str,
                    "concepts": List[str],
                    "relates_to_gap": bool,
                    "gap_label": str (optional),
                    "user_context": Dict,
                    "classification_confidence": float
                }
            }
        """
        try:
            self.validate_input(input_data, ["capture_result", "persona_card"])
            
            capture_result = input_data["capture_result"]
            persona_card = input_data["persona_card"]
            session_history = input_data.get("session_history", [])
            
            text = capture_result.get("text", "") or capture_result.get("extracted_text", "")
            if not text or len(text.strip()) < 10:
                return self.create_response(
                    success=False, 
                    error=f"Capture result must contain text (got {len(text) if text else 0} chars)"
                )
            
            # Extract basic content type
            aoi_type = capture_result.get("aoi_type", self._detect_aoi_type(text))
            
            # Infer domain from text
            domain = self._infer_domain(text)
            
            # Get user's expertise level for this domain
            expertise_levels = persona_card.get("expertiseLevels", {})
            user_expertise = expertise_levels.get(domain, "beginner")
            
            # Classify content using Gemini
            classification = await self._classify_with_gemini(
                text, aoi_type, user_expertise, persona_card
            )
            
            # Extract concepts
            concepts = await self._extract_concepts(text)
            
            # Check if relates to known gaps
            known_gaps = persona_card.get("knownGaps", [])
            relates_to_gap, gap_label = self._check_gap_relevance(concepts, known_gaps, text)
            
            # Find relevant projects
            active_projects = persona_card.get("activeProjects", [])
            relevant_projects = self._find_relevant_projects(concepts, active_projects, text)
            
            # Assess complexity relative to user
            complexity = self._assess_complexity(text, user_expertise, known_gaps)
            
            # Build user context
            user_context = {
                "expertise_level": user_expertise,
                "learning_style": persona_card.get("learningStyle", "reading"),
                "relevant_projects": relevant_projects,
                "estimated_difficulty": self._estimate_difficulty(text, user_expertise, known_gaps)
            }
            
            # Generate a brief summary using Gemini
            summary = await self._generate_summary(text, classification.get("content_type", "general"), concepts)
            
            result = {
                "content_type": classification.get("content_type", "general"),
                "aoi_type": aoi_type,
                "complexity": complexity,
                "concepts": concepts,
                "summary": summary,  # Add summary field
                "relates_to_gap": relates_to_gap,
                "user_context": user_context,
                "classification_confidence": classification.get("confidence", 0.8)
            }
            
            if relates_to_gap and gap_label:
                result["gap_label"] = gap_label
            
            return self.create_response(success=True, data=result)
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Content classification failed: {str(e)}")
    
    def _detect_aoi_type(self, text: str) -> str:
        """Detect AOI (Area of Interest) type from text"""
        text_lower = text.lower().strip()
        
        # Check for code blocks
        if re.search(r'```|function\s+\w+|def\s+\w+|class\s+\w+', text):
            return "code"
        
        # Check for equations
        if re.search(r'[=+\-*/]\s*\d+|\\[a-zA-Z]+|∑|∫|√', text):
            return "equation"
        
        # Check for headings
        if len(text) < 100 and (text.isupper() or text.startswith('#')):
            return "heading"
        
        # Check for lists
        if re.match(r'^\s*[-*•]\s+|\d+\.\s+', text):
            return "list"
        
        # Default to paragraph
        return "paragraph"
    
    def _infer_domain(self, text: str) -> str:
        """Infer domain/topic from text content"""
        text_lower = text.lower()
        
        # Programming domains
        if any(keyword in text_lower for keyword in ['react', 'javascript', 'jsx', 'component']):
            return "React"
        if any(keyword in text_lower for keyword in ['python', 'def ', 'import ', 'class ']):
            return "Python"
        if any(keyword in text_lower for keyword in ['sql', 'select', 'from', 'where']):
            return "SQL"
        if any(keyword in text_lower for keyword in ['html', 'css', 'dom', 'element']):
            return "Web Development"
        
        # Technical domains
        if any(keyword in text_lower for keyword in ['api', 'endpoint', 'request', 'response']):
            return "API Development"
        if any(keyword in text_lower for keyword in ['database', 'query', 'table', 'schema']):
            return "Database"
        if any(keyword in text_lower for keyword in ['algorithm', 'complexity', 'data structure']):
            return "Algorithms"
        
        # Default
        return "General"
    
    async def _classify_with_gemini(
        self,
        text: str,
        aoi_type: str,
        user_expertise: str,
        persona_card: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Use Gemini to classify content"""
        
        prompt = f"""Classify this content and determine its type:

Content:
{text[:1000]}

Content Type (AOI): {aoi_type}
User's Expertise Level: {user_expertise}
User's Learning Style: {persona_card.get('learningStyle', 'reading')}

Classify this content into one of these types:
- equation: Mathematical formulas, equations
- code: Code blocks, snippets, technical syntax
- legal_jargon: Legal terms, contracts, terms of service
- technical_concept: Domain-specific terminology
- procedure: Step-by-step instructions
- definition: Term definitions, explanations
- example: Code examples, use cases
- warning_note: Important callouts, gotchas
- general: General text content

Return JSON with:
{{
    "content_type": "one of the types above",
    "confidence": 0.0-1.0
}}
"""
        
        try:
            response = await self.gemini.analyze(
                prompt=prompt,
                system_instruction="You are an expert at classifying technical content. Always respond with valid JSON only.",
                temperature=0.3,
                json_mode=True
            )
            
            content = self.gemini.extract_text_from_response(response)
            
            # Remove markdown if present
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            import json
            return json.loads(content)
            
        except Exception as e:
            print(f"Error classifying with Gemini: {e}")
            # Fallback classification
            return {
                "content_type": self._fallback_classify(text),
                "confidence": 0.6
            }
    
    def _fallback_classify(self, text: str) -> str:
        """Fallback classification without LLM"""
        text_lower = text.lower()
        
        if re.search(r'```|function|def |class ', text):
            return "code"
        if re.search(r'[=+\-*/]\s*\d+|\\[a-zA-Z]+', text):
            return "equation"
        if any(word in text_lower for word in ['step', 'first', 'then', 'finally']):
            return "procedure"
        if any(word in text_lower for word in ['definition', 'means', 'refers to']):
            return "definition"
        if any(word in text_lower for word in ['warning', 'note', 'important', 'caution']):
            return "warning_note"
        
        return "general"
    
    async def _extract_concepts(self, text: str) -> List[str]:
        """Extract key concepts from text using Gemini for better quality"""
        # Filter out UI elements, dates, common words before sending to Gemini
        filtered_text = self._filter_ui_elements(text)
        
        if len(filtered_text.strip()) < 50:
            # Text too short after filtering, use original
            filtered_text = text
        
        try:
            # Use Gemini to extract meaningful concepts
            prompt = f"""Extract the 5-8 most important concepts, topics, or key ideas from this text. 
Focus on substantive, domain-specific concepts. EXCLUDE:
- UI elements (like "Close Session", "Chat", "Capturing")
- Dates and times (like "Tuesday", "February", "PM", "EDT")
- Common action words (like "Extracting", "Clicking")
- User interface terms
- Product names (like "ThirdEye", "Third Eye", or any monitoring/analytics tool names)
- Company names unless they're the main topic

Text:
{filtered_text[:2000]}

Return JSON with only meaningful, substantive concepts:
{{"concepts": ["concept1", "concept2", ...]}}"""
            
            response = await self.gemini.analyze(
                prompt=prompt,
                system_instruction="You are an expert at extracting key concepts from text. Ignore UI elements, dates, and common words. Focus on domain-specific topics and ideas. Always respond with valid JSON only.",
                temperature=0.3,
                json_mode=True
            )
            
            content = self.gemini.extract_text_from_response(response)
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            import json
            result = json.loads(content)
            concepts = result.get("concepts", [])
            if concepts and isinstance(concepts, list):
                # Filter out any remaining UI elements
                filtered_concepts = self._filter_concept_list(concepts)
                return filtered_concepts[:10]
        except Exception as e:
            print(f"Error extracting concepts with Gemini: {e}")
        
        # Fallback to regex-based extraction with filtering
        concepts = []
        tech_terms = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', filtered_text)
        concepts.extend([term for term in tech_terms[:10]])
        quoted = re.findall(r'"([^"]+)"', filtered_text)
        concepts.extend([q for q in quoted[:5]])
        filtered_concepts = self._filter_concept_list(concepts)
        return filtered_concepts[:10]
    
    def _filter_ui_elements(self, text: str) -> str:
        """Remove UI elements, dates, and common words from text"""
        # Remove common UI phrases
        ui_patterns = [
            r'close session',
            r'chat',
            r'capturing',
            r'extracting',
            r'click',
            r'button',
            r'save to notebook',
            r'joseph yung',  # User name
            r'thirdeye',  # Product name
            r'third eye',  # Product name variant
        ]
        
        filtered = text
        for pattern in ui_patterns:
            filtered = re.sub(pattern, '', filtered, flags=re.IGNORECASE)
        
        # Remove dates and times
        filtered = re.sub(r'\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b', '', filtered, flags=re.IGNORECASE)
        filtered = re.sub(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b', '', filtered, flags=re.IGNORECASE)
        filtered = re.sub(r'\b\d{1,2}:\d{2}\s*(?:AM|PM|EDT|EST|PST|PDT)\b', '', filtered, flags=re.IGNORECASE)
        
        return filtered
    
    def _filter_concept_list(self, concepts: List[str]) -> List[str]:
        """Filter out UI elements and common words from concept list"""
        ui_words = {
            'extracting', 'capturing', 'clicking', 'click', 'close', 'session', 
            'chat', 'button', 'save', 'notebook', 'joseph', 'yung',
            'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'monday',
            'january', 'february', 'march', 'april', 'may', 'june', 'july',
            'august', 'september', 'october', 'november', 'december',
            'pm', 'am', 'edt', 'est', 'pst', 'pdt',
            'thirdeye', 'third eye', 'monitoring', 'analytics tool'  # Product names
        }
        
        filtered = []
        for concept in concepts:
            concept_lower = concept.lower().strip()
            # Skip if it's a UI word or too short
            if concept_lower in ui_words or len(concept_lower) < 3:
                continue
            # Skip if it contains multiple UI words
            words = concept_lower.split()
            if len(words) > 1 and all(w in ui_words for w in words):
                continue
            filtered.append(concept)
        
        return filtered
    
    async def _generate_summary(self, text: str, content_type: str, concepts: List[str]) -> str:
        """Generate a brief summary of the EXTRACTED content from image/Google Docs"""
        try:
            prompt = f"""Extract and summarize the key information from the content below. This content was extracted from an image screenshot or Google Docs.

EXTRACTED CONTENT:
{text[:2000]}

YOUR TASK:
Extract and summarize the ACTUAL information present in the content. Look for:
- Event titles, topics, or subjects (e.g., "AI in Business", "Fireside Chat")
- Speaker names, titles, and affiliations (e.g., "Dr. Ronnie Chatterji, Chief Economist, OpenAI")
- Dates, times, locations
- Organizers, hosts, or sponsors
- Key topics or themes discussed
- Any specific details mentioned

Write a concise 2-3 sentence summary that captures:
1. What the main topic/subject is (e.g., "This is about AI in Business")
2. Key details about speakers, events, or subjects mentioned
3. Important context (dates, organizers, etc.)

CRITICAL:
- Summarize ONLY what is actually in the extracted content
- Do NOT use generic phrases like "Understanding general content" or "This concept"
- Be specific: mention actual names, topics, and details from the content
- Do NOT mention any product names, tools, or monitoring platforms
- If it's an event, mention the event topic and speaker details
- If it's about a person, mention their name and role
- If it's about a topic, mention the specific topic

Return ONLY the summary text (2-3 sentences), nothing else."""
            
            response = await self.gemini.analyze(
                prompt=prompt,
                system_instruction="You are a summarization expert. Your task is to summarize extracted content from images or documents. Return ONLY the summary text, nothing else. Do not analyze or explain - just summarize what was extracted.",
                temperature=0.3,
                json_mode=False
            )
            
            summary = self.gemini.extract_text_from_response(response)
            # Clean up summary - remove any reasoning markers
            summary = summary.strip()
            # Remove common reasoning prefixes
            summary = re.sub(r'^(Let me|First|To summarize|In summary|This content|The extracted)[\s,:-]+\s*', '', summary, flags=re.IGNORECASE)
            return summary.strip()[:500]  # Limit length
        except Exception as e:
            print(f"Error generating summary: {e}")
            # Fallback: use first few sentences
            sentences = text.split('.')[:3]
            return '. '.join(sentences).strip() + '.'
    
    def _check_gap_relevance(
        self,
        concepts: List[str],
        known_gaps: List[str],
        text: str
    ) -> tuple[bool, Optional[str]]:
        """Check if content relates to known knowledge gaps"""
        if not known_gaps:
            return False, None
        
        text_lower = text.lower()
        
        for gap in known_gaps:
            gap_lower = gap.lower()
            
            # Check if gap keyword appears in concepts or text
            if gap_lower in text_lower:
                return True, gap
            
            # Check concept overlap
            for concept in concepts:
                if gap_lower in concept or concept in gap_lower:
                    return True, gap
        
        return False, None
    
    def _find_relevant_projects(
        self,
        concepts: List[str],
        active_projects: List[Dict],
        text: str
    ) -> List[str]:
        """Find projects relevant to the content"""
        relevant = []
        text_lower = text.lower()
        
        for project in active_projects:
            project_name = project.get("name", "").lower()
            
            # Check if concepts match project name
            for concept in concepts:
                if concept in project_name or project_name in concept:
                    relevant.append(project.get("name", ""))
                    break
            
            # Check if text mentions project
            if project_name and project_name in text_lower:
                relevant.append(project.get("name", ""))
        
        return list(dict.fromkeys(relevant))[:3]  # Limit to 3
    
    def _assess_complexity(
        self,
        text: str,
        user_expertise: str,
        known_gaps: List[str]
    ) -> str:
        """Assess content complexity relative to user"""
        
        # Simple heuristics
        text_lower = text.lower()
        
        # Indicators of complexity
        advanced_indicators = [
            'advanced', 'complex', 'sophisticated', 'optimization',
            'algorithm', 'architecture', 'design pattern', 'abstraction'
        ]
        
        beginner_indicators = [
            'introduction', 'basics', 'simple', 'easy', 'getting started',
            'tutorial', 'learn', 'beginner'
        ]
        
        has_advanced = any(indicator in text_lower for indicator in advanced_indicators)
        has_beginner = any(indicator in text_lower for indicator in beginner_indicators)
        
        # Map to complexity levels
        if user_expertise == "beginner":
            if has_advanced:
                return "advanced"
            elif has_beginner:
                return "beginner"
            else:
                return "intermediate"
        elif user_expertise == "intermediate":
            if has_advanced:
                return "advanced"
            else:
                return "intermediate"
        else:  # advanced/expert
            if has_beginner:
                return "beginner"
            else:
                return "intermediate"
    
    def _estimate_difficulty(
        self,
        text: str,
        user_expertise: str,
        known_gaps: List[str]
    ) -> float:
        """Estimate difficulty on 0-1 scale"""
        
        complexity = self._assess_complexity(text, user_expertise, known_gaps)
        
        # Map complexity to difficulty
        difficulty_map = {
            "beginner": 0.2,
            "intermediate": 0.5,
            "advanced": 0.8
        }
        
        base_difficulty = difficulty_map.get(complexity, 0.5)
        
        # Adjust if relates to known gap
        relates_to_gap, _ = self._check_gap_relevance([], known_gaps, text)
        if relates_to_gap:
            base_difficulty += 0.1  # Slightly harder if it's a known gap
        
        return min(1.0, base_difficulty)
