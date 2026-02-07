#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import warnings
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

AOIType = Literal[
    "paragraph",
    "heading",
    "equation",
    "code",
    "figure",
    "table",
    "footnote",
    "unknown",
]

ReaderState = Literal["confused", "interested", "skimming", "revising"]

# ===== K2 CONFIG PLACEHOLDERS (fill these or pass via CLI) =====
DEFAULT_K2_BASE_URL = 'API_BASE_URL_NOT_SET'
DEFAULT_K2_MODEL = "ENTER_MODEL_NAME_HERE"
DEFAULT_K2_API_KEY_ENV = "ENTER_API_KEY_HERE"


@dataclass
class AOIEvent:
    doc_id: str
    page: int | None
    aoi_id: str
    aoi_type: Literal[
        "paragraph",
        "heading",
        "equation",
        "code",
        "figure",
        "table",
        "footnote",
        "unknown",
    ]
    bbox_screen: tuple[int, int, int, int]
    text_hint: str | None
    state: Literal["confused", "interested", "skimming", "revising"]
    dwell_ms: int
    regressions: int
    timestamp_ms: int


@dataclass
class CropInput:
    image_path: str
    device_scale: float | None


@dataclass
class ActionCard:
    title: str
    body: str
    buttons: list[dict]


@dataclass
class AssistPayload:
    aoi_id: str
    doc_id: str
    state: str
    extracted_text: str
    detected_language: str
    actions: list[ActionCard]
    suggested_prompts: list[str]
    telemetry: dict


@dataclass
class K2Config:
    base_url: str
    model: str
    api_key_env: str


class DocTextProvider(Protocol):
    def get_text(self, doc_id: str, aoi_id: str) -> str | None:
        ...


class NullDocTextProvider:
    def get_text(self, doc_id: str, aoi_id: str) -> str | None:
        _ = (doc_id, aoi_id)
        return None


class LLMClient:
    def complete(self, prompt: str) -> str:
        clipped = " ".join(prompt.strip().split())[:120]
        return (
            "LLM_STUB_RESPONSE: Replace LLMClient.complete with your provider. "
            f"Prompt preview: {clipped}"
        )

    def metadata(self) -> dict[str, Any]:
        return {"mode": "stub"}


class K2LLMClient(LLMClient):
    def __init__(self, config: K2Config):
        self.config = config

    def complete(self, prompt: str) -> str:
        clipped = " ".join(prompt.strip().split())[:120]
        api_key = os.getenv(self.config.api_key_env, "").strip()

        if not self.config.base_url or self.config.base_url == DEFAULT_K2_BASE_URL:
            return (
                "K2_PLACEHOLDER_RESPONSE: set --k2_base_url or DEFAULT_K2_BASE_URL. "
                f"Prompt preview: {clipped}"
            )
        if not self.config.model or self.config.model == DEFAULT_K2_MODEL:
            return (
                "K2_PLACEHOLDER_RESPONSE: set --k2_model or DEFAULT_K2_MODEL. "
                f"Prompt preview: {clipped}"
            )
        if not api_key:
            return (
                f"K2_PLACEHOLDER_RESPONSE: set env var {self.config.api_key_env}. "
                f"Prompt preview: {clipped}"
            )

        return (
            "K2_READY_PLACEHOLDER: credentials and model configured. "
            "Replace K2LLMClient.complete with your live API request call. "
            f"Prompt preview: {clipped}"
        )

    def metadata(self) -> dict[str, Any]:
        return {
            "mode": "k2_placeholder",
            "k2_base_url": self.config.base_url,
            "k2_model": self.config.model,
            "k2_api_key_env": self.config.api_key_env,
            "k2_api_key_present": bool(os.getenv(self.config.api_key_env, "").strip()),
        }


def _word_limit(text: str, limit: int = 60) -> str:
    words = text.split()
    if len(words) <= limit:
        return text.strip()
    return " ".join(words[:limit]).strip() + "..."


def _first_sentence(text: str, fallback: str) -> str:
    clean = text.strip()
    if not clean:
        return fallback
    bits = re.split(r"(?<=[.!?])\s+", clean)
    if not bits:
        return fallback
    return bits[0]


