import { useState, useEffect } from 'react'
import { SessionTimeline } from '../components/personal/SessionTimeline'
import { MarkdownEditor } from '../components/personal/MarkdownEditor'
import { AISearchChat } from '../components/personal/AISearchChat'
import { AccountInfo } from '../components/personal/profile/AccountInfo'
import { TimeSavedStats } from '../components/personal/profile/TimeSavedStats'
import { Navigation } from '../components/ui/Navigation'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { useUIStore } from '../store/useStore'
import { getProfile, ProfileResponse } from '../utils/api'

export default function PersonalPage() {
  const [showAISearch, setShowAISearch] = useState(false)
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true)
        const data = await getProfile()
        setProfileData(data)
      } catch (err) {
        console.error('Failed to fetch profile:', err)
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !profileData) {
    return (
      <div className="min-h-screen bg-background overflow-x-hidden">
        <Navigation />
        <div className="w-full max-w-7xl mx-auto px-4 pt-[73px] pb-4">
          <div className="text-center text-red-500">
            {error || 'Failed to load profile data'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navigation />
      {/* Top Bar - Removed, buttons moved to Session Timeline header */}

      {/* Profile Information Section - Compact */}
      {/* Padding-top accounts for: Nav bar (73px) = ~73px */}
      <div className="w-full max-w-7xl mx-auto px-4 pt-[73px] pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          {/* Left Column - Time Saved Stats */}
          <div className="lg:col-span-2">
            <TimeSavedStats
              totalHours={profileData.timeSaved.totalHours}
              thisWeek={profileData.timeSaved.thisWeek}
              thisMonth={profileData.timeSaved.thisMonth}
              breakdown={profileData.timeSaved.breakdown.map(item => ({
                category: item.category || item.label || 'Other',
                hours: item.hours
              }))}
            />
          </div>

          {/* Right Column - Account Info */}
          <div className="lg:col-span-3">
            <AccountInfo
              name={profileData.name}
              email={profileData.email}
              googleConnected={profileData.googleConnected}
            />
          </div>
        </div>
      </div>

      {/* Main Content - 2 Panel Layout */}
      <div className="w-full max-w-full mx-auto px-4 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 w-full">
          {/* Left Panel - Session Timeline */}
          <div className="lg:col-span-3 space-y-4 min-w-0 w-full overflow-hidden">
            <SessionTimeline
              onAISearchClick={() => setShowAISearch(true)}
              onMenuClick={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>

          {/* Center Panel - Markdown Editor (expanded) */}
          <div className="lg:col-span-9 min-w-0 w-full overflow-hidden">
            <MarkdownEditor />
          </div>
        </div>
      </div>

      {/* AI Search Chat Modal */}
      {showAISearch && (
        <AISearchChat onClose={() => setShowAISearch(false)} />
      )}
    </div>
  )
}
