/**
 * Centralized API Client
 * Handles all backend API calls with authentication, error handling, and base URL configuration
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('auth_token')
      window.location.href = '/'
      throw new Error('Authentication failed')
    }

    // Parse response
    const data = await response.json()

    // Check for error in response
    if (!response.ok) {
      const error: ApiError = data.error || {
        code: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
      }
      throw new Error(error.message || 'API request failed')
    }

    return data as T
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Network error occurred')
  }
}

/**
 * GET request
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' })
}

/**
 * POST request
 */
export async function apiPost<T>(endpoint: string, body?: any): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * PUT request
 */
export async function apiPut<T>(endpoint: string, body?: any): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * PATCH request
 */
export async function apiPatch<T>(endpoint: string, body?: any): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * DELETE request
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' })
}

// ============================================================================
// Authentication API
// ============================================================================

export interface GoogleLoginRequest {
  credential: string
  accountType: 'personal' | 'enterprise'
}

export interface AuthResponse {
  user: {
    id: string
    name: string
    email: string
    picture: string
    sub: string
  }
  token: string
  accountType: 'personal' | 'enterprise'
  hasEnterpriseAccess: boolean
}

export async function login(credential: string, accountType: 'personal' | 'enterprise'): Promise<AuthResponse> {
  return apiPost<AuthResponse>('/auth/google-login', { credential, accountType })
}

export async function getCurrentUser(): Promise<AuthResponse> {
  return apiGet<AuthResponse>('/auth/me')
}

export async function logout(): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('/auth/logout')
}

// ============================================================================
// Personal Dashboard API
// ============================================================================

export interface ProfileResponse {
  name: string
  email: string
  googleConnected: boolean
  timeSaved: {
    totalHours: number
    thisWeek: number
    thisMonth: number
    breakdown: Array<{ category: string; hours: number }>
  }
  personaCard?: any
}

export async function getProfile(): Promise<ProfileResponse> {
  return apiGet<ProfileResponse>('/personal/profile')
}

export interface Session {
  id: string
  date: string | null
  time: string | null
  duration: string | null
  concepts: number
  title: string
  docTitle: string
  triggers: string[]
  gapLabels: string[]
  isComplete: boolean
}

export async function getSessions(limit = 50, offset = 0): Promise<Session[]> {
  return apiGet<Session[]>(`/personal/sessions?limit=${limit}&offset=${offset}`)
}

export async function updateSession(sessionId: string, updates: { title?: string; isComplete?: boolean }): Promise<Session> {
  return apiPatch<Session>(`/personal/sessions/${sessionId}`, updates)
}

export interface SessionNotes {
  id: string
  title: string
  lastUpdated: string
  entries: any[]
}

export async function getSessionNotes(sessionId: string): Promise<SessionNotes> {
  return apiGet<SessionNotes>(`/personal/sessions/${sessionId}/notes`)
}

export async function saveSessionNotes(sessionId: string, notes: Partial<SessionNotes>): Promise<SessionNotes> {
  return apiPut<SessionNotes>(`/personal/sessions/${sessionId}/notes`, notes)
}

export async function generateSessionSummary(sessionId: string): Promise<{ summary: string; keyConcepts: string[]; generatedAt: string }> {
  return apiPost(`/personal/sessions/${sessionId}/generate-summary`)
}

export async function regenerateSessionSummary(sessionId: string): Promise<{ success: boolean; session: Session }> {
  return apiPost(`/personal/sessions/${sessionId}/regenerate-summary`)
}

export async function exportSessionToGoogleDoc(sessionId: string, options: { includeMetadata: boolean; format: 'markdown' | 'plain' }): Promise<{ success: boolean; googleDocUrl: string; fileId: string }> {
  return apiPost(`/personal/sessions/${sessionId}/export/google-doc`, options)
}

export async function downloadSessionMarkdown(sessionId: string): Promise<Blob> {
  const token = getAuthToken()
  const url = `${API_BASE_URL}/personal/sessions/${sessionId}/export/markdown`
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error('Failed to download')
  return response.blob()
}