def _clean_text(raw_text: str, preserve_layout: bool = False) -> str:
    if not raw_text:
        return ""

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"([A-Za-z0-9])-\s*\n\s*([A-Za-z0-9])", r"\1\2", text)

    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if re.fullmatch(r"[|¦`~^_*]{1,3}", stripped or " "):
            continue
        if len(stripped) == 1 and not stripped.isalnum():
            continue
        if preserve_layout:
            cleaned_lines.append(line.rstrip())
        else:
            cleaned_lines.append(stripped)

    text = "\n".join(cleaned_lines)
    text = re.sub(r"\n{2,}", "\n", text)
    if not preserve_layout:
        text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _detect_language(text: str) -> str:
    if not text.strip():
        return "unknown"
    ascii_letters = sum(ch.isascii() and ch.isalpha() for ch in text)
    alpha = sum(ch.isalpha() for ch in text)
    if alpha == 0:
        return "unknown"
    if ascii_letters / alpha > 0.85:
        return "en"
    return "unknown"


def _safe_open_image(image_path: str):
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return None, "Pillow import failed"
    try:
        return Image.open(image_path), None
    except Exception as exc:
        return None, str(exc)


def _run_ocr(image_path: str) -> tuple[str, dict[str, Any]]:
    meta: dict[str, Any] = {
        "ocr_available": False,
        "ocr_used": False,
        "ocr_confidence": 0.0,
        "ocr_error": None,
    }
    try:
        import pytesseract  # type: ignore
    except Exception:
        warnings.warn(
            "pytesseract is not available. Proceeding with image-only flow.",
            RuntimeWarning,
        )
        return "", meta

    image, image_error = _safe_open_image(image_path)
    if image is None:
        meta["ocr_error"] = f"Image open failed: {image_error}"
        warnings.warn(
            "OCR skipped because image could not be opened. Proceeding with image-only flow.",
            RuntimeWarning,
        )
        return "", meta

    try:
        text = pytesseract.image_to_string(image)
        meta["ocr_available"] = True
        meta["ocr_used"] = True

        confidence = 0.0
        try:
            data = pytesseract.image_to_data(
                image, output_type=pytesseract.Output.DICT
            )
            conf_values = []
            for raw_conf in data.get("conf", []):
                try:
                    conf = float(raw_conf)
                except Exception:
                    continue
                if conf >= 0:
                    conf_values.append(conf)
            if conf_values:
                confidence = sum(conf_values) / len(conf_values)
        except Exception:
            confidence = 0.0

        meta["ocr_confidence"] = round(confidence, 3)
        return text, meta
    except Exception as exc:
        meta["ocr_error"] = str(exc)
        warnings.warn(
            "OCR execution failed. Proceeding with image-only flow.",
            RuntimeWarning,
        )
        return "", meta


def _infer_text_type_scores(text: str) -> dict[str, int]:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    lower = text.lower()

    eq_symbols = len(re.findall(r"[=+\-/*^∑Σ∫√<>]", text))
    eq_like_vars = len(re.findall(r"\b[A-Za-z][A-Za-z0-9_]*\s*=\s*[-+/*()A-Za-z0-9_]", text))
    eq_funcs = len(re.findall(r"\b(sin|cos|tan|log|ln|lim|sum|prod)\b", lower))
    equation_score = eq_symbols + (2 * eq_like_vars) + eq_funcs

    code_keywords = [
        "def",
        "class",
        "return",
        "import",
        "if",
        "for",
        "while",
        "function",
        "const",
        "let",
        "var",
        "public",
        "private",
    ]
    kw_hits = sum(len(re.findall(rf"\b{kw}\b", lower)) for kw in code_keywords)
    indented = sum(1 for ln in lines if re.match(r"\s{2,}\S", ln))
    braces = len(re.findall(r"[{};]", text))
    code_score = (2 * kw_hits) + indented + braces

    col_like = 0
    for ln in lines:
        pieces = [p for p in re.split(r"\s{2,}|\t|\|", ln.strip()) if p]
        if len(pieces) >= 3:
            col_like += 1
    numbers = len(re.findall(r"\b\d+(?:\.\d+)?\b", text))
    table_score = (2 * col_like) + min(numbers, 10)

    return {
        "equation": equation_score,
        "code": code_score,
        "table": table_score,
    }


