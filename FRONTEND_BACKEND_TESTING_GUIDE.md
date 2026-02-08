# Frontend-Backend Integration Testing Guide

This guide provides step-by-step instructions for testing all integrated features.

## Prerequisites

1. **Backend Server Running**
   ```bash
   cd backend
   python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Frontend Server Running**
   ```bash
   cd Devfest
   npm run dev
   ```

3. **Database Connection**
   - Ensure Snowflake database is accessible
   - Check `.env` file has correct credentials

## Testing Checklist

### Phase 1: Authentication Flow

#### Test 1.1: Login with Google
1. Navigate to `http://localhost:5173`
2. Click "Sign In" or trigger login modal
3. Select "Sign in with Google"
4. **Expected**: Google OAuth popup appears
5. Complete Google authentication
6. **Expected**: 
   - Account type selection appears (if not pre-selected)
   - After selection, redirects to dashboard
   - Token stored in localStorage

#### Test 1.2: Token Verification
1. Refresh the page
2. **Expected**: 
   - ProtectedRoute calls `/api/auth/me`
   - User stays logged in
   - No redirect to login page

#### Test 1.3: Logout
1. Click logout button
2. **Expected**:
   - Token removed from localStorage
   - Redirected to landing page
   - Cannot access protected routes

**Issues to Check:**
- [ ] Login modal shows error messages properly
- [ ] Token is stored correctly
- [ ] 401 errors trigger logout
- [ ] Account type is saved correctly

---

### Phase 2: Personal Dashboard

#### Test 2.1: Profile Data Loading
1. Navigate to `/personal`
2. **Expected**:
   - Profile section shows user name and email
   - Time Saved stats display correctly
   - Loading spinner appears initially
   - No errors in console

**Check:**
- [ ] `GET /api/personal/profile` called successfully
- [ ] Data displays correctly
- [ ] Loading states work
- [ ] Error handling works

#### Test 2.2: Session Timeline
1. On Personal Dashboard, check Session Timeline (left panel)
2. **Expected**:
   - Sessions load from `GET /api/personal/sessions`
   - Sessions display with date, time, duration
   - Clicking a session selects it
   - Menu actions work (mark complete, rename, regenerate)

**Test Actions:**
- [ ] Click session → selects and loads notes
- [ ] Right-click → menu appears
- [ ] Mark Complete → updates via `PATCH /api/personal/sessions/{id}`
- [ ] Rename → updates via `PATCH /api/personal/sessions/{id}`
- [ ] Regenerate Summary → calls `POST /api/personal/sessions/{id}/regenerate-summary`

#### Test 2.3: Markdown Editor (Session Notes)
1. Select a session from timeline
2. **Expected**:
   - Notes load from `GET /api/personal/sessions/{id}/notes`
   - Chronological entries display
   - Can edit and save notes

**Test Actions:**
- [ ] Notes load correctly
- [ ] Click "Save All" → calls `PUT /api/personal/sessions/{id}/notes`
- [ ] Click "Generate Summary" → calls `POST /api/personal/sessions/{id}/generate-summary`
- [ ] Click "Export to Google Doc" → calls `POST /api/personal/sessions/{id}/export/google-doc`
- [ ] Click "Download Markdown" → calls `GET /api/personal/sessions/{id}/export/markdown`

#### Test 2.4: Notebook Entries
1. Navigate to notebook entries section
2. **Expected**:
   - Entries load from `GET /api/personal/notebook-entries`
   - Can view, create, update, delete entries

**Test Actions:**
- [ ] View entry details → `GET /api/personal/notebook-entries/{id}`
- [ ] Create entry → `POST /api/personal/notebook-entries`
- [ ] Update entry → `PUT /api/personal/notebook-entries/{id}`
- [ ] Delete entry → `DELETE /api/personal/notebook-entries/{id}`

#### Test 2.5: AI Search
1. Click "AI Search" button
2. Enter a search query
3. **Expected**:
   - Calls `POST /api/personal/ai-search`
   - Returns relevant results
   - Displays results in chat interface

---

### Phase 3: Enterprise Dashboard

#### Test 3.1: Enterprise Overview
1. Navigate to `/enterprise`
2. **Expected**:
   - Documents load from `GET /api/google-docs/documents`
   - KPIs load from `GET /api/enterprise/kpis`
   - All widgets display data

**Check:**
- [ ] Documents list appears
- [ ] Time Reclaimed KPI shows
- [ ] Top Documents widget shows
- [ ] Efficiency Prediction Chart shows

#### Test 3.2: Document Selection
1. Click a document in Friction Heatmap
2. **Expected**:
   - Document content loads via `GET /api/enterprise/documents/{id}`
   - Suggestions load via `GET /api/suggestions?documentId={id}`
   - Document heatmap view displays
   - Hotspots highlighted

**Test Actions:**
- [ ] Click document → loads content and suggestions
- [ ] Hover hotspot → highlights in document view
- [ ] Click hotspot → scrolls to suggestion in queue

#### Test 3.3: AI Suggestions Queue
1. With document selected, check suggestions queue
2. **Expected**:
   - Suggestions display with confidence, reasoning
   - Can select multiple suggestions
   - Can accept/reject suggestions

**Test Actions:**
- [ ] Select suggestion checkbox
- [ ] Click "Accept" → calls `POST /api/enterprise/suggestions/{id}/accept`
- [ ] Click "Reject" → calls `POST /api/enterprise/suggestions/{id}/reject`
- [ ] Click "Apply to Google Doc" → calls `POST /api/google-docs/apply-edit`

