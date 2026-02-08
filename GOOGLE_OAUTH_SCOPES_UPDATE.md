# Google OAuth Scopes Update - Action Required

**Date**: 2025-02-08  
**Priority**: 🔴 **HIGH** - Required for Google Drive and Chat access

---

## What Changed

### Frontend (`Devfest/src/components/auth/LoginModal.tsx`)
✅ **Updated** to request additional scopes:
- Google Drive read access
- Google Drive file access  
- Gmail read access
- Google Chat read access

### Backend
✅ **Created** Google API clients:
- `backend/services/google_drive_client.py` - Drive API client
- `backend/services/google_chat_client.py` - Gmail/Chat API client

---

## Required Actions in Google Cloud Console

### 1. Update OAuth Consent Screen

**Go to**: [Google Cloud Console](https://console.cloud.google.com/) → Your Project → **APIs & Services** → **OAuth consent screen**

#### Add These Scopes:

**User-facing scopes:**
1. ✅ `openid` (already added)
2. ✅ `email` (already added)
3. ✅ `profile` (already added)
4. 🔴 **NEW**: `https://www.googleapis.com/auth/drive.readonly`
   - Display name: "See and download all your Google Drive files"
   - User-facing: Yes
5. 🔴 **NEW**: `https://www.googleapis.com/auth/drive.file`
   - Display name: "See, edit, create, and delete only the specific Google Drive files you use with this app"
   - User-facing: Yes
6. 🔴 **NEW**: `https://www.googleapis.com/auth/gmail.readonly`
   - Display name: "View your email messages and settings"
   - User-facing: Yes
   - ⚠️ **Sensitive scope** - requires verification for production
7. 🔴 **NEW**: `https://www.googleapis.com/auth/chat.messages.readonly`
   - Display name: "View your Google Chat messages"
   - User-facing: Yes
   - ⚠️ **Sensitive scope** - requires verification for production

### 2. Enable Required APIs

**Go to**: [Google Cloud Console](https://console.cloud.google.com/) → Your Project → **APIs & Services** → **Library**

Enable these APIs:
1. ✅ **Google Drive API** - Click "Enable"
2. ✅ **Gmail API** - Click "Enable"
3. ✅ **Google Chat API** - Click "Enable"

### 3. Add Test Users (If in Testing Mode)

**Go to**: OAuth consent screen → **Test users**

Add email addresses of users who will test the app:
- Your email
- Team member emails
- Test accounts

---

## Sensitive Scopes - Important Notes

### Gmail and Chat Scopes
These are **sensitive scopes** that require:

1. **For Testing**:
   - ✅ Add test users in OAuth consent screen
   - ✅ App must be in "Testing" mode
   - ✅ Test users can grant sensitive scopes without verification

2. **For Production**:
   - ⚠️ **App Verification Required** by Google
   - ⚠️ **Privacy Policy URL** required (must be publicly accessible)
   - ⚠️ **Terms of Service URL** required (must be publicly accessible)
   - ⚠️ **Security Assessment** may be required
   - ⚠️ Can take 4-6 weeks for Google review

### Recommendation
- **Start with Testing mode** and test users
- **Add sensitive scopes** for testing
- **Prepare verification materials** for production later

---

## Testing the Changes

### 1. Test Login Flow

1. Clear browser cache/cookies
2. Log out if logged in
3. Try logging in again
4. You should see **multiple consent screens**:
   - First: Basic sign-in (openid, email, profile)
   - Second: Drive access
   - Third: Gmail access (if sensitive scopes enabled)
   - Fourth: Chat access (if sensitive scopes enabled)

### 2. Verify Scopes in Token

After login, check granted scopes:

```javascript
// In browser console
const token = localStorage.getItem('auth_token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Scopes:', payload.scope);
```

### 3. Test Drive Access

```python
# Backend test
from services.google_drive_client import GoogleDriveClient

# Use access token from OAuth
client = GoogleDriveClient(access_token=user_token)
files = client.list_files()
print(f"Found {len(files)} files")
```

---

## Current Status

✅ **Frontend**: Updated to request scopes  
✅ **Backend**: Google API clients created  
⏳ **OAuth Consent Screen**: Needs manual update  
⏳ **APIs**: Need to be enabled  
⏳ **Testing**: Pending scope updates  

---

## Next Steps

1. **Update OAuth Consent Screen** (5 minutes)
   - Add Drive scopes
   - Add Gmail scope
   - Add Chat scope

2. **Enable APIs** (2 minutes)
   - Enable Drive API
   - Enable Gmail API
   - Enable Chat API

3. **Add Test Users** (if in testing mode)
   - Add your email
   - Add team emails

4. **Test Login Flow**
   - Clear cache
   - Login again
   - Verify scopes are requested

5. **Test API Access**
   - Try accessing Drive files
   - Try accessing Gmail messages

---

**Action Required**: Update Google Cloud Console OAuth consent screen NOW