def _infer_from_image_only(image_path: str) -> tuple[AOIType, dict[str, Any]]:
    info: dict[str, Any] = {"image_only_heuristic": "none"}
    image, err = _safe_open_image(image_path)
    if image is None:
        info["image_only_heuristic"] = f"image unavailable ({err})"
        return "unknown", info

    width, height = image.size
    ratio = width / max(height, 1)
    info["image_size"] = [width, height]
    info["aspect_ratio"] = round(ratio, 3)

    if ratio > 2.4:
        info["image_only_heuristic"] = "wide block -> code"
        return "code", info
    if ratio > 1.6:
        info["image_only_heuristic"] = "moderately wide block -> table"
        return "table", info
    if ratio < 0.9:
        info["image_only_heuristic"] = "tall block -> figure"
        return "figure", info
    info["image_only_heuristic"] = "default readable block -> paragraph"
    return "paragraph", info


def _infer_aoi_type(
    provided_type: AOIType, text: str, image_path: str, prefer_image_only: bool
) -> tuple[AOIType, dict[str, Any]]:
    telemetry: dict[str, Any] = {"provided_aoi_type": provided_type}

    if provided_type != "unknown":
        telemetry["type_resolution"] = "used_provided_type"
        return provided_type, telemetry

    if not prefer_image_only and text.strip():
        scores = _infer_text_type_scores(text)
        telemetry["type_scores"] = scores
        best = max(scores, key=scores.get)
        if scores[best] >= 4:
            telemetry["type_resolution"] = "inferred_from_text"
            return best, telemetry

    inferred, image_info = _infer_from_image_only(image_path)
    telemetry.update(image_info)
    telemetry["type_resolution"] = "inferred_from_image"
    return inferred, telemetry


def _extract_key_terms(text: str, k: int = 3) -> list[str]:
    stop = {
        "this",
        "that",
        "with",
        "from",
        "have",
        "they",
        "there",
        "their",
        "which",
        "about",
        "into",
        "because",
        "while",
        "where",
        "when",
        "what",
        "your",
        "using",
    }
    tokens = re.findall(r"\b[A-Za-z][A-Za-z\-]{3,}\b", text.lower())
    freq: dict[str, int] = {}
    for token in tokens:
        if token in stop:
            continue
        freq[token] = freq.get(token, 0) + 1
    ranked = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    return [w for w, _ in ranked[:k]]


def _extract_equation_variables(text: str, k: int = 5) -> list[str]:
    tokens = re.findall(r"\b[A-Za-z][A-Za-z0-9_]*\b", text)
    blocked = {"sin", "cos", "tan", "log", "ln", "sum", "prod", "min", "max"}
    uniq: list[str] = []
    for token in tokens:
        if token.lower() in blocked:
            continue
        if token not in uniq:
            uniq.append(token)
    return uniq[:k]


def _extract_term_definitions(text: str, k: int = 2) -> list[str]:
    matches = re.findall(r"\b([A-Za-z][A-Za-z0-9_-]{2,})\s+is\s+([^.;:\n]{3,50})", text)
    defs: list[str] = []
    for term, meaning in matches:
        defs.append(f"{term}: {meaning.strip()}")
        if len(defs) >= k:
            return defs

    for term in _extract_key_terms(text, k=k):
        defs.append(f"{term}: key concept in this passage")
    return defs[:k]


def _extract_code_annotations(text: str, k: int = 3) -> list[str]:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []

    notes: list[str] = []
    for idx, line in enumerate(lines[:k], start=1):
        stripped = line.strip()
        if idx == 1:
            notes.append(f"L1 sets context: {stripped}")
        elif "for " in stripped or "while " in stripped:
            notes.append(f"L{idx} iterates: {stripped}")
        elif "return" in stripped:
            notes.append(f"L{idx} returns result: {stripped}")
        elif "=" in stripped:
            notes.append(f"L{idx} updates state: {stripped}")
        else:
            notes.append(f"L{idx}: {stripped}")
    return notes


def _quick_focus_options(aoi_type: AOIType) -> tuple[str, str]:
    if aoi_type == "equation":
        return "variable meanings", "the transformation step"
    if aoi_type == "code":
        return "overall flow", "a specific line"
    if aoi_type in {"figure", "table"}:
        return "what each axis/column means", "the core takeaway"
    return "main idea", "a specific term"


def _default_buttons(include_flashcards: bool) -> list[dict]:
    buttons = [
        {"label": "Explain", "action_id": "explain_short"},
        {"label": "Explain deeper", "action_id": "explain_expanded"},
        {"label": "Dismiss", "action_id": "dismiss"},
        {"label": "I already know this", "action_id": "feedback_known"},
    ]
    if include_flashcards:
        buttons.append({"label": "Make flashcards", "action_id": "make_flashcards"})
    return buttons


