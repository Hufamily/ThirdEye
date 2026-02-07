import { useState } from 'react'
import { BookOpen, History, Activity } from 'lucide-react'
import { StatusIndicators } from './StatusIndicators'
import { SessionToggle } from './SessionToggle'

type Tab = 'context' | 'actions' | 'sessions'

export function ExtensionPopup() {
  const [activeTab, setActiveTab] = useState<Tab>('context')

  const tabs = [
    { id: 'context' as Tab, label: 'Context', icon: BookOpen },
    { id: 'actions' as Tab, label: 'Actions', icon: Activity },
    { id: 'sessions' as Tab, label: 'Sessions', icon: History },
  ]

  return (
    <div className="w-[400px] bg-background border border-border rounded-lg shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Devfest</h2>
          <StatusIndicators />
        </div>
        <SessionToggle />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium
                transition-colors relative
                ${
                  activeTab === tab.id
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto scrollbar-hide">
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'actions' && <ActionsTab />}
        {activeTab === 'sessions' && <SessionsTab />}
      </div>
    </div>
  )
}

function ContextTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Current Page Context</h3>
        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <p className="text-muted-foreground">
            Analyzing current page content and extracting key concepts...
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Detected Concepts</h3>
        <div className="flex flex-wrap gap-2">
          {['React Hooks', 'State Management', 'TypeScript'].map((concept) => (
            <span
              key={concept}
              className="px-2 py-1 bg-primary/20 text-primary text-xs rounded"
            >
              {concept}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionsTab() {
  return (
    <div className="space-y-3">
      <button className="w-full text-left p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors">
        <div className="font-medium text-sm mb-1">Save to Notebook</div>
        <div className="text-xs text-muted-foreground">Save current context</div>
      </button>
      <button className="w-full text-left p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors">
        <div className="font-medium text-sm mb-1">Ask Question</div>
        <div className="text-xs text-muted-foreground">Get AI assistance</div>
      </button>
      <button className="w-full text-left p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors">
        <div className="font-medium text-sm mb-1">Generate Summary</div>
        <div className="text-xs text-muted-foreground">Create learning summary</div>
      </button>
    </div>
  )
}

function SessionsTab() {
  const sessions = [
    { id: 1, date: '2026-02-07', duration: '2h 15m', concepts: 12 },
    { id: 2, date: '2026-02-06', duration: '1h 45m', concepts: 8 },
    { id: 3, date: '2026-02-05', duration: '3h 30m', concepts: 15 },
  ]

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{session.date}</span>
            <span className="text-xs text-muted-foreground">{session.duration}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {session.concepts} concepts learned
          </div>
        </div>
      ))}
    </div>
  )
}
