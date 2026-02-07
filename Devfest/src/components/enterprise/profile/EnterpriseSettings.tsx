import { Settings, Shield, FileText } from 'lucide-react'

interface EnterpriseSettingsProps {
  classificationRules?: string[]
  privacyPolicies?: string[]
  isAdmin?: boolean
  onUpdate?: (settings: { classificationRules?: string[]; privacyPolicies?: string[] }) => void
}

export function EnterpriseSettings({
  classificationRules = [],
  privacyPolicies = [],
  isAdmin = false,
  onUpdate,
}: EnterpriseSettingsProps) {
  if (!isAdmin) {
    return null
  }

  const handleSave = () => {
    onUpdate?.({ classificationRules, privacyPolicies })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Enterprise Settings</h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-medium">Classification Rules</h4>
          </div>
          {classificationRules.length > 0 ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {classificationRules.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No classification rules configured</p>
          )}
        </div>

        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-medium">Privacy Policies</h4>
          </div>
          {privacyPolicies.length > 0 ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {privacyPolicies.map((policy, idx) => (
                <li key={idx}>{policy}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No privacy policies configured</p>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          Save Enterprise Settings
        </button>
      </div>
    </div>
  )
}
