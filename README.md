# ThirdEye

ThirdEye combines gaze tracking, browser context capture, and AI assistance for learning workflows.

## Project Layout

- `Devfest/` - frontend web app (Vite + React)
- `backend/` - FastAPI backend (Snowflake + Google integrations)
- `contentGrabber/` - Chrome extension
- `gaze2/` - webcam gaze tracking service and cursor control

## Fastest Demo Startup

From repo root:

```bash
./hackathon_start.sh
```

This script:
- creates/uses `.venv`
- installs backend dependencies if needed
- starts backend at `http://localhost:8000`
- starts frontend at `http://localhost:5173`

## Required Environment

Create root `.env` and set at minimum:

- `VITE_GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET_KEY`
- Snowflake credentials used by backend

Frontend and backend both read from the root `.env`.

## Manual Run

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd Devfest
npm install
npm run dev
```

### Gaze Cursor

Use Python 3.11-3.13 for gaze dependencies:

```bash
cd gaze2
python -m pip install -r requirements.txt
python gaze_cursor.py --api --control-cursor
```

## Google Docs Enterprise Integration (v1)

Added endpoints under `/v1` for:
- event ingest
- AOI doc sync
- assist payloads
- analytics
- suggestion queue
- accept/reject with Docs API edit apply

See `GOOGLE_DOCS_ENTERPRISE_INTEGRATION.md` and `backend/migrations/create_google_docs_enterprise_v1.sql`.
