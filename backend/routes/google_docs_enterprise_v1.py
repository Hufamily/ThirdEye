"""Enterprise Google Docs integration v1 endpoints."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from routes.auth import get_current_user
from models.user import User
from services.k2_suggestion_engine import k2_generate_suggestions
from services.k2think_client import K2ThinkClient
from services.gemini_client import GeminiClient
from services.dedalus_client import DedalusClient
from utils.database import ensure_warehouse_resumed, get_db

router = APIRouter()

DB = settings.snowflake_database
SCHEMA = settings.snowflake_schema
T_AOI_MAP = f"{DB}.{SCHEMA}.AOI_MAP"
T_EVENTS = f"{DB}.{SCHEMA}.ATTENTION_EVENTS"
T_AGG = f"{DB}.{SCHEMA}.AOI_AGGREGATES"
T_SUG = f"{DB}.{SCHEMA}.DOC_SUGGESTIONS"
T_DOC = f"{DB}.{SCHEMA}.DOCUMENTS"
T_TOK = f"{DB}.{SCHEMA}.GOOGLE_USER_TOKENS"


class IngestEventPayload(BaseModel):
    org_id: str
    doc_id: str
    aoi_id: Optional[str] = None
    aoi_key: Optional[str] = None
    bbox: Optional[Dict[str, Any]] = None
    state: str = "neutral"
    dwell_ms: int = 0
    regressions: int = 0
    timestamp_ms: int = Field(default_factory=lambda: int(datetime.now(tz=timezone.utc).timestamp() * 1000))
    session_id: Optional[str] = None
    scroll_position: Optional[Dict[str, Any]] = None
    cursor_position: Optional[Dict[str, Any]] = None
    text_selection: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class IngestRequest(BaseModel):
    events: List[IngestEventPayload]


class DocSyncRequest(BaseModel):
    org_id: str
    google_doc_id: str
    google_access_token: str
    title: Optional[str] = None


class AssistRequest(BaseModel):
    org_id: str
    doc_id: str
    aoi_key: Optional[str] = None
    cursor_range: Optional[Dict[str, int]] = None
    selected_text: Optional[str] = None
    action: str = "explain"
    provider: str = "stub"
    google_access_token: Optional[str] = None


class SuggestRequest(BaseModel):
    doc_id: str
    org_prefs: Dict[str, Any] = Field(default_factory=dict)
    max_suggestions: int = 5
    use_live_k2: bool = False


class SuggestDecisionRequest(BaseModel):
    manager_note: Optional[str] = None
    google_access_token: Optional[str] = None


@dataclass
class TextSegment:
    text: str
    doc_start: int
    doc_end: int
    text_start: int
    text_end: int
    paragraph_index: int


@dataclass
class AoiRow:
    aoi_key: str
    heading_path: List[str]
    paragraph_index: int
    start_index: int
    end_index: int
    snippet: str


def _ensure_tables(db: Session) -> None:
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS {T_AOI_MAP} (
            DOC_ID STRING,
            ORG_ID STRING,
            AOI_KEY STRING,
            HEADING_PATH VARIANT,
            PARAGRAPH_INDEX NUMBER,
            START_INDEX NUMBER,
            END_INDEX NUMBER,
            SNIPPET STRING,
            ANCHOR VARIANT,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (DOC_ID, AOI_KEY)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {T_EVENTS} (
            EVENT_ID STRING,
            ORG_ID STRING,
            DOC_ID STRING,
            USER_ID STRING,
            SESSION_ID STRING,
            AOI_KEY STRING,
            AOI_ID STRING,
            STATE STRING,
            DWELL_MS NUMBER,
            REGRESSIONS NUMBER,
            TS TIMESTAMP_NTZ,
            BBOX VARIANT,
            CONTEXT VARIANT,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (EVENT_ID)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {T_AGG} (
            AGG_ID STRING,
            ORG_ID STRING,
            DOC_ID STRING,
            AOI_KEY STRING,
            WINDOW_START TIMESTAMP_NTZ,
            WINDOW_END TIMESTAMP_NTZ,
            METRICS VARIANT,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (AGG_ID)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {T_SUG} (
            SUGGESTION_ID STRING,
            ORG_ID STRING,
            DOC_ID STRING,
            AOI_KEY STRING,
            TITLE STRING,
            ORIGINAL_TEXT STRING,
            PROPOSED_TEXT STRING,
            RATIONALE STRING,
            RISK_FLAGS VARIANT,
            ANCHOR VARIANT,
            STATUS STRING,
            SOURCE STRING,
            MANAGER_NOTE STRING,
            APPLIED_AT TIMESTAMP_NTZ,
            APPLIED_BY STRING,
            BACKUP_TEXT STRING,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (SUGGESTION_ID)
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {T_TOK} (
            USER_ID STRING,
            GOOGLE_ACCESS_TOKEN STRING,
            REFRESH_TOKEN STRING,
            SCOPE STRING,
            EXPIRES_AT TIMESTAMP_NTZ,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (USER_ID)
        )
        """,
    ]
    for stmt in statements:
        db.execute(text(stmt))
    db.commit()


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _hash_aoi(heading_path: List[str], paragraph_index: int, snippet: str) -> str:
    prefix = _normalize_text(snippet)[:32].lower()
    base = f"{' > '.join(heading_path)}|{paragraph_index}|{prefix}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]


