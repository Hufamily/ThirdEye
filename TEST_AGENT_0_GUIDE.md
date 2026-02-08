# Testing Agent 0.0 (Persona Architect) Guide

**Date**: 2025-02-08  
**Complete Testing Guide**

---

## Prerequisites

### 1. Backend Running
```bash
cd backend
python3 -m uvicorn app.main:app --reload --port 8000
```

### 2. Database Connection
- ✅ Snowflake connection configured
- ✅ Tables created (USERS, SESSIONS, DOCUMENTS, etc.)
- ✅ User account exists

### 3. Google OAuth Setup
- ✅ Google Cloud Console configured
- ✅ OAuth scopes added (Drive, Gmail, Chat)
- ✅ Client ID and Secret in `.env`

### 4. Browser History Tracking
- ✅ Chrome extension installed
- ✅ History permission granted
- ✅ Extension tracking visits

### 5. Google Docs Access
- ✅ User has Google Docs
- ✅ Access token available (from OAuth flow)

---

## Step-by-Step Testing

### Step 1: Get Authentication Token

#### Option A: Use Existing Login Flow
```bash
# If you have a frontend running, login through the UI
# The JWT token will be in localStorage or cookies
```

#### Option B: Create Test Token Manually
```python
# Create a test script: backend/scripts/create_test_token.py
from utils.auth import create_access_token
from models.user import User
from utils.database import get_db

# Get your user from database
db = next(get_db())
user = db.query(User).filter(User.email == "your-email@example.com").first()

# Create token
token_data = {"sub": user.user_id, "email": user.email}
token = create_access_token(token_data)
print(f"Token: {token}")
```

### Step 2: Get Google Access Token

#### Option A: From Frontend OAuth Flow
1. Login through your React app
2. After Google OAuth, get the access token from the response
3. Store it for testing

#### Option B: Use Google OAuth Playground
1. Go to https://developers.google.com/oauthplayground/
2. Select scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
3. Authorize and get access token

### Step 3: Ensure Browser History is Being Tracked

```bash
# Check if extension is tracking
# 1. Open Chrome DevTools (F12)
# 2. Go to Console tab
# 3. Navigate to a few pages
# 4. Look for: "[ContextGrabber] Visit tracked: ..."

# Or check backend logs for history tracking
```

### Step 4: Verify Data in Database

```python
# Test script: backend/scripts/check_user_data.py
from utils.database import engine
from sqlalchemy import text
import json

user_id = "your-user-id"

with engine.connect() as conn:
    # Check sessions with history
    result = conn.execute(text("""
        SELECT SESSION_ID, METADATA, STARTED_AT
        FROM THIRDEYE_DEV.PUBLIC.SESSIONS
        WHERE USER_ID = :user_id
          AND METADATA IS NOT NULL
        ORDER BY STARTED_AT DESC
        LIMIT 5
    """), {"user_id": user_id})
    
    for row in result:
        metadata = json.loads(row[1]) if row[1] else {}
        history_visits = metadata.get("history_visits", [])
        print(f"Session {row[0]}: {len(history_visits)} history visits")
    
    # Check documents
    result = conn.execute(text("""
        SELECT D.DOC_ID, D.TITLE, D.GOOGLE_DOC
        FROM THIRDEYE_DEV.PUBLIC.DOCUMENTS D
        JOIN THIRDEYE_DEV.PUBLIC.ORG_MEMBERSHIPS OM ON D.ORG_ID = OM.ORG_ID
        WHERE OM.USER_ID = :user_id
        LIMIT 5
    """), {"user_id": user_id})
    
    print("\nDocuments:")
    for row in result:
        print(f"  - {row[1]} (ID: {row[0]})")
```

### Step 5: Test Agent 0.0 API

#### Test 1: Basic Test (Metadata Only)
```bash
curl -X POST http://localhost:8000/api/agents/persona-architect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "include_docs": true,
    "include_history": true,
    "include_sessions": true
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "personaCard": {
      "userId": "user-123",
      "expertiseLevels": {
        "Python": "intermediate",
        "JavaScript": "beginner"
      },
      "learningStyle": "reading",
      "preferredTopics": ["Web Development", "Python"],
      "browsingInsights": {
        "totalVisits": 150,
        "learningSitesCount": 5,
        "topDomains": ["github.com", "stackoverflow.com"]
      }
    }
  }
}
```

#### Test 2: With Google Docs Content
```bash
curl -X POST http://localhost:8000/api/agents/persona-architect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "include_docs": true,
    "include_history": true,
    "include_sessions": true,
    "google_access_token": "ya29.a0AfH6SMB..."
  }' | jq
```

**Expected Response:**
- Same structure as Test 1
- More accurate expertise levels (from content analysis)
- Better topic identification (from actual doc content)