def _make_cards(aoi_type: AOIType, state: ReaderState, text: str) -> list[ActionCard]:
    include_flashcards = len(text.split()) >= 35
    buttons = _default_buttons(include_flashcards)
    summary = _first_sentence(
        text,
        "Text extraction was limited. I can still explain this region from AOI type.",
    )

    cards: list[ActionCard] = []
    if state == "confused":
        if aoi_type == "equation":
            vars_hint = ", ".join(_extract_equation_variables(text)) or "key symbols"
            body = (
                f"Start here: variables are {vars_hint}. Then follow each equation step left-to-right. "
                "Common pitfall: sign changes during rearrangement."
            )
        elif aoi_type == "code":
            annotations = "; ".join(_extract_code_annotations(text, k=3)) or "L1 defines context; later lines transform data."
            body = (
                f"What it does: transforms inputs into output. Key lines: {annotations}. "
                "Try modifying one input value to see behavior."
            )
        elif aoi_type in {"figure", "table"}:
            body = (
                "It shows relationships across axes/columns. Key takeaway: identify strongest trend first, "
                "then inspect any outlier. Look for scale or unit changes."
            )
        else:
            terms = ", ".join(_extract_key_terms(text)) or "key terms"
            defs = "; ".join(_extract_term_definitions(text, k=2))
            body = f"Summary: {summary} Terms: {terms}. Definitions: {defs or 'Term meanings can be clarified on click.'}"

        x, y = _quick_focus_options(aoi_type)
        check = f"Is the confusing part {x} or {y}?"
        cards.append(ActionCard("Direct explanation", _word_limit(body), buttons))
        cards.append(ActionCard("Quick check", _word_limit(check), buttons))

    elif state == "interested":
        if aoi_type == "equation":
            body1 = "I can break this equation into variable roles, then walk each algebraic step in order."
            body2 = "Example path: plug simple numbers into the equation to see how each term changes the result."
        elif aoi_type == "code":
            ann = "; ".join(_extract_code_annotations(text, k=2)) or "line-level annotations available"
            body1 = f"I can explain full control flow and annotate key lines ({ann})."
            body2 = "Example path: modify one input or branch condition, then trace how output changes."
        elif aoi_type in {"figure", "table"}:
            body1 = "I can interpret what this visual implies beyond the obvious trend."
            body2 = "Example path: compare two rows/series and test whether the difference is meaningful."
        else:
            body1 = f"Deeper take: {summary}"
            body2 = "Example path: I can connect this paragraph to a practical scenario."
        cards.append(ActionCard("Deeper view", _word_limit(body1), buttons))
        cards.append(ActionCard("Concrete example", _word_limit(body2), buttons))

    elif state == "skimming":
        bullets = []
        if aoi_type == "equation":
            bullets = ["identify variables", "follow operation order", "watch sign changes"]
        elif aoi_type == "code":
            bullets = ["purpose", "annotated key lines", "one safe modification"]
        elif aoi_type in {"figure", "table"}:
            bullets = ["what is measured", "largest change", "main takeaway"]
        else:
            bullets = ["main claim", "support detail", "term definitions"]
        tldr = (
            f"TL;DR: {summary} "
            f"- {bullets[0]}; - {bullets[1]}; - {bullets[2]}."
        )
        cards.append(ActionCard("TL;DR", _word_limit(tldr), buttons))

    else:  # revising
        if aoi_type == "equation":
            k1 = "Key points: variable definitions and operation sequence."
            k2 = "Common mistakes: sign errors and skipping substitutions. Recall prompt: which term dominates output?"
        elif aoi_type == "code":
            k1 = "Key points: what code does, key line annotations, and data flow."
            k2 = "Common mistakes: missed edge cases and state assumptions. Recall prompt: what single change alters output most?"
        elif aoi_type in {"figure", "table"}:
            k1 = "Key points: what each axis/column encodes, strongest trend, and where to focus next."
            k2 = "Common mistakes: comparing incompatible scales. Recall prompt: which data point best supports the conclusion?"
        else:
            defs = "; ".join(_extract_term_definitions(text, k=2))
            k1 = f"Key points: {summary} Definitions: {defs or 'review key terms.'}"
            k2 = "Common mistakes: blending similar terms. Recall prompt: can you restate the central claim in one sentence?"
        cards.append(ActionCard("Revision keys", _word_limit(k1), buttons))
        cards.append(ActionCard("Mistakes and recall", _word_limit(k2), buttons))

    return cards[:3]