export interface AgentData {
  classification?: {
    content_type?: string
    concepts?: string[]
    relates_to_gap?: boolean
    gap_label?: string
  }
  hypothesis?: {
    candidates?: Array<{
      id: string
      hypothesis: string
      prerequisites?: string[]
      impact?: string
    }>
    winning_hypothesis?: string
  }
  explanation?: {
    instant_hud?: {
      summary?: string
      key_points?: string[]
    }
    deep_dive?: {
      explanation?: string
      examples?: string[]
      related_concepts?: string[]
    }
  }
}

export interface NotebookEntry {
  id: string
  sessionId: string | null
  title: string
  date: string
  snippet: string
  preview: string
  agentData?: AgentData
  relevantWebpages?: Array<{
    title: string
    url: string
    snippet: string
  }>
}

export interface NotebookEntryDetail extends NotebookEntry {
  content: string
  tags: string[]
  relatedEntries: string[]
}

export async function getNotebookEntries(limit = 50, offset = 0, sessionId?: string): Promise<NotebookEntry[]> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
  if (sessionId) params.append('sessionId', sessionId)
  return apiGet<NotebookEntry[]>(`/personal/notebook-entries?${params}`)
}

export async function getNotebookEntry(entryId: string): Promise<NotebookEntryDetail> {
  return apiGet<NotebookEntryDetail>(`/personal/notebook-entries/${entryId}`)
}

export async function createNotebookEntry(entry: Partial<NotebookEntry>): Promise<NotebookEntryDetail> {
  return apiPost<NotebookEntryDetail>('/personal/notebook-entries', entry)
}

export async function updateNotebookEntry(entryId: string, entry: Partial<NotebookEntry>): Promise<NotebookEntryDetail> {
  return apiPut<NotebookEntryDetail>(`/personal/notebook-entries/${entryId}`, entry)
}

