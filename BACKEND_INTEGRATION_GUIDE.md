# Backend Integration Guide

This document maps every frontend component to its required backend functionality. Use this as a reference when implementing the backend to ensure all features are properly connected.

## Table of Contents
1. [Authentication & User Management](#authentication--user-management)
2. [Personal Dashboard Features](#personal-dashboard-features)
3. [Enterprise Features](#enterprise-features)
4. [Landing Page & Onboarding](#landing-page--onboarding)
5. [Extension Components](#extension-components)
6. [Data Types & Structures](#data-types--structures)

---

## Authentication & User Management

### Component: `LoginModal.tsx`
**Location:** `src/components/auth/LoginModal.tsx`

**Required Backend Endpoints:**

1. **POST `/api/auth/google-login`**
   - **Purpose:** Authenticate user with Google OAuth token
   - **Request Body:**
     ```json
     {
       "credential": "string (JWT token from Google)",
       "accountType": "personal" | "enterprise"
     }
     ```
   - **Response:**
     ```json
     {
       "user": {
         "id": "string",
         "name": "string",
         "email": "string",
         "picture": "string",
         "sub": "string"
       },
       "token": "string (JWT auth token)",
       "accountType": "personal" | "enterprise",
       "hasEnterpriseAccess": boolean
     }
     ```
   - **Notes:** 
     - Verify Google token on backend
     - Create user if doesn't exist
     - Return JWT token for subsequent requests
     - Check if personal account has enterprise access

2. **GET `/api/auth/me`**
   - **Purpose:** Get current authenticated user info
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** Same as login response
   - **Notes:** Used to verify token and get user info on app load

3. **POST `/api/auth/logout`**
   - **Purpose:** Logout user (invalidate token)
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

### Component: `ProtectedRoute.tsx`
**Location:** `src/components/auth/ProtectedRoute.tsx`

**Required Backend Endpoints:**
- Uses same `/api/auth/me` endpoint to verify authentication
- Should handle 401 responses and redirect to login

### Component: `Navigation.tsx`
**Location:** `src/components/ui/Navigation.tsx`

**Required Backend Functionality:**
- Check if user has enterprise access (for personal accounts)
- Uses `hasEnterpriseAccess` flag from auth response
- **TODO:** Backend should return `hasEnterpriseAccess` boolean in auth response

---

## Personal Dashboard Features

### Component: `PersonalPage.tsx`
**Location:** `src/pages/PersonalPage.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/profile`**
   - **Purpose:** Get user profile data
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "name": "string",
       "email": "string",
       "googleConnected": boolean,
       "timeSaved": {
         "totalHours": number,
         "thisWeek": number,
         "thisMonth": number,
         "breakdown": [
           {
             "category": "string",
             "hours": number
           }
         ]
       }
     }
     ```

### Component: `SessionTimeline.tsx`
**Location:** `src/components/personal/SessionTimeline.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/sessions`**
   - **Purpose:** Get all learning sessions for user
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?limit=50&offset=0`
   - **Response:**
     ```json
     {
       "sessions": [
         {
           "id": "string",
           "date": "YYYY-MM-DD",
           "time": "HH:mm",
           "duration": "string (e.g., '2h 15m')",
           "concepts": number,
           "title": "string",
           "docTitle": "string",
           "triggers": ["scroll", "hover", "click"],
           "gapLabels": ["hooks", "performance"],
           "isComplete": boolean
         }
       ],
       "total": number
     }
     ```

2. **PATCH `/api/personal/sessions/:sessionId`**
   - **Purpose:** Update session (rename, mark complete/incomplete)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "title"?: "string",
       "isComplete"?: boolean
     }
     ```

3. **POST `/api/personal/sessions/:sessionId/regenerate-summary`**
   - **Purpose:** Regenerate session summary with merge rules
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "success": true,
       "session": { /* updated session object */ }
     }
     ```

### Component: `MarkdownEditor.tsx`
**Location:** `src/components/personal/MarkdownEditor.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/sessions/:sessionId/notes`**
   - **Purpose:** Get session notes/entries
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "id": "string",
       "title": "string",
       "lastUpdated": "ISO 8601 datetime",
       "entries": [
         {
           "id": "string",
           "timestamp": "ISO 8601 datetime",
           "searchQuery": "string",
           "document": {
             "title": "string",
             "url": "string",
             "type": "google-doc" | "github" | "notion" | "confluence" | "other"
           },
           "context": "string",
           "agentAction": "string",
           "agentResponse": "string (markdown)",
           "links": [
             {
               "title": "string",
               "url": "string",
               "description": "string"
             }
           ]
         }
       ]
     }
     ```

2. **PUT `/api/personal/sessions/:sessionId/notes`**
   - **Purpose:** Save session notes
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "title": "string",
       "entries": [ /* same structure as GET response */ ]
     }
     ```

3. **POST `/api/personal/sessions/:sessionId/generate-summary`**
   - **Purpose:** Generate AI summary of session
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "summary": "string (markdown)",
       "keyConcepts": ["string"],
       "generatedAt": "ISO 8601 datetime"
     }
     ```

4. **POST `/api/personal/sessions/:sessionId/export/google-doc`**
   - **Purpose:** Export session notes to Google Doc
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "includeMetadata": boolean,
       "format": "markdown" | "plain"
     }
     ```
   - **Response:**
     ```json
     {
       "success": true,
       "googleDocUrl": "string",
       "fileId": "string"
     }
     ```

5. **GET `/api/personal/sessions/:sessionId/export/markdown`**
   - **Purpose:** Download session notes as markdown file
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** Markdown file download

### Component: `NotebookEntries.tsx`
**Location:** `src/components/personal/NotebookEntries.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/notebook-entries`**
   - **Purpose:** Get notebook entries (optionally filtered by session)
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?sessionId=<id>&limit=5`
   - **Response:**
     ```json
     {
       "entries": [
         {
           "id": "string",
           "sessionId": "string",
           "title": "string",
           "date": "YYYY-MM-DD",
           "snippet": "string",
           "preview": "string"
         }
       ],
       "total": number
     }
     ```

2. **GET `/api/personal/notebook-entries/:entryId`**
   - **Purpose:** Get full notebook entry details
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "id": "string",
       "sessionId": "string",
       "title": "string",
       "date": "YYYY-MM-DD",
       "content": "string (markdown)",
       "snippet": "string",
       "preview": "string",
       "tags": ["string"],
       "relatedEntries": ["entryId"]
     }
     ```

### Component: `AISearchChat.tsx`
**Location:** `src/components/personal/AISearchChat.tsx`

**Required Backend Endpoints:**

1. **POST `/api/personal/ai-search`**
   - **Purpose:** AI-powered search through learning history
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "query": "string",
       "context": {
         "sessionId": "string (optional)",
         "dateRange": {
           "start": "ISO 8601",
           "end": "ISO 8601"
         }
       }
     }
     ```
   - **Response:**
     ```json
     {
       "message": "string",
       "results": [
         {
           "type": "session" | "notebook-entry" | "document",
           "id": "string",
           "title": "string",
           "snippet": "string",
           "relevanceScore": number
         }
       ],
       "suggestions": ["string"]
     }
     ```

### Component: `AccountInfo.tsx`
**Location:** `src/components/personal/profile/AccountInfo.tsx`

**Required Backend Endpoints:**
- Uses same `/api/personal/profile` endpoint as PersonalPage

### Component: `TimeSavedStats.tsx`
**Location:** `src/components/personal/profile/TimeSavedStats.tsx`

**Required Backend Endpoints:**
- Uses same `/api/personal/profile` endpoint (timeSaved data)

### Component: `PersonaSettings.tsx`
**Location:** `src/components/personal/profile/PersonaSettings.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/persona`**
   - **Purpose:** Get user persona settings
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "experience": "beginner" | "intermediate" | "advanced" | "expert",
       "learningStyle": "visual" | "auditory" | "reading" | "kinesthetic",
       "goals": ["string"],
       "timeCommitment": "1-2h" | "3-5h" | "6-10h" | "10h+",
       "preferredTopics": ["string"],
       "challenges": ["string"]
     }
     ```

2. **PUT `/api/personal/persona`**
   - **Purpose:** Update persona settings
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:** Same structure as GET response

### Component: `PrivacySettings.tsx`
**Location:** `src/components/personal/profile/PrivacySettings.tsx`

**Required Backend Endpoints:**

1. **GET `/api/personal/privacy-settings`**
   - **Purpose:** Get privacy settings
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "dataSharing": boolean,
       "analytics": boolean,
       "sessionTracking": boolean,
       "aiTraining": boolean
     }
     ```

2. **PUT `/api/personal/privacy-settings`**
   - **Purpose:** Update privacy settings
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:** Same structure as GET response

---

## Enterprise Features

### Component: `EnterpriseOverview.tsx`
**Location:** `src/pages/enterprise/EnterpriseOverview.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/documents`**
   - **Purpose:** Get all documents with confusion metrics
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?limit=50&offset=0&folderPath=<path>`
   - **Response:**
     ```json
     {
       "documents": [
         {
           "id": "string",
           "title": "string",
           "googleDoc": {
             "fileId": "string",
             "url": "string",
             "name": "string",
             "folderPath": "string",
             "lastModified": "ISO 8601"
           },
           "confusionDensity": number,
           "totalTriggers": number,
           "usersAffected": number
         }
       ],
       "total": number
     }
     ```

