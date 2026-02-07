import { useState } from 'react'
import { Settings, RotateCcw, Shield } from 'lucide-react'

interface PersonaControlsProps {
  explanationStyle: 'concise' | 'step-by-step'
  defaultDepth: number
  onExplanationStyleChange: (style: 'concise' | 'step-by-step') => void
  onDefaultDepthChange: (depth: number) => void
  onResetPersona: () => void
  privacyToggles: {
    allowDataCollection: boolean
    shareWithOrg: boolean
  }
  onPrivacyToggleChange: (key: string, value: boolean) => void
}

export function PersonaControls({
  explanationStyle,
  defaultDepth,
  onExplanationStyleChange,
  onDefaultDepthChange,
  onResetPersona,
  privacyToggles,
  onPrivacyToggleChange,
}: PersonaControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-border rounded-lg bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          <span className="font-medium">Persona Controls</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {isExpanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 border-t border-border">
          {/* Preferred Explanation Style */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Preferred Explanation Style
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => onExplanationStyleChange('concise')}
                className={`
                  flex-1 px-3 py-2 rounded-lg text-sm transition-colors
                  ${
                    explanationStyle === 'concise'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }
                `}
              >
                Concise
              </button>
              <button
                onClick={() => onExplanationStyleChange('step-by-step')}
                className={`
                  flex-1 px-3 py-2 rounded-lg text-sm transition-colors
                  ${
                    explanationStyle === 'step-by-step'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }
                `}
              >
                Step-by-Step
              </button>
            </div>
          </div>

          {/* Default Depth */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Default Depth: {defaultDepth}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={defaultDepth}
              onChange={(e) => onDefaultDepthChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Shallow</span>
              <span>Deep</span>
            </div>
          </div>

          {/* Privacy Toggles */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Privacy</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyToggles.allowDataCollection}
                onChange={(e) =>
                  onPrivacyToggleChange('allowDataCollection', e.target.checked)
                }
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm">Allow data collection</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyToggles.shareWithOrg}
                onChange={(e) =>
                  onPrivacyToggleChange('shareWithOrg', e.target.checked)
                }
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm">Share with organization</span>
            </label>
          </div>

          {/* Reset Persona */}
          <button
            onClick={onResetPersona}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Persona
          </button>
        </div>
      )}
    </div>
  )
}
