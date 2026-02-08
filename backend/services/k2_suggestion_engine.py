"""K2 suggestion generation service with deterministic stub fallback."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from services.k2think_client import K2ThinkClient


def _safe_json_loads(value: str) -> Any:
    try:
        return json.loads(value)
    except Exception:
        return None


def _extract_json_block(text: str) -> Any:
    text = text.strip()
    direct = _safe_json_loads(text)
    if direct is not None:
        return direct

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if match:
        parsed = _safe_json_loads(match.group(0))
        if parsed is not None:
            return parsed
    return None


def _stub_suggestions(
    doc_chunks: List[Dict[str, Any]],
    aoi_metrics: List[Dict[str, Any]],
    org_prefs: Dict[str, Any],
    max_suggestions: int,
) -> List[Dict[str, Any]]:
    """Deterministic suggestions so end-to-end flow works without external API."""
    by_aoi = {m.get("aoi_key"): m for m in aoi_metrics}
    suggestions: List[Dict[str, Any]] = []

    sorted_chunks = sorted(
        doc_chunks,
        key=lambda c: (
            by_aoi.get(c.get("aoi_key"), {}).get("confusion_flags", 0),
            by_aoi.get(c.get("aoi_key"), {}).get("dwell_ms", 0),
            by_aoi.get(c.get("aoi_key"), {}).get("regressions", 0),
        ),
        reverse=True,
    )

    tone = org_prefs.get("tone", "clear, concise, and onboarding-friendly")
    compliance = org_prefs.get("compliance", "No speculative claims")

    for chunk in sorted_chunks[:max_suggestions]:
        aoi_key = chunk.get("aoi_key")
        snippet = (chunk.get("text") or "").strip()
        if not snippet:
            continue

        metric = by_aoi.get(aoi_key, {})
        confusion_flags = metric.get("confusion_flags", 0)
        regressions = metric.get("regressions", 0)

        suggestion_type = "clarify"
        if regressions >= 2:
            suggestion_type = "add_example"
        elif confusion_flags >= 3:
            suggestion_type = "define_terms"

        if suggestion_type == "add_example":
            proposed_text = (
                f"{snippet}\n\nExample: In practice, this means the user should complete this step "
                "before moving to the next section to avoid setup errors."
            )
            risk_flags = ["length_increase"]
        elif suggestion_type == "define_terms":
            proposed_text = (
                f"{snippet}\n\nDefinition: Add a one-sentence definition for the key term in this paragraph "
                "before using it in instructions."
            )
            risk_flags = ["terminology_change"]
        else:
            proposed_text = (
                "Rewritten for clarity: "
                + snippet[:1].upper()
                + snippet[1:]
            )
            risk_flags = []

        suggestions.append(
            {
                "aoi_key": aoi_key,
                "title": "Improve clarity in confusing section",
                "proposed_text": proposed_text,
                "rationale": (
                    f"High attention friction observed (confusion_flags={confusion_flags}, "
                    f"regressions={regressions}). Tone: {tone}. Constraint: {compliance}."
                ),
                "risk_flags": risk_flags,
                "source": "k2_stub",
            }
        )

    return suggestions


async def k2_generate_suggestions(
    doc_chunks: List[Dict[str, Any]],
    aoi_metrics: List[Dict[str, Any]],
    org_prefs: Dict[str, Any] | None = None,
    max_suggestions: int = 5,
    use_live_k2: bool = False,
) -> List[Dict[str, Any]]:
    """
    Interface contract:
    k2_generate_suggestions(doc_chunks, aoi_metrics, org_prefs) -> suggestions[]

    If live K2 call fails, gracefully falls back to deterministic stub suggestions.
    """
    prefs = org_prefs or {}

    if not use_live_k2:
        return _stub_suggestions(doc_chunks, aoi_metrics, prefs, max_suggestions)

    try:
        client = K2ThinkClient()
        prompt = {
            "task": "Generate actionable Google Docs edit suggestions",
            "requirements": [
                "Anchor every suggestion to aoi_key from input chunks",
                "Return JSON only",
                "Keep edits concise and enterprise-safe",
                "Include rationale based on metrics",
            ],
            "org_prefs": prefs,
            "max_suggestions": max_suggestions,
            "doc_chunks": doc_chunks,
            "aoi_metrics": aoi_metrics,
            "response_schema": {
                "suggestions": [
                    {
                        "aoi_key": "string",
                        "title": "string",
                        "proposed_text": "string",
                        "rationale": "string",
                        "risk_flags": ["string"],
                    }
                ]
            },
        }

        response = await client.reason(
            query=json.dumps(prompt, ensure_ascii=False),
            context="You are an enterprise documentation improvement assistant.",
            max_steps=8,
            temperature=0.2,
        )

        raw_text = ""
        choices = response.get("choices") if isinstance(response, dict) else None
        if isinstance(choices, list) and choices:
            raw_text = (
                choices[0].get("message", {}).get("content", "")
                if isinstance(choices[0], dict)
                else ""
            )
        if not raw_text:
            raw_text = json.dumps(response)

        parsed = _extract_json_block(raw_text)
        if isinstance(parsed, dict) and isinstance(parsed.get("suggestions"), list):
            out = []
            for item in parsed["suggestions"][:max_suggestions]:
                if not isinstance(item, dict):
                    continue
                out.append(
                    {
                        "aoi_key": item.get("aoi_key"),
                        "title": item.get("title", "Improve clarity"),
                        "proposed_text": item.get("proposed_text", ""),
                        "rationale": item.get("rationale", ""),
                        "risk_flags": item.get("risk_flags", []),
                        "source": "k2_live",
                    }
                )
            if out:
                return out
    except Exception:
        pass

    return _stub_suggestions(doc_chunks, aoi_metrics, prefs, max_suggestions)
