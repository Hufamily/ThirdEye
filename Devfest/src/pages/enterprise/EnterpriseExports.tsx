import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FileText, Loader2, CheckCircle, Download, Building2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Navigation } from '../../components/ui/Navigation'

interface ExportData {
  documentTitle: string
  suggestions: Array<{
    id: string
    originalText: string
    suggestedText: string
    confidence: number
    reasoning: string
    hotspotInfo: string
  }>
}

export default function EnterpriseExports() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isGenerating, setIsGenerating] = useState(true)
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Simulate Google Doc generation
    const timer = setTimeout(() => {
      // In a real app, this would fetch from the API
      const data = location.state?.exportData || {
        documentTitle: 'React Best Practices Guide',
        suggestions: [
          {
            id: 's1',
            originalText: 'The dependency array determines when the effect runs.',
            suggestedText:
              'The dependency array controls when the effect runs: include all values from component scope that change between renders. If omitted, the effect runs after every render.',
            confidence: 92,
            reasoning: 'Users need explicit explanation of dependency array behavior with examples',
            hotspotInfo: '15 users struggled with this paragraph',
          },
        ],
      }
      setExportData(data)
      setIsGenerating(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [location.state])

  const handleDownload = () => {
    if (!exportData) return

    // Generate markdown content for the Clarity Report
    const markdown = `# Clarity Report: ${exportData.documentTitle}

Generated: ${new Date().toLocaleDateString()}

## Summary

This report contains ${exportData.suggestions.length} AI-optimized suggestions to improve document clarity based on user confusion patterns.

---

${exportData.suggestions
  .map(
    (suggestion, idx) => `## Suggestion ${idx + 1}

**Confidence:** ${suggestion.confidence}%
**User Impact:** ${suggestion.hotspotInfo}

### Original Text (Confusing)
${suggestion.originalText}

### AI-Optimized Text
${suggestion.suggestedText}

### Reasoning
${suggestion.reasoning}

---
`
  )
  .join('\n')}

## Next Steps

1. Review each suggestion above
2. Apply changes to the source document
3. Monitor user engagement metrics to measure improvement

---

*This report was generated automatically based on user confusion patterns detected in the Diagnostic Command Center.*
`

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Clarity-Report-${exportData.documentTitle.replace(/\s+/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileText className="w-6 h-6" />
              <div>
                <h1 className="text-2xl font-bold">Clarity Report Generator</h1>
                <p className="text-sm text-muted-foreground">
                  Export selected suggestions to improve document clarity
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/enterprise')}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
              >
                <Building2 className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Padding-top accounts for: Nav bar (73px) + Header bar (~50px) = ~123px */}
      <div className="max-w-[1920px] mx-auto px-4 pb-6 pt-[123px]">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Generating Clarity Report</h2>
            <p className="text-sm text-muted-foreground">
              Compiling selected suggestions into Google Doc format...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-500">{error}</p>
            </div>
          </div>
        ) : exportData ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Success Header */}
            <div className="p-6 bg-green-500/20 border border-green-500/50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <div>
                  <h2 className="text-lg font-semibold">Report Generated Successfully</h2>
                  <p className="text-sm text-muted-foreground">
                    Your Clarity Report for "{exportData.documentTitle}" is ready
                  </p>
                </div>
              </div>
            </div>

            {/* Report Preview */}
            <div className="p-6 bg-muted/50 border border-border rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Report Preview</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Document:</span>
                  <span className="ml-2">{exportData.documentTitle}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Suggestions:</span>
                  <span className="ml-2">{exportData.suggestions.length}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Generated:</span>
                  <span className="ml-2">{new Date().toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Suggestions List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Included Suggestions</h3>
              {exportData.suggestions.map((suggestion, idx) => (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-6 bg-background border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="font-semibold mb-1">Suggestion {idx + 1}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Confidence: {suggestion.confidence}%</span>
                        <span>•</span>
                        <span>{suggestion.hotspotInfo}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Original (Confusing)
                      </div>
                      <div className="text-sm p-3 bg-red-500/10 border border-red-500/20 rounded">
                        {suggestion.originalText}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        AI-Optimized
                      </div>
                      <div className="text-sm p-3 bg-green-500/10 border border-green-500/20 rounded">
                        {suggestion.suggestedText}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Reasoning:</div>
                    <div className="text-sm">{suggestion.reasoning}</div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Download Markdown Report
              </button>
              <button
                onClick={() => navigate('/enterprise')}
                className="px-6 py-3 bg-muted hover:bg-muted/80 rounded-lg transition-colors font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}