2. **GET `/api/enterprise/documents/:documentId`**
   - **Purpose:** Get document content with hotspots
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "id": "string",
       "title": "string",
       "content": "string",
       "googleDoc": {
         "fileId": "string",
         "url": "string",
         "name": "string",
         "folderPath": "string"
       },
       "hotspots": [
         {
           "id": "string",
           "startIndex": number,
           "endIndex": number,
           "intensity": number,
           "userCount": number,
           "unmetNeed": "string"
         }
       ]
     }
     ```

3. **GET `/api/enterprise/suggestions`**
   - **Purpose:** Get AI suggestions for documents
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?documentId=<id>`
   - **Response:**
     ```json
     {
       "suggestions": [
         {
           "id": "string",
           "documentId": "string",
           "googleDoc": {
             "fileId": "string",
             "url": "string",
             "name": "string"
           },
           "hotspotId": "string",
           "originalText": "string",
           "suggestedText": "string",
           "confidence": number,
           "reasoning": "string",
           "googleDocRange": {
             "startIndex": number,
             "endIndex": number
           }
         }
       ]
     }
     ```

4. **POST `/api/google-docs/apply-edit`**
   - **Purpose:** Apply suggestion edit to Google Doc
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "suggestionId": "string",
       "googleDoc": {
         "fileId": "string",
         "url": "string",
         "name": "string"
       },
       "originalText": "string",
       "suggestedText": "string",
       "range": {
         "startIndex": number,
         "endIndex": number
       }
     }
     ```
   - **Response:**
     ```json
     {
       "success": boolean,
       "message": "string",
       "googleDocUrl": "string",
       "appliedAt": "ISO 8601"
     }
     ```

5. **GET `/api/enterprise/kpis`**
   - **Purpose:** Get diagnostic KPIs
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "timeReclaimed": number,
       "totalTriggers": number,
       "topDocuments": [
         {
           "id": "string",
           "title": "string",
           "frictionScore": number,
           "triggersPerUser": number
         }
       ],
       "efficiencyData": [
         {
           "date": "string",
           "actual": number,
           "predicted": number
         }
       ],
       "currentEfficiency": number,
       "predictedEfficiency": number,
       "timeframe": "string"
     }
     ```

