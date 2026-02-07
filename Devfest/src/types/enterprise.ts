/**
 * Enterprise Types - Frontend data structures for easy backend integration
 * 
 * These types define the contract between frontend and backend.
 * Backend should send/receive data matching these structures.
 */

/**
 * Google Doc File Information
 * Used to identify which Google Doc file a document/suggestion belongs to
 */
export interface GoogleDocFile {
  /** Google Docs file ID (from Google Drive API) */
  fileId: string
  /** Full Google Docs URL */
  url: string
  /** File name in Google Drive */
  name: string
  /** Optional: Folder path in Google Drive */
  folderPath?: string
  /** Last modified timestamp */
  lastModified?: string
}

/**
 * Document with Google Doc integration
 */
export interface DocumentWithGoogleDoc {
  id: string
  title: string
  /** Google Doc file information */
  googleDoc: GoogleDocFile
  confusionDensity: number
  totalTriggers: number
  usersAffected: number
}

/**
 * Document Content with Google Doc reference
 */
export interface DocumentContent {
  id: string
  title: string
  content: string
  /** Google Doc file information */
  googleDoc: GoogleDocFile
  hotspots: Array<{
    id: string
    startIndex: number
    endIndex: number
    intensity: number
    userCount: number
    unmetNeed: string
  }>
}

/**
 * AI Suggestion with Google Doc reference
 */
export interface AISuggestion {
  id: string
  /** Document ID this suggestion belongs to */
  documentId: string
  /** Google Doc file information for easy backend targeting */
  googleDoc: GoogleDocFile
  hotspotId: string
  originalText: string
  suggestedText: string
  confidence: number
  reasoning: string
  /** Optional: Character range in Google Doc for precise targeting */
  googleDocRange?: {
    startIndex: number
    endIndex: number
  }
}

/**
 * API Request/Response Types for Backend Integration
 */

/**
 * Request to send suggestion to Google Docs
 * POST /api/google-docs/apply-edit
 */
export interface ApplyEditRequest {
  suggestionId: string
  googleDoc: GoogleDocFile
  originalText: string
  suggestedText: string
  /** Optional: Character range for precise replacement */
  range?: {
    startIndex: number
    endIndex: number
  }
}

/**
 * Response from applying edit to Google Docs
 */
export interface ApplyEditResponse {
  success: boolean
  message: string
  /** Updated Google Doc URL */
  googleDocUrl?: string
  /** Timestamp of change */
  appliedAt?: string
}

/**
 * Request to fetch documents from Google Drive
 * GET /api/google-docs/documents
 */
export interface FetchDocumentsRequest {
  /** Optional: Filter by folder path */
  folderPath?: string
  /** Optional: Filter by date range */
  dateRange?: {
    start: string
    end: string
  }
}

/**
 * Response with documents from Google Drive
 */
export interface FetchDocumentsResponse {
  documents: DocumentWithGoogleDoc[]
  total: number
}

/**
 * Request to fetch suggestions for a document
 * GET /api/suggestions?documentId=xxx
 */
export interface FetchSuggestionsRequest {
  documentId: string
}

/**
 * Response with suggestions
 */
export interface FetchSuggestionsResponse {
  suggestions: AISuggestion[]
  document: DocumentContent
}

/**
 * WebSocket/SSE Event Types for Real-time Updates
 * Backend can push updates to frontend via WebSocket or SSE
 */

export interface SuggestionUpdateEvent {
  type: 'suggestion_created' | 'suggestion_updated' | 'suggestion_applied'
  suggestion: AISuggestion
  timestamp: string
}

export interface DocumentUpdateEvent {
  type: 'document_updated' | 'hotspot_detected'
  document: DocumentContent
  timestamp: string
}
