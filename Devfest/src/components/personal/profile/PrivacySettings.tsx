import { useState } from 'react'
import { Shield, Globe, Lock } from 'lucide-react'

interface PrivacySettingsProps {
  trustBoundary?: string[]
  allowedSources?: string[]
  onUpdate?: (settings: { trustBoundary?: string[]; allowedSources?: string[] }) => void
}

export function PrivacySettings({
  trustBoundary = [],
  allowedSources = [],
  onUpdate,
}: PrivacySettingsProps) {
  const [trustBoundaryList] = useState<string[]>(trustBoundary)
  const [allowedSourcesList] = useState<string[]>(allowedSources)

  const handleSave = () => {
    onUpdate?.({ trustBoundary: trustBoundaryList, allowedSources: allowedSourcesList })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Privacy Settings</h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-medium">Trust Boundary</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Domains and sources you trust for learning data
          </p>
          {trustBoundaryList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {trustBoundaryList.map((domain, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-background border border-border rounded text-sm"
                >
                  {domain}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trust boundaries configured</p>
          )}
        </div>

        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-medium">Allowed Sources</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Sources allowed to access your learning data
          </p>
          {allowedSourcesList.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allowedSourcesList.map((source, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-background border border-border rounded text-sm"
                >
                  {source}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No allowed sources configured</p>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          Save Privacy Settings
        </button>
      </div>
    </div>
  )
}