6. **POST `/api/enterprise/suggestions/:suggestionId/accept`**
   - **Purpose:** Accept a suggestion
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

7. **POST `/api/enterprise/suggestions/:suggestionId/reject`**
   - **Purpose:** Reject a suggestion
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

### Component: `EnterpriseDocuments.tsx`
**Location:** `src/pages/enterprise/EnterpriseDocuments.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/documents`**
   - **Purpose:** Get document list with engagement metrics
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?limit=50&offset=0`
   - **Response:**
     ```json
     {
       "documents": [
         {
           "id": "string",
           "title": "string",
           "lastUpdated": "ISO 8601",
           "views": number,
           "concepts": number,
           "engagement": number
         }
       ],
       "total": number
     }
     ```

### Component: `EnterpriseSuggestions.tsx`
**Location:** `src/pages/enterprise/EnterpriseSuggestions.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/suggestions`**
   - **Purpose:** Get all AI suggestions with diagnosis
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?limit=50&offset=0`
   - **Response:**
     ```json
     {
       "suggestions": [
         {
           "id": "string",
           "document": "string",
           "section": "string",
           "confusionType": "concept" | "terminology" | "application",
           "confidence": number,
           "diagnosis": "string",
           "actions": ["string"]
         }
       ],
       "total": number
     }
     ```