def _build_prompt(
    *,
    action_id: str,
    variant: Literal["short", "expanded"],
    event: AOIEvent,
    inferred_type: AOIType,
    extracted_text: str,
) -> str:
    action_intent = {
        "explain_short": "Give a concise explanation suitable for immediate unblocking.",
        "explain_expanded": "Give a more detailed explanation with a worked example.",
        "make_flashcards": "Generate 5 flashcards (Q/A) focused on retention.",
    }.get(action_id, "Help the user with this AOI.")

    depth_instruction = (
        "Keep the answer under 120 words."
        if variant == "short"
        else "Provide step-by-step detail with one example."
    )

    text_block = extracted_text.strip() or "[No extracted text available]"
    return (
        "You are an assistive reading agent.\n"
        f"doc_id: {event.doc_id}\n"
        f"aoi_id: {event.aoi_id}\n"
        f"aoi_type: {inferred_type}\n"
        f"state: {event.state}\n"
        f"action_id: {action_id}\n"
        f"variant: {variant}\n\n"
        "Extracted AOI text:\n"
        f"{text_block}\n\n"
        "Task:\n"
        f"- {action_intent}\n"
        f"- {depth_instruction}\n"
        "- Match the user state (confused/interested/skimming/revising).\n"
        "- Do not assume missing context. If unclear, ask ONE concise question.\n"
    )


def _build_prompt_variants(
    event: AOIEvent, inferred_type: AOIType, extracted_text: str, include_flashcards: bool
) -> tuple[list[str], dict[str, dict[str, str]]]:
    action_ids = ["explain_short", "explain_expanded"]
    if include_flashcards:
        action_ids.append("make_flashcards")

    variants: dict[str, dict[str, str]] = {}
    prompts: list[str] = []
    for action_id in action_ids:
        variants[action_id] = {
            "short": _build_prompt(
                action_id=action_id,
                variant="short",
                event=event,
                inferred_type=inferred_type,
                extracted_text=extracted_text,
            ),
            "expanded": _build_prompt(
                action_id=action_id,
                variant="expanded",
                event=event,
                inferred_type=inferred_type,
                extracted_text=extracted_text,
            ),
        }
        prompts.append(f"[{action_id}|short]\n{variants[action_id]['short']}")
        prompts.append(f"[{action_id}|expanded]\n{variants[action_id]['expanded']}")
    return prompts, variants


def _acquire_text(
    event: AOIEvent, crop: CropInput, doc_text_provider: DocTextProvider
) -> tuple[str, dict[str, Any], bool]:
    telemetry: dict[str, Any] = {
        "text_source": "none",
        "ocr_used": False,
        "ocr_available": False,
        "ocr_confidence": 0.0,
    }

    raw_text = ""
    preserve_layout = event.aoi_type in {"equation", "code", "table"}

    if event.text_hint and len(event.text_hint.strip()) > 20:
        raw_text = event.text_hint
        telemetry["text_source"] = "text_hint"
    else:
        provider_text = doc_text_provider.get_text(event.doc_id, event.aoi_id)
        if provider_text and provider_text.strip():
            raw_text = provider_text
            telemetry["text_source"] = "doc_text_provider"
        else:
            ocr_text, ocr_meta = _run_ocr(crop.image_path)
            telemetry.update(ocr_meta)
            raw_text = ocr_text
            telemetry["text_source"] = "ocr" if ocr_text.strip() else "image_only"

    cleaned = _clean_text(raw_text, preserve_layout=preserve_layout)
    telemetry["raw_text_len"] = len(raw_text)
    telemetry["cleaned_text_len"] = len(cleaned)

    ocr_is_poor = telemetry["text_source"] in {"ocr", "image_only"} and (
        len(cleaned) < 20 or float(telemetry.get("ocr_confidence", 0.0)) < 25.0
    )
    telemetry["ocr_poor_or_empty"] = ocr_is_poor
    return cleaned, telemetry, ocr_is_poor


