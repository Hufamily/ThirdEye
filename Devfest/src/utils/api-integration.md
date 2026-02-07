# Backend API Integration Guide

This document describes how to integrate the frontend with your backend API for Google Docs functionality.

## API Endpoints

### 1. Fetch Documents from Google Drive

**Endpoint:** `GET /api/google-docs/documents`

**Request:**
```typescript
interface FetchDocumentsRequest {
  folderPath?: string
  dateRange?: {
    start: string
    end: string
  }
}
```

**Response:**
```typescript
interface FetchDocumentsResponse {
  documents: DocumentWithGoogleDoc[]
  total: number
}
```

**Example:**
```typescript
const response = await fetch('/api/google-docs/documents', {
  headers: {
    'Authorization': `Bearer ${authToken}`,
  },
})
const data: FetchDocumentsResponse = await response.json()
```

### 2. Fetch Suggestions for a Document

**Endpoint:** `GET /api/suggestions?documentId=xxx`

**Request:**
```typescript
interface FetchSuggestionsRequest {
  documentId: string
}
```

**Response:**
```typescript
interface FetchSuggestionsResponse {
  suggestions: AISuggestion[]
  document: DocumentContent
}
```

**Example:**
```typescript
const response = await fetch(`/api/suggestions?documentId=${documentId}`, {
  headers: {
    'Authorization': `Bearer ${authToken}`,
  },
})
const data: FetchSuggestionsResponse = await response.json()
```

### 3. Apply Edit to Google Doc

**Endpoint:** `POST /api/google-docs/apply-edit`

**Request:**
```typescript
interface ApplyEditRequest {
  suggestionId: string
  googleDoc: {
    fileId: string
    url: string
    name: string
  }
  originalText: string
  suggestedText: string
  range?: {
    startIndex: number
    endIndex: number
  }
}
```

**Response:**
```typescript
interface ApplyEditResponse {
  success: boolean
  message: string
  googleDocUrl?: string
  appliedAt?: string
}
```

**Example:**
```typescript
const response = await fetch('/api/google-docs/apply-edit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    suggestionId: 's1',
    googleDoc: {
      fileId: '1a2b3c4d5e6f7g8h9i0j',
      url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
      name: 'React Best Practices Guide',
    },
    originalText: 'The dependency array determines when the effect runs.',
    suggestedText: 'The dependency array controls when the effect runs...',
    range: {
      startIndex: 200,
      endIndex: 280,
    },
  }),
})
const result: ApplyEditResponse = await response.json()
```

## Real-time Updates (Optional)

For real-time updates when suggestions are created or applied, you can use WebSocket or Server-Sent Events (SSE):

**WebSocket Example:**
```typescript
const ws = new WebSocket('wss://your-api.com/ws')

ws.onmessage = (event) => {
  const update: SuggestionUpdateEvent | DocumentUpdateEvent = JSON.parse(event.data)
  
  if (update.type === 'suggestion_applied') {
    // Update UI to reflect applied suggestion
    console.log('Suggestion applied:', update.suggestion)
  }
}
```

## Frontend Integration Points

### In `EnterpriseOverview.tsx`:

1. **Replace mock data fetching:**
   ```typescript
   // Replace this:
   const documents = [...]
   
   // With this:
   useEffect(() => {
     fetch('/api/google-docs/documents')
       .then(res => res.json())
       .then(data => setDocuments(data.documents))
   }, [])
   ```

2. **Replace suggestion fetching:**
   ```typescript
   useEffect(() => {
     if (selectedDocumentId) {
       fetch(`/api/suggestions?documentId=${selectedDocumentId}`)
         .then(res => res.json())
         .then(data => {
           setSuggestions(data.suggestions)
           setDocumentContent(data.document)
         })
     }
   }, [selectedDocumentId])
   ```

3. **Uncomment API call in `handleExportToSource`:**
   ```typescript
   const response = await fetch('/api/google-docs/apply-edit', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${authToken}`,
     },
     body: JSON.stringify(requestPayload),
   })
   const result: ApplyEditResponse = await response.json()
   ```

## Type Definitions

All type definitions are in `/src/types/enterprise.ts`. Import them in your components:

```typescript
import type {
  DocumentWithGoogleDoc,
  DocumentContent,
  AISuggestion,
  ApplyEditRequest,
  ApplyEditResponse,
} from '../../types/enterprise'
```

## Error Handling

The frontend is set up to handle errors gracefully. Make sure your backend returns appropriate HTTP status codes:

- `200 OK`: Success
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid auth token
- `404 Not Found`: Document or suggestion not found
- `500 Internal Server Error`: Server error

## Authentication

The frontend expects an authentication token. Store it and include it in requests:

```typescript
const authToken = localStorage.getItem('authToken') // or from your auth store

fetch('/api/google-docs/apply-edit', {
  headers: {
    'Authorization': `Bearer ${authToken}`,
  },
})
```
