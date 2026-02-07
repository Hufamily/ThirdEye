import { useState, useEffect } from 'react'
import { Edit2, Save, FileDown, FileText, Sparkles, Search, FileText as FileTextIcon, ExternalLink, Bot, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { usePersonalPageStore } from '../../store/useStore'
import { format } from 'date-fns'

interface ChronologicalEntry {
  id: string
  timestamp: Date
  searchQuery: string
  document: {
    title: string
    url?: string
    type: 'google-doc' | 'github' | 'notion' | 'confluence' | 'other'
  }
  context: string
  agentAction: string
  agentResponse: string
  links: Array<{
    title: string
    url: string
    description?: string
  }>
}

interface SessionNotes {
  id: string
  title: string
  lastUpdated: Date
  entries: ChronologicalEntry[]
}

const mockSessions: Record<string, SessionNotes> = {
  '1': {
    id: '1',
    title: 'React Advanced Patterns',
    lastUpdated: new Date('2026-02-07T14:30:00'),
    entries: [
      {
        id: '1-1',
        timestamp: new Date('2026-02-07T14:25:00'),
        searchQuery: 'How to optimize React component performance?',
        document: {
          title: 'React Documentation - Performance',
          url: 'https://react.dev/learn/render-and-commit',
          type: 'other',
        },
        context: 'Reading React performance optimization guide',
        agentAction: 'Identified key performance patterns and explained memoization strategies',
        agentResponse: `Found relevant information about React performance optimization:

**Key Concepts:**
- React.memo for component memoization
- useMemo and useCallback hooks for expensive computations
- Code splitting and lazy loading

**Recommendations:**
- Use React.memo for components that receive the same props frequently
- Memoize expensive calculations with useMemo
- Use useCallback for functions passed as props`,
        links: [
          {
            title: 'React.memo Documentation',
            url: 'https://react.dev/reference/react/memo',
            description: 'Official guide on React.memo',
          },
          {
            title: 'Performance Optimization Guide',
            url: 'https://react.dev/learn/render-and-commit',
            description: 'Complete performance guide',
          },
        ],
      },
      {
        id: '1-2',
        timestamp: new Date('2026-02-07T14:20:00'),
        searchQuery: 'What is component composition in React?',
        document: {
          title: 'React Patterns - Component Composition',
          url: 'https://react.dev/learn/passing-data-deeply-with-context',
          type: 'github',
        },
        context: 'Learning about React component patterns',
        agentAction: 'Explained composition patterns and provided examples',
        agentResponse: `Component composition is a pattern where you build complex UIs by combining smaller components.

**Patterns:**
- Container/Presentational pattern
- Compound components
- Render props pattern

**Example:**
\`\`\`jsx
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
\`\`\``,
        links: [
          {
            title: 'Composition vs Inheritance',
            url: 'https://react.dev/learn/passing-data-deeply-with-context',
            description: 'React composition patterns',
          },
        ],
      },
    ],
  },
  '2': {
    id: '2',
    title: 'TypeScript Fundamentals',
    lastUpdated: new Date('2026-02-07T10:00:00'),
    entries: [
      {
        id: '2-1',
        timestamp: new Date('2026-02-07T09:55:00'),
        searchQuery: 'What are TypeScript generics?',
        document: {
          title: 'TypeScript Handbook - Generics',
          url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
          type: 'other',
        },
        context: 'Learning TypeScript generics',
        agentAction: 'Explained generics with examples and use cases',
        agentResponse: `Generics allow you to create reusable components that work with multiple types.

**Syntax:**
\`\`\`typescript
function identity<T>(arg: T): T {
  return arg
}
\`\`\`

**Key Points:**
- Type parameter <T> can be used throughout the function
- Provides type safety without losing flexibility
- Commonly used in React for component props`,
        links: [
          {
            title: 'TypeScript Generics Guide',
            url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
            description: 'Official TypeScript generics documentation',
          },
        ],
      },
    ],
  },
  '3': {
    id: '3',
    title: 'State Management Deep Dive',
    lastUpdated: new Date('2026-02-06T16:00:00'),
    entries: [
      {
        id: '3-1',
        timestamp: new Date('2026-02-06T15:50:00'),
        searchQuery: 'Zustand store patterns and best practices',
        document: {
          title: 'Zustand Documentation',
          url: 'https://zustand-demo.pmnd.rs/',
          type: 'github',
        },
        context: 'Implementing state management with Zustand',
        agentAction: 'Analyzed Zustand patterns and provided implementation guide',
        agentResponse: `Zustand is a minimal state management solution for React.

**Store Creation:**
\`\`\`typescript
import { create } from 'zustand'

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))
\`\`\`

**Best Practices:**
- Keep stores focused and small
- Use middleware for persistence or devtools
- Separate concerns into multiple stores if needed`,
        links: [
          {
            title: 'Zustand GitHub',
            url: 'https://github.com/pmndrs/zustand',
            description: 'Zustand repository and examples',
          },
          {
            title: 'Zustand Documentation',
            url: 'https://zustand-demo.pmnd.rs/',
            description: 'Official Zustand docs',
          },
        ],
      },
    ],
  },
}

export function MarkdownEditor() {
  const { selectedSessionId } = usePersonalPageStore()
  const [sessionTitle, setSessionTitle] = useState<string>('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [entries, setEntries] = useState<ChronologicalEntry[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Load session data when selected
  useEffect(() => {
    if (selectedSessionId && mockSessions[selectedSessionId]) {
      const session = mockSessions[selectedSessionId]
      // Sort entries by timestamp (newest first)
      const sortedEntries = [...session.entries].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      )
      setEntries(sortedEntries)
      setSessionTitle(session.title)
      setLastUpdated(session.lastUpdated)
    } else {
      setSessionTitle('')
      setEntries([])
    }
  }, [selectedSessionId])

  const handleSaveAll = () => {
    setLastUpdated(new Date())
    // Save all entries logic - would call API
  }

  const handleGenerateSummary = () => {
    // Generate summary logic - would call API
    console.log('Generating summary...')
  }

  const handleExportGoogleDoc = () => {
    // Export to Google Doc logic - only knowledge/notes + links
    const content = entries
      .map((entry) => {
        const dateStr = format(entry.timestamp, 'MMM d, yyyy')
        let docContent = `## ${entry.document.title} - ${dateStr}\n\n`
        docContent += `${entry.agentResponse}\n\n`
        
        if (entry.links.length > 0) {
          docContent += `**Further Reading:**\n`
          docContent += entry.links.map((link) => `- [${link.title}](${link.url})${link.description ? ` - ${link.description}` : ''}`).join('\n')
          docContent += '\n\n'
        }
        
        return docContent
      })
      .join('---\n\n')
    
    const fullContent = `# ${sessionTitle}\n\n${content}`
    
    // In a real implementation, this would call Google Docs API
    console.log('Exporting to Google Doc:', fullContent)
    // For now, we'll create a downloadable text file that can be imported to Google Docs
    const blob = new Blob([fullContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sessionTitle.replace(/\s+/g, '-')}-notes.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportMarkdown = () => {
    // Export markdown - only knowledge/notes + links (no agent metadata)
    const markdown = entries
      .map((entry) => {
        const dateStr = format(entry.timestamp, 'MMM d, yyyy')
        let docContent = `## ${entry.document.title} - ${dateStr}\n\n`
        docContent += `${entry.agentResponse}\n\n`
        
        if (entry.links.length > 0) {
          docContent += `**Further Reading:**\n\n`
          docContent += entry.links.map((link) => `- [${link.title}](${link.url})${link.description ? ` - ${link.description}` : ''}`).join('\n')
          docContent += '\n\n'
        }
        
        return docContent
      })
      .join('---\n\n')
    
    const fullMarkdown = `# ${sessionTitle}\n\n${markdown}`
    
    const blob = new Blob([fullMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sessionTitle.replace(/\s+/g, '-')}-notes.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRename = () => {
    setIsRenaming(true)
  }

  const handleTitleSave = () => {
    setIsRenaming(false)
    // Save title logic
  }

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'google-doc':
        return '📄'
      case 'github':
        return '💻'
      case 'notion':
        return '📝'
      case 'confluence':
        return '📚'
      default:
        return '📄'
    }
  }

  if (!selectedSessionId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a session to view notes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 h-full overflow-y-auto w-full max-w-full min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-shrink-0 w-full min-w-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          {isRenaming ? (
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyPress={(e) => e.key === 'Enter' && handleTitleSave()}
              className="text-lg font-semibold bg-background border border-border rounded px-2 py-1 w-full max-w-full focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg font-semibold truncate">
                Session Notes — {sessionTitle}
              </h2>
              <button
                onClick={handleRename}
                className="p-1 hover:bg-muted rounded transition-colors opacity-0 group-hover:opacity-100"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="text-sm text-muted-foreground mt-1">
            Last updated: {format(lastUpdated, 'MMM d, yyyy h:mm a')}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <button
            onClick={handleGenerateSummary}
            className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm"
          >
            <Sparkles className="w-4 h-4" />
            Generate Summary
          </button>
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleExportGoogleDoc}
            className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm"
          >
            <FileText className="w-4 h-4" />
            Export to Google Doc
          </button>
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm"
          >
            <FileDown className="w-4 h-4" />
            Export Markdown
          </button>
        </div>
      </div>

      {/* Chronological Feed */}
      <div className="space-y-6">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No entries yet. Start learning to see your chronological feed!</p>
          </div>
        ) : (
          entries.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="border border-border rounded-lg p-6 bg-muted/30 hover:bg-muted/40 transition-colors"
            >
              {/* Entry Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">
                        {format(entry.timestamp, 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Search className="w-4 h-4 text-primary" />
                      <span className="font-medium">{entry.searchQuery}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Context */}
              <div className="mb-4 p-3 bg-background/50 rounded-lg border border-border">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">{getDocumentIcon(entry.document.type)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{entry.document.title}</span>
                      {entry.document.url && (
                        <a
                          href={entry.document.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{entry.context}</p>
                  </div>
                </div>
              </div>

              {/* Agent Action */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Agent Action</span>
                </div>
                <p className="text-sm text-muted-foreground">{entry.agentAction}</p>
              </div>

              {/* Agent Response */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Response</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{entry.agentResponse}</ReactMarkdown>
                </div>
              </div>

              {/* Links for Further Inquiry */}
              {entry.links.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <ExternalLink className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Links for Further Inquiry</span>
                  </div>
                  <div className="space-y-2">
                    {entry.links.map((link, linkIndex) => (
                      <a
                        key={linkIndex}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 p-2 bg-background/50 rounded border border-border hover:bg-background transition-colors group"
                      >
                        <ExternalLink className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm group-hover:text-primary transition-colors">
                            {link.title}
                          </div>
                          {link.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {link.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {link.url}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
