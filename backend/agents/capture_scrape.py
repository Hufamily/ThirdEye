"""
Agent 1.0: Capture & Scrape
"The Eyes" - Content Extraction
Captures text content under cursor when user dwells for 2 seconds
"""

from typing import Dict, Any, Optional, List
from .base_agent import BaseAgent
from services.google_drive_client import GoogleDriveClient
from services.vision_client import VisionClient
import re
from urllib.parse import urlparse
import hashlib


class CaptureScrape(BaseAgent):
    """
    Agent 1.0: Capture & Scrape
    Extracts content from web pages and Google Docs based on cursor position
    """
    
    def __init__(self):
        super().__init__(
            agent_id="1.0",
            agent_name="Capture & Scrape",
            agent_version="1.0.0"
        )
        # Initialize vision client for screenshot processing
        try:
            self.vision_client = VisionClient()
        except Exception as e:
            print(f"Warning: Vision client initialization failed: {e}")
            self.vision_client = None
        
        # Simple cache for vision results (in-memory, could be moved to Redis)
        self._vision_cache = {}
    
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract content from page based on cursor position
        
        Input:
            {
                "url": "string",
                "cursor_position": {"x": int, "y": int},
                "dwell_time_ms": int (optional, default 2000),
                "context_lines": int (optional, default 10),
                "page_content": Dict (optional) - DOM structure or page text,
                "google_access_token": str (optional) - for Google Docs,
                "screenshot": str (optional) - base64 data URL of screenshot,
                "text_extraction": str (optional) - pre-extracted text from DOM
            }
        
        Returns:
            {
                "success": bool,
                "data": {
                    "extracted_text": str,
                    "context_before": str,
                    "context_after": str,
                    "source_type": "google_docs" | "web_page" | "pdf",
                    "text_source": "hybrid" | "dom" | "vision",
                    "screenshot_used": bool,
                    "vision_confidence": float (optional),
                    "content_types_detected": List[str] (optional),
                    "metadata": Dict
                }
            }
        """
        try:
            self.validate_input(input_data, ["url", "cursor_position"])
            
            url = input_data["url"]
            cursor_pos = input_data["cursor_position"]
            dwell_time = input_data.get("dwell_time_ms", 2000)
            context_lines = input_data.get("context_lines", 10)
            screenshot = input_data.get("screenshot")
            text_extraction = input_data.get("text_extraction")
            
            # Determine source type
            source_type = self._detect_source_type(url)
            
            # Try text extraction first (if provided or available)
            text_result = None
            if text_extraction:
                text_result = text_extraction
            else:
                # Extract content based on source type (traditional method)
                if source_type == "google_docs":
                    text_result_data = await self._extract_from_google_docs(
                        url, cursor_pos, context_lines, input_data.get("google_access_token")
                    )
                    text_result = text_result_data.get("extracted_text", "")
                elif source_type == "pdf":
                    text_result_data = await self._extract_from_pdf(
                        url, cursor_pos, context_lines, input_data.get("page_content")
                    )
                    text_result = text_result_data.get("extracted_text", "")
                else:
                    # Regular web page
                    text_result_data = await self._extract_from_web_page(
                        url, cursor_pos, context_lines, input_data.get("page_content")
                    )
                    text_result = text_result_data.get("extracted_text", "")
            
            # Use hybrid extraction if screenshot is provided
            if screenshot:
                result = await self._extract_hybrid(
                    screenshot, text_result, url, cursor_pos, context_lines, source_type
                )
            else:
                # Fallback to traditional extraction result
                if source_type == "google_docs":
                    result = await self._extract_from_google_docs(
                        url, cursor_pos, context_lines, input_data.get("google_access_token")
                    )
                elif source_type == "pdf":
                    result = await self._extract_from_pdf(
                        url, cursor_pos, context_lines, input_data.get("page_content")
                    )
                else:
                    result = await self._extract_from_web_page(
                        url, cursor_pos, context_lines, input_data.get("page_content")
                    )
                # Add text_source metadata
                result["text_source"] = "dom"
                result["screenshot_used"] = False
            
            return self.create_response(success=True, data=result)
            
        except ValueError as e:
            return self.create_response(success=False, error=str(e))
        except Exception as e:
            return self.create_response(success=False, error=f"Content extraction failed: {str(e)}")
    
    def _detect_source_type(self, url: str) -> str:
        """Detect the type of content source"""
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        
        # Google Docs
        if "docs.google.com" in hostname and "/document/" in url:
            return "google_docs"
        
        # PDF files
        if url.endswith(".pdf") or "pdf" in parsed.path.lower():
            return "pdf"
        
        # Default to web page
        return "web_page"
    
    async def _extract_from_google_docs(
        self,
        url: str,
        cursor_pos: Dict[str, int],
        context_lines: int,
        access_token: Optional[str]
    ) -> Dict[str, Any]:
        """Extract content from Google Docs using Drive API"""
        
        if not access_token:
            return {
                "extracted_text": "",
                "context_before": "",
                "context_after": "",
                "source_type": "google_docs",
                "metadata": {
                    "error": "Google access token required for Google Docs extraction",
                    "url": url
                }
            }
        
        try:
            # Extract document ID from URL
            doc_id = self._extract_google_doc_id(url)
            if not doc_id:
                raise ValueError("Could not extract Google Doc ID from URL")
            
            # Use Google Drive client to get document content
            drive_client = GoogleDriveClient(access_token)
            full_content = drive_client.get_file_content(doc_id)
            
            if not full_content:
                return {
                    "extracted_text": "",
                    "context_before": "",
                    "context_after": "",
                    "source_type": "google_docs",
                    "metadata": {
                        "error": "Could not fetch document content",
                        "doc_id": doc_id
                    }
                }
            
            # For now, extract text around cursor position
            # In a full implementation, we'd use Google Docs API to get precise position
            # This is a simplified version that extracts text around the middle
            lines = full_content.split('\n')
            total_lines = len(lines)
            
            # Estimate line number from cursor Y position (simplified)
            # In real implementation, would map pixel Y to line number
            estimated_line = max(0, min(total_lines - 1, total_lines // 2))
            
            # Extract context window
            start_line = max(0, estimated_line - context_lines)
            end_line = min(total_lines, estimated_line + context_lines + 1)
            
            context_before = '\n'.join(lines[start_line:estimated_line])
            extracted_text = lines[estimated_line] if estimated_line < total_lines else ""
            context_after = '\n'.join(lines[estimated_line + 1:end_line])
            
            return {
                "extracted_text": extracted_text,
                "context_before": context_before,
                "context_after": context_after,
                "source_type": "google_docs",
                "metadata": {
                    "doc_id": doc_id,
                    "url": url,
                    "line_number": estimated_line,
                    "total_lines": total_lines,
                    "cursor_position": cursor_pos
                }
            }
            
        except Exception as e:
            return {
                "extracted_text": "",
                "context_before": "",
                "context_after": "",
                "source_type": "google_docs",
                "metadata": {
                    "error": str(e),
                    "url": url
                }
            }
    
    async def _extract_from_web_page(
        self,
        url: str,
        cursor_pos: Dict[str, int],
        context_lines: int,
        page_content: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Extract content from regular web page using DOM or text content"""
        
        if not page_content:
            return {
                "extracted_text": "",
                "context_before": "",
                "context_after": "",
                "source_type": "web_page",
                "metadata": {
                    "error": "Page content not provided",
                    "url": url
                }
            }
        
        try:
            # If page_content has structured DOM, extract from element at cursor
            # Otherwise, extract from text content
            
            text_content = page_content.get("text", "")
            if not text_content:
                # Try to extract from DOM structure
                dom_elements = page_content.get("elements", [])
                if dom_elements:
                    # Find element closest to cursor position
                    closest_element = self._find_closest_element(dom_elements, cursor_pos)
                    if closest_element:
                        text_content = closest_element.get("text", "")
            
            if not text_content:
                return {
                    "extracted_text": "",
                    "context_before": "",
                    "context_after": "",
                    "source_type": "web_page",
                    "metadata": {
                        "error": "No text content found",
                        "url": url
                    }
                }
            
            # Extract text around cursor position
            lines = text_content.split('\n')
            total_lines = len(lines)
            
            # Estimate line from cursor Y position
            # Simplified: assume ~20px per line
            estimated_line = max(0, min(total_lines - 1, cursor_pos.get("y", 0) // 20))
            
            start_line = max(0, estimated_line - context_lines)
            end_line = min(total_lines, estimated_line + context_lines + 1)
            
            context_before = '\n'.join(lines[start_line:estimated_line])
            extracted_text = lines[estimated_line] if estimated_line < total_lines else ""
            context_after = '\n'.join(lines[estimated_line + 1:end_line])
            
            return {
                "extracted_text": extracted_text,
                "context_before": context_before,
                "context_after": context_after,
                "source_type": "web_page",
                "metadata": {
                    "url": url,
                    "line_number": estimated_line,
                    "total_lines": total_lines,
                    "cursor_position": cursor_pos
                }
            }
            
        except Exception as e:
            return {
                "extracted_text": "",
                "context_before": "",
                "context_after": "",
                "source_type": "web_page",
                "metadata": {
                    "error": str(e),
                    "url": url
                }
            }
    
    async def _extract_from_pdf(
        self,
        url: str,
        cursor_pos: Dict[str, int],
        context_lines: int,
        page_content: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Extract content from PDF"""
        
        # PDF extraction would require PDF parsing library
        # For now, return placeholder
        return {
            "extracted_text": "",
            "context_before": "",
            "context_after": "",
            "source_type": "pdf",
            "metadata": {
                "error": "PDF extraction not yet implemented",
                "url": url,
                "note": "Requires PDF parsing library (PyPDF2, pdfplumber, etc.)"
            }
        }
    
    def _extract_google_doc_id(self, url: str) -> Optional[str]:
        """Extract Google Doc ID from URL"""
        # Google Docs URL format: https://docs.google.com/document/d/{DOC_ID}/edit
        match = re.search(r'/document/d/([a-zA-Z0-9-_]+)', url)
        if match:
            return match.group(1)
        return None
    
    def _find_closest_element(
        self,
        elements: List[Dict[str, Any]],
        cursor_pos: Dict[str, int]
    ) -> Optional[Dict[str, Any]]:
        """Find DOM element closest to cursor position"""
        if not elements:
            return None
        
        cursor_x = cursor_pos.get("x", 0)
        cursor_y = cursor_pos.get("y", 0)
        
        closest = None
        min_distance = float('inf')
        
        for element in elements:
            bounds = element.get("bounds", {})
            elem_x = bounds.get("x", 0) + bounds.get("width", 0) / 2
            elem_y = bounds.get("y", 0) + bounds.get("height", 0) / 2
            
            distance = ((cursor_x - elem_x) ** 2 + (cursor_y - elem_y) ** 2) ** 0.5
            
            if distance < min_distance:
                min_distance = distance
                closest = element
        
        return closest
    
    async def _extract_hybrid(
        self,
        screenshot: str,
        text_extraction: Optional[str],
        url: str,
        cursor_pos: Dict[str, int],
        context_lines: int,
        source_type: str
    ) -> Dict[str, Any]:
        """
        Hybrid extraction: Combine text extraction + vision model results
        
        Args:
            screenshot: Base64 data URL of screenshot
            text_extraction: Pre-extracted text from DOM (optional)
            url: Page URL
            cursor_pos: Cursor position
            context_lines: Number of context lines
            source_type: Source type (google_docs, web_page, pdf)
            
        Returns:
            Combined extraction result
        """
        vision_result = None
        vision_confidence = 0.0
        content_types = []
        
        # Check cache first
        screenshot_hash = self._get_screenshot_hash(screenshot)
        cached_result = self._vision_cache.get(screenshot_hash)
        
        if cached_result:
            vision_result = cached_result
            vision_confidence = vision_result.get("confidence", 0.0)
            content_types = vision_result.get("content_types", [])
        elif self.vision_client:
            try:
                # Extract text from screenshot using vision model
                vision_result = await self.vision_client.extract_structured_content(screenshot)
                vision_confidence = vision_result.get("confidence", 0.0)
                content_types = vision_result.get("content_types", [])
                
                # Cache the result
                self._vision_cache[screenshot_hash] = vision_result
                
                # Limit cache size (keep last 100)
                if len(self._vision_cache) > 100:
                    # Remove oldest entry (simple FIFO)
                    oldest_key = next(iter(self._vision_cache))
                    del self._vision_cache[oldest_key]
            except Exception as e:
                print(f"Vision extraction failed: {e}")
                vision_result = None
        
        # Combine results intelligently
        extracted_text = ""
        text_source = "dom"
        
        if text_extraction and len(text_extraction.strip()) > 50:
            # Text extraction has good content
            if vision_result and vision_result.get("text"):
                vision_text = vision_result.get("text", "").strip()
                # Combine: prefer text extraction, supplement with vision
                if len(vision_text) > len(text_extraction) * 1.5:
                    # Vision found significantly more content (likely canvas-rendered)
                    extracted_text = vision_text
                    text_source = "vision"
                else:
                    # Merge both, prioritizing text extraction
                    extracted_text = self._merge_texts(text_extraction, vision_text)
                    text_source = "hybrid"
            else:
                extracted_text = text_extraction
                text_source = "dom"
        elif vision_result and vision_result.get("text"):
            # No good text extraction, use vision
            extracted_text = vision_result.get("text", "")
            text_source = "vision"
        else:
            # Fallback: use whatever we have
            extracted_text = text_extraction or ""
            text_source = "dom"
        
        # Extract context (simplified - in full implementation would use vision for context too)
        lines = extracted_text.split('\n')
        total_lines = len(lines)
        estimated_line = max(0, min(total_lines - 1, total_lines // 2))
        
        start_line = max(0, estimated_line - context_lines)
        end_line = min(total_lines, estimated_line + context_lines + 1)
        
        context_before = '\n'.join(lines[start_line:estimated_line])
        context_after = '\n'.join(lines[estimated_line + 1:end_line])
        
        return {
            "extracted_text": extracted_text,
            "context_before": context_before,
            "context_after": context_after,
            "source_type": source_type,
            "text_source": text_source,
            "screenshot_used": True,
            "vision_confidence": vision_confidence if vision_result else None,
            "content_types_detected": content_types,
            "metadata": {
                "url": url,
                "cursor_position": cursor_pos,
                "line_number": estimated_line,
                "total_lines": total_lines,
                "screenshot_size": "400x400",  # Default from extension
                "ocr_confidence": vision_confidence if vision_result else None,
                "visual_elements": content_types
            }
        }
    
    def _merge_texts(self, text1: str, text2: str) -> str:
        """Intelligently merge two text extractions"""
        # Simple merge: combine unique lines
        lines1 = set(text1.split('\n'))
        lines2 = set(text2.split('\n'))
        
        # Combine unique lines, preserving order from text1
        merged_lines = []
        seen = set()
        
        for line in text1.split('\n'):
            if line.strip() and line not in seen:
                merged_lines.append(line)
                seen.add(line)
        
        # Add lines from text2 that aren't duplicates
        for line in text2.split('\n'):
            if line.strip() and line not in seen:
                merged_lines.append(line)
                seen.add(line)
        
        return '\n'.join(merged_lines)
    
    def _get_screenshot_hash(self, screenshot: str) -> str:
        """Generate hash for screenshot caching"""
        # Extract base64 part
        base64_part = self._extract_base64_from_data_url(screenshot) or screenshot
        return hashlib.md5(base64_part.encode()).hexdigest()
    
    def _extract_base64_from_data_url(self, data_url: str) -> Optional[str]:
        """Extract base64 string from data URL"""
        if not data_url:
            return None
        
        if data_url.startswith("data:image"):
            comma_index = data_url.find(",")
            if comma_index != -1:
                return data_url[comma_index + 1:]
        
        return data_url
