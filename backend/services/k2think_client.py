"""
K2-Think (Kimi K2 Thinking) API Client
Deep reasoning model for complex problem-solving
"""

import httpx
from typing import Dict, Any, Optional, List
from app.config import settings
import json


class K2ThinkClient:
    """
    Client for K2-Think API
    Handles reasoning calls with step-by-step thinking
    """
    
    def __init__(self):
        """Initialize K2-Think client"""
        self.api_key = settings.k2_api_key
        # K2-Think API endpoint: https://api.k2think.ai/v1/chat/completions
        self.base_url = "https://api.k2think.ai"
        # Use MBZUAI-IFM/K2-Think-v2 model for reasoning
        self.model = "MBZUAI-IFM/K2-Think-v2"
        # K2-Think uses Authorization: Bearer header
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def reason(
        self,
        query: str,
        context: Optional[str] = None,
        max_steps: int = 10,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Perform reasoning with K2-Think
        
        Args:
            query: The question or problem to reason about
            context: Optional context information
            max_steps: Maximum reasoning steps
            temperature: Sampling temperature (0.0-1.0)
            
        Returns:
            Reasoning result with step-by-step thinking
        """
        async with httpx.AsyncClient() as client:
            messages = []
            
            if context:
                messages.append({
                    "role": "system",
                    "content": f"Context: {context}"
                })
            
            messages.append({
                "role": "user",
                "content": query
            })
            
            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 4000,
                "stream": False
            }
            
            # Add reasoning parameters if supported
            if hasattr(settings, 'k2_reasoning_steps'):
                payload["reasoning_steps"] = max_steps
            
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=self.headers,
                json=payload,
                timeout=120.0  # K2-Think can take longer for complex reasoning
            )
            response.raise_for_status()
            return response.json()
    
    async def analyze_gap(
        self,
        user_content: str,
        user_question: str,
        user_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyze knowledge gap using K2-Think
        
        Args:
            user_content: Content the user is reading
            user_question: Question or confusion point
            user_context: Optional user context (persona, learning style, etc.)
            
        Returns:
            Gap analysis with hypothesis
        """
        context_parts = []
        
        if user_context:
            if "persona" in user_context:
                context_parts.append(f"User persona: {json.dumps(user_context['persona'])}")
            if "learning_style" in user_context:
                context_parts.append(f"Learning style: {user_context['learning_style']}")
            if "expertise_level" in user_context:
                context_parts.append(f"Expertise level: {user_context['expertise_level']}")
        
        context_str = "\n".join(context_parts) if context_parts else None
        
        query = f"""Analyze the knowledge gap in this learning scenario:

Content being read:
{user_content}

User's question/confusion:
{user_question}

Provide:
1. The specific knowledge gap identified
2. Why this gap exists (what prerequisite knowledge is missing)
3. A hypothesis about what the user needs to learn
4. Recommended learning path to fill this gap
"""
        
        return await self.reason(query, context=context_str, max_steps=15)
    
    async def generate_explanation(
        self,
        concept: str,
        gap_analysis: str,
        user_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate personalized explanation using K2-Think
        
        Args:
            concept: Concept to explain
            gap_analysis: Previous gap analysis
            user_context: User context for personalization
            
        Returns:
            Personalized explanation
        """
        context_parts = [f"Gap analysis: {gap_analysis}"]
        
        if user_context:
            if "learning_style" in user_context:
                style = user_context["learning_style"]
                context_parts.append(f"User prefers {style} learning style - tailor explanation accordingly")
            if "expertise_level" in user_context:
                level = user_context["expertise_level"]
                context_parts.append(f"User expertise level: {level} - adjust complexity")
        
        context_str = "\n".join(context_parts)
        
        query = f"""Generate a clear, personalized explanation for this concept:

Concept: {concept}

Requirements:
1. Address the identified knowledge gap
2. Use appropriate complexity for the user's level
3. Match the user's learning style
4. Provide examples and analogies
5. Include follow-up questions to check understanding
"""
        
        return await self.reason(query, context=context_str, max_steps=12)
    
    async def test_connection(self) -> bool:
        """
        Test connection to K2-Think API
        
        Returns:
            True if connection successful
        """
        try:
            # Simple reasoning test
            result = await self.reason(
                "What is 2+2?",
                max_steps=1,
                temperature=0.1
            )
            return "choices" in result or "content" in str(result)
        except Exception as e:
            print(f"K2-Think connection test failed: {e}")
            return False
