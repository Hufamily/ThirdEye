# Snowflake Schema Update Instructions

This guide will walk you through updating your Snowflake database schema to add the missing tables.

---

## Prerequisites

1. **Snowflake Account Access**: You need access to your Snowflake account
2. **Database**: `THIRDEYE_DEV` database should already exist
3. **Schema**: `PUBLIC` schema should already exist
4. **Permissions**: You need `CREATE TABLE` and `CREATE INDEX` permissions

---

## Method 1: Using Snowflake Web UI (Recommended)

### Step 1: Open Snowflake Web UI
1. Go to https://app.snowflake.com (or your Snowflake instance URL)
2. Log in with your credentials
3. Select your account and warehouse

### Step 2: Navigate to Worksheets
1. Click on **"Worksheets"** in the left sidebar
2. Click **"+"** to create a new worksheet

### Step 3: Set Context
Run these commands first to set your context:

```sql
-- Set your account, warehouse, database, and schema
USE WAREHOUSE COMPUTE_WH;  -- Replace with your warehouse name if different
USE DATABASE THIRDEYE_DEV;
USE SCHEMA PUBLIC;
```

### Step 4: Run the Update Script
1. Open the file `backend/migrations/update_schema.sql` in your editor
2. Copy the entire contents
3. Paste it into the Snowflake worksheet
4. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)

### Step 5: Verify Tables Were Created
Run this query to verify:

```sql
SELECT TABLE_NAME 
FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
  AND TABLE_NAME IN ('TRACKED_ASSETS', 'ORG_MEMBERSHIPS')
ORDER BY TABLE_NAME;
```

You should see:
```
TABLE_NAME
----------
ORG_MEMBERSHIPS
TRACKED_ASSETS
```

---

## Method 2: Using SnowSQL CLI

### Step 1: Install SnowSQL (if not already installed)
Download from: https://docs.snowflake.com/en/user-guide/snowsql-install-config.html

### Step 2: Configure Connection
Create/edit `~/.snowsql/config`:

```ini
[connections.thirdeye]
accountname = YOUR_ACCOUNT_NAME
username = YOUR_USERNAME
password = YOUR_PASSWORD
warehousename = COMPUTE_WH
dbname = THIRDEYE_DEV
schemaname = PUBLIC
rolename = PUBLIC
```

### Step 3: Run the Update Script
```bash
cd /Users/jy/Desktop/ThirdEye/backend/migrations
snowsql -c thirdeye -f update_schema.sql
```

### Step 4: Verify
```bash
snowsql -c thirdeye -q "SELECT TABLE_NAME FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME IN ('TRACKED_ASSETS', 'ORG_MEMBERSHIPS');"
```

---

## Method 3: Using Python Script

### Step 1: Run the Update Script
```bash
cd /Users/jy/Desktop/ThirdEye/backend
python scripts/update_snowflake_schema.py
```

*(Note: This script needs to be created - see below)*

---

## Quick Verification Script

After running the update, verify everything works:

```sql
-- Check if tables exist
SELECT TABLE_NAME 
FROM THIRDEYE_DEV.INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
  AND TABLE_NAME IN ('TRACKED_ASSETS', 'ORG_MEMBERSHIPS', 'INTERACTIONS', 'DOCUMENTS')
ORDER BY TABLE_NAME;

-- Check table structures
DESCRIBE TABLE THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS;
DESCRIBE TABLE THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS;

-- Check indexes
SHOW INDEXES IN TABLE THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS;
SHOW INDEXES IN TABLE THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS;
```

---

## Troubleshooting

### Error: "Table already exists"
**Solution**: This is fine! The `CREATE TABLE IF NOT EXISTS` will skip creation if the table already exists. You can proceed.

### Error: "Insufficient privileges"
**Solution**: 
1. Check that you're using the correct role
2. Contact your Snowflake admin to grant `CREATE TABLE` permissions
3. Run: `SHOW GRANTS TO ROLE PUBLIC;` to see your permissions

### Error: "Warehouse not found"
**Solution**: 
1. Check your warehouse name: `SHOW WAREHOUSES;`
2. Update the `USE WAREHOUSE` command with the correct name
3. Or use: `ALTER WAREHOUSE YOUR_WAREHOUSE_NAME RESUME;`

### Error: "Database not found"
**Solution**: 
1. Check if database exists: `SHOW DATABASES LIKE 'THIRDEYE_DEV';`
2. If it doesn't exist, create it: `CREATE DATABASE IF NOT EXISTS THIRDEYE_DEV;`

### Error: "Schema not found"
**Solution**: 
1. Check if schema exists: `SHOW SCHEMAS IN DATABASE THIRDEYE_DEV;`
2. If it doesn't exist, create it: `CREATE SCHEMA IF NOT EXISTS THIRDEYE_DEV.PUBLIC;`

---

## What Gets Created

### 1. TRACKED_ASSETS Table
- **Purpose**: Tracks all assets (Google Docs, GitHub repos, etc.) with confusion metrics
- **Key Columns**: `ASSET_ID`, `ASSET_TYPE`, `CONFUSION_DENSITY`, `TOTAL_TRIGGERS`
- **Indexes**: Created on `ASSET_TYPE`, `ORG_ID`, and `CONFUSION_DENSITY`

### 2. ORG_MEMBERSHIPS Table
- **Purpose**: Links users to organizations with roles
- **Key Columns**: `ORG_ID`, `USER_ID`, `ROLE` ('admin' or 'member')
- **Indexes**: Created on `ORG_ID`, `USER_ID`, and `(ORG_ID, ROLE)`
- **Unique Constraint**: One membership per user per organization

---

## After Update Checklist

- [ ] Tables created successfully
- [ ] Indexes created successfully
- [ ] No errors in Snowflake query history
- [ ] Backend API starts without errors
- [ ] Test endpoints work:
  - `GET /api/enterprise/documents` ✅
  - `GET /api/enterprise/organization` ✅
  - `GET /api/enterprise/kpis` ✅

---

## Rollback (if needed)

If something goes wrong and you need to remove the tables:

```sql
-- WARNING: This will delete all data in these tables!
DROP TABLE IF EXISTS THIRDEYE_DEV.PUBLIC.TRACKED_ASSETS;
DROP TABLE IF EXISTS THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS;
```

---

## Need Help?

If you encounter issues:
1. Check Snowflake query history for detailed error messages
2. Verify your connection settings in `.env` file
3. Ensure your Snowflake user has the necessary permissions
4. Check the `backend/VERIFICATION_REPORT.md` for more details

---

**Last Updated**: 2025-01-27  
**Status**: Ready to execute