2. **POST `/api/enterprise/suggestions/:suggestionId/apply`**
   - **Purpose:** Apply suggestion actions
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

3. **POST `/api/enterprise/suggestions/:suggestionId/dismiss`**
   - **Purpose:** Dismiss suggestion
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

### Component: `EnterpriseCharts.tsx`
**Location:** `src/pages/enterprise/EnterpriseCharts.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/analytics/growth`**
   - **Purpose:** Get growth trends data
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?startDate=<ISO>&endDate=<ISO>`
   - **Response:**
     ```json
     {
       "data": [
         {
           "month": "string",
           "users": number,
           "sessions": number
         }
       ]
     }
     ```

2. **GET `/api/enterprise/analytics/departments`**
   - **Purpose:** Get department performance data
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "data": [
         {
           "department": "string",
           "concepts": number,
           "engagement": number
         }
       ]
     }
     ```

3. **GET `/api/enterprise/analytics/topics`**
   - **Purpose:** Get topic distribution data
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "data": [
         {
           "name": "string",
           "value": number
         }
       ]
     }
     ```

### Component: `EnterpriseExports.tsx`
**Location:** `src/pages/enterprise/EnterpriseExports.tsx`

**Required Backend Endpoints:**

1. **POST `/api/enterprise/exports/generate-report`**
   - **Purpose:** Generate clarity report from selected suggestions
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "documentId": "string",
       "suggestionIds": ["string"]
     }
     ```
   - **Response:**
     ```json
     {
       "exportId": "string",
       "documentTitle": "string",
       "suggestions": [
         {
           "id": "string",
           "originalText": "string",
           "suggestedText": "string",
           "confidence": number,
           "reasoning": "string",
           "hotspotInfo": "string"
         }
       ],
       "generatedAt": "ISO 8601"
     }
     ```

2. **GET `/api/enterprise/exports/:exportId/download`**
   - **Purpose:** Download report as markdown
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** Markdown file download

### Component: `EnterpriseProfilePage.tsx`
**Location:** `src/pages/enterprise/EnterpriseProfilePage.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/organization`**
   - **Purpose:** Get organization info
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "orgName": "string",
       "adminEmail": "string",
       "memberCount": number,
       "createdAt": "ISO 8601",
       "driveSources": [
         {
           "id": "string",
           "name": "string",
           "type": "shared-drive" | "folder",
           "path": "string"
         }
       ],
       "members": [
         {
           "id": "string",
           "name": "string",
           "email": "string",
           "role": "admin" | "member"
         }
       ],
       "metrics": {
         "confusionDensity": number,
         "totalTimeSaved": number,
         "activeUsers": number,
         "documentsProcessed": number
       }
     }
     ```

2. **PUT `/api/enterprise/organization`**
   - **Purpose:** Update organization info (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "orgName": "string",
       "adminEmail": "string"
     }
     ```

3. **GET `/api/enterprise/exports/organization-data`**
   - **Purpose:** Export organization data
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** JSON file download

### Component: `GoogleDriveIntegration.tsx`
**Location:** `src/components/enterprise/profile/GoogleDriveIntegration.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/google-drive/sources`**
   - **Purpose:** Get configured Google Drive sources
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "sources": [
         {
           "id": "string",
           "name": "string",
           "type": "shared-drive" | "folder",
           "path": "string"
         }
       ]
     }
     ```

2. **POST `/api/enterprise/google-drive/sources`**
   - **Purpose:** Add Google Drive source (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "name": "string",
       "type": "shared-drive" | "folder",
       "path": "string",
       "googleDriveId": "string"
     }
     ```

