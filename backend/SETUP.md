# ThirdEye Backend Setup Guide

This guide will walk you through setting up all credentials and dependencies for the ThirdEye backend.

## Prerequisites

- Python 3.9+ installed
- Snowflake account (free trial available at https://signup.snowflake.com/)
- Google Cloud Project with OAuth credentials
- Dedalus Labs API key (already provided)

---

## Step 1: Snowflake Setup

### 1.1 Create Snowflake Account

1. Go to https://signup.snowflake.com/
2. Sign up for a free trial (no credit card required for trial)
3. Choose your cloud provider (AWS, Azure, or GCP) and region
4. Complete the signup process

### 1.2 Get Your Snowflake Account Identifier

After signing up, you'll see your account URL. Extract the account identifier:

- **Format**: `https://<account_identifier>.<region>.snowflakecomputing.com`
- **Example**: If your URL is `https://xy12345.us-east-1.snowflakecomputing.com`
  - Account identifier: `xy12345.us-east-1`
  - Region: `us-east-1`

### 1.3 Create Database and Schema

1. Log into Snowflake web interface
2. Open a SQL worksheet
3. Run the following SQL commands:

```sql
-- Create database
CREATE DATABASE IF NOT EXISTS THIRDEYE_DEV;

-- Use the database
USE DATABASE THIRDEYE_DEV;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS PUBLIC;
CREATE SCHEMA IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS STAGING;
CREATE SCHEMA IF NOT EXISTS AUDIT;

-- Create warehouses (compute resources)
CREATE WAREHOUSE IF NOT EXISTS COMPUTE_WH
  WITH WAREHOUSE_SIZE = 'X-Small'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

CREATE WAREHOUSE IF NOT EXISTS ANALYTICS_WH
  WITH WAREHOUSE_SIZE = 'Small'
  AUTO_SUSPEND = 300
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

-- Grant permissions
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE PUBLIC;
GRANT USAGE ON WAREHOUSE ANALYTICS_WH TO ROLE PUBLIC;
GRANT ALL PRIVILEGES ON DATABASE THIRDEYE_DEV TO ROLE PUBLIC;
GRANT ALL PRIVILEGES ON SCHEMA PUBLIC TO ROLE PUBLIC;
GRANT ALL PRIVILEGES ON SCHEMA ANALYTICS TO ROLE PUBLIC;
```

### 1.4 Create User and Get Credentials

1. In Snowflake web interface, go to **Admin** → **Users & Roles**
2. Click **Create User** (or use your existing user)
3. Note down:
   - **Username**: Your Snowflake username
   - **Password**: Set a strong password (you'll need this)
   - **Account**: Your account identifier (from step 1.2)

### 1.5 Run Database Schema

1. Copy the contents of `backend/migrations/create_schema.sql`
2. Paste into Snowflake SQL worksheet
3. Make sure you're using the correct database: `USE DATABASE THIRDEYE_DEV;`
4. Run the entire script

---

## Step 2: Google OAuth Setup

### 2.1 Get Client Secret

1. Go to https://console.cloud.google.com/
2. Select your project (or create one)
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID (matching the client ID in `.env`)
5. Click on it to view details
6. Copy the **Client Secret**

### 2.2 Add to Environment Variables

Add the client secret to your `.env` file (see Step 4 below).

---

## Step 3: Dedalus Labs API

✅ **Already configured!** Your API key has been added to `.env.example`.

- **API Key**: `dsk-live-26efce6175d9-551d8047c7b33ce00f9b82035b23b658`
- **API URL**: `https://api.dedaluslabs.ai`

---

## Step 4: Create `.env` File

**Note:** ThirdEye now uses a unified `.env` file at the project root (not in backend directory).

1. Copy `.env.example` to `.env` at the project root:
   ```bash
   # From project root (ThirdEye/)
   cp .env.example .env
   ```

2. Edit the root `.env` file and fill in all values:

```bash
# Snowflake Configuration (from Step 1)
SNOWFLAKE_ACCOUNT=your_account_identifier.us-east-1  # e.g., xy12345.us-east-1
SNOWFLAKE_USER=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=THIRDEYE_DEV
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_ROLE=PUBLIC

# JWT Authentication (generate a secure random string)
JWT_SECRET_KEY=your-secret-key-change-in-production-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# Google OAuth (from Step 2)
GOOGLE_CLIENT_ID=331266334090-nahb5m02sqd86tlh3fq1jjjur9msdk83.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Dedalus Labs (already configured)
DEDALUS_API_KEY=dsk-live-26efce6175d9-551d8047c7b33ce00f9b82035b23b658
DEDALUS_API_URL=https://api.dedaluslabs.ai

# K2-Think (Kimi K2)
K2_API_KEY=IFM-FKSKeh0mN28qkOp8
K2_BASE_URL=https://api.kimi-k2.ai
K2_MODEL=kimi/k2-think

# Server Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_BASE_URL=http://localhost:8000/api
FRONTEND_URL=http://localhost:5173

# Environment
ENVIRONMENT=development
```

### Generate JWT Secret Key

Run this Python command to generate a secure JWT secret:

```python
import secrets
print(secrets.token_urlsafe(32))
```

Or use this one-liner:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Step 5: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

---

## Step 6: Verify Setup

### Test Snowflake Connection

```bash
cd backend
python3 -c "
from utils.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text('SELECT CURRENT_VERSION()'))
    print('Snowflake connected! Version:', result.fetchone()[0])
"
```

### Test Backend Server

```bash
cd backend
python -m app.main
```

Visit http://localhost:8000/docs to see the API documentation.

**Note:** The backend automatically reads from the root `.env` file. You don't need a separate `.env` in the backend directory.

---

## Troubleshooting

### Snowflake Connection Issues

- **Error: "Invalid account identifier"**
  - Make sure your account identifier includes the region (e.g., `xy12345.us-east-1`)
  
- **Error: "Authentication failed"**
  - Verify username and password are correct
  - Check if your user has proper permissions
  
- **Error: "Warehouse not found"**
  - Make sure you created the warehouses in Step 1.3
  - Verify warehouse name matches in `.env`

### Google OAuth Issues

- **Error: "Invalid client secret"**
  - Make sure you copied the entire client secret (no extra spaces)
  - Verify the client ID matches between frontend and backend

### Dedalus Labs Issues

- **Error: "Invalid API key"**
  - Verify the API key is correct
  - Check if there are any extra spaces or newlines

---

## Next Steps

Once all credentials are configured:

1. ✅ Run database migrations (schema already created in Step 1.5)
2. ✅ Start the backend server
3. ✅ Test authentication endpoints
4. ✅ Continue with agent integration

---

## Security Notes

- **Never commit `.env` file to git** (already in `.gitignore`)
- **Use different credentials for production**
- **Rotate JWT secret key regularly**
- **Keep API keys secure and never share them**
