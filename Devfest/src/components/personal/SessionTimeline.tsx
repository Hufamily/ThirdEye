import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Clock, BookOpen, FileText, Sparkles, MoreVertical, CheckCircle2, RotateCcw, Edit2, Search, Menu } from 'lucide-react'
import { usePersonalPageStore } from '../../store/useStore'
import { format } from 'date-fns'
import { getSessions, updateSession, regenerateSessionSummary, Session } from '../../utils/api'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface SessionTimelineProps {
  onAISearchClick?: () => void
  onMenuClick?: () => void
}

export function SessionTimeline({ onAISearchClick, onMenuClick }: SessionTimelineProps = {}) {
  const { selectedSessionId, setSelectedSessionId } = usePersonalPageStore()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [sessionsState, setSessionsState] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoading(true)
        const sessions = await getSessions(50, 0)
        setSessionsState(sessions)
      } catch (err) {
        console.error('Failed to fetch sessions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessions()
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return

    const handleClickOutside = () => {
      setOpenMenuId(null)
    }

    // Small delay to avoid immediate closure
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

  // Group sessions by date
  const groupedSessions = sessionsState.reduce((acc, session) => {
    const dateKey = session.date
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(session)
    return acc
  }, {} as Record<string, Session[]>)

  const handleSessionClick = (sessionId: string) => {
    setSelectedSessionId(sessionId)
  }

  const handleOpenSessionNotes = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setSelectedSessionId(sessionId)
  }

  const handleMarkComplete = async (sessionId: string) => {
    try {
      const session = sessionsState.find(s => s.id === sessionId)
      if (!session) return

      const updated = await updateSession(sessionId, { isComplete: !session.isComplete })
      setSessionsState((prev) =>
        prev.map((s) => (s.id === sessionId ? updated : s))
      )
    } catch (err) {
      console.error('Failed to update session:', err)
      alert('Failed to update session. Please try again.')
    }
    setOpenMenuId(null)
  }

  const handleRegenerateSummary = async (sessionId: string) => {
    try {
      await regenerateSessionSummary(sessionId)
      // Refresh sessions to get updated data
      const sessions = await getSessions(50, 0)
      setSessionsState(sessions)
      alert('Summary regenerated successfully')
    } catch (err) {
      console.error('Failed to regenerate summary:', err)
      alert('Failed to regenerate summary. Please try again.')
    }
    setOpenMenuId(null)
  }

  const handleRenameSession = async (sessionId: string) => {
    const newTitle = prompt('Enter new session title:')
    if (newTitle) {
      try {
        const updated = await updateSession(sessionId, { title: newTitle })
        setSessionsState((prev) =>
          prev.map((s) => (s.id === sessionId ? updated : s))
        )
      } catch (err) {
        console.error('Failed to rename session:', err)
        alert('Failed to rename session. Please try again.')
      }
    }
    setOpenMenuId(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
        <div className="text-sm text-red-500 text-center py-4">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold truncate">Session Timeline</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onAISearchClick}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="text-xs">AI Search</span>
          </button>
          <button
            onClick={onMenuClick}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="space-y-6 w-full max-w-full overflow-hidden">
        {Object.entries(groupedSessions).map(([date, dateSessions]) => (
          <div key={date} className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {format(new Date(date), 'EEEE, MMMM d, yyyy')}
            </div>
            {dateSessions.map((session, index) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleSessionClick(session.id)}
                className={`
                  p-4 rounded-lg border transition-all cursor-pointer group w-full max-w-full overflow-hidden
                  ${
                    selectedSessionId === session.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted/50 hover:bg-muted border-border'
                  }
                `}
              >
                <div className="flex items-start gap-3 w-full min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden w-full max-w-full">
                    <div className="flex items-start gap-2 mb-1 min-w-0 w-full">
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{session.title}</span>
                      {session.isComplete && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded flex-shrink-0">
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      <span className="line-clamp-1">{session.docTitle}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {session.time}
                      </div>
                      <span>{session.duration}</span>
                    </div>
                    {session.triggers.length > 0 && (
                      <div className="flex items-center gap-1 mb-2 flex-wrap">
                        {session.triggers.map((trigger) => (
                          <span
                            key={trigger}
                            className="text-xs px-2 py-0.5 bg-background border border-border rounded"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>
                    )}
                    {session.gapLabels.length > 0 && (
                      <div className="flex items-center gap-1 mb-2 flex-wrap">
                        <Sparkles className="w-3 h-3 text-primary" />
                        {session.gapLabels.slice(0, 2).map((label) => (
                          <span
                            key={label}
                            className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={(e) => handleOpenSessionNotes(e, session.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        Open session notes →
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === session.id ? null : session.id)
                          }}
                          className="p-1 hover:bg-muted rounded transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === session.id && (
                          <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg z-10 min-w-[180px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRenameSession(session.id)
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2 text-sm"
                            >
                              <Edit2 className="w-4 h-4" />
                              Rename Session
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkComplete(session.id)
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2 text-sm"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {session.isComplete ? 'Mark Incomplete' : 'Mark Complete'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRegenerateSummary(session.id)
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2 text-sm"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Regenerate Summary
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
