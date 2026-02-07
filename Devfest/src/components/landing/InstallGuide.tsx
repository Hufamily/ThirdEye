import { motion } from 'framer-motion'
import { Check, Download, ArrowRight } from 'lucide-react'
import { useState } from 'react'

interface InstallGuideProps {
  onComplete: () => void
}

export function InstallGuide({ onComplete }: InstallGuideProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const steps = [
    {
      id: 1,
      title: 'Download Extension',
      description: 'Download the Devfest Chrome extension from the Chrome Web Store',
      action: 'Download',
    },
    {
      id: 2,
      title: 'Install Extension',
      description: 'Open Chrome and navigate to chrome://extensions/, then enable Developer mode',
      action: 'Open Extensions',
    },
    {
      id: 3,
      title: 'Grant Permissions',
      description: 'Allow the extension to access web pages and track your learning',
      action: 'Grant Permissions',
    },
    {
      id: 4,
      title: 'Sign In',
      description: 'Sign in with your account to sync your learning data',
      action: 'Sign In',
    },
  ]

  const toggleStep = (id: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const allCompleted = completedSteps.size === steps.length

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex items-center justify-center px-4 py-20"
    >
      <div className="max-w-3xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-4">Install Devfest Extension</h1>
          <p className="text-muted-foreground">
            Follow these steps to get started with Devfest
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {steps.map((step, index) => {
            const isCompleted = completedSteps.has(step.id)
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`
                  p-6 border rounded-lg transition-all
                  ${
                    isCompleted
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-muted/50'
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div
                      className={`
                        w-10 h-10 rounded-full flex items-center justify-center
                        ${
                          isCompleted
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted border-2 border-border'
                        }
                      `}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <span className="font-semibold">{step.id}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleStep(step.id)}
                        className={`
                          px-4 py-2 rounded-lg text-sm font-medium transition-colors
                          ${
                            isCompleted
                              ? 'bg-muted hover:bg-muted/80'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }
                        `}
                      >
                        {isCompleted ? 'Mark Incomplete' : step.action}
                      </button>
                      {step.id === 1 && (
                        <button className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                          <Download className="w-4 h-4" />
                          Chrome Web Store
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onComplete}
            disabled={!allCompleted}
            className={`
              px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2
              ${
                allCompleted
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }
            `}
          >
            Continue to Onboarding
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
