import { useState } from 'react'
import { SessionTimeline } from '../components/personal/SessionTimeline'
import { MarkdownEditor } from '../components/personal/MarkdownEditor'
import { AISearchChat } from '../components/personal/AISearchChat'
import { AccountInfo } from '../components/personal/profile/AccountInfo'
import { TimeSavedStats } from '../components/personal/profile/TimeSavedStats'
import { Navigation } from '../components/ui/Navigation'
import { useUIStore } from '../store/useStore'

export default function PersonalPage() {
  const [showAISearch, setShowAISearch] = useState(false)
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  const [profileData] = useState({
    name: 'John Doe',
    email: 'john.doe@example.com',
    googleConnected: true,
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
              breakdown={profileData.timeSaved.breakdown}
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
