"""
Agent 0.0: Persona Architect
Constructs comprehensive "Knowledge Profile" of the user
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.gemini_client import GeminiClient
from services.google_drive_client import GoogleDriveClient
from utils.database import engine, ensure_warehouse_resumed
from sqlalchemy import text
import json


class PersonaArchitect(BaseAgent):
    """
    Agent 0.0: Persona Architect
    Analyzes user's digital footprint to build knowledge profile
    """
    
    def __init__(self):
        super().__init__(
            agent_id="0.0",
            agent_name="Persona Architect",
            agent_version="1.0.0"
        )
        self.gemini = GeminiClient()
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build persona card from user data
        
        Input:
            {
                "user_id": "string",
                "include_docs": bool (optional),
                "include_sessions": bool (optional),
                "include_searches": bool (optional),
                "include_history": bool (optional, default True),
                "google_access_token": str (optional) - if provided, fetches actual Google Docs content
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "personaCard": {
                        "userId": "string",
                        "expertiseLevels": Dict[str, str],
                        "learningStyle": "string",
                        "activeProjects": List[Dict],
                        "preferredTopics": List[str],
                        "knownGaps": List[str],
                        "learningVelocity": float
                    }
                }
            }
        """
        try:
            self.validate_input(input_data, ["user_id"])
            user_id = input_data["user_id"]
            
            # Gather data sources
            docs_metadata = await self._fetch_google_docs_metadata(user_id) if input_data.get("include_docs", True) else []
            
            # If access token provided, fetch actual Google Docs content
            google_access_token = input_data.get("google_access_token")
            if not google_access_token:
                # Try to get token from database (future enhancement)
                google_access_token = await self._get_user_google_token(user_id)
            
            docs_content = []
            if google_access_token and docs_metadata:
                docs_content = await self._fetch_google_docs_content(docs_metadata, google_access_token)
            
            search_patterns = await self._analyze_search_history(user_id) if input_data.get("include_searches", True) else []
            session_history = await self._fetch_session_history(user_id) if input_data.get("include_sessions", True) else []
            browser_history = await self._fetch_browser_history(user_id) if input_data.get("include_history", True) else {}
            
            # Use Gemini to analyze and build persona
            analysis_prompt = self._build_analysis_prompt(
                docs_metadata, 
                docs_content,
                search_patterns, 
                session_history,
                browser_history
            )
            
            # Call Gemini for persona analysis
            persona_result = await self._analyze_with_gemini(analysis_prompt)
            
            # Build PersonaCard
            persona_card = self._build_persona_card(
                user_id, 
                persona_result, 
                docs_metadata, 
                session_history,
                browser_history
            )
            
            return self.create_response(success=True, data={"personaCard": persona_card})
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Persona analysis failed: {str(e)}")
    
    async def _fetch_google_docs_metadata(self, user_id: str) -> List[Dict[str, Any]]:
        """Fetch Google Docs metadata for user"""
        ensure_warehouse_resumed()
        
        try:
            with engine.connect() as conn:
                # Query DOCUMENTS table for user's documents
                # Note: This assumes documents are linked via ORG_ID -> ORG_MEMBERSHIPS -> USER_ID
                result = conn.execute(text("""
                    SELECT 
                        D.DOC_ID,
                        D.TITLE,
                        D.GOOGLE_DOC,
                        D.CREATED_AT,
                        D.UPDATED_AT,
                        D.CONFUSION_DENSITY
                    FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS D
                    JOIN THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS OM ON D.ORG_ID = OM.ORG_ID
                    WHERE OM.USER_ID = :user_id
                    ORDER BY D.UPDATED_AT DESC
                    LIMIT 50
                """), {"user_id": user_id})
                
                docs = []
                for row in result:
                    docs.append({
                        "doc_id": row[0],
                        "title": row[1],
                        "google_doc": json.loads(row[2]) if row[2] else {},
                        "created_at": str(row[3]) if row[3] else None,
                        "updated_at": str(row[4]) if row[4] else None,
                        "confusion_density": float(row[5]) if row[5] else 0.0
                    })
                
                return docs
        except Exception as e:
            print(f"Error fetching docs metadata: {e}")
            return []
    
    async def _get_user_google_token(self, user_id: str) -> Optional[str]:
        """Try to get user's Google access token from database"""
        ensure_warehouse_resumed()
        
        try:
            # TODO: When TOKENS table is created, query it here
            # For now, return None - token must be passed explicitly
            # This is a placeholder for future token storage
            return None
        except Exception as e:
            print(f"Error getting user token: {e}")
            return None
    
    async def _fetch_google_docs_content(
        self, 
        docs_metadata: List[Dict[str, Any]], 
        access_token: str
    ) -> List[Dict[str, Any]]:
        """Fetch actual content from Google Docs using Drive API"""
        try:
            drive_client = GoogleDriveClient(access_token)
            docs_content = []
            
            # Fetch content for top 10 most recent docs
            for doc in docs_metadata[:10]:
                doc_id = doc.get("doc_id")
                google_doc_data = doc.get("google_doc", {})
                
                # Extract Google Doc file ID from metadata
                file_id = None
                if isinstance(google_doc_data, dict):
                    file_id = google_doc_data.get("fileId") or google_doc_data.get("id")
                elif isinstance(google_doc_data, str):
                    # Try to parse if it's a JSON string
                    try:
                        parsed = json.loads(google_doc_data)
                        file_id = parsed.get("fileId") or parsed.get("id")
                    except:
                        # If doc_id looks like a Google Doc ID, use it directly
                        if doc_id and len(doc_id) > 20:
                            file_id = doc_id
                
                if not file_id:
                    # Try using doc_id as file_id if it looks like a Google Doc ID
                    # Google Doc IDs are typically 44 characters long
                    if doc_id and len(doc_id) > 20:
                        file_id = doc_id
                    else:
                        continue
                
                try:
                    # Fetch document content
                    content = drive_client.get_file_content(file_id)
                    
                    if content:
                        # Truncate content to avoid token limits (keep first 5000 chars)
                        truncated_content = content[:5000] if len(content) > 5000 else content
                        
                        docs_content.append({
                            "doc_id": doc_id,
                            "title": doc.get("title", "Untitled"),
                            "content": truncated_content,
                            "content_length": len(content),
                            "file_id": file_id,
                            "has_full_content": len(content) <= 5000
                        })
                except Exception as e:
                    print(f"Error fetching content for doc {doc_id}: {e}")
                    # Continue with other docs even if one fails
                    continue
            
            return docs_content
            
        except Exception as e:
            print(f"Error fetching Google Docs content: {e}")
            return []
    
    async def _analyze_search_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Analyze search history from sessions"""
        ensure_warehouse_resumed()
        
        try:
            with engine.connect() as conn:
                # Query SESSIONS for search-related data
                # Note: Search queries might be stored in session metadata or NOTEBOOK_ENTRIES
                result = conn.execute(text("""
                    SELECT 
                        S.SESSION_ID,
                        S.TITLE,
                        S.CREATED_AT,
                        S.METADATA
                    FROM THIRDEYE_DEV.PUBLIC.SESSIONS S
                    WHERE S.USER_ID = :user_id
                    ORDER BY S.CREATED_AT DESC
                    LIMIT 100
                """), {"user_id": user_id})
                
                patterns = []
                for row in result:
                    metadata = json.loads(row[3]) if row[3] else {}
                    if "search_queries" in metadata:
                        patterns.append({
                            "session_id": row[0],
                            "title": row[1],
                            "created_at": str(row[2]),
                            "queries": metadata["search_queries"]
                        })
                
                return patterns
        except Exception as e:
            print(f"Error analyzing search history: {e}")
            return []
    
    async def _fetch_session_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Fetch session history with confusion patterns"""
        ensure_warehouse_resumed()
        
        try:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT 
                        S.SESSION_ID,
                        S.TITLE,
                        S.CREATED_AT,
                        S.DURATION_SECONDS,
                        S.METADATA
                    FROM THIRDEYE_DEV.PUBLIC.SESSIONS S
                    WHERE S.USER_ID = :user_id
                    ORDER BY S.CREATED_AT DESC
                    LIMIT 100
                """), {"user_id": user_id})
                
                sessions = []
                for row in result:
                    metadata = json.loads(row[4]) if row[4] else {}
                    sessions.append({
                        "session_id": row[0],
                        "title": row[1],
                        "created_at": str(row[2]),
                        "duration_seconds": int(row[3]) if row[3] else 0,
                        "gap_labels": metadata.get("gap_labels", []),
                        "concepts": metadata.get("concepts", [])
                    })
                
                return sessions
        except Exception as e:
            print(f"Error fetching session history: {e}")
            return []
    
    async def _fetch_browser_history(self, user_id: str, days_back: int = 7) -> Dict[str, Any]:
        """Fetch browser history analysis for user"""
        ensure_warehouse_resumed()
        
        try:
            with engine.connect() as conn:
                # Get sessions with history data from metadata
                result = conn.execute(text("""
                    SELECT SESSION_ID, METADATA, STARTED_AT
                    FROM THIRDEYE_DEV.PUBLIC.SESSIONS
                    WHERE USER_ID = :user_id
                      AND STARTED_AT >= DATEADD(day, -:days_back, CURRENT_TIMESTAMP())
                      AND METADATA IS NOT NULL
                    ORDER BY STARTED_AT DESC
                """), {
                    "user_id": user_id,
                    "days_back": days_back
                })
                
                all_visits = []
                domain_groups = {}
                
                for row in result:
                    metadata = json.loads(row[1]) if row[1] else {}
                    visits = metadata.get("history_visits", [])
                    
                    for visit in visits:
                        all_visits.append(visit)
                        
                        try:
                            from urllib.parse import urlparse
                            domain = urlparse(visit["url"]).netloc
                            
                            if domain not in domain_groups:
                                domain_groups[domain] = {
                                    "domain": domain,
                                    "visits": 0,
                                    "urls": [],
                                    "lastVisit": 0
                                }
                            
                            domain_groups[domain]["visits"] += 1
                            domain_groups[domain]["urls"].append(visit["url"])
                            if visit["visitTime"] > domain_groups[domain]["lastVisit"]:
                                domain_groups[domain]["lastVisit"] = visit["visitTime"]
                        except Exception:
                            pass
                
                # Sort by visit count
                top_domains = sorted(
                    domain_groups.values(),
                    key=lambda x: x["visits"],
                    reverse=True
                )[:20]
                
                # Identify learning sites
                learning_keywords = [
                    'docs.google.com', 'github.com', 'stackoverflow.com',
                    'developer.mozilla.org', 'medium.com', 'wikipedia.org',
                    'youtube.com', 'coursera.org', 'udemy.com', 'khanacademy.org',
                    'reddit.com', 'dev.to', 'hashnode.com', 'freecodecamp.org'
                ]
                
                learning_sites = [
                    d for d in top_domains
                    if any(keyword in d["domain"] for keyword in learning_keywords)
                ]
                
                return {
                    "totalVisits": len(all_visits),
                    "topDomains": top_domains,
                    "learningSites": learning_sites,
                    "daysAnalyzed": days_back,
                    "recentVisits": all_visits[:50]  # Last 50 visits
                }
                
        except Exception as e:
            print(f"Error fetching browser history: {e}")
            return {
                "totalVisits": 0,
                "topDomains": [],
                "learningSites": [],
                "daysAnalyzed": days_back,
                "recentVisits": []
            }
    
    def _build_analysis_prompt(
        self,
        docs_metadata: List[Dict],
        docs_content: List[Dict],
        search_patterns: List[Dict],
        session_history: List[Dict],
        browser_history: Dict[str, Any]
    ) -> str:
        """Build prompt for Gemini analysis"""
        
        # Extract key insights from browser history
        history_summary = ""
        if browser_history.get("totalVisits", 0) > 0:
            learning_sites = browser_history.get("learningSites", [])
            top_domains = browser_history.get("topDomains", [])[:10]
            
            history_summary = f"""