def _extract_paragraph_text(paragraph: Dict[str, Any]) -> str:
    parts: List[str] = []
    for element in paragraph.get("elements", []):
        tr = element.get("textRun")
        if not tr:
            continue
        parts.append(tr.get("content", ""))
    return "".join(parts)


def _flatten_doc(doc: Dict[str, Any]) -> Tuple[str, List[TextSegment], List[AoiRow]]:
    content = doc.get("body", {}).get("content", [])
    heading_path: List[str] = []
    para_idx = -1
    text_cursor = 0
    segments: List[TextSegment] = []
    aois: List[AoiRow] = []

    for block in content:
        paragraph = block.get("paragraph")
        if not paragraph:
            continue

        para_idx += 1
        block_text = _extract_paragraph_text(paragraph)
        norm = _normalize_text(block_text)
        if not norm:
            continue

        style = paragraph.get("paragraphStyle", {}).get("namedStyleType", "")
        if style.startswith("HEADING_"):
            try:
                level = max(1, int(style.split("_")[-1]))
            except Exception:
                level = 1
            while len(heading_path) >= level:
                heading_path.pop()
            heading_path.append(norm)

        seg_start = text_cursor
        seg_end = seg_start + len(block_text)
        doc_start = int(block.get("startIndex") or 1)
        doc_end = int(block.get("endIndex") or (doc_start + len(block_text)))

        segments.append(
            TextSegment(
                text=block_text,
                doc_start=doc_start,
                doc_end=doc_end,
                text_start=seg_start,
                text_end=seg_end,
                paragraph_index=para_idx,
            )
        )

        aoi_key = _hash_aoi(heading_path, para_idx, norm)
        aois.append(
            AoiRow(
                aoi_key=aoi_key,
                heading_path=list(heading_path),
                paragraph_index=para_idx,
                start_index=doc_start,
                end_index=doc_end,
                snippet=norm,
            )
        )

        text_cursor = seg_end

    full_text = "".join(s.text for s in segments)
    return full_text, segments, aois


def _text_offset_to_doc_index(offset: int, segments: List[TextSegment]) -> Optional[int]:
    for seg in segments:
        if seg.text_start <= offset <= seg.text_end:
            return seg.doc_start + (offset - seg.text_start)
    return None


def _find_best_anchor(
    snippet: str,
    old_anchor: Optional[Dict[str, Any]],
    full_text: str,
    segments: List[TextSegment],
) -> Optional[Dict[str, int]]:
    needle = _normalize_text(snippet)
    if not needle:
        return None

    literal_idx = full_text.find(snippet)
    if literal_idx >= 0:
        start = _text_offset_to_doc_index(literal_idx, segments)
        end = _text_offset_to_doc_index(literal_idx + len(snippet), segments)
        if start and end and end > start:
            return {"start_index": start, "end_index": end}

    norm_text = _normalize_text(full_text)
    norm_idx = norm_text.find(needle)
    if norm_idx >= 0:
        literal_guess = full_text.lower().find(needle[: min(16, len(needle))].lower())
        if literal_guess >= 0:
            start = _text_offset_to_doc_index(literal_guess, segments)
            end = _text_offset_to_doc_index(literal_guess + len(snippet), segments)
            if start and end and end > start:
                return {"start_index": start, "end_index": end}

    best: Tuple[float, Optional[TextSegment]] = (0.0, None)
    for seg in segments:
        ratio = SequenceMatcher(None, needle.lower(), _normalize_text(seg.text).lower()).ratio()
        if ratio > best[0]:
            best = (ratio, seg)

    if best[1] and best[0] >= 0.62:
        return {"start_index": best[1].doc_start, "end_index": best[1].doc_end}

    if old_anchor:
        old_start = int(old_anchor.get("start_index") or old_anchor.get("startIndex") or 0)
        old_end = int(old_anchor.get("end_index") or old_anchor.get("endIndex") or 0)
        if old_end > old_start:
            return {"start_index": old_start, "end_index": old_end}

    return None


