import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

interface DraggableOverlayProps {
  onClose?: () => void
}

export function DraggableOverlay({ onClose }: DraggableOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  return (
    <motion.div
      className="fixed z-[9999]"
      initial={{ x: window.innerWidth - 320, y: 20 }}
      drag
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      dragConstraints={{
        left: 0,
        right: window.innerWidth - (isExpanded ? 400 : 300),
        top: 0,
        bottom: window.innerHeight - (isExpanded ? 500 : 150),
      }}
    >
      <motion.div
        className={`
          bg-background border border-border rounded-lg shadow-2xl
          ${isExpanded ? 'w-[400px]' : 'w-[300px]'}
          transition-all duration-300
        `}
        animate={{
          scale: isDragging ? 1.05 : 1,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-medium">Quick Answer</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {!isExpanded ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Based on your current context, here's a quick answer...
              </p>
              <div className="text-xs text-primary cursor-pointer hover:underline">
                Expand for full explanation →
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Full Explanation</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This is a comprehensive explanation based on the current context
                  and your learning history. It includes detailed concepts, examples,
                  and connections to previous knowledge.
                </p>
              </div>
              
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold mb-2">Follow-up Questions</h4>
                <div className="space-y-2">
                  <button className="w-full text-left text-sm p-2 hover:bg-muted rounded transition-colors">
                    Can you explain this concept in more detail?
                  </button>
                  <button className="w-full text-left text-sm p-2 hover:bg-muted rounded transition-colors">
                    How does this relate to what I learned earlier?
                  </button>
                  <button className="w-full text-left text-sm p-2 hover:bg-muted rounded transition-colors">
                    Show me examples
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
