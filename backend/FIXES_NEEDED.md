# Critical Fixes Needed for Backend

## Summary

The backend is **~90% complete** but has **critical table name issues** that will cause runtime errors. These must be fixed before deployment.

---

## Critical Issues (Must Fix Before Deployment)

### 1. Missing Table: `TRACKED_ASSETS`

**Problem**: Code references `THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS` but this table doesn't exist in schema.

**Affected Files**:
- `routes/enterprise.py` (lines 95, 343, 748)

**Solution Options**:

#### Option A: Create TRACKED_ASSETS Table (Recommended)
Add to `migrations/create_schema.sql`:

```sql
-- Tracked Assets Table (general asset tracking)
CREATE TABLE IF NOT EXISTS PUBLIC.TRACKED_ASSETS (
    ASSET_ID VARCHAR(500) PRIMARY KEY,
    ORG_ID VARCHAR(36) REFERENCES PUBLIC.ORGANIZATIONS(ORG_ID),
    ASSET_TYPE VARCHAR(50) NOT NULL,  -- 'GOOGLE_DOC', 'GITHUB', 'NOTION', etc.
    TITLE VARCHAR(500) NOT NULL,
    GOOGLE_DOC VARIANT,
    CONFUSION_DENSITY FLOAT,
    TOTAL_TRIGGERS INTEGER DEFAULT 0,
    USERS_AFFECTED INTEGER DEFAULT 0,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY (ORG_ID, ASSET_TYPE);

CREATE INDEX IF NOT EXISTS IDX_TRACKED_ASSETS_TYPE ON PUBLIC.TRACKED_ASSETS(ASSET_TYPE);
CREATE INDEX IF NOT EXISTS IDX_TRACKED_ASSETS_CONFUSION ON PUBLIC.TRACKED_ASSETS(CONFUSION_DENSITY DESC);
```

#### Option B: Update Code to Use DOCUMENTS Table
Change all references from `TRACKED_ASSETS` to `DOCUMENTS` and map columns:
- `ASSET_ID` → `DOC_ID`
- Remove `ASSET_TYPE` filter (or add it to DOCUMENTS table)

**Recommendation**: Option A - Create the table as it provides more flexibility.

---

### 2. Missing Table: `ORG_MEMBERSHIPS`

**Problem**: Code references `THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS` but this table doesn't exist in schema.

**Affected Files**:
- `routes/enterprise.py` (lines 577, 606, 674, 693)

**Solution**: Add to `migrations/create_schema.sql`:

```sql
-- Organization Memberships Table
CREATE TABLE IF NOT EXISTS PUBLIC.ORG_MEMBERSHIPS (
    MEMBERSHIP_ID VARCHAR(36) PRIMARY KEY,
    ORG_ID VARCHAR(36) NOT NULL REFERENCES PUBLIC.ORGANIZATIONS(ORG_ID),
    USER_ID VARCHAR(36) NOT NULL REFERENCES PUBLIC.USERS(USER_ID),
    ROLE VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
    JOINED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE(ORG_ID, USER_ID)
)
CLUSTER BY (ORG_ID, USER_ID);

CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_ORG ON PUBLIC.ORG_MEMBERSHIPS(ORG_ID);
CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_USER ON PUBLIC.ORG_MEMBERSHIPS(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_ROLE ON PUBLIC.ORG_MEMBERSHIPS(ORG_ID, ROLE);
```

---

### 3. Fixed: Table Name Mismatch `INTERACTION_LOGS` → `INTERACTIONS`

**Status**: ✅ **FIXED**

**What was changed**:
- Changed `INTERACTION_LOGS` to `INTERACTIONS`
- Changed column `INTERACTION_MODE` to `READING_STATE`

**File**: `routes/enterprise.py:334`

---

## How to Apply Fixes

### Step 1: Update Schema
1. Edit `backend/migrations/create_schema.sql`
2. Add the `TRACKED_ASSETS` table definition (see Option A above)
3. Add the `ORG_MEMBERSHIPS` table definition (see above)
4. Run the migration script against your Snowflake database

### Step 2: Verify Tables Exist
Run this SQL in Snowflake:
```sql
SELECT TABLE_NAME 
FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
ORDER BY TABLE_NAME;
```

You should see:
- `TRACKED_ASSETS` ✅
- `ORG_MEMBERSHIPS` ✅
- `INTERACTIONS` ✅ (already exists)

### Step 3: Test Endpoints
After fixing, test these endpoints:
```bash
# Test documents endpoint
curl http://localhost:8000/api/enterprise/documents \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test organization endpoint
curl http://localhost:8000/api/enterprise/organization \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test KPIs endpoint
curl http://localhost:8000/api/enterprise/kpis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Non-Critical Issues

### 4. SQLAlchemy ORM vs Raw SQL

**Issue**: `routes/personal.py` uses SQLAlchemy ORM instead of raw SQL (contradicts claim but works fine).

**Impact**: Low - ORM works with Snowflake, just inconsistent with other routes.

**Recommendation**: Either:
- Convert to raw SQL for consistency, OR
- Update documentation to reflect actual implementation

---

## Verification Checklist

After applying fixes, verify:

- [ ] `TRACKED_ASSETS` table exists in Snowflake
- [ ] `ORG_MEMBERSHIPS` table exists in Snowflake
- [ ] All endpoints return 200 (not 500) with valid auth token
- [ ] No SQL errors in logs
- [ ] Database queries execute successfully

---

## Quick Fix Script

Run this to check if tables exist:

```python
# backend/scripts/check_tables.py
from utils.database import get_db
from sqlalchemy import text

db = next(get_db())
result = db.execute(text("""
    SELECT TABLE_NAME 
    FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = 'PUBLIC'
    ORDER BY TABLE_NAME
"""))

tables = [row[0] for row in result.fetchall()]
required = ['TRACKED_ASSETS', 'ORG_MEMBERSHIPS', 'INTERACTIONS', 'DOCUMENTS']

print("Existing tables:", tables)
print("\nRequired tables:")
for table in required:
    status = "✅" if table in tables else "❌ MISSING"
    print(f"  {status} {table}")
```

---

**Last Updated**: 2025-01-27  
**Priority**: 🔴 **CRITICAL** - Fix before deployment