async def _rollup_events(db: Session, org_id: str, doc_id: Optional[str] = None) -> int:
    where_clause = "WHERE ORG_ID = :org_id"
    params: Dict[str, Any] = {"org_id": org_id}
    if doc_id:
        where_clause += " AND DOC_ID = :doc_id"
        params["doc_id"] = doc_id

    rows = db.execute(
        text(
            f"""
            SELECT DOC_ID, AOI_KEY,
                   COALESCE(SUM(DWELL_MS), 0) AS dwell_ms,
                   COALESCE(SUM(REGRESSIONS), 0) AS regressions,
                   COALESCE(SUM(CASE WHEN LOWER(STATE) = 'confused' THEN 1 ELSE 0 END), 0) AS confusion_flags,
                   COUNT(*) AS events_count,
                   MIN(TS) AS min_ts,
                   MAX(TS) AS max_ts
            FROM {T_EVENTS}
            {where_clause}
            GROUP BY DOC_ID, AOI_KEY
            """
        ),
        params,
    ).fetchall()

    upserts = 0
    for row in rows:
        metrics = {
            "dwell_ms": int(row[2] or 0),
            "regressions": int(row[3] or 0),
            "confusion_flags": int(row[4] or 0),
            "events_count": int(row[5] or 0),
        }
        agg_id = hashlib.sha1(f"{org_id}:{row[0]}:{row[1]}".encode("utf-8")).hexdigest()[:24]
        db.execute(
            text(
                f"""
                MERGE INTO {T_AGG} t
                USING (
                    SELECT :agg_id AS AGG_ID,
                           :org_id AS ORG_ID,
                           :doc_id AS DOC_ID,
                           :aoi_key AS AOI_KEY,
                           :window_start::TIMESTAMP_NTZ AS WINDOW_START,
                           :window_end::TIMESTAMP_NTZ AS WINDOW_END,
                           PARSE_JSON(:metrics) AS METRICS
                ) s
                ON t.AGG_ID = s.AGG_ID
                WHEN MATCHED THEN UPDATE SET
                    WINDOW_START = s.WINDOW_START,
                    WINDOW_END = s.WINDOW_END,
                    METRICS = s.METRICS,
                    UPDATED_AT = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN INSERT
                    (AGG_ID, ORG_ID, DOC_ID, AOI_KEY, WINDOW_START, WINDOW_END, METRICS)
                VALUES
                    (s.AGG_ID, s.ORG_ID, s.DOC_ID, s.AOI_KEY, s.WINDOW_START, s.WINDOW_END, s.METRICS)
                """
            ),
            {
                "agg_id": agg_id,
                "org_id": org_id,
                "doc_id": row[0],
                "aoi_key": row[1],
                "window_start": (
                    row[6].isoformat()
                    if hasattr(row[6], "isoformat")
                    else str(row[6] or datetime.now(tz=timezone.utc).isoformat())
                ),
                "window_end": (
                    row[7].isoformat()
                    if hasattr(row[7], "isoformat")
                    else str(row[7] or datetime.now(tz=timezone.utc).isoformat())
                ),
                "metrics": json.dumps(metrics),
            },
        )
        upserts += 1

    db.commit()
    return upserts


def _build_docs_service(access_token: str):
    creds = Credentials(token=access_token)
    return build("docs", "v1", credentials=creds)


def _extract_help_payload(snippet: str, action: str) -> Dict[str, Any]:
    clean = _normalize_text(snippet)
    words = clean.split()
    short = " ".join(words[:24])

    summary = short if short else "No text available"
    explanation = (
        f"This section means: {summary}. Focus on the steps in order and verify any prerequisites first."
    )
    definitions = []
    for token in words:
        if len(token) > 8 and len(definitions) < 3:
            definitions.append({"term": token.strip(".,:;()"), "definition": "Key concept in this section."})

    flashcards = [
        {
            "front": "What is the key action in this section?",
            "back": summary,
        }
    ]

    return {
        "action": action,
        "summary": summary,
        "explanation": explanation,
        "definitions": definitions,
        "flashcards": flashcards,
    }


