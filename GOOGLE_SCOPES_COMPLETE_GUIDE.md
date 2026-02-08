# Complete Guide: Google OAuth Scopes for Drive & Chat

**Date**: 2025-02-08  
**Status**: 🔴 **ACTION REQUIRED**

---

## Summary

To access Google Drive and Chat/Gmail history, you need to:

1. ✅ **Frontend**: Updated (but scopes are configured in Google Cloud Console)
2. 🔴 **Google Cloud Console**: **MUST UPDATE** OAuth consent screen
3. 🔴 **APIs**: **MUST ENABLE** Drive, Gmail, Chat APIs
4. ⏳ **Backend**: Ready (clients created)

---

## Step 1: Update Google Cloud Console OAuth Consent Screen

### Go to OAuth Consent Screen

1. Visit: https://console.cloud.google.com/
2. Select your project
3. Navigate: **APIs & Services** → **OAuth consent screen**
4. Click **Edit App** (or create if new)

### Add Required Scopes

Click **Add or Remove Scopes** and add:

#### Basic Scopes (Already Added)
- ✅ `openid`
- ✅ `email`  
- ✅ `profile`

#### Google Drive Scopes (ADD THESE)
- 🔴 `https://www.googleapis.com/auth/drive.readonly`
  - Display name: "See and download all your Google Drive files"
  - User-facing: ✅ Yes
  
- 🔴 `https://www.googleapis.com/auth/drive.file`
  - Display name: "See, edit, create, and delete only the specific Google Drive files you use with this app"
  - User-facing: ✅ Yes

#### Gmail Scope (ADD THIS)
- 🔴 `https://www.googleapis.com/auth/gmail.readonly`
  - Display name: "View your email messages and settings"
  - User-facing: ✅ Yes
  - ⚠️ **Sensitive scope** - requires verification for production

#### Google Chat Scope (ADD THIS)
- 🔴 `https://www.googleapis.com/auth/chat.messages.readonly`
  - Display name: "View your Google Chat messages"
  - User-facing: ✅ Yes
  - ⚠️ **Sensitive scope** - requires verification for production

### Save Changes

Click **Save and Continue** through all steps.

---

## Step 2: Enable Required APIs

### Enable APIs

1. Go to: **APIs & Services** → **Library**
2. Search and enable:

#### Google Drive API
- Search: "Google Drive API"
- Click **Enable**

#### Gmail API
- Search: "Gmail API"
- Click **Enable**

#### Google Chat API
- Search: "Google Chat API"
- Click **Enable**

---

## Step 3: Add Test Users (If in Testing Mode)

1. Go to: **OAuth consent screen** → **Test users**
2. Click **Add Users**
3. Add email addresses:
   - Your email
   - Team member emails
   - Test accounts

**Note**: Test users can grant sensitive scopes without Google verification.

---

## Step 4: Frontend Configuration

### Current Implementation

The `LoginModal.tsx` has been updated, but **@react-oauth/google** requests scopes configured in Google Cloud Console, not via component props.

### How It Works

1. User clicks "Sign in with Google"
2. Google shows consent screens for **all scopes configured in OAuth consent screen**
3. User grants permissions
4. Token includes granted scopes

### Alternative: Incremental Authorization

For better UX, you can request additional scopes later:

```typescript
// Request Drive access when user needs it
import { useGoogleLogin } from '@react-oauth/google'

const requestDriveAccess = useGoogleLogin({
  onSuccess: (tokenResponse) => {
    // Use tokenResponse.access_token for Drive API
  },
  scope: 'https://www.googleapis.com/auth/drive.readonly'
})
```

---

## Step 5: Backend Token Handling

### Store Access Token

When user logs in, you'll receive:
- **ID Token** (JWT) - for authentication
- **Access Token** - for API calls (if scopes granted)

### Update Auth Flow

The backend should:
1. Receive access token from frontend
2. Store access token securely
3. Use access token for Google API calls

**Note**: Current implementation only handles ID token. We need to update to also handle access token.

---

## Testing Checklist

After updating Google Cloud Console:

- [ ] OAuth consent screen shows all scopes
- [ ] Drive API is enabled
- [ ] Gmail API is enabled
- [ ] Chat API is enabled
- [ ] Test users added (if in testing mode)
- [ ] Login flow shows consent screens for new scopes
- [ ] Access token includes requested scopes
- [ ] Backend can access Drive files
- [ ] Backend can access Gmail messages

---

## Important Notes

### Sensitive Scopes (Gmail, Chat)

**For Testing**:
- ✅ Works with test users
- ✅ No verification needed
- ✅ App must be in "Testing" mode

**For Production**:
- ⚠️ Requires Google verification (4-6 weeks)
- ⚠️ Privacy policy URL required
- ⚠️ Terms of service URL required
- ⚠️ Security assessment may be required

### Recommendation

1. **Start with Testing mode** + test users
2. **Test all functionality** with sensitive scopes
3. **Prepare verification materials** for production
4. **Submit for verification** when ready for production

---

## Current Status

✅ **Frontend**: Component updated (scopes come from Google Cloud Console)  
✅ **Backend**: Google API clients created  
✅ **Gemini Client**: Created and ready  
✅ **Agent 0.0**: Updated to use Gemini  
🔴 **Google Cloud Console**: **NEEDS UPDATE** (OAuth consent screen + APIs)  
⏳ **Access Token Handling**: Needs update to store/use access tokens  

---

## Next Actions

1. **Update Google Cloud Console** (10 minutes)
   - Add scopes to OAuth consent screen
   - Enable APIs
   - Add test users

2. **Add Gemini API Key** to `.env`
   - Get from: https://aistudio.google.com/app/apikey
   - Add: `GEMINI_API_KEY=your_key_here`

3. **Test Login Flow**
   - Clear cache
   - Login
   - Verify scopes are requested

4. **Update Backend Auth** (if needed)
   - Handle access tokens
   - Store tokens securely
   - Use tokens for API calls

---

**Priority**: 🔴 **HIGH** - Update Google Cloud Console NOW