Browser History Analysis ({browser_history.get("daysAnalyzed", 7)} days):
- Total visits: {browser_history.get("totalVisits", 0)}
- Learning sites visited: {len(learning_sites)}
- Top domains: {', '.join([d["domain"] for d in top_domains[:5]])}
- Learning sites: {json.dumps(learning_sites[:10], indent=2) if learning_sites else "None"}
- Recent visits: {json.dumps(browser_history.get("recentVisits", [])[:20], indent=2)}
"""
        else:
            history_summary = "\nBrowser History: No history data available (extension may not be tracking or user hasn't browsed yet)"
        
        # Build docs section with content if available
        docs_section = ""
        if docs_content:
            docs_section = f"""
Google Docs Content ({len(docs_content)} documents with content):
{json.dumps(docs_content, indent=2)}
"""
        else:
            docs_section = f"""
Google Docs Metadata ({len(docs_metadata)} documents):
{json.dumps(docs_metadata[:10], indent=2) if docs_metadata else "No documents found"}
(Note: Actual content not available - only metadata)
"""
        
        prompt = f"""Analyze this user's digital footprint and create a comprehensive knowledge profile.

**IMPORTANT: You MUST use BOTH Google Docs content AND browser history together. Cross-reference them to build accurate insights.**

{docs_section}

