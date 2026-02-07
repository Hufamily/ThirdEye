import { useState } from 'react'
import { X, BookOpen, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface NotebookEntry {
  id: string
  title: string
  timestamp: string
  preview: string
}

interface SidePanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SidePanel({ isOpen, onClose }: SidePanelProps) {
  const [selectedEntry, setSelectedEntry] = useState<NotebookEntry | null>(null)

  const entries: NotebookEntry[] = [
    {
      id: '1',
      title: 'React Hooks Deep Dive',
      timestamp: '2 hours ago',
      preview: 'Understanding useState, useEffect, and custom hooks...',
    },
    {
      id: '2',
      title: 'TypeScript Generics',
      timestamp: '5 hours ago',
      preview: 'Generic types and their applications in React...',
    },
    {
      id: '3',
      title: 'State Management Patterns',
      timestamp: '1 day ago',
      preview: 'Comparing Zustand, Redux, and Context API...',
    },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-[400px] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Notebook Entries</h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {selectedEntry ? (
                <div className="p-4">
                  <button
                    onClick={() => setSelectedEntry(null)}
                    className="text-sm text-primary hover:underline mb-4"
                  >
                    ← Back to list
                  </button>
                  <h3 className="text-xl font-semibold mb-2">{selectedEntry.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <Clock className="w-4 h-4" />
                    {selectedEntry.timestamp}
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <p>{selectedEntry.preview}</p>
                    <p className="mt-4">
                      Full content of the notebook entry would be displayed here.
                      This includes all the concepts, confusions, definitions, and
                      questions captured during the session.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {entries.map((entry) => (
                    <motion.div
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="p-4 bg-muted/50 hover:bg-muted rounded-lg cursor-pointer transition-colors"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium mb-1">{entry.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {entry.preview}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {entry.timestamp}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