export async function deleteNotebookEntry(entryId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/personal/notebook-entries/${entryId}`)
}

export interface AISearchRequest {
  query: string
  context?: {
    sessionId?: string
    dateRange?: {
      start: string
      end: string
    }
  }
}

export interface AISearchResponse {
  message: string
  results: Array<{
    type: 'session' | 'notebook-entry' | 'document'
    id: string
    title: string
    snippet: string
    relevanceScore: number
  }>
  suggestions: string[]
}

export async function aiSearch(request: AISearchRequest): Promise<AISearchResponse> {
  return apiPost<AISearchResponse>('/personal/ai-search', request)
}

export interface PersonaSettings {
  experience: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  learningStyle: 'visual' | 'auditory' | 'reading' | 'kinesthetic'
  goals: string[]
  timeCommitment: '1-2h' | '3-5h' | '6-10h' | '10h+'
  preferredTopics: string[]
  challenges: string[]
}

export async function getPersonaSettings(): Promise<PersonaSettings> {
  return apiGet<PersonaSettings>('/personal/persona')
}

export async function updatePersonaSettings(settings: PersonaSettings): Promise<PersonaSettings> {
  return apiPut<PersonaSettings>('/personal/persona', settings)
}

export interface PrivacySettings {
  dataSharing: boolean
  analytics: boolean
  sessionTracking: boolean
  aiTraining: boolean
}

export async function getPrivacySettings(): Promise<PrivacySettings> {
  return apiGet<PrivacySettings>('/personal/privacy-settings')
}

export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
  return apiPut<PrivacySettings>('/personal/privacy-settings', settings)
}

// ============================================================================
// Enterprise API
// ============================================================================

export interface DocumentWithGoogleDoc {
  id: string
  title: string
  googleDoc: {
    fileId: string
    url: string
    name: string
    folderPath: string
    lastModified?: string
  }
  confusionDensity: number
  totalTriggers: number
  usersAffected: number
}

export async function getEnterpriseDocuments(limit = 50, offset = 0, folderPath?: string): Promise<{ documents: DocumentWithGoogleDoc[]; total: number }> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
  if (folderPath) params.append('folderPath', folderPath)
  return apiGet<{ documents: DocumentWithGoogleDoc[]; total: number }>(`/enterprise/documents?${params}`)
}

export interface DocumentContent {
  id: string
  title: string
  content: string
  googleDoc: {
    fileId: string
    url: string
    name: string
    folderPath: string
  }
  hotspots: Array<{
    id: string
    startIndex: number
    endIndex: number
    intensity: number
    userCount: number
    unmetNeed: string
  }>
}

export async function getDocumentContent(documentId: string): Promise<DocumentContent> {
  return apiGet<DocumentContent>(`/enterprise/documents/${documentId}`)
}

export interface AISuggestion {
  id: string
  documentId: string
  googleDoc: {
    fileId: string
    url: string
    name: string
  }
  hotspotId: string | null
  originalText: string
  suggestedText: string
  confidence: number
  reasoning: string
  googleDocRange: {
    startIndex: number
    endIndex: number
  }
}

export async function getSuggestions(documentId?: string, limit = 50, offset = 0): Promise<{ suggestions: AISuggestion[]; total: number }> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
  if (documentId) params.append('documentId', documentId)
  return apiGet<{ suggestions: AISuggestion[]; total: number }>(`/enterprise/suggestions?${params}`)
}

export interface ApplyEditRequest {
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

export interface ApplyEditResponse {
  success: boolean
  message: string
  googleDocUrl?: string
  appliedAt?: string
}

export async function applyEditToGoogleDoc(request: ApplyEditRequest): Promise<ApplyEditResponse> {
  return apiPost<ApplyEditResponse>('/google-docs/apply-edit', request)
}

export async function getGoogleDocsDocuments(folderPath?: string, dateRange?: { start: string; end: string }): Promise<{ documents: DocumentWithGoogleDoc[]; total: number }> {
  const params = new URLSearchParams()
  if (folderPath) params.append('folderPath', folderPath)
  if (dateRange) {
    params.append('dateRange.start', dateRange.start)
    params.append('dateRange.end', dateRange.end)
  }
  return apiGet<{ documents: DocumentWithGoogleDoc[]; total: number }>(`/google-docs/documents?${params}`)
}

export async function acceptSuggestion(suggestionId: string): Promise<{ success: boolean }> {
  return apiPost(`/enterprise/suggestions/${suggestionId}/accept`)
}

export async function rejectSuggestion(suggestionId: string): Promise<{ success: boolean }> {
  return apiPost(`/enterprise/suggestions/${suggestionId}/reject`)
}

export async function applySuggestion(suggestionId: string): Promise<{ success: boolean }> {
  return apiPost(`/enterprise/suggestions/${suggestionId}/apply`)
}

export async function dismissSuggestion(suggestionId: string): Promise<{ success: boolean }> {
  return apiPost(`/enterprise/suggestions/${suggestionId}/dismiss`)
}

export interface KPIsResponse {
  timeReclaimed: number
  totalTriggers: number
  topDocuments: Array<{
    id: string
    title: string
    frictionScore: number
    triggersPerUser: number
  }>
  efficiencyData: Array<{
    date: string
    actual: number
    predicted: number
  }>
  currentEfficiency: number
  predictedEfficiency: number
  timeframe: string
}

export async function getKPIs(): Promise<KPIsResponse> {
  return apiGet<KPIsResponse>('/enterprise/kpis')
}

export interface Organization {
  orgName: string
  adminEmail: string
  memberCount: number
  createdAt: string | null
  driveSources: Array<{
    id: string
    name: string
    type: 'shared-drive' | 'folder'
    path: string
  }>
  members: Array<{
    id: string
    name: string
    email: string
    role: 'admin' | 'member'
  }>
  metrics: {
    confusionDensity: number
    totalTimeSaved: number
    activeUsers: number
    documentsProcessed: number
  }
}

export async function getOrganization(): Promise<Organization> {
  return apiGet<Organization>('/enterprise/organization')
}

export async function updateOrganization(updates: { orgName?: string; adminEmail?: string }): Promise<{ success: boolean }> {
  return apiPut<{ success: boolean }>('/enterprise/organization', updates)
}

export interface GoogleDriveSource {
  id: string
  name: string
  type: 'shared-drive' | 'folder'
  path: string
}

export async function getGoogleDriveSources(): Promise<{ sources: GoogleDriveSource[] }> {
  return apiGet<{ sources: GoogleDriveSource[] }>('/enterprise/google-drive/sources')
}

export async function addGoogleDriveSource(source: { name: string; type: 'shared-drive' | 'folder'; path: string; googleDriveId?: string }): Promise<GoogleDriveSource> {
  return apiPost<GoogleDriveSource>('/enterprise/google-drive/sources', source)
}

export async function removeGoogleDriveSource(sourceId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/enterprise/google-drive/sources/${sourceId}`)
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  joinedAt: string
}

