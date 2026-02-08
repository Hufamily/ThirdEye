# Migration to Gemini API

**Date**: 2025-02-08  
**Status**: ✅ In Progress

---

## Changes Made

### 1. Created Gemini Client
- ✅ `backend/services/gemini_client.py` - Gemini API client
- Uses `gemini-2.0-flash-exp` model (or `gemini-1.5-pro` for more capable)
- Supports chat completions, JSON mode, system instructions

### 2. Updated Agent 0.0
- ✅ Changed from Dedalus Labs (GPT-4) to Gemini
- ✅ Updated imports and method calls
- ✅ Maintains same functionality

### 3. Google Permissions
- ✅ Updated frontend to request Drive and Chat scopes
- ✅ Created Google Drive client (`google_drive_client.py`)
- ✅ Created Google Chat/Gmail client (`google_chat_client.py`)

---

## Environment Variables Needed

Add to `.env`:

```bash
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
```

**Get API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create new API key or use existing
3. Add to `.env` file

---

## Google OAuth Scopes Added

The frontend now requests these scopes:

- `openid` - Basic authentication
- `email` - User email
- `profile` - User profile
- `https://www.googleapis.com/auth/drive.readonly` - Read Drive files
- `https://www.googleapis.com/auth/drive.file` - Access app-created files
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail
- `https://www.googleapis.com/auth/chat.messages.readonly` - Read Chat messages

---

## Next Steps

1. **Add Gemini API Key** to `.env`
2. **Update OAuth Consent Screen** in Google Cloud Console:
   - Add Drive scopes
   - Add Gmail scope
   - Add Chat scope
   - Enable required APIs (Drive, Gmail, Chat)
3. **Test Agent 0.0** with Gemini
4. **Test Google Drive access** after login
5. **Update other agents** to use Gemini if needed

---

## Testing

### Test Gemini Connection

```bash
cd backend
python3 -c "
import asyncio
from services.gemini_client import GeminiClient

async def test():
    client = GeminiClient()
    result = await client.chat([{'role': 'user', 'content': 'Hello'}])
    print(result)

asyncio.run(test())
"
```

### Test Google Drive Access

After user logs in with new scopes, test Drive access:

```python
from services.google_drive_client import GoogleDriveClient

# Use access token from OAuth flow
client = GoogleDriveClient(access_token=user_token)
files = client.list_files()
print(f"Found {len(files)} files")
```

---

**Status**: Ready for testing after adding Gemini API key
