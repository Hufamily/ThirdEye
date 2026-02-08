# ThirdEye Backend API

Backend API implementation for ThirdEye learning assistance platform.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

3. **Set up Snowflake:**
   - Create Snowflake account
   - Create database: `THIRDEYE_DEV` (or `THIRDEYE_PROD`)
   - Create schemas: `PUBLIC`, `ANALYTICS`, `STAGING`
   - Create warehouses: `COMPUTE_WH` (X-Small), `ANALYTICS_WH` (Medium)
   - Update `.env` with Snowflake credentials

4. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```

5. **Start the server:**
   ```bash
   python -m app.main
   # Or
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Project Structure

```
backend/
├── app/
│   ├── main.py          # FastAPI application
│   └── config.py        # Configuration settings
├── models/              # SQLAlchemy models
├── routes/              # API route handlers
├── services/            # Business logic
├── utils/               # Utilities (database, auth)
├── migrations/          # Alembic migrations
└── tests/               # Test files
```

## Environment Variables

See `.env.example` for all required environment variables.

## Development

- Backend runs on `http://localhost:8000`
- API base path: `/api`
- Frontend expects API at `http://localhost:8000/api`
