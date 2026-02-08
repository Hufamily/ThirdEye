# Step-by-Step Testing Guide

Follow these steps to test all integrated features.

## Prerequisites Check

### 1. Verify Backend is Running
```bash
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Check**: Open http://localhost:8000/docs - Should show Swagger UI

### 2. Verify Frontend is Running
```bash
cd Devfest
npm run dev
```

**Check**: Open http://localhost:5173 - Should show landing page

### 3. Verify Database Connection
- Check `.env` file has correct Snowflake credentials
- Backend should connect without errors

---

## Step 1: Test Authentication

### 1.1 Login Flow
1. Open http://localhost:5173
2. Click "Sign In" button
3. **Expected**: Login modal appears
4. Click "Sign in with Google"
5. **Expected**: Google OAuth popup
6. Complete Google authentication
7. **Expected**: 
   - If account type not pre-selected: Account type selection appears
   - Select "Personal" or "Enterprise"
   - Redirects to appropriate dashboard
   - Check browser console: Should see successful API call to `/api/auth/google-login`
   - Check localStorage: Should have `auth_token` key

### 1.2 Verify Token Storage
1. Open browser DevTools → Application → Local Storage
2. **Expected**: `auth_token` exists and starts with `eyJ`
3. Refresh page
4. **Expected**: 
   - ProtectedRoute calls `/api/auth/me`
   - User stays logged in
   - No redirect to login

### 1.3 Test Logout
1. Click logout button
2. **Expected**:
   - Token removed from localStorage
   - Redirected to landing page
   - Cannot access `/personal` or `/enterprise`

**✅ If all pass, authentication is working!**

---

## Step 2: Test Personal Dashboard

### 2.1 Profile Loading
1. Navigate to `/personal` (after login)
2. **Expected**:
   - Loading spinner appears briefly
   - Profile section shows:
     - Your name and email
     - Time Saved stats (may be 0 if no sessions)
   - Check Network tab: `GET /api/personal/profile` returns 200

### 2.2 Session Timeline
1. Look at left panel "Session Timeline"
2. **Expected**:
   - Loading spinner if fetching
   - Sessions list appears (may be empty)
   - Check Network tab: `GET /api/personal/sessions` returns 200

**If no sessions exist:**
- Sessions list shows empty state
- This is normal for new users

**If sessions exist:**
- Click a session
- **Expected**: Session selected, notes panel updates

### 2.3 Session Actions
1. Right-click a session (or use menu button)
2. Try "Mark Complete"
   - **Expected**: Calls `PATCH /api/personal/sessions/{id}`
   - Session updates visually
3. Try "Rename"
   - **Expected**: Prompt appears
   - Enter new name
   - Calls `PATCH /api/personal/sessions/{id}`
   - Title updates

### 2.4 Session Notes (Markdown Editor)
1. Select a session
2. **Expected**:
   - Right panel shows "Session Notes"
   - Loading spinner appears
   - Notes load from `GET /api/personal/sessions/{id}/notes`
   - Chronological entries display

**Test Actions:**
- Click "Save All" → Should call `PUT /api/personal/sessions/{id}/notes`
- Click "Generate Summary" → Should call `POST /api/personal/sessions/{id}/generate-summary`
- Click "Export to Google Doc" → Should call `POST /api/personal/sessions/{id}/export/google-doc`
- Click "Download Markdown" → Should download file

### 2.5 Notebook Entries
1. Check notebook entries section
2. **Expected**:
   - Entries load from `GET /api/personal/notebook-entries`
   - If filtered by session, only shows entries for that session

### 2.6 AI Search
1. Click "AI Search" button in Session Timeline
2. **Expected**: Modal opens
3. Type a search query (e.g., "React hooks")
4. Click Send
5. **Expected**:
   - Calls `POST /api/personal/ai-search`
   - Results appear in chat
   - Shows relevant entries/sessions

**✅ If all pass, personal dashboard is working!**

---

## Step 3: Test Enterprise Dashboard

### 3.1 Enterprise Overview
1. Navigate to `/enterprise` (after login with enterprise account)
2. **Expected**:
   - Loading spinner appears
   - Documents load from `GET /api/google-docs/documents`
   - KPIs load from `GET /api/enterprise/kpis`
   - All widgets display:
     - Time Reclaimed
     - Top Documents
     - Efficiency Prediction Chart

### 3.2 Document Selection
1. Click a document in the Friction Heatmap (left panel)
2. **Expected**:
   - Document content loads: `GET /api/enterprise/documents/{id}`
   - Suggestions load: `GET /api/suggestions?documentId={id}`
   - Document Heatmap View shows content with hotspots
   - AI Suggestions Queue shows suggestions

### 3.3 Hotspot Interaction
1. Hover over a hotspot in document view
2. **Expected**: Hotspot highlights
3. Click a hotspot
4. **Expected**: Matching suggestion scrolls into view in queue

### 3.4 Suggestion Actions
1. In AI Suggestions Queue, try actions:
   - **Accept**: Calls `POST /api/enterprise/suggestions/{id}/accept`
   - **Reject**: Calls `POST /api/enterprise/suggestions/{id}/reject`
   - **Apply to Google Doc**: Calls `POST /api/google-docs/apply-edit`

**Note**: Apply to Google Doc requires Google access token. You may need to:
- Pass `google_access_token` query parameter
- Or implement token storage in backend

### 3.5 Batch Export
1. Select multiple suggestions (checkboxes)
2. Click "Generate Report" in footer
3. **Expected**:
   - Calls `POST /api/enterprise/exports/generate-report`
   - Navigates to exports page with data

**✅ If all pass, enterprise dashboard is working!**

---

## Step 4: Test Enterprise Profile

### 4.1 Organization Info
1. Navigate to `/enterprise/profile`
2. **Expected**:
   - Organization data loads: `GET /api/enterprise/organization`
   - Shows org name, members, metrics

### 4.2 Google Drive Sources
1. Go to Google Drive Integration section
2. **Expected**:
   - Sources load: `GET /api/enterprise/google-drive/sources`
   - Can add source: `POST /api/enterprise/google-drive/sources`
   - Can remove source: `DELETE /api/enterprise/google-drive/sources/{id}`

### 4.3 Team Members
1. Go to Team Members section
2. **Expected**:
   - Members load: `GET /api/enterprise/members`
   - Can add member: `POST /api/enterprise/members`
   - Can remove member: `DELETE /api/enterprise/members/{id}`
   - Can update role: `PATCH /api/enterprise/members/{id}/role`

### 4.4 Enterprise Settings
1. Go to Settings section
2. **Expected**:
   - Settings load: `GET /api/enterprise/settings`
   - Can update: `PUT /api/enterprise/settings`

**✅ If all pass, enterprise profile is working!**

---

## Step 5: Test Personal Profile Settings

### 5.1 Persona Settings
1. Navigate to `/personal/profile`
2. Go to Persona Settings
3. **Expected**:
   - Settings load: `GET /api/personal/persona`
   - Can update: `PUT /api/personal/persona`
   - Changes save successfully

### 5.2 Privacy Settings
1. Go to Privacy Settings
2. **Expected**:
   - Settings load: `GET /api/personal/privacy-settings`
   - Can update: `PUT /api/personal/privacy-settings`
   - Changes save successfully

**✅ If all pass, profile settings are working!**

---

## Step 6: Test Extension Integration

### 6.1 Extension Status
1. Open extension popup
2. **Expected**:
   - Status loads: `GET /api/extension/status`
   - Shows active session if any

### 6.2 Start Session
1. Click "Start Session" in extension
2. **Expected**:
   - Calls `POST /api/extension/session/start`
   - Session ID returned
   - Status updates to show active session

### 6.3 Stop Session
1. Click "Stop Session"
2. **Expected**:
   - Calls `POST /api/extension/session/{id}/stop`
   - Session ends
   - Duration calculated

### 6.4 History Tracking
1. Browse pages with extension active
2. **Expected**:
   - Calls `POST /api/extension/history/track`
   - History stored in session metadata

**✅ If all pass, extension integration is working!**

---

## Common Issues & Solutions

### Issue: 401 Unauthorized
**Solution**: 
- Check token in localStorage
- Verify backend is running
- Check CORS settings

### Issue: CORS Error
**Solution**:
- Check `FRONTEND_URL` in `.env` matches frontend URL
- Verify backend CORS middleware allows frontend origin

### Issue: Data Not Loading
**Solution**:
- Check Network tab for failed requests
- Check backend logs for errors
- Verify database connection
- Check if data exists in database

### Issue: Type Errors
**Solution**:
- Check TypeScript types match backend response
- Verify API client functions return correct types

---

## Testing Checklist

Print this and check off as you test:

```
### Authentication
[ ] Login works
[ ] Token stored correctly
[ ] Token verification works
[ ] Logout works

### Personal Dashboard
[ ] Profile loads
[ ] Sessions load
[ ] Session selection works
[ ] Notes load
[ ] Notes save
[ ] Summary generation works
[ ] Export works
[ ] Notebook entries load
[ ] AI search works

### Enterprise Dashboard
[ ] Documents load
[ ] KPIs display
[ ] Document selection works
[ ] Suggestions load
[ ] Hotspot interaction works
[ ] Accept/reject suggestions works
[ ] Apply edit to Google Doc works
[ ] Batch export works

### Profile & Settings
[ ] Organization data loads
[ ] Google Drive sources work
[ ] Team members work
[ ] Enterprise settings work
[ ] Persona settings work
[ ] Privacy settings work

### Extension
[ ] Status works
[ ] Start session works
[ ] Stop session works
[ ] History tracking works
```

---

## Reporting Issues

When reporting issues, include:
1. What you were testing
2. What you expected
3. What actually happened
4. Browser console errors
5. Network tab request/response
6. Backend logs (if available)
