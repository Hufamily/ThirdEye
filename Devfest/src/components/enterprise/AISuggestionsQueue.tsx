import { useEffect, useRef, useMemo, useCallback } from 'react'
import { Check, X, ExternalLink, Sparkles, Loader2, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import type { AISuggestion } from '../../types/enterprise'

interface Suggestion extends AISuggestion {}

interface AISuggestionsQueueProps {
  suggestions: Suggestion[]
  selectedHotspotId: string | null
  selectedSuggestionIds: Set<string>
  sendingToGoogleDocs?: Set<string>
  onSelectSuggestion: (suggestionId: string, selected: boolean) => void
  onAccept: (suggestionId: string) => void
  onReject: (suggestionId: string) => void
  onExportToSource: (suggestionId: string) => void
}

export function AISuggestionsQueue({
  suggestions,
  selectedHotspotId,
  selectedSuggestionIds,
  sendingToGoogleDocs = new Set(),
  onSelectSuggestion,
  onAccept,
  onReject,
  onExportToSource,
}: AISuggestionsQueueProps) {
  const suggestionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasScrolledRef = useRef<string | null>(null)

  // Memoize filtered suggestions to prevent unnecessary recalculations
  const filteredSuggestions = useMemo(() => {
    return selectedHotspotId
      ? suggestions.filter((s) => s.hotspotId === selectedHotspotId)
      : suggestions
  }, [suggestions, selectedHotspotId])

  // Memoize suggestion IDs for stable comparison
  const suggestionIds = useMemo(() => filteredSuggestions.map((s) => s.id), [filteredSuggestions])

  // Clean up refs when suggestions change
  useEffect(() => {
    // Clean up refs for suggestions that no longer exist
    const currentIds = new Set(suggestionIds)
    Object.keys(suggestionRefs.current).forEach((id) => {
      if (!currentIds.has(id)) {
        delete suggestionRefs.current[id]
      }
    })
  }, [suggestionIds])

  // Scroll to suggestion when hotspot is selected (only once per hotspot)
  useEffect(() => {
    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // Only scroll if this is a new hotspot selection
    if (selectedHotspotId && filteredSuggestions.length > 0 && hasScrolledRef.current !== selectedHotspotId) {
      scrollTimeoutRef.current = setTimeout(() => {
        const firstSuggestion = filteredSuggestions[0]
        const ref = suggestionRefs.current[firstSuggestion.id]
        if (ref) {
          ref.scrollIntoView({ behavior: 'smooth', block: 'center' })
          hasScrolledRef.current = selectedHotspotId
        }
      }, 300) // Slightly longer delay to ensure DOM is ready
    }

    // Reset scroll flag when hotspot is cleared
    if (!selectedHotspotId) {
      hasScrolledRef.current = null
    }

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [selectedHotspotId, filteredSuggestions.length])

  // Stable ref callback to prevent re-renders
  const setSuggestionRef = useCallback((suggestionId: string) => {
    return (el: HTMLDivElement | null) => {
      if (el) {
        suggestionRefs.current[suggestionId] = el
      } else {
        delete suggestionRefs.current[suggestionId]
      }
    }
  }, [])

  if (filteredSuggestions.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">AI Suggestions Queue</h3>
        </div>
        <div className="flex items-center justify-center flex-1 text-muted-foreground border border-border rounded-lg bg-muted/30">
          <div className="text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No suggestions available</p>
            {selectedHotspotId ? (
              <p className="text-xs mt-2">No suggestions for this hotspot</p>
            ) : suggestions.length === 0 ? (
              <p className="text-xs mt-2">Select a document to view its suggestions</p>
            ) : (
              <p className="text-xs mt-2">Select a hotspot to filter suggestions</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">AI Suggestions Queue</h3>
        <span className="text-sm text-muted-foreground">
          ({filteredSuggestions.length} suggestions)
        </span>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
        {filteredSuggestions.map((suggestion, index) => {
          const isSelected = selectedSuggestionIds.has(suggestion.id)
          const isHighlighted = selectedHotspotId === suggestion.hotspotId

          return (
            <motion.div
              key={suggestion.id}
              ref={setSuggestionRef(suggestion.id)}
              initial={false}
              animate={{ opacity: 1 }}
              className={`
                border rounded-lg overflow-hidden transition-all
                ${
                  isHighlighted
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-muted/30'
                }
              `}
            >
            {/* Header */}
            <div className="p-3 bg-muted/50 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {/* Checkbox for selection */}
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onSelectSuggestion(suggestion.id, e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Confidence:</span>
                    <span
                      className={`
                        text-xs font-bold
                        ${
                          suggestion.confidence >= 85
                            ? 'text-green-500'
                            : suggestion.confidence >= 70
                            ? 'text-yellow-500'
                            : 'text-orange-500'
                        }
                      `}
                    >
                      {suggestion.confidence}%
                    </span>
                  </div>
                </div>
                {isHighlighted && (
                  <div className="text-xs text-primary font-medium">Active Hotspot</div>
                )}
              </div>
              {/* Google Doc File Info */}
              {suggestion.googleDoc && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                  <FileText className="w-3 h-3" />
                  <span className="truncate">{suggestion.googleDoc.name}</span>
                  <a
                    href={suggestion.googleDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto flex items-center gap-1 text-primary hover:underline"
                    title="Open in Google Docs"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Doc</span>
                  </a>
                </div>
              )}
            </div>

            {/* Split View: Original vs Suggested */}
            <div className="grid grid-cols-2 gap-0">
              {/* Original Text */}
              <div className="p-4 border-r border-border bg-background/50">
                <div className="flex items-center gap-2 mb-2">
                  <X className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium">Original (Confusing)</span>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {suggestion.originalText}
                </div>
              </div>

              {/* Suggested Text */}
              <div className="p-4 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">AI-Optimized</span>
                </div>
                <div className="text-sm leading-relaxed">{suggestion.suggestedText}</div>
              </div>
            </div>

            {/* Reasoning */}
            <div className="p-3 bg-muted/30 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Reasoning:</div>
              <div className="text-xs">{suggestion.reasoning}</div>
            </div>

            {/* Action Buttons */}
            <div className="p-3 bg-muted/50 border-t border-border flex items-center gap-2">
              <button
                onClick={() => onAccept(suggestion.id)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={() => onReject(suggestion.id)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
              <button
                onClick={() => onExportToSource(suggestion.id)}
                disabled={sendingToGoogleDocs.has(suggestion.id)}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send this edit to Google Docs - agent will apply the change"
              >
                {sendingToGoogleDocs.has(suggestion.id) ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>Send to Google Docs</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
          )
        })}
      </div>
    </div>
  )
}