#### Test 3.4: Apply Edit to Google Doc
1. Select a suggestion
2. Click "Apply to Google Doc" button
3. **Expected**:
   - Loading state shows
   - Calls `POST /api/google-docs/apply-edit`
   - Success message appears
   - Google Doc URL provided

**Note**: This requires Google access token. May need to pass `google_access_token` query param.

#### Test 3.5: Batch Export
1. Select multiple suggestions
2. Click "Generate Report" in footer
3. **Expected**:
   - Calls `POST /api/enterprise/exports/generate-report`
   - Navigates to exports page with data

---

### Phase 4: Enterprise Profile & Settings

#### Test 4.1: Organization Info
1. Navigate to `/enterprise/profile`
2. **Expected**:
   - Organization data loads from `GET /api/enterprise/organization`
   - Shows org name, members, metrics

#### Test 4.2: Google Drive Integration
1. In profile, go to Google Drive Integration section
2. **Expected**:
   - Sources load from `GET /api/enterprise/google-drive/sources`
   - Can add source → `POST /api/enterprise/google-drive/sources`
   - Can remove source → `DELETE /api/enterprise/google-drive/sources/{id}`

#### Test 4.3: Team Members
1. Go to Team Members section
2. **Expected**:
   - Members load from `GET /api/enterprise/members`
   - Can add member → `POST /api/enterprise/members`
   - Can remove member → `DELETE /api/enterprise/members/{id}`
   - Can update role → `PATCH /api/enterprise/members/{id}/role`

#### Test 4.4: Enterprise Settings
1. Go to Settings section
2. **Expected**:
   - Settings load from `GET /api/enterprise/settings`
   - Can update → `PUT /api/enterprise/settings`

---

### Phase 5: Personal Profile Settings

#### Test 5.1: Persona Settings
1. Navigate to `/personal/profile`
2. Go to Persona Settings
3. **Expected**:
   - Settings load from `GET /api/personal/persona`
   - Can update → `PUT /api/personal/persona`

#### Test 5.2: Privacy Settings
1. Go to Privacy Settings
2. **Expected**:
   - Settings load from `GET /api/personal/privacy-settings`
   - Can update → `PUT /api/personal/privacy-settings`

---

### Phase 6: Extension Integration

#### Test 6.1: Extension Status
1. Open extension popup
2. **Expected**:
   - Status loads from `GET /api/extension/status`
   - Shows active session if any

#### Test 6.2: Start Session
1. Click "Start Session" in extension
2. **Expected**:
   - Calls `POST /api/extension/session/start`
   - Session ID returned
   - Status updates

#### Test 6.3: Stop Session
1. Click "Stop Session"
2. **Expected**:
   - Calls `POST /api/extension/session/{id}/stop`
   - Session ends
   - Duration calculated

#### Test 6.4: History Tracking
1. Browse pages with extension active
2. **Expected**:
   - Calls `POST /api/extension/history/track`
   - History stored in session metadata

---

## Common Issues & Fixes

### Issue: 401 Unauthorized Errors
**Fix**: 
- Check token is in localStorage: `localStorage.getItem('auth_token')`
- Verify token format: Should start with `eyJ...`
- Check backend is running
- Verify CORS settings

### Issue: CORS Errors
**Fix**:
- Check `backend/app/main.py` CORS settings
- Verify `FRONTEND_URL` in `.env` matches frontend URL
- Check browser console for specific CORS error

### Issue: Data Not Loading
**Fix**:
- Check browser Network tab for failed requests
- Verify endpoint URLs are correct
- Check backend logs for errors
- Verify database connection

### Issue: Google Docs API Errors
**Fix**:
- Ensure Google access token is provided
- Check token has correct scopes
- Verify Google Docs API is enabled in Google Cloud Console

### Issue: Type Mismatches
**Fix**:
- Check TypeScript types match backend response
- Verify API client functions return correct types
- Check console for type errors

---

## Debugging Tips

1. **Browser DevTools**
   - Network tab: Check all API calls
   - Console tab: Check for errors
   - Application tab: Check localStorage for token

2. **Backend Logs**
   - Check terminal running backend
   - Look for error stack traces
   - Verify SQL queries execute

3. **Database Queries**
   - Check Snowflake query history
   - Verify data exists in tables
   - Check table schemas match models

4. **API Testing**
   - Use Postman or curl to test endpoints directly
   - Verify request/response formats
   - Test with and without authentication

---

## Next Steps After Testing

1. Fix any bugs found
2. Add error handling where missing
3. Improve loading states
4. Add user feedback for actions
5. Optimize API calls (caching, debouncing)
6. Add unit tests for API client
7. Add integration tests for critical flows

---

## Test Results Template

```
Date: ___________
Tester: ___________

### Authentication
- [ ] Login works
- [ ] Token verification works
- [ ] Logout works
- Issues: ___________

### Personal Dashboard
- [ ] Profile loads
- [ ] Sessions load
- [ ] Notes load/save
- [ ] Notebook entries work
- [ ] AI search works
- Issues: ___________

### Enterprise Dashboard
- [ ] Documents load
- [ ] Suggestions load
- [ ] Apply edit works
- [ ] KPIs display
- Issues: ___________

### Profile & Settings
- [ ] Organization data loads
- [ ] Team members work
- [ ] Settings save
- Issues: ___________

### Extension
- [ ] Status works
- [ ] Session start/stop works
- [ ] History tracking works
- Issues: ___________
```
