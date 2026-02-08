"""
Vision Client for Gemini Vision API
Handles image processing, OCR, and content type detection
"""

import httpx
from typing import Dict, Any, Optional, List
from app.config import settings
import json
import os
import base64
import hashlib


class VisionClient:
    """
    Client for Google Gemini Vision API
    Handles OCR extraction and content type detection from images
    """
    
    def __init__(self):
        """Initialize Vision client"""
        # Get API key from environment or settings
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key and hasattr(settings, 'gemini_api_key'):
            self.api_key = settings.gemini_api_key
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables. Add it to .env file.")
        
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.model = "gemini-2.0-flash"  # Gemini 2.0 Flash supports vision
    
    def _extract_base64_from_data_url(self, data_url: str) -> Optional[str]:
        """Extract base64 string from data URL"""
        if not data_url:
            return None
        
        # Handle data URL format: data:image/png;base64,<base64_string>
        if data_url.startswith("data:image"):
            # Find the comma that separates metadata from data
            comma_index = data_url.find(",")
            if comma_index != -1:
                return data_url[comma_index + 1:]
        
        # If it's already base64, return as is
        return data_url
    
    def _get_image_hash(self, image_data: str) -> str:
        """Generate hash for image caching"""
        return hashlib.md5(image_data.encode()).hexdigest()
    
    async def extract_text_from_image(
        self,
        image_data_url: str,
        prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract text from image using Gemini Vision API
        
        Args:
            image_data_url: Base64-encoded image data URL (data:image/png;base64,...)
            prompt: Optional prompt for extraction guidance
            
        Returns:
            {
                "text": str,
                "confidence": float,
                "content_types": List[str],
                "metadata": Dict
            }
        """
        try:
            base64_image = self._extract_base64_from_data_url(image_data_url)
            if not base64_image:
                return {
                    "text": "",
                    "confidence": 0.0,
                    "content_types": [],
                    "metadata": {"error": "Invalid image data URL"}
                }
            
            # Build prompt for OCR
            extraction_prompt = prompt or """Extract all text from this image. 
            Preserve the structure and formatting. Include:
            - All visible text content
            - Code blocks if present
            - Mathematical equations if present
            - Any labels or captions
            
            Return the extracted text exactly as it appears, maintaining line breaks and spacing."""
            
            # Prepare Gemini Vision API request
            payload = {
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"text": extraction_prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": base64_image
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.1,  # Low temperature for accurate OCR
                    "maxOutputTokens": 4096
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/models/{self.model}:generateContent",
                    headers={
                        "x-goog-api-key": self.api_key,
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            # Extract text from response
            text = self._extract_text_from_response(result)
            
            # Detect content types
            content_types = self._detect_content_types(text)
            
            # Estimate confidence (simplified - could be improved)
            confidence = 0.9 if len(text) > 20 else 0.5
            
            return {
                "text": text,
                "confidence": confidence,
                "content_types": content_types,
                "metadata": {
                    "model": self.model,
                    "text_length": len(text),
                    "image_hash": self._get_image_hash(base64_image)
                }
            }
            
        except Exception as e:
            return {
                "text": "",
                "confidence": 0.0,
                "content_types": [],
                "metadata": {"error": str(e)}
            }
    
    async def detect_content_type(
        self,
        image_data_url: str
    ) -> Dict[str, Any]:
        """
        Detect content type in image (text, code, equation, diagram, etc.)
        
        Args:
            image_data_url: Base64-encoded image data URL
            
        Returns:
            {
                "content_types": List[str],
                "primary_type": str,
                "confidence": float
            }
        """
        try:
            base64_image = self._extract_base64_from_data_url(image_data_url)
            if not base64_image:
                return {
                    "content_types": [],
                    "primary_type": "unknown",
                    "confidence": 0.0
                }
            
            prompt = """Analyze this image and identify what types of content it contains.
            
            Possible content types:
            - text: Regular text content
            - code: Code blocks, programming syntax
            - equation: Mathematical equations, formulas
            - diagram: Charts, graphs, flowcharts, diagrams
            - table: Tabular data
            - image: Embedded images or screenshots
            - list: Bulleted or numbered lists
            
            Return JSON with:
            {
                "content_types": ["type1", "type2"],
                "primary_type": "most_common_type",
                "confidence": 0.0-1.0
            }"""
            
            payload = {
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": base64_image
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.3,
                    "responseMimeType": "application/json"
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/models/{self.model}:generateContent",
                    headers={
                        "x-goog-api-key": self.api_key,
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
            
            # Extract JSON from response
            content = self._extract_text_from_response(result)
            
            # Remove markdown if present
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            detection_result = json.loads(content)
            
            return {
                "content_types": detection_result.get("content_types", []),
                "primary_type": detection_result.get("primary_type", "unknown"),
                "confidence": detection_result.get("confidence", 0.8)
            }
            
        except Exception as e:
            # Fallback detection based on text extraction
            text_result = await self.extract_text_from_image(image_data_url)
            content_types = self._detect_content_types(text_result.get("text", ""))
            
            return {
                "content_types": content_types,
                "primary_type": content_types[0] if content_types else "unknown",
                "confidence": 0.6
            }
    
    async def extract_structured_content(
        self,
        image_data_url: str
    ) -> Dict[str, Any]:
        """
        Extract structured content from image (text + metadata)
        
        Args:
            image_data_url: Base64-encoded image data URL
            
        Returns:
            {
                "text": str,
                "content_types": List[str],
                "structure": Dict,
                "confidence": float
            }
        """
        # Extract text
        text_result = await self.extract_text_from_image(image_data_url)
        
        # Detect content types
        type_result = await self.detect_content_type(image_data_url)
        
        return {
            "text": text_result.get("text", ""),
            "content_types": type_result.get("content_types", []),
            "structure": {
                "primary_type": type_result.get("primary_type"),
                "has_code": "code" in type_result.get("content_types", []),
                "has_equation": "equation" in type_result.get("content_types", []),
                "has_diagram": "diagram" in type_result.get("content_types", [])
            },
            "confidence": min(text_result.get("confidence", 0.0), type_result.get("confidence", 0.0))
        }
    
    def _extract_text_from_response(self, response: Dict[str, Any]) -> str:
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
    
    def _detect_content_types(self, text: str) -> List[str]:
        """Detect content types from extracted text (fallback method)"""
        import re
        
        content_types = []
        text_lower = text.lower()
        
        # Check for code
        if re.search(r'```|function\s+\w+|def\s+\w+|class\s+\w+|import\s+\w+', text):
            content_types.append("code")
        
        # Check for equations
        if re.search(r'[=+\-*/]\s*\d+|\\[a-zA-Z]+|∑|∫|√|^[a-zA-Z]\s*=\s*', text):
            content_types.append("equation")
        
        # Check for tables
        if re.search(r'\|\s*[^\|]+\s*\|', text) or text.count('|') > 5:
            content_types.append("table")
        
        # Check for lists
        if re.match(r'^\s*[-*•]\s+|\d+\.\s+', text, re.MULTILINE):
            content_types.append("list")
        
        # Check for diagrams (heuristic: short lines, many symbols)
        if len(text.split('\n')) > 5 and re.search(r'[─│┌┐└┘├┤┬┴┼]', text):
            content_types.append("diagram")
        
        # Default to text if nothing else detected
        if not content_types:
            content_types.append("text")
        
        return content_types
    
    async def test_connection(self) -> bool:
        """Test connection to Gemini Vision API"""
        try:
            # Create a simple test image (1x1 pixel PNG)
            test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            test_data_url = f"data:image/png;base64,{test_image_base64}"
            
            result = await self.extract_text_from_image(test_data_url)
            return result.get("text") is not None
        except Exception as e:
            print(f"Vision API connection test failed: {e}")
            return False
