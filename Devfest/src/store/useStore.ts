import { create } from 'zustand'

interface SessionState {
  isActive: boolean
  isGazeTracking: boolean
  hasWebcamAccess: boolean
  startSession: () => void
  stopSession: () => void
  setGazeTracking: (value: boolean) => void
  setWebcamAccess: (value: boolean) => void
}

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

interface PersonalPageState {
  selectedSessionId: string | null
  searchQuery: string
  showOrgDocsOnly: boolean
  selectedNotebookEntryId: string | null
  setSelectedSessionId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setShowOrgDocsOnly: (show: boolean) => void
  setSelectedNotebookEntryId: (id: string | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  isActive: false,
  isGazeTracking: false,
  hasWebcamAccess: false,
  startSession: () => set({ isActive: true }),
  stopSession: () => set({ isActive: false }),
  setGazeTracking: (value) => set({ isGazeTracking: value }),
  setWebcamAccess: (value) => set({ hasWebcamAccess: value }),
}))

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))

export const usePersonalPageStore = create<PersonalPageState>((set) => ({
  selectedSessionId: null,
  searchQuery: '',
  showOrgDocsOnly: false,
  selectedNotebookEntryId: null,
  setSelectedSessionId: (id) => set({ selectedSessionId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowOrgDocsOnly: (show) => set({ showOrgDocsOnly: show }),
  setSelectedNotebookEntryId: (id) => set({ selectedNotebookEntryId: id }),
}))
