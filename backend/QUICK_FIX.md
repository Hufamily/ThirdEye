# Quick Fix for Missing ORG_MEMBERSHIPS Table

## The Problem
You're seeing this error:
```
SQL compilation error: Object 'THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS' does not exist or not authorized.
```

## The Solution

### Option 1: Copy-Paste SQL (Fastest)

1. **In Snowflake Web UI**, open a new worksheet
2. **Copy and paste this SQL**:

```sql
USE WAREHOUSE COMPUTE_WH;  -- Change if your warehouse has a different name
USE DATABASE THIRDEYE_DEV;
USE SCHEMA PUBLIC;

-- Create ORG_MEMBERSHIPS table
CREATE TABLE IF NOT EXISTS THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS (
    MEMBERSHIP_ID VARCHAR(36) PRIMARY KEY,
    ORG_ID VARCHAR(36) NOT NULL REFERENCES THIRDEYE_DEV.PUBLIC.ORGANIZATIONS(ORG_ID),
    USER_ID VARCHAR(36) NOT NULL REFERENCES THIRDEYE_DEV.PUBLIC.USERS(USER_ID),
    ROLE VARCHAR(20) NOT NULL DEFAULT 'member',
    JOINED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UNIQUE(ORG_ID, USER_ID)
)
CLUSTER BY (ORG_ID, USER_ID);

CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_ORG ON THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS(ORG_ID);
CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_USER ON THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS(USER_ID);
CREATE INDEX IF NOT EXISTS IDX_ORG_MEMBERSHIPS_ROLE ON THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS(ORG_ID, ROLE);
```

3. **Click "Run"** (or press Ctrl+Enter / Cmd+Enter)
4. **Verify** it worked - you should see "Table ORG_MEMBERSHIPS created successfully"

### Option 2: Use the Fix Script File

1. Open `backend/migrations/fix_missing_tables.sql` in your editor
2. Copy the entire contents
3. Paste into Snowflake worksheet
4. Run it

### Option 3: Use Python Script

```bash
cd /Users/jy/Desktop/ThirdEye/backend
python scripts/update_snowflake_schema.py
```

## Verify It Worked

After running, check that the table exists:

```sql
SELECT TABLE_NAME 
FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
  AND TABLE_NAME = 'ORG_MEMBERSHIPS';
```

You should see `ORG_MEMBERSHIPS` in the results.

## Note About INTERACTION_LOGS vs INTERACTIONS

I noticed your database has `INTERACTION_LOGS` but the code uses `INTERACTIONS`. 

- If `INTERACTION_LOGS` works for you, that's fine - the code was already fixed to use `INTERACTIONS`
- If you want to use `INTERACTIONS` instead, you can create it using the commented section in `fix_missing_tables.sql`

The important thing right now is to create `ORG_MEMBERSHIPS` to fix the error you're seeing.
