# Google Permissions Setup Guide

**Date**: 2025-02-08  
**Purpose**: Configure Google OAuth to access Drive and Chat/Gmail history

---

## Required Scopes

ThirdEye needs the following Google API scopes:

### Basic Authentication
- `openid` - OpenID Connect
- `email` - User's email address
- `profile` - User's basic profile

### Google Drive Access
- `https://www.googleapis.com/auth/drive.readonly` - Read-only access to Drive files
- `https://www.googleapis.com/auth/drive.file` - Access files created/opened by the app

### Chat/Gmail History
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages
- `https://www.googleapis.com/auth/chat.messages.readonly` - Read Google Chat messages

---

## Setup Steps

### 1. Update OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Click **Edit App**

#### Add Required Scopes:

**User-facing scopes:**
- ✅ `openid`
- ✅ `email`
- ✅ `profile`
- ✅ `https://www.googleapis.com/auth/drive.readonly` - "See and download all your Google Drive files"
- ✅ `https://www.googleapis.com/auth/drive.file` - "See, edit, create, and delete only the specific Google Drive files you use with this app"
- ✅ `https://www.googleapis.com/auth/gmail.readonly` - "View your email messages and settings"
- ✅ `https://www.googleapis.com/auth/chat.messages.readonly` - "View your Google Chat messages"

**Sensitive scopes** (may require verification):
- Gmail and Chat scopes are **sensitive** and may require:
  - App verification by Google
  - Privacy policy URL
  - Terms of service URL
  - Security assessment (for production)

### 2. Enable Required APIs

Enable these APIs in your Google Cloud project:

1. **Google Drive API**
   - APIs & Services → Library
   - Search "Google Drive API"
   - Click **Enable**

2. **Gmail API** (for email history)
   - Search "Gmail API"
   - Click **Enable**

3. **Google Chat API** (for chat history)
   - Search "Google Chat API"
   - Click **Enable**

### 3. Update Frontend Login Component

The `LoginModal.tsx` component has been updated to request these scopes:

```tsx
<GoogleLogin
  scope="openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/chat.messages.readonly"
  // ... other props
/>
```

### 4. Backend Token Handling

The backend (`routes/auth.py`) will receive tokens with these scopes. You can use the access token to call Google APIs:

```python
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Use the access token from OAuth flow
credentials = Credentials(token=access_token)
drive_service = build('drive', 'v3', credentials=credentials)
gmail_service = build('gmail', 'v1', credentials=credentials)
```

---

## Testing Scopes

### Verify Scopes in Token

After login, decode the JWT token to see granted scopes:

```javascript
// In browser console after login
const token = localStorage.getItem('auth_token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Scopes:', payload.scope);
```

### Test Drive Access

```python
# Backend test script
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

credentials = Credentials(token=user_access_token)
drive = build('drive', 'v3', credentials=credentials)
files = drive.files().list(pageSize=10).execute()
print(f"Found {len(files.get('files', []))} files")
```

---

## App Verification (For Production)

If you're using **sensitive scopes** (Gmail, Chat), Google requires:

1. **Privacy Policy URL** - Must be publicly accessible
2. **Terms of Service URL** - Must be publicly accessible
3. **App Verification** - Submit for Google review
4. **Security Assessment** - May be required for sensitive scopes

### For Development/Testing

- Add test users in OAuth consent screen
- Test users can grant sensitive scopes without verification
- App must be in "Testing" mode

---

## Current Status

✅ **Frontend Updated**: LoginModal requests all required scopes  
⏳ **OAuth Consent Screen**: Needs to be updated with new scopes  
⏳ **APIs Enabled**: Drive, Gmail, Chat APIs need to be enabled  
⏳ **Backend Integration**: Google API clients need to be implemented  

---

## Next Steps

1. **Update OAuth Consent Screen** with new scopes
2. **Enable APIs** (Drive, Gmail, Chat)
3. **Add test users** if in testing mode
4. **Test login flow** to verify scopes are granted
5. **Implement Google API clients** in backend

---

**Last Updated**: 2025-02-08