export async function getTeamMembers(): Promise<{ members: TeamMember[] }> {
  return apiGet<{ members: TeamMember[] }>('/enterprise/members')
}

export async function addTeamMember(member: { email: string; role: 'admin' | 'member' }): Promise<TeamMember> {
  return apiPost<TeamMember>('/enterprise/members', member)
}

export async function removeTeamMember(memberId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/enterprise/members/${memberId}`)
}

export async function updateTeamMemberRole(memberId: string, role: 'admin' | 'member'): Promise<{ success: boolean }> {
  return apiPatch<{ success: boolean }>(`/enterprise/members/${memberId}/role`, { role })
}

export interface EnterpriseSettings {
  classificationRules: string[]
  privacyPolicies: string[]
  notificationSettings: {
    emailAlerts: boolean
    weeklyReports: boolean
  }
}

export async function getEnterpriseSettings(): Promise<EnterpriseSettings> {
  return apiGet<EnterpriseSettings>('/enterprise/settings')
}

export async function updateEnterpriseSettings(settings: EnterpriseSettings): Promise<EnterpriseSettings> {
  return apiPut<EnterpriseSettings>('/enterprise/settings', settings)
}

export async function exportOrganizationData(): Promise<Blob> {
  const token = getAuthToken()
  const url = `${API_BASE_URL}/enterprise/exports/organization-data`
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error('Failed to export')
  return response.blob()
}

export interface ExportReportRequest {
  documentId: string
  suggestionIds: string[]
}

export interface ExportReportResponse {
  exportId: string
  documentTitle: string
  suggestions: Array<{
    id: string
    originalText: string
    suggestedText: string
    confidence: number
    reasoning: string
    hotspotInfo: string
  }>
  generatedAt: string
}

export async function generateReport(request: ExportReportRequest): Promise<ExportReportResponse> {
  return apiPost<ExportReportResponse>('/enterprise/exports/generate-report', request)
}

export async function downloadReport(exportId: string): Promise<Blob> {
  const token = getAuthToken()
  const url = `${API_BASE_URL}/enterprise/exports/${exportId}/download`
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error('Failed to download')
  return response.blob()
}

export interface AnalyticsGrowth {
  data: Array<{
    month: string
    users: number
    sessions: number
  }>
}

export async function getGrowthAnalytics(startDate?: string, endDate?: string): Promise<AnalyticsGrowth> {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  const query = params.toString()
  return apiGet<AnalyticsGrowth>(`/enterprise/analytics/growth${query ? `?${query}` : ''}`)
}

export interface AnalyticsDepartments {
  data: Array<{
    department: string
    concepts: number
    engagement: number
  }>
}

export async function getDepartmentAnalytics(): Promise<AnalyticsDepartments> {
  return apiGet<AnalyticsDepartments>('/enterprise/analytics/departments')
}

export interface AnalyticsTopics {
  data: Array<{
    name: string
    value: number
  }>
}

export async function getTopicAnalytics(): Promise<AnalyticsTopics> {
  return apiGet<AnalyticsTopics>('/enterprise/analytics/topics')
}