def _parse_json_text(text_value: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(text_value)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{.*\}", text_value, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return None


async def _provider_assist_payload(snippet: str, action: str, provider: str) -> Dict[str, Any]:
    base = _extract_help_payload(snippet, action)
    provider_name = (provider or "stub").lower()

    if provider_name == "stub":
        base["provider"] = "stub"
        return base

    prompt = (
        "Return strict JSON with keys: summary, explanation, definitions, flashcards. "
        "definitions must be an array of objects {term, definition}. "
        "flashcards must be an array of objects {front, back}. "
        f"Action={action}. Text={snippet}"
    )

    if provider_name == "k2":
        try:
            client = K2ThinkClient()
            result = await client.reason(
                query=prompt,
                context="You are a concise reading assistant.",
                max_steps=4,
                temperature=0.2,
            )
            raw = ""
            choices = result.get("choices") if isinstance(result, dict) else None
            if isinstance(choices, list) and choices:
                raw = choices[0].get("message", {}).get("content", "")
            parsed = _parse_json_text(raw) if raw else None
            if parsed:
                parsed["provider"] = "k2"
                return parsed
        except Exception:
            pass

    if provider_name == "gemini":
        try:
            client = GeminiClient()
            resp = await client.analyze(
                prompt=prompt,
                system_instruction="Return only JSON.",
                temperature=0.2,
                json_mode=True,
            )
            text_out = client.extract_text_from_response(resp)
            parsed = _parse_json_text(text_out) if text_out else None
            if parsed:
                parsed["provider"] = "gemini"
                return parsed
        except Exception:
            pass

    if provider_name == "dedalus":
        try:
            client = DedalusClient()
            # We keep this lightweight: verify connectivity; detailed agent orchestration plugs in later.
            healthy = await client.test_connection()
            if healthy:
                base["provider"] = "dedalus"
                base["explanation"] = (
                    base["explanation"]
                    + " (Dedalus connected; wire your production agent ID in backend/services/dedalus_client.py.)"
                )
                return base
        except Exception:
            pass

    base["provider"] = "stub_fallback"
    return base


def _get_saved_google_token(db: Session, user_id: str) -> Optional[str]:
    row = db.execute(
        text(f"SELECT GOOGLE_ACCESS_TOKEN FROM {T_TOK} WHERE USER_ID = :user_id LIMIT 1"),
        {"user_id": user_id},
    ).fetchone()
    if not row:
        return None
    return row[0]


@router.post("/events/ingest")
async def ingest_events(
    request: IngestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    inserted = 0
    for ev in request.events:
        event_id = str(uuid.uuid4())
        ctx = {
            "scroll_position": ev.scroll_position,
            "cursor_position": ev.cursor_position,
            "text_selection": ev.text_selection,
            "metadata": ev.metadata,
        }
        ts_iso = datetime.fromtimestamp(ev.timestamp_ms / 1000, tz=timezone.utc).isoformat()
        db.execute(
            text(
                f"""
                INSERT INTO {T_EVENTS}
                (EVENT_ID, ORG_ID, DOC_ID, USER_ID, SESSION_ID, AOI_KEY, AOI_ID, STATE,
                 DWELL_MS, REGRESSIONS, TS, BBOX, CONTEXT)
                VALUES
                (:event_id, :org_id, :doc_id, :user_id, :session_id, :aoi_key, :aoi_id, :state,
                 :dwell_ms, :regressions, :ts::TIMESTAMP_NTZ, PARSE_JSON(:bbox), PARSE_JSON(:context))
                """
            ),
            {
                "event_id": event_id,
                "org_id": ev.org_id,
                "doc_id": ev.doc_id,
                "user_id": current_user.user_id,
                "session_id": ev.session_id,
                "aoi_key": ev.aoi_key,
                "aoi_id": ev.aoi_id,
                "state": ev.state,
                "dwell_ms": ev.dwell_ms,
                "regressions": ev.regressions,
                "ts": ts_iso,
                "bbox": json.dumps(ev.bbox or {}),
                "context": json.dumps(ctx),
            },
        )
        inserted += 1

    db.commit()
    return {"ok": True, "inserted": inserted}


@router.post("/docs/sync")
async def sync_doc(
    request: DocSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    docs_service = _build_docs_service(request.google_access_token)
    try:
        doc = docs_service.documents().get(documentId=request.google_doc_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Google Doc: {exc}")

    doc_title = request.title or doc.get("title") or request.google_doc_id
    full_text, _segments, aois = _flatten_doc(doc)

    db.execute(
        text(
            f"""
            MERGE INTO {T_DOC} t
            USING (
                SELECT :doc_id AS DOC_ID,
                       :org_id AS ORG_ID,
                       :title AS TITLE,
                       PARSE_JSON(:google_doc) AS GOOGLE_DOC,
                       :content AS CONTENT
            ) s
            ON t.DOC_ID = s.DOC_ID
            WHEN MATCHED THEN UPDATE SET
                ORG_ID = s.ORG_ID,
                TITLE = s.TITLE,
                GOOGLE_DOC = s.GOOGLE_DOC,
                CONTENT = s.CONTENT,
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT
                (DOC_ID, ORG_ID, TITLE, GOOGLE_DOC, CONTENT)
            VALUES
                (s.DOC_ID, s.ORG_ID, s.TITLE, s.GOOGLE_DOC, s.CONTENT)
            """
        ),
        {
            "doc_id": request.google_doc_id,
            "org_id": request.org_id,
            "title": doc_title,
            "google_doc": json.dumps(
                {
                    "fileId": request.google_doc_id,
                    "name": doc_title,
                    "url": f"https://docs.google.com/document/d/{request.google_doc_id}/edit",
                }
            ),
            "content": full_text,
        },
    )

    for aoi in aois:
        anchor = {
            "start_index": aoi.start_index,
            "end_index": aoi.end_index,
            "heading_path": aoi.heading_path,
            "paragraph_index": aoi.paragraph_index,
            "snippet": aoi.snippet[:256],
        }
        db.execute(
            text(
                f"""
                MERGE INTO {T_AOI_MAP} t
                USING (
                    SELECT :doc_id AS DOC_ID,
                           :org_id AS ORG_ID,
                           :aoi_key AS AOI_KEY,
                           PARSE_JSON(:heading_path) AS HEADING_PATH,
                           :paragraph_index AS PARAGRAPH_INDEX,
                           :start_index AS START_INDEX,
                           :end_index AS END_INDEX,
                           :snippet AS SNIPPET,
                           PARSE_JSON(:anchor) AS ANCHOR
                ) s
                ON t.DOC_ID = s.DOC_ID AND t.AOI_KEY = s.AOI_KEY
                WHEN MATCHED THEN UPDATE SET
                    ORG_ID = s.ORG_ID,
                    HEADING_PATH = s.HEADING_PATH,
                    PARAGRAPH_INDEX = s.PARAGRAPH_INDEX,
                    START_INDEX = s.START_INDEX,
                    END_INDEX = s.END_INDEX,
                    SNIPPET = s.SNIPPET,
                    ANCHOR = s.ANCHOR,
                    UPDATED_AT = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN INSERT
                    (DOC_ID, ORG_ID, AOI_KEY, HEADING_PATH, PARAGRAPH_INDEX, START_INDEX, END_INDEX, SNIPPET, ANCHOR)
                VALUES
                    (s.DOC_ID, s.ORG_ID, s.AOI_KEY, s.HEADING_PATH, s.PARAGRAPH_INDEX, s.START_INDEX, s.END_INDEX, s.SNIPPET, s.ANCHOR)
                """
            ),
            {
                "doc_id": request.google_doc_id,
                "org_id": request.org_id,
                "aoi_key": aoi.aoi_key,
                "heading_path": json.dumps(aoi.heading_path),
                "paragraph_index": aoi.paragraph_index,
                "start_index": aoi.start_index,
                "end_index": aoi.end_index,
                "snippet": aoi.snippet,
                "anchor": json.dumps(anchor),
            },
        )

    db.commit()

    return {
        "ok": True,
        "doc_id": request.google_doc_id,
        "title": doc_title,
        "aoi_count": len(aois),
    }


@router.post("/assist")
async def assist(
    request: AssistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    snippet = _normalize_text(request.selected_text or "")
    aoi_anchor = None

    if request.aoi_key:
        row = db.execute(
            text(
                f"""
                SELECT SNIPPET, ANCHOR
                FROM {T_AOI_MAP}
                WHERE DOC_ID = :doc_id AND ORG_ID = :org_id AND AOI_KEY = :aoi_key
                LIMIT 1
                """
            ),
            {
                "doc_id": request.doc_id,
                "org_id": request.org_id,
                "aoi_key": request.aoi_key,
            },
        ).fetchone()
        if row:
            snippet = snippet or _normalize_text(row[0] or "")
            aoi_anchor = row[1] if isinstance(row[1], dict) else {}

    if not snippet and request.cursor_range and request.google_access_token:
        docs_service = _build_docs_service(request.google_access_token)
        doc = docs_service.documents().get(documentId=request.doc_id).execute()
        full_text, segments, _ = _flatten_doc(doc)
        start = int(request.cursor_range.get("startIndex", 0))
        end = int(request.cursor_range.get("endIndex", 0))
        if end > start:
            # Convert doc indexes to approximate text offsets
            start_off = 0
            end_off = min(len(full_text), 400)
            for seg in segments:
                if seg.doc_start <= start <= seg.doc_end:
                    start_off = seg.text_start + (start - seg.doc_start)
                if seg.doc_start <= end <= seg.doc_end:
                    end_off = seg.text_start + (end - seg.doc_start)
            snippet = _normalize_text(full_text[start_off:end_off])

    if not snippet:
        raise HTTPException(status_code=400, detail="No AOI or text available for assist.")

    payload = await _provider_assist_payload(snippet, request.action, request.provider)

    return {
        "ok": True,
        "doc_id": request.doc_id,
        "aoi_key": request.aoi_key,
        "anchor": aoi_anchor,
        "assist": payload,
    }


@router.get("/orgs/{org_id}/analytics")
async def org_analytics(
    org_id: str,
    doc_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    await _rollup_events(db, org_id=org_id, doc_id=doc_id)

    where_clause = "WHERE a.ORG_ID = :org_id"
    params: Dict[str, Any] = {"org_id": org_id}
    if doc_id:
        where_clause += " AND a.DOC_ID = :doc_id"
        params["doc_id"] = doc_id

    rows = db.execute(
        text(
            f"""
            SELECT a.DOC_ID, a.AOI_KEY, a.METRICS, m.SNIPPET, m.HEADING_PATH, m.PARAGRAPH_INDEX
            FROM {T_AGG} a
            LEFT JOIN {T_AOI_MAP} m
                ON a.DOC_ID = m.DOC_ID AND a.AOI_KEY = m.AOI_KEY
            {where_clause}
            ORDER BY COALESCE(a.METRICS:confusion_flags::NUMBER, 0) DESC,
                     COALESCE(a.METRICS:dwell_ms::NUMBER, 0) DESC
            LIMIT 200
            """
        ),
        params,
    ).fetchall()

    top_sections = []
    heatmap = []
    totals = {
        "events": 0,
        "confusion_flags": 0,
        "dwell_ms": 0,
    }

    for row in rows:
        metrics = row[2] if isinstance(row[2], dict) else {}
        section = {
            "doc_id": row[0],
            "aoi_key": row[1],
            "snippet": row[3] or "",
            "heading_path": row[4] if isinstance(row[4], list) else [],
            "paragraph_index": int(row[5]) if row[5] is not None else None,
            "metrics": {
                "dwell_ms": int(metrics.get("dwell_ms", 0)),
                "regressions": int(metrics.get("regressions", 0)),
                "confusion_flags": int(metrics.get("confusion_flags", 0)),
                "events_count": int(metrics.get("events_count", 0)),
            },
        }
        top_sections.append(section)
        heatmap.append(
            {
                "aoi_key": section["aoi_key"],
                "paragraph_index": section["paragraph_index"],
                "confusion_intensity": section["metrics"]["confusion_flags"],
                "dwell_ms": section["metrics"]["dwell_ms"],
            }
        )

        totals["events"] += section["metrics"]["events_count"]
        totals["confusion_flags"] += section["metrics"]["confusion_flags"]
        totals["dwell_ms"] += section["metrics"]["dwell_ms"]

    return {
        "ok": True,
        "org_id": org_id,
        "doc_id": doc_id,
        "summary": totals,
        "top_confusing_sections": top_sections[:25],
        "heatmap": heatmap[:200],
    }


@router.post("/orgs/{org_id}/suggest")
async def create_suggestions(
    org_id: str,
    request: SuggestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    await _rollup_events(db, org_id=org_id, doc_id=request.doc_id)

    metrics_rows = db.execute(
        text(
            f"""
            SELECT AOI_KEY, METRICS
            FROM {T_AGG}
            WHERE ORG_ID = :org_id AND DOC_ID = :doc_id
            """
        ),
        {"org_id": org_id, "doc_id": request.doc_id},
    ).fetchall()

    aoi_rows = db.execute(
        text(
            f"""
            SELECT AOI_KEY, SNIPPET, ANCHOR
            FROM {T_AOI_MAP}
            WHERE ORG_ID = :org_id AND DOC_ID = :doc_id
            ORDER BY PARAGRAPH_INDEX ASC
            """
        ),
        {"org_id": org_id, "doc_id": request.doc_id},
    ).fetchall()

    if not aoi_rows:
        raise HTTPException(status_code=404, detail="No AOI mapping found. Run /v1/docs/sync first.")

    metric_list = [
        {
            "aoi_key": r[0],
            **(r[1] if isinstance(r[1], dict) else {}),
        }
        for r in metrics_rows
    ]

    chunks = [
        {
            "aoi_key": r[0],
            "text": r[1] or "",
            "anchor": r[2] if isinstance(r[2], dict) else {},
        }
        for r in aoi_rows
    ]

    generated = await k2_generate_suggestions(
        doc_chunks=chunks,
        aoi_metrics=metric_list,
        org_prefs=request.org_prefs,
        max_suggestions=request.max_suggestions,
        use_live_k2=request.use_live_k2,
    )

    stored = []
    for item in generated:
        aoi_key = item.get("aoi_key")
        anchor = {}
        original_text = ""
        for r in aoi_rows:
            if r[0] == aoi_key:
                anchor = r[2] if isinstance(r[2], dict) else {}
                original_text = r[1] or ""
                break

        suggestion_id = str(uuid.uuid4())
        db.execute(
            text(
                f"""
                INSERT INTO {T_SUG}
                (SUGGESTION_ID, ORG_ID, DOC_ID, AOI_KEY, TITLE, ORIGINAL_TEXT, PROPOSED_TEXT,
                 RATIONALE, RISK_FLAGS, ANCHOR, STATUS, SOURCE)
                VALUES
                (:suggestion_id, :org_id, :doc_id, :aoi_key, :title, :original_text, :proposed_text,
                 :rationale, PARSE_JSON(:risk_flags), PARSE_JSON(:anchor), 'pending', :source)
                """
            ),
            {
                "suggestion_id": suggestion_id,
                "org_id": org_id,
                "doc_id": request.doc_id,
                "aoi_key": aoi_key,
                "title": item.get("title", "Improve section"),
                "original_text": original_text,
                "proposed_text": item.get("proposed_text", ""),
                "rationale": item.get("rationale", ""),
                "risk_flags": json.dumps(item.get("risk_flags", [])),
                "anchor": json.dumps(anchor),
                "source": item.get("source", "k2_stub"),
            },
        )
        stored.append({"id": suggestion_id, **item, "status": "pending"})

    db.commit()

    return {
        "ok": True,
        "org_id": org_id,
        "doc_id": request.doc_id,
        "created": len(stored),
        "suggestions": stored,
    }


@router.get("/orgs/{org_id}/suggestions")
async def list_suggestions(
    org_id: str,
    status: str = "pending",
    doc_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    where_clause = "WHERE ORG_ID = :org_id"
    params: Dict[str, Any] = {"org_id": org_id}

    if status != "all":
        where_clause += " AND STATUS = :status"
        params["status"] = status
    if doc_id:
        where_clause += " AND DOC_ID = :doc_id"
        params["doc_id"] = doc_id

    rows = db.execute(
        text(
            f"""
            SELECT SUGGESTION_ID, DOC_ID, AOI_KEY, TITLE, ORIGINAL_TEXT, PROPOSED_TEXT,
                   RATIONALE, RISK_FLAGS, STATUS, SOURCE, CREATED_AT, ANCHOR
            FROM {T_SUG}
            {where_clause}
            ORDER BY CREATED_AT DESC
            LIMIT 200
            """
        ),
        params,
    ).fetchall()

    suggestions = []
    for row in rows:
        suggestions.append(
            {
                "id": row[0],
                "doc_id": row[1],
                "aoi_key": row[2],
                "title": row[3],
                "original_text": row[4],
                "proposed_text": row[5],
                "rationale": row[6],
                "risk_flags": row[7] if isinstance(row[7], list) else [],
                "status": row[8],
                "source": row[9],
                "created_at": row[10].isoformat() if row[10] else None,
                "anchor": row[11] if isinstance(row[11], dict) else {},
            }
        )

    return {
        "ok": True,
        "org_id": org_id,
        "count": len(suggestions),
        "suggestions": suggestions,
    }


@router.post("/suggestions/{suggestion_id}/accept")
async def accept_suggestion(
    suggestion_id: str,
    request: SuggestDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    row = db.execute(
        text(
            f"""
            SELECT ORG_ID, DOC_ID, AOI_KEY, ORIGINAL_TEXT, PROPOSED_TEXT, ANCHOR, STATUS
            FROM {T_SUG}
            WHERE SUGGESTION_ID = :suggestion_id
            LIMIT 1
            """
        ),
        {"suggestion_id": suggestion_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    if row[6] not in {"pending", "accepted"}:
        raise HTTPException(status_code=400, detail=f"Suggestion status '{row[6]}' cannot be accepted")

    token = request.google_access_token or _get_saved_google_token(db, current_user.user_id)
    if not token:
        raise HTTPException(status_code=400, detail="google_access_token required to apply edit")

    docs_service = _build_docs_service(token)
    doc = docs_service.documents().get(documentId=row[1]).execute()
    full_text, segments, _ = _flatten_doc(doc)

    anchor = row[5] if isinstance(row[5], dict) else {}
    best_anchor = _find_best_anchor(
        snippet=row[3] or "",
        old_anchor=anchor,
        full_text=full_text,
        segments=segments,
    )

    if not best_anchor:
        raise HTTPException(status_code=409, detail="Unable to re-anchor suggestion in latest doc revision")

    requests = [
        {
            "deleteContentRange": {
                "range": {
                    "startIndex": int(best_anchor["start_index"]),
                    "endIndex": int(best_anchor["end_index"]),
                }
            }
        },
        {
            "insertText": {
                "location": {"index": int(best_anchor["start_index"])},
                "text": row[4] or "",
            }
        },
    ]

    docs_service.documents().batchUpdate(
        documentId=row[1],
        body={"requests": requests},
    ).execute()

    db.execute(
        text(
            f"""
            UPDATE {T_SUG}
            SET STATUS = 'applied',
                MANAGER_NOTE = :manager_note,
                APPLIED_AT = CURRENT_TIMESTAMP(),
                APPLIED_BY = :applied_by,
                BACKUP_TEXT = :backup_text,
                ANCHOR = PARSE_JSON(:anchor),
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE SUGGESTION_ID = :suggestion_id
            """
        ),
        {
            "manager_note": request.manager_note,
            "applied_by": current_user.user_id,
            "backup_text": row[3] or "",
            "anchor": json.dumps(best_anchor),
            "suggestion_id": suggestion_id,
        },
    )
    db.commit()

    return {
        "ok": True,
        "suggestion_id": suggestion_id,
        "doc_id": row[1],
        "status": "applied",
        "applied_anchor": best_anchor,
    }


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    request: SuggestDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    row = db.execute(
        text(f"SELECT SUGGESTION_ID FROM {T_SUG} WHERE SUGGESTION_ID = :id LIMIT 1"),
        {"id": suggestion_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    db.execute(
        text(
            f"""
            UPDATE {T_SUG}
            SET STATUS = 'rejected',
                MANAGER_NOTE = :manager_note,
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE SUGGESTION_ID = :id
            """
        ),
        {"id": suggestion_id, "manager_note": request.manager_note},
    )
    db.commit()

    return {"ok": True, "suggestion_id": suggestion_id, "status": "rejected"}


@router.post("/auth/store-google-access-token")
async def store_google_access_token(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    token = payload.get("access_token")
    if not token:
        raise HTTPException(status_code=400, detail="access_token is required")

    db.execute(
        text(
            f"""
            MERGE INTO {T_TOK} t
            USING (
                SELECT :user_id AS USER_ID,
                       :token AS GOOGLE_ACCESS_TOKEN,
                       :refresh_token AS REFRESH_TOKEN,
                       :scope AS SCOPE,
                       :expires_at::TIMESTAMP_NTZ AS EXPIRES_AT
            ) s
            ON t.USER_ID = s.USER_ID
            WHEN MATCHED THEN UPDATE SET
                GOOGLE_ACCESS_TOKEN = s.GOOGLE_ACCESS_TOKEN,
                REFRESH_TOKEN = s.REFRESH_TOKEN,
                SCOPE = s.SCOPE,
                EXPIRES_AT = s.EXPIRES_AT,
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT
                (USER_ID, GOOGLE_ACCESS_TOKEN, REFRESH_TOKEN, SCOPE, EXPIRES_AT)
            VALUES
                (s.USER_ID, s.GOOGLE_ACCESS_TOKEN, s.REFRESH_TOKEN, s.SCOPE, s.EXPIRES_AT)
            """
        ),
        {
            "user_id": current_user.user_id,
            "token": token,
            "refresh_token": payload.get("refresh_token"),
            "scope": payload.get("scope", ""),
            "expires_at": payload.get("expires_at")
            or datetime.now(tz=timezone.utc).isoformat(),
        },
    )
    db.commit()

    return {"ok": True}


@router.post("/jobs/rollup")
async def run_rollup(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await ensure_warehouse_resumed()
    _ensure_tables(db)

    org_id = payload.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="org_id is required")

    doc_id = payload.get("doc_id")
    upserts = await _rollup_events(db, org_id=org_id, doc_id=doc_id)
    return {"ok": True, "upserts": upserts, "org_id": org_id, "doc_id": doc_id}