Search Patterns ({len(search_patterns)} patterns):
{json.dumps(search_patterns[:10], indent=2) if search_patterns else "No search patterns found"}

Session History ({len(session_history)} sessions):
{json.dumps(session_history[:10], indent=2) if session_history else "No sessions found"}
{history_summary}

**CRITICAL ANALYSIS INSTRUCTIONS - Use BOTH Google Docs AND Browser History:**

1. **Cross-reference document topics with browsing patterns**:
   - If user creates docs about "Python" AND visits python.org/stackoverflow → validate Python expertise
   - If user visits tutorial sites about "React" BUT no React docs → identify learning gap
   - Match document content themes with visited domains

2. **Validate expertise levels using both sources**:
   - Advanced docs + frequent visits to advanced documentation sites = high expertise
   - Simple docs + tutorial site visits = beginner/learning phase
   - Complex docs + no related browsing = independent expert work

3. **Identify learning journey**:
   - Browser history shows research/learning phase
   - Google Docs content shows application/creation phase
   - Together reveal complete learning cycle

4. **Find topic consistency and gaps**:
   - Topics in docs that match browsing = core interests (high confidence)
   - Topics in browsing but NOT in docs = potential new interests
   - Topics in docs but NOT in browsing = independent work or past knowledge

5. **Learning velocity from both sources**:
   - Frequent doc updates + high browsing activity = active learning
   - Doc updates without browsing = applying existing knowledge
   - Browsing without doc updates = research phase