3. **DELETE `/api/enterprise/google-drive/sources/:sourceId`**
   - **Purpose:** Remove Google Drive source (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

4. **GET `/api/google-docs/documents`**
   - **Purpose:** Fetch documents from Google Drive
   - **Headers:** `Authorization: Bearer <token>`
   - **Query Params:** `?folderPath=<path>&dateRange.start=<ISO>&dateRange.end=<ISO>`
   - **Response:** See `EnterpriseOverview` document endpoint

### Component: `TeamMembers.tsx`
**Location:** `src/components/enterprise/profile/TeamMembers.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/members`**
   - **Purpose:** Get team members list
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "members": [
         {
           "id": "string",
           "name": "string",
           "email": "string",
           "role": "admin" | "member",
           "joinedAt": "ISO 8601"
         }
       ]
     }
     ```

2. **POST `/api/enterprise/members`**
   - **Purpose:** Add team member (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "email": "string",
       "role": "admin" | "member"
     }
     ```

3. **DELETE `/api/enterprise/members/:memberId`**
   - **Purpose:** Remove team member (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:** `{ "success": true }`

4. **PATCH `/api/enterprise/members/:memberId/role`**
   - **Purpose:** Update member role (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "role": "admin" | "member"
     }
     ```

### Component: `EnterpriseSettings.tsx`
**Location:** `src/components/enterprise/profile/EnterpriseSettings.tsx`

**Required Backend Endpoints:**

1. **GET `/api/enterprise/settings`**
   - **Purpose:** Get enterprise settings
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "classificationRules": ["string"],
       "privacyPolicies": ["string"],
       "notificationSettings": {
         "emailAlerts": boolean,
         "weeklyReports": boolean
       }
     }
     ```

2. **PUT `/api/enterprise/settings`**
   - **Purpose:** Update enterprise settings (admin only)
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:** Same structure as GET response

---

## Landing Page & Onboarding

### Component: `PersonaSetup.tsx`
**Location:** `src/components/landing/PersonaSetup.tsx`

**Required Backend Endpoints:**

1. **POST `/api/personal/persona`**
   - **Purpose:** Save initial persona setup
   - **Headers:** `Authorization: Bearer <token>` (user must be logged in)
   - **Request Body:**
     ```json
     {
       "experience": "beginner" | "intermediate" | "advanced" | "expert",
       "learningStyle": "visual" | "auditory" | "reading" | "kinesthetic",
       "goals": ["string"],
       "timeCommitment": "1-2h" | "3-5h" | "6-10h" | "10h+",
       "preferredTopics": ["string"],
       "challenges": ["string"]
     }
     ```
   - **Response:** `{ "success": true }`

### Component: `Onboarding.tsx`
**Location:** `src/components/landing/Onboarding.tsx`

**Required Backend Endpoints:**
- No specific endpoints, uses localStorage for onboarding state
- Can optionally track onboarding completion: `POST /api/personal/onboarding/complete`

### Component: `InstallGuide.tsx`
**Location:** `src/components/landing/InstallGuide.tsx`

**Required Backend Endpoints:**
- No backend endpoints needed (static content)

---

## Extension Components

### Component: `ExtensionPopup.tsx`
**Location:** `src/components/extension/ExtensionPopup.tsx`

**Required Backend Endpoints:**

1. **POST `/api/extension/session/start`**
   - **Purpose:** Start a new learning session
   - **Headers:** `Authorization: Bearer <token>`
   - **Request Body:**
     ```json
     {
       "url": "string",
       "documentTitle": "string",
       "documentType": "google-doc" | "github" | "notion" | "confluence" | "other"
     }
     ```
   - **Response:**
     ```json
     {
       "sessionId": "string",
       "startedAt": "ISO 8601"
     }
     ```

2. **POST `/api/extension/session/:sessionId/stop`**
   - **Purpose:** Stop current session
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "sessionId": "string",
       "duration": number,
       "conceptsDetected": number
     }
     ```

### Component: `SessionToggle.tsx`
**Location:** `src/components/extension/SessionToggle.tsx`

**Required Backend Endpoints:**
- Uses same session endpoints as `ExtensionPopup`

### Component: `StatusIndicators.tsx`
**Location:** `src/components/extension/StatusIndicators.tsx`

**Required Backend Endpoints:**

1. **GET `/api/extension/status`**
   - **Purpose:** Get extension status
   - **Headers:** `Authorization: Bearer <token>`
   - **Response:**
     ```json
     {
       "isActive": boolean,
       "currentSessionId": "string | null",
       "isGazeTracking": boolean,
       "hasWebcamAccess": boolean
     }
     ```

### Component: `SidePanel.tsx`
**Location:** `src/components/extension/SidePanel.tsx`

**Required Backend Endpoints:**
- Uses session and notebook entry endpoints from Personal Dashboard

### Component: `DraggableOverlay.tsx`
**Location:** `src/components/extension/DraggableOverlay.tsx`

**Required Backend Endpoints:**
- No specific endpoints (UI component)

---

## Data Types & Structures

### Type Definitions
**Location:** `src/types/enterprise.ts`

All type definitions are already documented in the file. Backend should match these structures:

- `GoogleDocFile`
- `DocumentWithGoogleDoc`
- `DocumentContent`
- `AISuggestion`
- `ApplyEditRequest`
- `ApplyEditResponse`
- `FetchDocumentsRequest`
- `FetchDocumentsResponse`
- `FetchSuggestionsRequest`
- `FetchSuggestionsResponse`
- `SuggestionUpdateEvent` (WebSocket/SSE)
- `DocumentUpdateEvent` (WebSocket/SSE)

### Real-time Updates

**WebSocket/SSE Endpoints:**

1. **WebSocket `/ws/enterprise/updates`**
   - **Purpose:** Real-time updates for enterprise dashboard
   - **Events:**
     - `suggestion_created`
     - `suggestion_updated`
     - `suggestion_applied`
     - `document_updated`
     - `hotspot_detected`
   - **Message Format:**
     ```json
     {
       "type": "suggestion_created" | "suggestion_updated" | "suggestion_applied" | "document_updated" | "hotspot_detected",
       "data": { /* event-specific data */ },
       "timestamp": "ISO 8601"
     }
     ```

---

## Authentication Token Format

All authenticated endpoints expect:
- **Header:** `Authorization: Bearer <JWT_TOKEN>`
- Token should be stored in `localStorage` as `auth_token`
- Token expiration should be handled (refresh token flow recommended)

---

## Error Handling

All endpoints should return consistent error format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {} // Optional additional details
  }
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (should trigger logout)
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Environment Variables

Backend should use these environment variables (matching frontend `.env`):

- `VITE_API_URL` - Backend API URL (default: `http://localhost:8000/api`)
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth Client ID

