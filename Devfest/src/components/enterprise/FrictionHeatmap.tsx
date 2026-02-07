import { FileText, AlertCircle, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import type { DocumentWithGoogleDoc } from '../../types/enterprise'

interface Document {
  id: string
  title: string
  confusionDensity: number
  totalTriggers: number
  usersAffected: number
  googleDoc?: {
    fileId: string
    url: string
    name: string
  }
}

interface FrictionHeatmapProps {
  documents: Document[]
  onDocumentSelect: (docId: string) => void
  selectedDocumentId: string | null
}

export function FrictionHeatmap({
  documents,
  onDocumentSelect,
  selectedDocumentId,
}: FrictionHeatmapProps) {
  // Sort by confusion density (highest first)
  const sortedDocs = [...documents].sort((a, b) => b.confusionDensity - a.confusionDensity)

  const getHeatmapColor = (density: number) => {
    if (density >= 70) return 'bg-red-500/30 border-red-500/50'
    if (density >= 40) return 'bg-orange-500/30 border-orange-500/50'
    if (density >= 20) return 'bg-yellow-500/30 border-yellow-500/50'
    return 'bg-blue-500/30 border-blue-500/50'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Friction Heatmap</h3>
      </div>
      <div className="space-y-2">
        {sortedDocs.map((doc, index) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onDocumentSelect(doc.id)}
            className={`
              p-4 rounded-lg border cursor-pointer transition-all
              ${getHeatmapColor(doc.confusionDensity)}
              ${
                selectedDocumentId === doc.id
                  ? 'ring-2 ring-primary scale-[1.02]'
                  : 'hover:scale-[1.01]'
              }
            `}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium mb-1 truncate">{doc.title}</h4>
                  {doc.googleDoc && (
                    <div className="flex items-center gap-1 mb-1">
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      <a
                        href={doc.googleDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline truncate"
                        title={`Google Doc: ${doc.googleDoc.name}`}
                      >
                        {doc.googleDoc.name}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Confusion Density: {doc.confusionDensity.toFixed(1)}%</span>
                    <span>•</span>
                    <span>{doc.totalTriggers} triggers</span>
                    <span>•</span>
                    <span>{doc.usersAffected} users</span>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div
                  className={`
                    w-3 h-3 rounded-full
                    ${
                      doc.confusionDensity >= 70
                        ? 'bg-red-500'
                        : doc.confusionDensity >= 40
                        ? 'bg-orange-500'
                        : doc.confusionDensity >= 20
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }
                  `}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
