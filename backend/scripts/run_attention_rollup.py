"""Cron-friendly rollup job for AOI attention events."""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import text

from utils.database import SessionLocal, ensure_warehouse_resumed
from app.config import settings

T_EVENTS = f"{settings.snowflake_database}.{settings.snowflake_schema}.ATTENTION_EVENTS"
T_AGG = f"{settings.snowflake_database}.{settings.snowflake_schema}.AOI_AGGREGATES"


async def rollup(org_id: str, doc_id: str | None = None) -> int:
    await ensure_warehouse_resumed()
    db = SessionLocal()
    try:
        where_clause = "WHERE ORG_ID = :org_id"
        params = {"org_id": org_id}
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
            agg_id = f"{org_id}:{row[0]}:{row[1]}"[:240]
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
                    "window_start": row[6].isoformat() if hasattr(row[6], "isoformat") else str(row[6] or ""),
                    "window_end": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7] or ""),
                    "metrics": str(metrics).replace("'", '"'),
                },
            )
            upserts += 1

        db.commit()
        return upserts
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Roll up attention events into AOI aggregates")
    parser.add_argument("--org-id", required=True, help="Organization ID")
    parser.add_argument("--doc-id", required=False, help="Optional document ID filter")
    args = parser.parse_args()

    upserts = asyncio.run(rollup(org_id=args.org_id, doc_id=args.doc_id))
    print(f"AOI rollup complete. upserts={upserts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
