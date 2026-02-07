import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Navigation } from '../../components/ui/Navigation'
import { OrgInfo } from '../../components/enterprise/profile/OrgInfo'
import { GoogleDriveIntegration } from '../../components/enterprise/profile/GoogleDriveIntegration'
import { TeamMembers } from '../../components/enterprise/profile/TeamMembers'
import { OrgMetrics } from '../../components/enterprise/profile/OrgMetrics'
import { EnterpriseSettings } from '../../components/enterprise/profile/EnterpriseSettings'
import { Building2, Download } from 'lucide-react'

export default function EnterpriseProfilePage() {
  const navigate = useNavigate()
  const [isAdmin] = useState(true) // This would come from auth context
  const [orgData, setOrgData] = useState({
    orgName: 'Acme Corporation',
    adminEmail: 'admin@acme.com',
    memberCount: 25,
    createdAt: '2024-01-15',
    driveSources: [
      { id: '1', name: 'Engineering Docs', type: 'shared-drive' as const, path: '/Shared Drives/Engineering' },
      { id: '2', name: 'Product Specs', type: 'folder' as const, path: '/Product/Specs' },
    ],
    members: [
      { id: '1', name: 'John Doe', email: 'john@acme.com', role: 'admin' as const },
      { id: '2', name: 'Jane Smith', email: 'jane@acme.com', role: 'member' as const },
    ],
    metrics: {
      confusionDensity: 12.5,
      totalTimeSaved: 245.8,
      activeUsers: 18,
      documentsProcessed: 1247,
    },
  })

  const handleExport = () => {
    console.log('Exporting enterprise profile data...')
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Building2 className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Enterprise Profile</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/enterprise')}
                className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {/* Padding-top accounts for: Nav bar (73px) + Header bar (~50px) = ~123px */}
      <div className="max-w-7xl mx-auto px-4 pb-6 pt-[123px]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            <OrgInfo
              orgName={orgData.orgName}
              adminEmail={orgData.adminEmail}
              memberCount={orgData.memberCount}
              createdAt={orgData.createdAt}
            />
            <GoogleDriveIntegration
              sources={orgData.driveSources}
              isAdmin={isAdmin}
              onRemove={(id) =>
                setOrgData({
                  ...orgData,
                  driveSources: orgData.driveSources.filter((s) => s.id !== id),
                })
              }
            />
            <TeamMembers members={orgData.members} isAdmin={isAdmin} />
            {isAdmin && (
              <EnterpriseSettings
                classificationRules={['Rule 1: Classify by department', 'Rule 2: Tag by project']}
                privacyPolicies={['Policy 1: Internal use only', 'Policy 2: No external sharing']}
                isAdmin={isAdmin}
                onUpdate={(settings) => console.log('Enterprise settings updated:', settings)}
              />
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <OrgMetrics
              confusionDensity={orgData.metrics.confusionDensity}
              totalTimeSaved={orgData.metrics.totalTimeSaved}
              activeUsers={orgData.metrics.activeUsers}
              documentsProcessed={orgData.metrics.documentsProcessed}
            />

            {/* Export Settings */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <h3 className="text-lg font-semibold mb-4">Export Settings</h3>
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export Organization Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
