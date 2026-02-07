import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Navigation } from '../../components/ui/Navigation'
import { AccountInfo } from '../../components/personal/profile/AccountInfo'
import { PersonaSettings } from '../../components/personal/profile/PersonaSettings'
import { PrivacySettings } from '../../components/personal/profile/PrivacySettings'
import { TimeSavedStats } from '../../components/personal/profile/TimeSavedStats'
import { Download, User } from 'lucide-react'

export default function PersonalProfilePage() {
  const navigate = useNavigate()
  const [profileData, setProfileData] = useState({
    name: 'John Doe',
    email: 'john.doe@example.com',
    googleConnected: true,
    persona: {
      experience: 'intermediate',
      learningStyle: 'visual',
      goals: ['master-fundamentals', 'build-projects'],
    },
    timeSaved: {
      totalHours: 45.5,
      thisWeek: 8.2,
      thisMonth: 32.1,
      breakdown: [
        { category: 'Documentation Reading', hours: 15.2 },
        { category: 'Code Review', hours: 12.8 },
        { category: 'Learning', hours: 17.5 },
      ],
    },
  })

  const handleExport = () => {
    // Export functionality
    console.log('Exporting profile data...')
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <User className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Personal Profile</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/personal')}
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
            <AccountInfo
              name={profileData.name}
              email={profileData.email}
              googleConnected={profileData.googleConnected}
            />
            <PersonaSettings
              persona={profileData.persona}
              onUpdate={(persona) =>
                setProfileData({ ...profileData, persona: { ...profileData.persona, ...persona } })
              }
            />
            <PrivacySettings
              trustBoundary={['example.com', 'docs.example.com']}
              allowedSources={['Google Drive', 'GitHub']}
              onUpdate={(settings) => console.log('Privacy settings updated:', settings)}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <TimeSavedStats
              totalHours={profileData.timeSaved.totalHours}
              thisWeek={profileData.timeSaved.thisWeek}
              thisMonth={profileData.timeSaved.thisMonth}
              breakdown={profileData.timeSaved.breakdown}
            />

            {/* Export Preferences */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <h3 className="text-lg font-semibold mb-4">Export Preferences</h3>
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export Profile Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
