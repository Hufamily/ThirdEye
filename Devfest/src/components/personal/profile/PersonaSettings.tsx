import { useState } from 'react'
import { Edit2, Save, X } from 'lucide-react'

interface PersonaData {
  experience?: string
  learningStyle?: string
  goals?: string[]
  timeCommitment?: string
}

interface PersonaSettingsProps {
  persona?: PersonaData
  onUpdate?: (persona: PersonaData) => void
}

export function PersonaSettings({ persona, onUpdate }: PersonaSettingsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedPersona, setEditedPersona] = useState<PersonaData>(persona || {})

  const handleSave = () => {
    onUpdate?.(editedPersona)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedPersona(persona || {})
    setIsEditing(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Persona Settings</h3>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="p-2 hover:bg-muted rounded-lg transition-colors text-primary"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Experience Level</label>
              <select
                value={editedPersona.experience || ''}
                onChange={(e) =>
                  setEditedPersona({ ...editedPersona, experience: e.target.value })
                }
                className="w-full mt-1 p-2 bg-background border border-border rounded-lg"
              >
                <option value="">Select...</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Learning Style</label>
              <select
                value={editedPersona.learningStyle || ''}
                onChange={(e) =>
                  setEditedPersona({ ...editedPersona, learningStyle: e.target.value })
                }
                className="w-full mt-1 p-2 bg-background border border-border rounded-lg"
              >
                <option value="">Select...</option>
                <option value="visual">Visual</option>
                <option value="auditory">Auditory</option>
                <option value="reading">Reading</option>
                <option value="kinesthetic">Hands-on</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Experience: </span>
              <span className="font-medium capitalize">
                {persona?.experience || 'Not set'}
              </span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Learning Style: </span>
              <span className="font-medium capitalize">
                {persona?.learningStyle || 'Not set'}
              </span>
            </div>
            {persona?.goals && persona.goals.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Goals: </span>
                <span className="font-medium">{persona.goals.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
