# Complete Backend Testing Guide

## Current Status: 37/43 tests passing (86%)

### ✅ What's Working
- Database connection: ✓
- INTERACTIONS table: ✓ Created
- All other tables: ✓ Exist
- SQL queries: ✓ All use fully qualified names
- Code structure: ✓ All routes implemented

### ⚠️ What's Left

## Step 1: Create DOCUMENTS Table (1 minute)

Run this in Snowflake:

```sql
USE WAREHOUSE COMPUTE_WH;
USE DATABASE THIRDEYE_DEV;
USE SCHEMA PUBLIC;

CREATE TABLE IF NOT EXISTS THIRDEYE_DEV.PUBLIC.DOCUMENTS (
    DOC_ID VARCHAR(500) PRIMARY KEY,
    ORG_ID VARCHAR(36),
    TITLE VARCHAR(500) NOT NULL,
    GOOGLE_DOC VARIANT,
    CONFUSION_DENSITY FLOAT,
    TOTAL_TRIGGERS INTEGER DEFAULT 0,
    USERS_AFFECTED INTEGER DEFAULT 0,
    CONTENT TEXT,
    HOTSPOTS VARIANT,
    LAST_ANALYZED TIMESTAMP_NTZ,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY (ORG_ID, DOC_ID);
```

**Or** open `backend/migrations/add_missing_tables.sql` and copy just the DOCUMENTS table part.

## Step 2: Start the API Server (1 minute)

Open a **new terminal** and run:

```bash
cd /Users/jy/Desktop/ThirdEye/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
INFO:     Started reloader process
```

**Keep this terminal open** - the server needs to keep running.

## Step 3: Verify Everything Works

In a **different terminal**, run:

```bash
cd /Users/jy/Desktop/ThirdEye/backend
python3 scripts/verify_backend.py
```

**Expected Result**: All 43 tests should pass! ✅

## Step 4: Test API Endpoints Manually

### Test Health Endpoint
```bash
curl http://localhost:8000/health
```
Should return: `{"status":"healthy"}`

### Test Root Endpoint
```bash
curl http://localhost:8000/
```
Should return API info

### Test OpenAPI Docs
Open in browser: http://localhost:8000/docs

You should see the interactive API documentation with all endpoints listed.

### Test Protected Endpoints (should return 401)
```bash
curl http://localhost:8000/api/personal/profile
```
Should return: `{"detail":"Not authenticated"}` or similar 401 error

## Step 5: Quick Endpoint Test Script

Run the endpoint tester:
```bash
cd /Users/jy/Desktop/ThirdEye/backend
python3 scripts/test_endpoints.py
```

## Troubleshooting

### If DOCUMENTS table still missing:
1. Check you're in the right database: `USE DATABASE THIRDEYE_DEV;`
2. Check you're in the right schema: `USE SCHEMA PUBLIC;`
3. Verify table exists: `SHOW TABLES LIKE 'DOCUMENTS';`

### If API won't start:
1. Check if port 8000 is already in use: `lsof -i :8000`
2. Check Python dependencies: `pip install -r requirements.txt`
3. Check .env file has all required variables

### If tests still fail:
1. Make sure API server is running (Step 2)
2. Make sure DOCUMENTS table exists (Step 1)
3. Check error messages in verification output

---

**Once all steps complete, you should have:**
- ✅ All tables created
- ✅ API server running
- ✅ All 43 tests passing
- ✅ Backend fully functional

Ready to test! 🚀
