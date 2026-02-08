# Third Eye Google Docs Enterprise Integration (v1)

This adds an end-to-end Google Docs integration for:
- in-the-moment assist in Docs sidebar
- org-level AOI analytics
- K2 suggestion generation + manager review
- applying accepted edits back to Google Docs

## What Was Added

### Backend
- `backend/routes/google_docs_enterprise_v1.py`
- `backend/services/k2_suggestion_engine.py`
- `backend/scripts/run_attention_rollup.py`
- Registered route in `backend/app/main.py` with prefix `/v1`
- Migration: `backend/migrations/create_google_docs_enterprise_v1.sql`

### Google Docs Add-on (Apps Script)
- `apps_script/appsscript.json`
- `apps_script/Code.gs`
- `apps_script/Sidebar.html`

## Endpoint Contract

- `POST /v1/events/ingest`
- `POST /v1/docs/sync`
- `POST /v1/assist`
- `GET /v1/orgs/{org_id}/analytics`
- `POST /v1/orgs/{org_id}/suggest`
- `GET /v1/orgs/{org_id}/suggestions`
- `POST /v1/suggestions/{id}/accept`
- `POST /v1/suggestions/{id}/reject`
- `POST /v1/auth/store-google-access-token`
- `POST /v1/jobs/rollup`

## Data Model (Snowflake)

Created in migration:
- `AOI_MAP` (doc anchors + AOI keys)
- `ATTENTION_EVENTS` (ingested gaze/context events)
- `AOI_AGGREGATES` (rollups)
- `DOC_SUGGESTIONS` (review queue + applied metadata)
- `GOOGLE_USER_TOKENS` (user Google access token relay)

Existing tables reused:
- `USERS`
- `ORGANIZATIONS`
- `DOCUMENTS`

## AOI Key + Re-Anchoring Strategy

AOI key uses:
- `hash(heading_path + paragraph_index + first_32_chars(snippet))`

Anchor metadata per AOI stores:
- `start_index`
- `end_index`
- `heading_path`
- `paragraph_index`
- `snippet`

When applying accepted edits, re-anchoring uses:
1. literal snippet match in latest doc text
2. normalized text fallback
3. fuzzy paragraph match (`SequenceMatcher`)
4. stored previous range as last fallback

## Google Cloud Setup

1. In Google Cloud Console, enable:
- Google Docs API
- Google Drive API
- Apps Script API (if managing script via CI)

2. OAuth consent + credentials:
- Configure OAuth consent screen
- Add scopes:
  - `https://www.googleapis.com/auth/documents`
  - `https://www.googleapis.com/auth/userinfo.email`
  - any scopes used by your app auth stack

3. Backend env vars (in `.env`):
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `JWT_SECRET_KEY=...`
- `K2_API_KEY=...`
- `DEDALUS_API_KEY=...`
- `GEMINI_API_KEY=...`
- Existing Snowflake vars

## Run Migration

Use Snowflake worksheet or your migration runner to execute:

```sql
-- file: backend/migrations/create_google_docs_enterprise_v1.sql
```

## Run Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Deploy Apps Script Add-on

1. Create a new Apps Script project (Docs Add-on context)
2. Copy files:
- `apps_script/appsscript.json` as manifest
- `apps_script/Code.gs`
- `apps_script/Sidebar.html`
3. Deploy as test add-on
4. Open a Google Doc and launch from `Extensions -> Third Eye -> Open Assistant`

## End-to-End Test (“Banana Onboarding”)

1. Open Banana Onboarding Google Doc
2. In sidebar settings, set:
- API base (`http://localhost:8000`)
- backend Bearer JWT
- org ID
- provider (`stub` first)
3. Click **Sync AOI Map**
4. Ingest sample events (curl below)
5. Confirm **Need help?** card appears
6. Click Explain/Summarize/Define/Flashcards
7. Generate suggestions and accept one

## Example Payloads

### Event Ingest

```json
{
  "events": [
    {
      "org_id": "org_demo",
      "doc_id": "1AbCdEfGoogleDocId",
      "aoi_key": "aoi_123",
      "state": "confused",
      "dwell_ms": 890,
      "regressions": 2,
      "timestamp_ms": 1760000000000,
      "metadata": {
        "source": "gaze_pipeline",
        "session_id": "sess_1"
      }
    }
  ]
}
```

### Assist Request

```json
{
  "org_id": "org_demo",
  "doc_id": "1AbCdEfGoogleDocId",
  "aoi_key": "aoi_123",
  "action": "explain",
  "provider": "stub"
}
```

### Suggestion Generation

```json
{
  "doc_id": "1AbCdEfGoogleDocId",
  "org_prefs": {
    "tone": "friendly and concise",
    "compliance": "avoid legal claims"
  },
  "max_suggestions": 5,
  "use_live_k2": false
}
```

### Accept Suggestion

```json
{
  "manager_note": "Approved for rollout",
  "google_access_token": "ya29.a0...."
}
```

### Reject Suggestion

```json
{
  "manager_note": "Too verbose for this section"
}
```

## Cron / Batch Rollup

Run hourly or daily:

```bash
python backend/scripts/run_attention_rollup.py --org-id org_demo
```

Or trigger API rollup:

```bash
POST /v1/jobs/rollup
{
  "org_id": "org_demo",
  "doc_id": "1AbCdEfGoogleDocId"
}
```

## Privacy Notes

- Stores AOI-level metrics and state transitions, not raw gaze stream by default
- All analytics and suggestions are org-scoped (`org_id`)
- Manager approval is required before doc edits are applied
