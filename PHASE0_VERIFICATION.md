# Phase 0: Infrastructure Verification

**Status**: 🔄 In Progress  
**Goal**: Verify all prerequisites before starting Phase 3 (AI/ML Integration)

---

## Quick Start

Run the automated verification script:

```bash
cd backend
python scripts/phase0_verification.py
```

This will check:
- ✅ Environment variables
- ✅ Snowflake connection
- ✅ Database tables
- ✅ Backend API
- ✅ Frontend build

---

## Manual Verification Steps

### 1. Database Migration

**Run the migration script in Snowflake:**

```sql
-- Copy and paste the contents of:
-- backend/migrations/add_missing_tables.sql

-- Or run via SnowSQL:
snowsql -c your_config -f backend/migrations/add_missing_tables.sql
```

**Verify tables exist:**

```sql
SELECT TABLE_NAME 
FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
ORDER BY TABLE_NAME;
```

**Expected tables (9 total):**
- DOCUMENTS
- INTERACTIONS
- NOTEBOOK_ENTRIES
- ORG_MEMBERSHIPS
- ORGANIZATIONS
- SESSIONS
- SUGGESTIONS
- TRACKED_ASSETS
- USERS

---

### 2. Backend API Test

**Start the backend:**

```bash
cd backend
python -m app.main
```

**Test endpoints:**

```bash
# Health check
curl http://localhost:8000/health

# Should return: {"status": "healthy"}
```

**View API docs:**

Open in browser: http://localhost:8000/docs

---

### 3. Snowflake Connection Test

```bash
cd backend
python scripts/test_snowflake_connection.py
```

**Expected output:**
- ✅ Snowflake connected successfully
- ✅ Database access OK
- ✅ Warehouse access OK
- ✅ Schema access OK

---

### 4. Frontend Build Test

```bash
cd Devfest
npm install
npm run build
```

**Expected:** Build completes without errors

**To run dev server:**

```bash
npm run dev
```

Frontend should start on: http://localhost:5173

---

## Verification Checklist

Before proceeding to Phase 3, ensure:

- [ ] All 9 database tables exist in Snowflake
- [ ] Backend API starts without errors (`python -m app.main`)
- [ ] `/health` endpoint returns `{"status": "healthy"}`
- [ ] Snowflake connection test passes
- [ ] Frontend builds successfully (`npm run build`)
- [ ] All environment variables set in `.env` file

---

## Environment Variables Required

Check your `.env` file at project root has:

```bash
# Snowflake
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USER=your_user
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=THIRDEYE_DEV
SNOWFLAKE_SCHEMA=PUBLIC

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# JWT
JWT_SECRET_KEY=your_secret_key
```

---

## Troubleshooting

### Database Tables Missing

**Solution:** Run migration script in Snowflake:
```sql
-- Copy contents of backend/migrations/add_missing_tables.sql
-- Paste into Snowflake worksheet and execute
```

### Backend Won't Start

**Check:**
1. Python dependencies installed: `pip install -r backend/requirements.txt`
2. Environment variables set correctly
3. Port 8000 not in use

### Snowflake Connection Fails

**Check:**
1. Account identifier includes region (e.g., `xy12345.us-east-1`)
2. User has proper permissions
3. Warehouse exists and is accessible
4. Database and schema exist

### Frontend Build Fails

**Check:**
1. Node.js installed (`node --version`)
2. Dependencies installed: `npm install`
3. No syntax errors in TypeScript files

---

## Next Steps

Once all checks pass:

✅ **Proceed to Phase 3: AI/ML Integration**

1. Dedalus Labs setup
2. K2-Think integration
3. Agent implementations (0.0 - 6.0)

---

**Last Updated**: 2025-02-08  
**Status**: Ready for verification
