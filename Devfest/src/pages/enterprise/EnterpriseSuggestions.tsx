import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, AlertCircle, Lightbulb, HelpCircle, Building2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigation } from '../../components/ui/Navigation'

interface Suggestion {
  id: string
  document: string
  section: string
  confusionType: 'concept' | 'terminology' | 'application'
  confidence: number
  diagnosis: string
  actions: string[]
}

export default function EnterpriseSuggestions() {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const suggestions: Suggestion[] = [
    {
      id: '1',
      document: 'React Best Practices Guide',
      section: 'Hooks Section',
      confusionType: 'concept',
      confidence: 92,
      diagnosis: 'Users are struggling with the dependency array in useEffect. Multiple questions indicate confusion about when to include dependencies.',
      actions: [
        'Add interactive examples showing dependency arrays',
        'Create a visual dependency checker tool',
        'Add common pitfalls section',
      ],
    },
    {
      id: '2',
      document: 'TypeScript Advanced Patterns',
      section: 'Generics Chapter',
      confusionType: 'terminology',
      confidence: 85,
      diagnosis: 'The term "generic constraint" is causing confusion. Users are asking for simpler explanations.',
      actions: [
        'Simplify terminology in this section',
        'Add more real-world examples',
        'Create a glossary entry',
      ],
    },
    {
      id: '3',
      document: 'State Management Comparison',
      section: 'Redux vs Zustand',
      confusionType: 'application',
      confidence: 78,
      diagnosis: 'Users understand the concepts but struggle with when to use each solution in practice.',
      actions: [
        'Add decision tree for choosing state management',
        'Include migration examples',
        'Add performance comparison charts',
      ],
    },
  ]

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const getConfusionIcon = (type: Suggestion['confusionType']) => {
    switch (type) {
      case 'concept':
        return Lightbulb
      case 'terminology':
        return HelpCircle
      case 'application':
        return AlertCircle
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-400'
    if (confidence >= 70) return 'text-yellow-400'
    return 'text-orange-400'
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Lightbulb className="w-6 h-6" />
              <div>
                <h1 className="text-2xl font-bold">AI Suggestions</h1>
                <p className="text-sm text-muted-foreground">
                  AI-powered insights to improve learning materials based on user confusion patterns
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/enterprise/profile')}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
              >
                <Building2 className="w-4 h-4" />
                <span>Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Padding-top accounts for: Nav bar (73px) + Header bar (~50px) = ~123px */}
      <div className="max-w-7xl mx-auto px-4 pb-6 pt-[123px]">

        {/* Suggestions List */}
        <div className="space-y-4">
          {suggestions.map((suggestion, index) => {
            const Icon = getConfusionIcon(suggestion.confusionType)
            const isExpanded = expanded.has(suggestion.id)

            return (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-border rounded-lg bg-muted/30 overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => toggleExpand(suggestion.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{suggestion.document}</h3>
                        <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                          {suggestion.section}
                        </span>
                        <span className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                          {suggestion.confidence}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground capitalize">
                        {suggestion.confusionType} confusion detected
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {/* Expanded Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-4 border-t border-border">
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Diagnosis</h4>
                          <p className="text-sm text-muted-foreground">{suggestion.diagnosis}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Recommended Actions</h4>
                          <ul className="space-y-2">
                            {suggestion.actions.map((action, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm">
                                <span className="text-primary mt-1">•</span>
                                <span className="text-muted-foreground">{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm">
                            Apply Suggestions
                          </button>
                          <button className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm">
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
