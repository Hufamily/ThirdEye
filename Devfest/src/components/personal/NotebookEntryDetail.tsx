import { useState, useEffect } from 'react'
import { X, BookOpen, Clock, CheckCircle2, Tag, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'

interface NotebookEntry {
  id: string
  sessionId: string
  title: string
  date: string
  snippet: string
  preview: string
}

interface NotebookEntryDetailProps {
  isOpen: boolean
  onClose: () => void
  entryId: string | null
  entries: NotebookEntry[]
}

interface EntryDetail {
  id: string
  snippet: string
  explanation: string
  followUps: string[]
  isUnderstood: boolean
  corrections: string[]
}

const mockEntryDetails: Record<string, EntryDetail> = {
  '1': {
    id: '1',
    snippet: 'useState(() => { return initialValue })',
    explanation: `The \`useState\` hook allows functional components to manage state. When you pass a function to \`useState\`, it's called only once during the initial render to compute the initial state value. This is useful for expensive computations.

**Key points:**
- The function is only called once, not on every render
- Useful for computing initial state from props
- Prevents unnecessary recalculations`,
    followUps: [
      'How does useState differ from class component state?',
      'When should I use the function form vs direct value?',
      'What happens if the initial value changes?',
    ],
    isUnderstood: false,
    corrections: [],
  },
  '2': {
    id: '2',
    snippet: '<Component prop={value} />',
    explanation: `Component composition is a pattern where you build complex UIs by combining smaller, reusable components. This snippet shows the basic syntax for passing props to a component.

**Benefits:**
- Reusability
- Maintainability
- Separation of concerns`,
    followUps: [
      'What are the best practices for prop naming?',
      'How do I handle prop validation?',
    ],
    isUnderstood: false,
    corrections: [],
  },
  '3': {
    id: '3',
    snippet: 'function identity<T>(arg: T): T',
    explanation: `This is a generic function in TypeScript. The \`<T>\` syntax defines a type parameter that can be used throughout the function signature. The function takes an argument of type \`T\` and returns a value of the same type \`T\`.

**Type safety:**
- Ensures input and output types match
- Provides compile-time type checking
- Enables code reuse with type safety`,
    followUps: [
      'What are generic constraints?',
      'How do I use multiple type parameters?',
    ],
    isUnderstood: false,
    corrections: [],
  },
  '4': {
    id: '4',
    snippet: 'const store = create((set) => ({...}))',
    explanation: `This is the Zustand store creation pattern. \`create\` is a function that takes a callback with a \`set\` function parameter. The callback returns an object representing the store's state and actions.

**Zustand advantages:**
- Minimal boilerplate
- No providers needed
- Simple API`,
    followUps: [
      'How does Zustand compare to Redux?',
      'What are middleware options?',
    ],
    isUnderstood: false,
    corrections: [],
  },
}

export function NotebookEntryDetail({
  isOpen,
  onClose,
  entryId,
  entries,
}: NotebookEntryDetailProps) {
  const [selectedEntry, setSelectedEntry] = useState<EntryDetail | null>(null)
  const [correctionInput, setCorrectionInput] = useState('')

  // Load entry detail when entryId changes
  useEffect(() => {
    if (entryId && mockEntryDetails[entryId]) {
      setSelectedEntry(mockEntryDetails[entryId])
    } else {
      setSelectedEntry(null)
    }
  }, [entryId])

  const entry = entryId ? entries.find((e) => e.id === entryId) : null

  const handleMarkUnderstood = () => {
    if (selectedEntry) {
      setSelectedEntry({ ...selectedEntry, isUnderstood: !selectedEntry.isUnderstood })
      // API call would go here
    }
  }

  const handleTagCorrection = () => {
    if (correctionInput.trim() && selectedEntry) {
      setSelectedEntry({
        ...selectedEntry,
        corrections: [...selectedEntry.corrections, correctionInput.trim()],
      })
      setCorrectionInput('')
      // API call would go here - feeds persona
    }
  }

  if (!entry) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-[55]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-[73px] h-[calc(100vh-73px)] w-[400px] max-w-[90vw] bg-background border-l border-border shadow-2xl z-[60] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">Notebook Entries</h2>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
                <div className="text-center text-muted-foreground py-8">
                  Select an entry to view details
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  const detail = mockEntryDetails[entry.id] || {
    id: entry.id,
    snippet: entry.snippet,
    explanation: entry.preview,
    followUps: [],
    isUnderstood: false,
    corrections: [],
  }

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
            className="fixed right-0 top-[73px] h-[calc(100vh-73px)] w-[400px] max-w-[90vw] bg-background border-l border-border shadow-2xl z-[60] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">{entry.title}</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {entry.date}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-6">
              {/* Captured Snippet */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Captured Snippet
                </h3>
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <code className="text-sm font-mono">{detail.snippet}</code>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Explanation
                </h3>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{detail.explanation}</ReactMarkdown>
                </div>
              </div>

              {/* Follow-ups */}
              {detail.followUps.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Follow-ups
                  </h3>
                  <ul className="space-y-2">
                    {detail.followUps.map((followUp, index) => (
                      <li
                        key={index}
                        className="p-2 bg-muted/30 rounded border border-border text-sm"
                      >
                        {followUp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Corrections */}
              {detail.corrections.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tagged Corrections
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.corrections.map((correction, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-primary/20 text-primary rounded text-xs"
                      >
                        {correction}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-border">
                <button
                  onClick={handleMarkUnderstood}
                  className={`
                    w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium
                    ${
                      detail.isUnderstood
                        ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                        : 'bg-muted hover:bg-muted/80'
                    }
                  `}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {detail.isUnderstood ? 'Marked as Understood' : 'Mark Understood'}
                </button>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Tag a correction (feeds persona)..."
                    value={correctionInput}
                    onChange={(e) => setCorrectionInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleTagCorrection()}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                  <button
                    onClick={handleTagCorrection}
                    disabled={!correctionInput.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    <Tag className="w-4 h-4" />
                    Tag Correction
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