Based on this comprehensive cross-referenced data, determine:

1. Expertise levels in different topics (beginner/intermediate/advanced/expert)
   - **CROSS-REFERENCE**: Compare document content depth with browsing site sophistication
   - If docs show advanced concepts AND user visits expert-level sites → advanced expertise
   - If docs are basic BUT user visits advanced sites → learning phase
   - Use BOTH sources to validate and refine expertise assessment

2. Learning style preference (visual/auditory/reading/kinesthetic)
   - **CROSS-REFERENCE**: Match browsing site types (video/docs/interactive) with document content style
   - Video site visits + tutorial-style docs = visual learner
   - Documentation site visits + reference-style docs = reading learner
   - Use both to confirm learning style

3. Active projects and interests
   - **CROSS-REFERENCE**: Match document topics/content with browsing domains
   - Projects in docs that align with browsing = active current projects
   - Browsing topics without matching docs = potential new projects
   - Use both to identify what user is actively working on vs researching

4. Preferred topics and domains
   - **CROSS-REFERENCE**: Find topics that appear in BOTH docs AND browsing = core interests
   - Topics only in docs = independent work areas
   - Topics only in browsing = research/learning areas
   - Prioritize topics found in both sources

5. Known knowledge gaps
   - **CROSS-REFERENCE**: Tutorial site visits + simple/learning docs = confirmed gaps
   - Advanced browsing but basic docs = knowledge gap being addressed
   - Use both to identify what user is actively learning

