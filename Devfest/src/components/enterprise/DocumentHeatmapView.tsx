import { useState } from 'react'
import { FileText, Users, AlertCircle, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import type { DocumentContent } from '../../types/enterprise'

interface Hotspot {
  id: string
  startIndex: number
  endIndex: number
  intensity: number // 0-100
  userCount: number
  unmetNeed: string
}

interface DocumentHeatmapViewProps {
  document: DocumentContent | null
  onHotspotHover?: (hotspot: Hotspot | null) => void
  onHotspotClick?: (hotspot: Hotspot) => void
  selectedHotspotId?: string | null
}

export function DocumentHeatmapView({
  document,
  onHotspotHover,
  onHotspotClick,
  selectedHotspotId,
}: DocumentHeatmapViewProps) {
  const [hoveredHotspot, setHoveredHotspot] = useState<Hotspot | null>(null)

  if (!document) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground border border-border rounded-lg bg-muted/30">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a document to view heatmap</p>
        </div>
      </div>
    )
  }

  const getHotspotColor = (intensity: number) => {
    if (intensity >= 70) return 'bg-red-500/40'
    if (intensity >= 40) return 'bg-orange-500/40'
    if (intensity >= 20) return 'bg-yellow-500/40'
    return 'bg-blue-500/20'
  }

  const renderContentWithHotspots = () => {
    const parts: Array<{ text: string; hotspot: Hotspot | null }> = []
    let lastIndex = 0

    // Sort hotspots by start index
    const sortedHotspots = [...document.hotspots].sort((a, b) => a.startIndex - b.startIndex)

    sortedHotspots.forEach((hotspot) => {
      // Add text before hotspot
      if (hotspot.startIndex > lastIndex) {
        parts.push({
          text: document.content.slice(lastIndex, hotspot.startIndex),
          hotspot: null,
        })
      }
      // Add hotspot text
      parts.push({
        text: document.content.slice(hotspot.startIndex, hotspot.endIndex),
        hotspot,
      })
      lastIndex = hotspot.endIndex
    })

    // Add remaining text
    if (lastIndex < document.content.length) {
      parts.push({
        text: document.content.slice(lastIndex),
        hotspot: null,
      })
    }

    return parts.map((part, idx) => {
      if (part.hotspot) {
        const isHovered = hoveredHotspot?.id === part.hotspot.id
        const isSelected = selectedHotspotId === part.hotspot.id
        return (
          <span
            key={idx}
            className={`
              relative ${getHotspotColor(part.hotspot.intensity)}
              ${isHovered || isSelected ? 'ring-2 ring-primary' : ''}
              cursor-pointer transition-all hover:ring-2 hover:ring-primary/50
            `}
            onMouseEnter={() => {
              setHoveredHotspot(part.hotspot)
              onHotspotHover?.(part.hotspot)
            }}
            onMouseLeave={() => {
              setHoveredHotspot(null)
              onHotspotHover?.(null)
            }}
            onClick={() => {
              onHotspotClick?.(part.hotspot)
            }}
            title={`${part.hotspot.userCount} users struggled here: ${part.hotspot.unmetNeed} - Click to view suggestion`}
          >
            {part.text}
            {(isHovered || isSelected) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full left-0 mb-2 p-2 bg-background border border-border rounded-lg shadow-lg z-10 min-w-[200px]"
              >
                <div className="text-xs font-medium mb-1">
                  {part.hotspot.userCount} users affected
                </div>
                <div className="text-xs text-muted-foreground">{part.hotspot.unmetNeed}</div>
              </motion.div>
            )}
          </span>
        )
      }
      return <span key={idx}>{part.text}</span>
    })
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">{document.title}</h3>
          {/* Google Doc File Info */}
          {document.googleDoc && (
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{document.googleDoc.name}</span>
              <a
                href={document.googleDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
                title="Open in Google Docs"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open Doc</span>
              </a>
            </div>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>{document.hotspots.length} hotspots</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>
                {document.hotspots.reduce((sum, h) => sum + h.userCount, 0)} total users affected
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>High Friction</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Low Friction</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 bg-background border border-border rounded-lg overflow-y-auto min-h-0">
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="leading-relaxed">{renderContentWithHotspots()}</p>
        </div>
      </div>
    </div>
  )
}