def _estimate_confidence(text_source: str, text_len: int, ocr_conf: float) -> float:
    base = {
        "text_hint": 0.92,
        "doc_text_provider": 0.85,
        "ocr": min(0.8, max(0.35, ocr_conf / 100.0)),
        "image_only": 0.28,
    }.get(text_source, 0.3)
    if text_len < 25:
        base -= 0.12
    return max(0.0, min(1.0, round(base, 3)))


def build_assist_payload(
    event: AOIEvent,
    crop: CropInput,
    doc_text_provider: DocTextProvider | None = None,
    llm_client: LLMClient | None = None,
) -> AssistPayload:
    if not Path(crop.image_path).exists():
        raise FileNotFoundError(
            f"image_path does not exist: {crop.image_path}. Provide a valid PNG/JPG crop path."
        )

    provider = doc_text_provider or NullDocTextProvider()
    llm = llm_client or LLMClient()

    extracted_text, text_meta, ocr_is_poor = _acquire_text(event, crop, provider)
    inferred_type, type_meta = _infer_aoi_type(
        event.aoi_type, extracted_text, crop.image_path, prefer_image_only=ocr_is_poor
    )

    actions = _make_cards(inferred_type, event.state, extracted_text)
    include_flashcards = any(
        btn.get("action_id") == "make_flashcards"
        for card in actions
        for btn in card.buttons
    )
    suggested_prompts, prompt_variants = _build_prompt_variants(
        event, inferred_type, extracted_text, include_flashcards
    )

    preview = llm.complete(prompt_variants["explain_short"]["short"])

    telemetry = {
        **text_meta,
        **type_meta,
        "confidence": _estimate_confidence(
            text_meta.get("text_source", "none"),
            len(extracted_text),
            float(text_meta.get("ocr_confidence", 0.0)),
        ),
        "device_scale": crop.device_scale,
        "llm_preview": preview,
        "llm_config": llm.metadata(),
        "prompt_variants": prompt_variants,
        "heuristics": {
            "priority_order": [
                "text_hint_if_len_gt_20",
                "doc_text_provider_get_text",
                "ocr_with_pytesseract",
                "image_only_type_heuristics",
            ],
            "state_routing_applied": event.state,
            "max_action_cards": 3,
        },
    }

    return AssistPayload(
        aoi_id=event.aoi_id,
        doc_id=event.doc_id,
        state=event.state,
        extracted_text=extracted_text,
        detected_language=_detect_language(extracted_text),
        actions=actions,
        suggested_prompts=suggested_prompts,
        telemetry=telemetry,
    )