---

## Notes for Backend Implementation

1. **Google OAuth Integration:**
   - Verify Google JWT tokens on backend
   - Store user info and create accounts if needed
   - Handle enterprise access checks for personal accounts

2. **Google Docs API Integration:**
   - Need Google Drive API access
   - Apply edits to Google Docs programmatically
   - Fetch documents from Google Drive
   - Handle OAuth scopes for Google Drive access

3. **Session Tracking:**
   - Track user learning sessions
   - Detect confusion triggers (scroll, hover, click)
   - Generate gap labels and concepts
   - Store chronological entries

4. **AI/ML Integration:**
   - Generate AI suggestions based on confusion patterns
   - Analyze document hotspots
   - Provide search functionality through learning history
   - Generate summaries and insights

5. **Real-time Features:**
   - WebSocket or SSE for live updates
   - Push notifications for new suggestions
   - Live document updates

6. **Data Privacy:**
   - Respect privacy settings
   - Handle data sharing preferences
   - Comply with user consent for analytics

---

## Testing Checklist

When implementing backend, ensure:

- [ ] All authentication endpoints work
- [ ] All personal dashboard endpoints return correct data structures
- [ ] All enterprise endpoints require proper authorization
- [ ] Google Docs integration works end-to-end
- [ ] Real-time updates are functional
- [ ] Error handling is consistent
- [ ] Token refresh works
- [ ] File uploads/downloads work
- [ ] WebSocket connections are stable
- [ ] Rate limiting is implemented
- [ ] CORS is properly configured

---

**Last Updated:** February 7, 2026
**Version:** 1.0