#### Test 3: Python Script (More Detailed)
```python
# backend/scripts/test_agent_00_full.py
import asyncio
import httpx
import json

async def test_agent_00():
    base_url = "http://localhost:8000"
    jwt_token = "YOUR_JWT_TOKEN"
    google_token = "ya29.a0AfH6SMB..."  # Optional
    
    async with httpx.AsyncClient() as client:
        # Test with both sources
        response = await client.post(
            f"{base_url}/api/agents/persona-architect",
            headers={
                "Authorization": f"Bearer {jwt_token}",
                "Content-Type": "application/json"
            },
            json={
                "include_docs": True,
                "include_history": True,
                "include_sessions": True,
                "google_access_token": google_token  # Optional
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Success!")
            print(json.dumps(result, indent=2))
            
            # Check key fields
            persona = result.get("data", {}).get("personaCard", {})
            
            print("\n📊 Persona Summary:")
            print(f"  Expertise Levels: {persona.get('expertiseLevels', {})}")
            print(f"  Learning Style: {persona.get('learningStyle')}")
            print(f"  Preferred Topics: {persona.get('preferredTopics', [])}")
            
            browsing = persona.get("browsingInsights")
            if browsing:
                print(f"\n🌐 Browsing Insights:")
                print(f"  Total Visits: {browsing.get('totalVisits')}")
                print(f"  Learning Sites: {browsing.get('learningSitesCount')}")
                print(f"  Top Domains: {browsing.get('topDomains', [])}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(response.text)

if __name__ == "__main__":
    asyncio.run(test_agent_00())
```

Run it:
```bash
cd backend
python3 scripts/test_agent_00_full.py
```

---

## Verification Checklist

### ✅ Check 1: Browser History is Tracked
- [ ] Extension installed and enabled
- [ ] History permission granted
- [ ] Visits logged in console: `[ContextGrabber] Visit tracked`
- [ ] Sessions have `history_visits` in metadata

### ✅ Check 2: Google Docs Available
- [ ] User has documents in database
- [ ] Documents linked via ORG_MEMBERSHIPS
- [ ] Google Doc IDs present in metadata

### ✅ Check 3: Access Token Works
- [ ] Google OAuth token obtained
- [ ] Token has Drive API scope
- [ ] Can fetch doc content (test separately)

### ✅ Check 4: Agent Response
- [ ] Response includes `personaCard`
- [ ] `expertiseLevels` populated
- [ ] `browsingInsights` present (if history tracked)
- [ ] `preferredTopics` includes topics from both sources

### ✅ Check 5: Cross-Reference Working
- [ ] Topics appear in both docs and browsing
- [ ] Expertise levels validated by both sources
- [ ] Learning gaps identified from comparing both

---

## Troubleshooting

### Issue: "No history data available"
**Solution:**
1. Check extension is tracking: Look for console logs
2. Verify sessions have history in metadata
3. Ensure `include_history: true` in request

### Issue: "No documents found"
**Solution:**
1. Check user has documents in database
2. Verify ORG_MEMBERSHIPS link user to org
3. Check documents linked to same org

### Issue: "Error fetching Google Docs content"
**Solution:**
1. Verify access token is valid
2. Check token has Drive API scope
3. Verify document IDs are correct Google Doc IDs
4. Check Google Drive API is enabled in Cloud Console

### Issue: "401 Unauthorized"
**Solution:**
1. Check JWT token is valid
2. Verify token hasn't expired
3. Check user exists in database

### Issue: "Empty persona card"
**Solution:**
1. Ensure user has some data (docs, sessions, or history)
2. Check Gemini API key is set
3. Verify Gemini API is working

---

## Quick Test Script

Create `backend/scripts/quick_test_agent_00.sh`:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:8000/api/agents/persona-architect"
JWT_TOKEN="YOUR_JWT_TOKEN"
GOOGLE_TOKEN="ya29.a0AfH6SMB..."  # Optional

echo "🧪 Testing Agent 0.0..."
echo ""

# Test 1: Basic (metadata only)
echo "Test 1: Basic (metadata only)"
curl -X POST "$API_URL" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "include_docs": true,
    "include_history": true
  }' | jq '.data.personaCard | {expertiseLevels, preferredTopics, browsingInsights}'

echo ""
echo ""

# Test 2: With Google Docs content
if [ ! -z "$GOOGLE_TOKEN" ]; then
    echo "Test 2: With Google Docs content"
    curl -X POST "$API_URL" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"include_docs\": true,
        \"include_history\": true,
        \"google_access_token\": \"$GOOGLE_TOKEN\"
      }" | jq '.data.personaCard | {expertiseLevels, preferredTopics, browsingInsights}'
else
    echo "⚠️  Google token not set, skipping content test"
fi

echo ""
echo "✅ Tests complete!"
```

Make it executable:
```bash
chmod +x backend/scripts/quick_test_agent_00.sh
./backend/scripts/quick_test_agent_00.sh
```

---

## Expected Results

### With Both Sources (Ideal)
```json
{
  "expertiseLevels": {
    "Python": "intermediate",  // Validated by both docs content and browsing
    "React": "beginner"        // Tutorial sites + basic docs
  },
  "preferredTopics": [
    "Web Development",         // Found in both docs and browsing
    "Python Programming"        // Core interest (both sources)
  ],
  "browsingInsights": {
    "totalVisits": 150,
    "learningSitesCount": 5,
    "topDomains": ["github.com", "stackoverflow.com"]
  }
}
```

### With Metadata Only
```json
{
  "expertiseLevels": {
    "Python": "intermediate"    // Less accurate (no content)
  },
  "preferredTopics": [
    "Web Development"          // From titles only
  ],
  "browsingInsights": {
    "totalVisits": 150,
    "learningSitesCount": 5
  }
}
```

---

## Next Steps After Testing

1. **Verify Cross-Reference**: Check that topics in docs match browsing patterns
2. **Validate Expertise**: Ensure expertise levels make sense from both sources
3. **Check Gaps**: Verify knowledge gaps are identified correctly
4. **Monitor Performance**: Check response times and API usage

---

**Ready to test!** Follow the steps above and verify each checkpoint.
