# Browser History Access Setup

**Date**: 2025-02-08  
**Status**: ✅ **IMPLEMENTED**

---

## What Was Added

### 1. Chrome Extension Manifest
✅ **Updated** `contentGrabber/manifest.json`:
- Added `"history"` permission
- Allows extension to access browser history

### 2. History Tracking in Extension
✅ **Added** to `contentGrabber/background.js`:
- `trackPageVisit()` - Tracks each page visit
- `getRecentHistory()` - Gets recent browsing history
- `analyzeBrowsingPatterns()` - Analyzes browsing patterns
- Automatic tracking on page navigation

### 3. Backend Endpoints
✅ **Added** to `backend/routes/extension.py`:
- `POST /api/extension/history/track` - Track history visit
- `GET /api/extension/history/analyze` - Analyze browsing patterns

---

## How It Works

### Extension Side
1. **Automatic Tracking**: When user navigates to a page, extension tracks the visit
2. **History API**: Uses Chrome `chrome.history` API to get visit details
3. **Sends to Backend**: Visit data sent to backend for analysis

### Backend Side
1. **Stores Visits**: History visits stored in session metadata
2. **Pattern Analysis**: Analyzes domains, learning sites, visit patterns
3. **Learning Context**: Uses history to understand user's learning journey

---

## Permissions Required

### Chrome Extension Permission
```json
{
  "permissions": ["history"]
}
```

**User Impact**: 
- Chrome will show a warning when installing extension
- User must grant "Read your browsing history" permission
- This is a sensitive permission that requires user consent

---

## Usage

### Track Visit (Automatic)
Extension automatically tracks visits when:
- User navigates to a new page
- Page finishes loading
- Session is active

### Get History (Manual)
```javascript
// In extension background script
chrome.runtime.sendMessage({
  type: 'GET_BROWSING_HISTORY',
  maxResults: 100,
  hoursBack: 24
}, (response) => {
  console.log('History:', response.history);
});
```

### Analyze Patterns (Manual)
```javascript
chrome.runtime.sendMessage({
  type: 'ANALYZE_BROWSING_PATTERNS',
  daysBack: 7
}, (response) => {
  console.log('Patterns:', response.analysis);
});
```

### Backend API
```bash
# Track visit
POST /api/extension/history/track
{
  "url": "https://example.com",
  "title": "Example Page",
  "visitTime": 1707300000000,
  "transition": "link",
  "visitCount": 5,
  "sessionId": "session-123"
}

# Analyze patterns
GET /api/extension/history/analyze?days_back=7
```

---

## Privacy & Security

### What Data is Collected
- URLs visited
- Page titles
- Visit timestamps
- Visit counts
- Navigation type (link, typed, reload)

### Data Storage
- Stored in session metadata (Snowflake database)
- Linked to user account
- Can be deleted with session

### User Consent
- ✅ Extension permission required (user must grant)
- ✅ Only tracks during active sessions
- ✅ User can disable extension to stop tracking

---

## Integration with Agents

### Agent 0.0 (Persona Architect)
Can use browsing history to:
- Identify learning interests
- Track topics user researches
- Understand learning patterns
- Build better persona cards

### Agent 1.0 (Capture & Scrape)
Can use history to:
- Understand context of current page
- Identify related pages user visited
- Track learning journey

---

## Testing

### Test History Permission
1. Install extension with updated manifest
2. Chrome will prompt for history permission
3. Grant permission
4. Navigate to a few pages
5. Check browser console for tracking logs

### Test Backend Endpoint
```bash
curl -X POST http://localhost:8000/api/extension/history/track \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "title": "Example",
    "visitTime": 1707300000000,
    "transition": "link",
    "visitCount": 1
  }'
```

---

## Files Modified

- ✅ `contentGrabber/manifest.json` - Added "history" permission
- ✅ `contentGrabber/background.js` - Added history tracking functions
- ✅ `backend/routes/extension.py` - Added history endpoints

---

## Next Steps

1. **Reload Extension** with new manifest
2. **Grant History Permission** when Chrome prompts
3. **Test Tracking** by navigating to pages
4. **Verify Backend** receives history data
5. **Integrate with Agent 0.0** to use history for persona building

---

**Status**: ✅ **READY** - Extension will track history after reload