6. Learning velocity (how quickly they learn)
   - **CROSS-REFERENCE**: Compare doc update frequency with browsing activity
   - High browsing + frequent updates = rapid learning
   - Low browsing + updates = applying existing knowledge
   - Use both to assess learning pace

Pay special attention to browser history patterns:
- Frequent visits to documentation sites suggest active learning
- Tutorial/educational site visits indicate knowledge gaps
- Domain patterns reveal interests and expertise areas
- Learning site visits show preferred learning resources
- Cross-reference with Google Docs to validate and deepen insights

Return a JSON object with this structure:
{{
    "expertiseLevels": {{"topic": "level"}},
    "learningStyle": "style",
    "activeProjects": [{{"name": "...", "docId": "..."}}],
    "preferredTopics": ["topic1", "topic2"],
    "knownGaps": ["gap1", "gap2"],
    "learningVelocity": 0.0-1.0
}}
"""
        return prompt
    
    async def _analyze_with_gemini(self, prompt: str) -> Dict[str, Any]:
        """Use Gemini to analyze persona"""
        system_instruction = "You are an expert at analyzing learning patterns and building knowledge profiles. Always respond with valid JSON only, no markdown formatting."
        
        # Use Gemini API
        response = await self.gemini.analyze(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.3,
            json_mode=True
        )
        
        # Extract JSON from Gemini response
        content = self.gemini.extract_text_from_response(response)
        
        # Remove markdown code blocks if present
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        return json.loads(content)
    
    def _build_persona_card(
        self,
        user_id: str,
        analysis: Dict[str, Any],
        docs_metadata: List[Dict],
        session_history: List[Dict],
        browser_history: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build final PersonaCard structure"""
        
        # Extract active projects from docs
        active_projects = []
        for doc in docs_metadata[:5]:  # Top 5 most recent
            if doc.get("updated_at"):
                active_projects.append({
                    "name": doc.get("title", "Untitled"),
                    "docId": doc.get("doc_id"),
                    "lastAccessed": doc.get("updated_at")
                })
        
        # Enhance preferred topics with browser history insights
        preferred_topics = analysis.get("preferredTopics", [])
        if browser_history.get("learningSites"):
            # Extract topics from learning sites
            learning_domains = [site["domain"] for site in browser_history["learningSites"][:5]]
            # Add domain-based topics if not already present
            for domain in learning_domains:
                if "github" in domain and "GitHub" not in preferred_topics:
                    preferred_topics.append("Software Development")
                elif "stackoverflow" in domain and "Programming" not in preferred_topics:
                    preferred_topics.append("Programming")
                elif "docs.google" in domain and "Documentation" not in preferred_topics:
                    preferred_topics.append("Documentation")
        
        return {
            "userId": user_id,
            "expertiseLevels": analysis.get("expertiseLevels", {}),
            "learningStyle": analysis.get("learningStyle", "reading"),
            "activeProjects": active_projects,
            "preferredTopics": preferred_topics[:10],  # Limit to top 10
            "knownGaps": analysis.get("knownGaps", []),
            "learningVelocity": analysis.get("learningVelocity", 0.5),
            "browsingInsights": {
                "totalVisits": browser_history.get("totalVisits", 0),
                "learningSitesCount": len(browser_history.get("learningSites", [])),
                "topDomains": [d["domain"] for d in browser_history.get("topDomains", [])[:5]]
            } if browser_history.get("totalVisits", 0) > 0 else None
        }
