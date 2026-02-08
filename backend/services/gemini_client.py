"""
Google Gemini API Client
Replaces GPT-4 for LLM operations
"""

import httpx
from typing import Dict, Any, Optional, List
from app.config import settings
import json
import os


class GeminiClient:
    """
    Client for Google Gemini API
    Handles chat completions and reasoning tasks
    """
    
    def __init__(self):
        """Initialize Gemini client"""
        # Get API key from environment or settings
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key and hasattr(settings, 'gemini_api_key'):
            self.api_key = settings.gemini_api_key
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables. Add it to .env file.")
        
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.model = "gemini-2.0-flash"  # Use Gemini 2.0 Flash (fast and capable)
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Chat completion using Gemini API
        
        Args:
            messages: List of message dicts with "role" and "content"
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Maximum tokens to generate
            response_format: Optional format specification (e.g., {"type": "json_object"})
            
        Returns:
            Gemini API response
        """
        async with httpx.AsyncClient() as client:
            # Convert messages to Gemini format
            # Gemini uses "parts" instead of "messages"
            contents = []
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                
                # Gemini uses "user" and "model" roles
                if role == "system":
                    # System messages are handled via system_instruction
                    continue
                elif role == "assistant":
                    role = "model"
                
                contents.append({
                    "role": role,
                    "parts": [{"text": content}]
                })
            
            # Extract system instruction if present
            system_instruction = None
            for msg in messages:
                if msg.get("role") == "system":
                    system_instruction = msg.get("content")
                    break
            
            payload = {
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                }
            }
            
            if max_tokens:
                payload["generationConfig"]["maxOutputTokens"] = max_tokens
            
            if response_format and response_format.get("type") == "json_object":
                payload["generationConfig"]["responseMimeType"] = "application/json"
            
            if system_instruction:
                payload["systemInstruction"] = {
                    "parts": [{"text": system_instruction}]
                }
            
            response = await client.post(
                f"{self.base_url}/models/{self.model}:generateContent",
                headers={
                    "x-goog-api-key": self.api_key,
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=60.0
            )
            response.raise_for_status()
            return response.json()
    
    async def analyze(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.3,
        json_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze text with Gemini
        
        Args:
            prompt: Analysis prompt
            system_instruction: Optional system instruction
            temperature: Sampling temperature
            json_mode: Return JSON format
            
        Returns:
            Analysis result
        """
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        response_format = {"type": "json_object"} if json_mode else None
        
        return await self.chat(
            messages=messages,
            temperature=temperature,
            response_format=response_format
        )
    
    def extract_text_from_response(self, response: Dict[str, Any]) -> str:
        """Extract text content from Gemini response"""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return ""
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return ""
            
            return parts[0].get("text", "")
        except Exception:
            return ""
    
    async def test_connection(self) -> bool:
        """Test connection to Gemini API"""
        try:
            result = await self.chat(
                messages=[{"role": "user", "content": "Say hello"}],
                max_tokens=10
            )
            return "candidates" in result
        except Exception as e:
            print(f"Gemini connection test failed: {e}")
            return False
