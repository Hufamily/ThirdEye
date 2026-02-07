import { FileText, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BatchExportFooterProps {
  selectedCount: number
  onGenerateReport: () => void
  isGenerating?: boolean
}

export function BatchExportFooter({
  selectedCount,
  onGenerateReport,
  isGenerating = false,
}: BatchExportFooterProps) {
  if (selectedCount === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg"
      >
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {selectedCount} suggestion{selectedCount !== 1 ? 's' : ''} selected
                </div>
                <div className="text-xs text-muted-foreground">
                  Ready to generate Clarity Report
                </div>
              </div>
            </div>
            <button
              onClick={onGenerateReport}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Generate Clarity Report</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
