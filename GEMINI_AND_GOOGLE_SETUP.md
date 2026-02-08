# Gemini API & Google Permissions Setup - Quick Reference

**Date**: 2025-02-08

---

## ✅ What's Been Done

1. **Gemini Client Created** (`backend/services/gemini_client.py`)
2. **Agent 0.0 Updated** - Now uses Gemini instead of GPT-4
3. **Google Drive Client Created** (`backend/services/google_drive_client.py`)
4. **Google Chat/Gmail Client Created** (`backend/services/google_chat_client.py`)
5. **Frontend Updated** - Ready to request scopes (configured in Google Cloud Console)
6. **Backend Routes Created** - Token storage endpoints

---

## 🔴 ACTION REQUIRED

### 1. Add Gemini API Key

**Get API Key**: https://aistudio.google.com/app/apikey

**Add to `.env`**:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

**Test**:
```bash
cd backend
python3 scripts/test_gemini.py
```

### 2. Update Google Cloud Console

**Go to**: https://console.cloud.google.com/

#### A. OAuth Consent Screen
1. **APIs & Services** → **OAuth consent screen**
2. Click **Edit App**
3. **Add Scopes**:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/gmail.readonly` (sensitive)
   - `https://www.googleapis.com/auth/chat.messages.readonly` (sensitive)

#### B. Enable APIs
1. **APIs & Services** → **Library**
2. Enable:
   - Google Drive API
   - Gmail API
   - Google Chat API

#### C. Add Test Users (if in Testing mode)
1. **OAuth consent screen** → **Test users**
2. Add your email and team emails

---

## 📋 Files Created/Updated

### Backend
- ✅ `backend/services/gemini_client.py` - Gemini API client
- ✅ `backend/services/google_drive_client.py` - Drive API client
- ✅ `backend/services/google_chat_client.py` - Gmail/Chat client
- ✅ `backend/agents/persona_architect.py` - Updated to use Gemini
- ✅ `backend/routes/google_auth.py` - Token management
- ✅ `backend/app/config.py` - Added gemini_api_key
- ✅ `backend/scripts/test_gemini.py` - Test script

### Frontend
- ✅ `Devfest/src/components/auth/LoginModal.tsx` - Ready for scopes

### Documentation
- ✅ `GEMINI_MIGRATION.md` - Migration guide
- ✅ `GOOGLE_PERMISSIONS_SETUP.md` - Permissions guide
- ✅ `GOOGLE_OAUTH_SCOPES_UPDATE.md` - Scope update guide
- ✅ `GOOGLE_SCOPES_COMPLETE_GUIDE.md` - Complete guide

---

## 🧪 Testing

### Test Gemini
```bash
cd backend
python3 scripts/test_gemini.py
```

### Test Google Drive (after scopes granted)
```python
from services.google_drive_client import GoogleDriveClient

client = GoogleDriveClient(access_token=user_token)
files = client.list_files()
print(f"Found {len(files)} files")
```

---

## ⚠️ Important Notes

1. **Scopes are configured in Google Cloud Console**, not in the component
2. **Sensitive scopes** (Gmail, Chat) require verification for production
3. **Test users** can grant sensitive scopes without verification
4. **Access tokens** need to be stored and used for API calls

---

**Next**: Update Google Cloud Console OAuth consent screen + Add Gemini API key