def _parse_bbox(value: str) -> tuple[int, int, int, int]:
    parts = [p.strip() for p in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be x1,y1,x2,y2")
    try:
        nums = tuple(int(p) for p in parts)
    except Exception as exc:
        raise argparse.ArgumentTypeError("bbox must contain integers") from exc
    return nums  # type: ignore[return-value]


def _write_demo_image(path: Path, text: str) -> None:
    try:
        from PIL import Image, ImageDraw  # type: ignore

        image = Image.new("RGB", (960, 260), color="white")
        draw = ImageDraw.Draw(image)
        draw.text((20, 20), text, fill="black")
        image.save(path)
    except Exception:
        path.write_bytes(b"")


def run_examples() -> int:
    now_ms = int(time.time() * 1000)
    with tempfile.TemporaryDirectory(prefix="agent_action_examples_") as tmp:
        tmp_path = Path(tmp)

        paragraph_img = tmp_path / "paragraph.png"
        equation_img = tmp_path / "equation.png"
        code_img = tmp_path / "code.png"

        _write_demo_image(paragraph_img, "Example paragraph crop")
        _write_demo_image(equation_img, "E = mc^2")
        _write_demo_image(code_img, "def add(a, b): return a + b")

        events = [
            (
                AOIEvent(
                    doc_id="doc-paragraph",
                    page=1,
                    aoi_id="aoi-p-1",
                    aoi_type="paragraph",
                    bbox_screen=(100, 120, 700, 360),
                    text_hint=(
                        "Photosynthesis converts light energy into chemical energy. "
                        "Chlorophyll captures photons and drives glucose production."
                    ),
                    state="confused",
                    dwell_ms=920,
                    regressions=2,
                    timestamp_ms=now_ms,
                ),
                CropInput(image_path=str(paragraph_img), device_scale=2.0),
            ),
            (
                AOIEvent(
                    doc_id="doc-equation",
                    page=2,
                    aoi_id="aoi-e-1",
                    aoi_type="equation",
                    bbox_screen=(80, 140, 760, 320),
                    text_hint=(
                        "F = m * a where F is force, m is mass, and a is acceleration. "
                        "Rearrange as a = F / m."
                    ),
                    state="confused",
                    dwell_ms=1100,
                    regressions=3,
                    timestamp_ms=now_ms,
                ),
                CropInput(image_path=str(equation_img), device_scale=2.0),
            ),
            (
                AOIEvent(
                    doc_id="doc-code",
                    page=3,
                    aoi_id="aoi-c-1",
                    aoi_type="code",
                    bbox_screen=(120, 160, 860, 460),
                    text_hint=(
                        "def add_items(items):\n"
                        "    total = 0\n"
                        "    for item in items:\n"
                        "        total += item\n"
                        "    return total"
                    ),
                    state="confused",
                    dwell_ms=1000,
                    regressions=2,
                    timestamp_ms=now_ms,
                ),
                CropInput(image_path=str(code_img), device_scale=2.0),
            ),
        ]

        for idx, (event, crop) in enumerate(events, start=1):
            payload = build_assist_payload(event, crop)
            print(f"# Example {idx}")
            print(json.dumps(asdict(payload), indent=2))

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Step 8 Agent Action Layer: AOI crop + metadata -> AssistPayload JSON"
    )
    parser.add_argument("--run_examples", action="store_true")
    parser.add_argument("--image", help="Path to screenshot crop image (png/jpg)")
    parser.add_argument("--doc_id")
    parser.add_argument("--aoi_id")
    parser.add_argument(
        "--aoi_type",
        choices=[
            "paragraph",
            "heading",
            "equation",
            "code",
            "figure",
            "table",
            "footnote",
            "unknown",
        ],
    )
    parser.add_argument(
        "--state", choices=["confused", "interested", "skimming", "revising"]
    )
    parser.add_argument("--page", type=int, default=None)
    parser.add_argument("--bbox", type=_parse_bbox, default="0,0,0,0")
    parser.add_argument("--text_hint", default=None)
    parser.add_argument("--dwell_ms", type=int, default=0)
    parser.add_argument("--regressions", type=int, default=0)
    parser.add_argument("--timestamp_ms", type=int, default=int(time.time() * 1000))
    parser.add_argument("--device_scale", type=float, default=None)
    parser.add_argument("--llm_mode", choices=["stub", "k2"], default="stub")
    parser.add_argument("--k2_base_url", default=DEFAULT_K2_BASE_URL)
    parser.add_argument("--k2_model", default=DEFAULT_K2_MODEL)
    parser.add_argument("--k2_api_key_env", default=DEFAULT_K2_API_KEY_ENV)

    args = parser.parse_args()

    if args.run_examples:
        return run_examples()

    required = {
        "image": args.image,
        "doc_id": args.doc_id,
        "aoi_id": args.aoi_id,
        "aoi_type": args.aoi_type,
        "state": args.state,
    }
    missing = [k for k, v in required.items() if v is None]
    if missing:
        parser.error(f"missing required args (unless --run_examples): {', '.join(missing)}")

    image_path = str(args.image)
    if not Path(image_path).exists():
        print(
            f"Error: image_path does not exist: {image_path}. "
            "Provide a valid screenshot crop path.",
            file=sys.stderr,
        )
        return 1

    event = AOIEvent(
        doc_id=str(args.doc_id),
        page=args.page,
        aoi_id=str(args.aoi_id),
        aoi_type=args.aoi_type,  # type: ignore[arg-type]
        bbox_screen=args.bbox,
        text_hint=args.text_hint,
        state=args.state,  # type: ignore[arg-type]
        dwell_ms=args.dwell_ms,
        regressions=args.regressions,
        timestamp_ms=args.timestamp_ms,
    )
    crop = CropInput(image_path=image_path, device_scale=args.device_scale)

    llm_client: LLMClient
    if args.llm_mode == "k2":
        llm_client = K2LLMClient(
            K2Config(
                base_url=str(args.k2_base_url),
                model=str(args.k2_model),
                api_key_env=str(args.k2_api_key_env),
            )
        )
    else:
        llm_client = LLMClient()

    payload = build_assist_payload(event, crop, llm_client=llm_client)
    print(json.dumps(asdict(payload), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
