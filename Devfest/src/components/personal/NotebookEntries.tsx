import { BookOpen, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUIStore, usePersonalPageStore } from '../../store/useStore'
import { NotebookEntryDetail } from './NotebookEntryDetail'

interface NotebookEntry {
  id: string
  sessionId: string
  title: string
  date: string
  snippet: string
  preview: string
}

export function NotebookEntries() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const { selectedSessionId, selectedNotebookEntryId, setSelectedNotebookEntryId } = usePersonalPageStore()

  // Mock entries - in real app, these would be filtered by selectedSessionId
  const allEntries: NotebookEntry[] = [
    {
      id: '1',
      sessionId: '1',
      title: 'React Hooks Deep Dive',
      date: '2026-02-07',
      snippet: 'useState(() => { return initialValue })',
      preview: 'Understanding useState, useEffect, and custom hooks...',
    },
    {
      id: '2',
      sessionId: '1',
      title: 'Component Composition',
      date: '2026-02-07',
      snippet: '<Component prop={value} />',
      preview: 'Patterns for composing React components...',
    },
    {
      id: '3',
      sessionId: '2',
      title: 'TypeScript Generics',
      date: '2026-02-07',
      snippet: 'function identity<T>(arg: T): T',
      preview: 'Generic types and their applications in React...',
    },
    {
      id: '4',
      sessionId: '3',
      title: 'State Management Patterns',
      date: '2026-02-06',
      snippet: 'const store = create((set) => ({...}))',
      preview: 'Comparing Zustand, Redux, and Context API...',
    },
  ]

  // Filter entries by selected session, or show all if none selected
  const filteredEntries = selectedSessionId
    ? allEntries.filter((entry) => entry.sessionId === selectedSessionId)
    : allEntries

  const displayedEntries = filteredEntries.slice(0, 5)

  const handleEntryClick = (entryId: string) => {
    setSelectedNotebookEntryId(entryId)
    setSidebarOpen(true)
  }

  return (
    <>
      <div className="space-y-4 h-full flex flex-col w-full max-w-full">
        <div className="flex items-center justify-between flex-shrink-0 min-w-0">
          <h2 className="text-lg font-semibold truncate">Notebook Entries</h2>
          {filteredEntries.length > 5 && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-sm text-primary hover:underline flex-shrink-0 ml-2"
            >
              View All ({filteredEntries.length})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 w-full">
          {displayedEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {selectedSessionId
                ? 'No notebook entries for this session'
                : 'No notebook entries'}
            </div>
          ) : (
            <div className="space-y-2 w-full">
              {displayedEntries.map((entry) => (
                <motion.div
                  key={entry.id}
                  onClick={() => handleEntryClick(entry.id)}
                  className="p-3 bg-muted/50 hover:bg-muted rounded-lg cursor-pointer transition-colors group w-full max-w-full"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-start gap-2 min-w-0 w-full">
                    <BookOpen className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <h3 className="text-sm font-medium mb-1 truncate">
                        {entry.title}
                      </h3>
                      <div className="text-xs font-mono text-muted-foreground mb-1 truncate">
                        {entry.snippet}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry.date}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NotebookEntryDetail
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false)
          setSelectedNotebookEntryId(null)
        }}
        entryId={selectedNotebookEntryId}
        entries={allEntries}
      />
    </>
  )
}
