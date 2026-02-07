import { useState } from 'react'
import { Folder, Plus, Trash2 } from 'lucide-react'

interface DriveSource {
  id: string
  name: string
  type: 'shared-drive' | 'folder'
  path: string
}

interface GoogleDriveIntegrationProps {
  sources?: DriveSource[]
  onRemove?: (id: string) => void
  isAdmin?: boolean
}

export function GoogleDriveIntegration({
  sources = [],
  onRemove,
  isAdmin = false,
}: GoogleDriveIntegrationProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Google Drive Integration</h3>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Source
          </button>
        )}
      </div>

      {sources.length > 0 ? (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <Folder className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{source.name}</div>
                  <div className="text-sm text-muted-foreground">{source.path}</div>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => onRemove?.(source.id)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 bg-muted/50 rounded-lg border border-border text-center">
          <p className="text-muted-foreground">No Google Drive sources configured</p>
        </div>
      )}
    </div>
  )
}
