"""
Analyze route
Provides the /analyze endpoint that the Chrome extension calls.

This replaces the old test.py mock server. It accepts text + URL from the
extension and runs it through the agent orchestrator (or returns a simple
analysis when agents are unavailable).
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, List
import json

router = APIRouter()


class AnalyzeRequest(BaseModel):
    """Request body for POST /analyze"""
    url: str = ""
    text: str = ""
    sessionId: Optional[str] = None


class AnalyzeResponse(BaseModel):
    """Response matching the format the extension expects"""
    summary: str
    confusion_points: List[str]
    image_queries: List[str]


@router.post("", response_model=AnalyzeResponse)
async def analyze_content(req: AnalyzeRequest):
    """
    POST /analyze
    Analyse extracted page text and return a summary, confusion points,
    and image search queries.

    Tries the agent pipeline first (Gemini / K2-Think).
    Falls back to a simple heuristic if AI services are unavailable.
    """

    text = (req.text or "").strip()
    url = req.url or ""

    # --- Try the real agent pipeline -------------------------------------------
    try:
        from services.agent_orchestrator import AgentOrchestrator

        orchestrator = AgentOrchestrator()
        capture_result = {
            "success": True,
            "data": {
                "text": text[:3000],
                "content_type": "article",
                "url": url,
                "metadata": {"source": "extension_analyze"},
            },
        }

        result = await orchestrator.process_user_interaction(
            user_id="extension_anonymous",
            capture_result=capture_result,
        )

        if result.get("success") and result.get("data"):
            agents = result["data"].get("agents", {})
            agent4 = agents.get("4.0") or agents.get("explanation_composer") or {}
            instant = agent4.get("instant_hud") or {}

            summary = instant.get("summary") or instant.get("body") or ""
            key_points = instant.get("key_points") or []

            if summary:
                return AnalyzeResponse(
                    summary=summary,
                    confusion_points=key_points[:5] if key_points else _default_questions(text),
                    image_queries=_image_queries(text),
                )
    except Exception as e:
        # Agents unavailable — fall through to heuristic
        print(f"[analyze] Agent pipeline unavailable, using heuristic: {e}")

    # --- Heuristic fallback ----------------------------------------------------
    sentences = [s.strip() for s in text.split(".")[:4] if s.strip()]
    summary = ". ".join(sentences) + "." if sentences else f"Content from {url}"

    return AnalyzeResponse(
        summary=summary,
        confusion_points=_default_questions(text),
        image_queries=_image_queries(text),
    )


def _default_questions(text: str) -> list[str]:
    """Generate simple confusion-point placeholders."""
    return [
        "What is the main topic?",
        "How does this relate to common knowledge?",
        "Are there any unfamiliar terms?",
    ]


def _image_queries(text: str) -> list[str]:
    """Generate image search suggestions from the content."""
    words = text.split()[:8]
    topic = " ".join(words) if words else "topic"
    return [
        f"Diagram explaining {topic}",
        "Graph of related statistics",
        "Real-world example photos",
    ]
