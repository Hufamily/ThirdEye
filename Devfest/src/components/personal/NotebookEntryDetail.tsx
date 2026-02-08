import { useState, useEffect } from 'react'
import { X, BookOpen, Clock, CheckCircle2, Tag, MessageSquare, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { getNotebookEntry, NotebookEntryDetail as NotebookEntryDetailType, AgentData } from '../../utils/api'

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
  const [entryDetail, setEntryDetail] = useState<NotebookEntryDetailType | null>(null)
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [relevantWebpages, setRelevantWebpages] = useState<Array<{title: string, url: string, snippet: string}>>([])
  const [activeTab, setActiveTab] = useState<'summary' | 'explanation' | 'resources'>('summary')
  const [isLoading, setIsLoading] = useState(false)
  const [correctionInput, setCorrectionInput] = useState('')

  // Load entry detail when entryId changes
  useEffect(() => {
    const fetchEntryDetail = async () => {
      if (!entryId) {
        setEntryDetail(null)
        setAgentData(null)
        setRelevantWebpages([])
        return
      }

      try {
        setIsLoading(true)
        const detail = await getNotebookEntry(entryId)
        setEntryDetail(detail)
        
        // Parse agent data from content JSON
        try {
          let contentData
          if (typeof detail.content === 'string') {
            contentData = JSON.parse(detail.content || '{}')
          } else {
            contentData = detail.content || {}
          }
          
          if (contentData.agentData) {
            setAgentData(contentData.agentData)
          }
          if (contentData.relevantWebpages) {
            setRelevantWebpages(contentData.relevantWebpages)
          }
        } catch (e) {
          // Content might not be JSON, that's okay
          console.log('Content is not JSON format:', e)
        }
      } catch (err) {
        console.error('Failed to fetch entry detail:', err)
        // Fallback to mock data
        if (mockEntryDetails[entryId]) {
          const mockDetail = mockEntryDetails[entryId]
          setEntryDetail({
            id: entryId,
            sessionId: entries.find(e => e.id === entryId)?.sessionId || null,
            title: entries.find(e => e.id === entryId)?.title || '',
            date: entries.find(e => e.id === entryId)?.date || '',
            snippet: mockDetail.snippet,
            preview: mockDetail.explanation,
            content: mockDetail.explanation,
            tags: [],
            relatedEntries: []
          })
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchEntryDetail()
  }, [entryId, entries])

  const entry = entryId ? entries.find((e) => e.id === entryId) : null

  const handleMarkUnderstood = () => {
    // API call would go here
    console.log('Mark as understood')
  }

  const handleTagCorrection = () => {
    if (correctionInput.trim()) {
      // API call would go here - feeds persona
      setCorrectionInput('')
    }
  }

  // Extract agent data
  const agent2 = agentData?.classification
  const agent3 = agentData?.hypothesis
  const agent4 = agentData?.explanation
  
  // Get winning hypothesis
  let winningHypothesis = null
  if (agent3?.candidates && agent3.winning_hypothesis) {
    winningHypothesis = agent3.candidates.find(c => c.id === agent3.winning_hypothesis) || agent3.candidates[0]
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
            <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
              {/* Tabs */}
              {agentData && (
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'summary'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setActiveTab('explanation')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'explanation'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Explanation
                  </button>
                  <button
                    onClick={() => setActiveTab('resources')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'resources'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Resources
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-muted-foreground">Loading...</div>
                  </div>
                ) : agentData ? (
                  <>
                    {/* Summary Tab */}
                    {activeTab === 'summary' && (
                      <div className="space-y-4">
                        {/* Content Type */}
                        {agent2?.content_type && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Content Type</h3>
                            <span className="inline-block px-3 py-1 bg-muted rounded-md text-sm">
                              {agent2.content_type}
                            </span>
                          </div>
                        )}

                        {/* Concepts */}
                        {agent2?.concepts && agent2.concepts.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Concepts</h3>
                            <ul className="list-disc list-inside space-y-1">
                              {agent2.concepts.map((concept, idx) => (
                                <li key={idx} className="text-sm">{concept}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Gap Hypothesis */}
                        {winningHypothesis && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Gap Hypothesis</h3>
                            <p className="text-sm mb-2">{winningHypothesis.hypothesis}</p>
                            {winningHypothesis.prerequisites && winningHypothesis.prerequisites.length > 0 && (
                              <div className="mt-2">
                                <h4 className="text-xs font-medium text-muted-foreground mb-1">Prerequisites:</h4>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                  {winningHypothesis.prerequisites.map((prereq, idx) => (
                                    <li key={idx}>{prereq}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Captured Snippet */}
                        {entryDetail?.snippet && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Captured Snippet</h3>
                            <div className="p-3 bg-muted/50 rounded-lg border border-border">
                              <code className="text-sm font-mono">{entryDetail.snippet}</code>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Explanation Tab */}
                    {activeTab === 'explanation' && (
                      <div className="space-y-4">
                        {/* Instant HUD */}
                        {agent4?.instant_hud && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Quick Summary</h3>
                            {agent4.instant_hud.summary && (
                              <p className="text-sm mb-2">{agent4.instant_hud.summary}</p>
                            )}
                            {agent4.instant_hud.key_points && agent4.instant_hud.key_points.length > 0 && (
                              <ul className="list-disc list-inside space-y-1">
                                {agent4.instant_hud.key_points.map((point, idx) => (
                                  <li key={idx} className="text-sm">{point}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Deep Dive */}
                        {agent4?.deep_dive && (
                          <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">Deep Dive</h3>
                            {agent4.deep_dive.explanation && (
                              <div className="prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown>{agent4.deep_dive.explanation}</ReactMarkdown>
                              </div>
                            )}
                            {agent4.deep_dive.examples && agent4.deep_dive.examples.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-xs font-medium text-muted-foreground mb-2">Examples:</h4>
                                {agent4.deep_dive.examples.map((example, idx) => (
                                  <div key={idx} className="p-3 bg-muted/50 rounded-lg border border-border mb-2 text-sm">
                                    {example}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Resources Tab */}
                    {activeTab === 'resources' && (
                      <div className="space-y-3">
                        {relevantWebpages.length > 0 ? (
                          relevantWebpages.map((page, idx) => (
                            <a
                              key={idx}
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                                    {page.title}
                                    <ExternalLink className="w-3 h-3" />
                                  </h4>
                                  <p className="text-xs text-muted-foreground mb-1 truncate">{page.url}</p>
                                  {page.snippet && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{page.snippet}</p>
                                  )}
                                </div>
                              </div>
                            </a>
                          ))
                        ) : (
                          <div className="text-center text-muted-foreground py-8">
                            No relevant webpages found
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Fallback: Show basic entry info if no agent data */}
                    {entryDetail?.snippet && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Captured Snippet</h3>
                        <div className="p-3 bg-muted/50 rounded-lg border border-border">
                          <code className="text-sm font-mono">{entryDetail.snippet}</code>
                        </div>
                      </div>
                    )}
                    {entryDetail?.content && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Content</h3>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{entryDetail.content}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Tags */}
                {entryDetail?.tags && entryDetail.tags.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {entryDetail.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-primary/20 text-primary rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <button
                    onClick={handleMarkUnderstood}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium bg-muted hover:bg-muted/80"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Understood
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
