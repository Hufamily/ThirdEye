import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { TimeReclaimed, TopDocuments } from '../../components/enterprise/DiagnosticKPIs'
import { EfficiencyPredictionChart } from '../../components/enterprise/EfficiencyPredictionChart'
import { FrictionHeatmap } from '../../components/enterprise/FrictionHeatmap'
import { DocumentHeatmapView } from '../../components/enterprise/DocumentHeatmapView'
import { AISuggestionsQueue } from '../../components/enterprise/AISuggestionsQueue'
import { BatchExportFooter } from '../../components/enterprise/BatchExportFooter'
import { Navigation } from '../../components/ui/Navigation'
import type {
  DocumentContent,
  AISuggestion,
  DocumentWithGoogleDoc,
  ApplyEditRequest,
  ApplyEditResponse,
} from '../../types/enterprise'

export default function EnterpriseOverview() {
  const navigate = useNavigate()
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set())
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [sendingToGoogleDocs, setSendingToGoogleDocs] = useState<Set<string>>(new Set())

  // Mock data with Google Doc file information
  // In production, this would come from: GET /api/google-docs/documents
  const documents: DocumentWithGoogleDoc[] = [
    {
      id: '1',
      title: 'React Best Practices Guide',
      googleDoc: {
        fileId: '1a2b3c4d5e6f7g8h9i0j',
        url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
        name: 'React Best Practices Guide',
        folderPath: '/Engineering/Documentation',
        lastModified: '2024-02-07T10:30:00Z',
      },
      confusionDensity: 72.5,
      totalTriggers: 145,
      usersAffected: 23,
    },
    {
      id: '2',
      title: 'TypeScript Advanced Patterns',
      googleDoc: {
        fileId: '2b3c4d5e6f7g8h9i0j1k',
        url: 'https://docs.google.com/document/d/2b3c4d5e6f7g8h9i0j1k/edit',
        name: 'TypeScript Advanced Patterns',
        folderPath: '/Engineering/Documentation',
        lastModified: '2024-02-06T14:20:00Z',
      },
      confusionDensity: 58.3,
      totalTriggers: 98,
      usersAffected: 18,
    },
    {
      id: '3',
      title: 'State Management Comparison',
      googleDoc: {
        fileId: '3c4d5e6f7g8h9i0j1k2l',
        url: 'https://docs.google.com/document/d/3c4d5e6f7g8h9i0j1k2l/edit',
        name: 'State Management Comparison',
        folderPath: '/Engineering/Documentation',
        lastModified: '2024-02-05T09:15:00Z',
      },
      confusionDensity: 45.2,
      totalTriggers: 67,
      usersAffected: 12,
    },
  ]

  // Document contents with Google Doc references
  // In production, this would come from: GET /api/suggestions?documentId=xxx
  const documentContents: Record<string, DocumentContent> = {
    '1': {
      id: '1',
      title: 'React Best Practices Guide',
      googleDoc: {
        fileId: '1a2b3c4d5e6f7g8h9i0j',
        url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
        name: 'React Best Practices Guide',
        folderPath: '/Engineering/Documentation',
      },
      content: `React Hooks provide a way to use state and other React features in functional components. The useState hook allows you to add state to functional components. When you call useState, it returns a pair: the current state value and a function to update it. The useEffect hook lets you perform side effects in functional components. It's similar to componentDidMount, componentDidUpdate, and componentWillUnmount combined. The dependency array determines when the effect runs.`,
      hotspots: [
        {
          id: 'h1',
          startIndex: 200,
          endIndex: 280,
          intensity: 85,
          userCount: 15,
          unmetNeed: 'Users confused about dependency array behavior',
        },
        {
          id: 'h2',
          startIndex: 100,
          endIndex: 150,
          intensity: 65,
          userCount: 8,
          unmetNeed: 'Unclear explanation of useState return value',
        },
      ],
    },
    '2': {
      id: '2',
      title: 'TypeScript Advanced Patterns',
      googleDoc: {
        fileId: '2b3c4d5e6f7g8h9i0j1k',
        url: 'https://docs.google.com/document/d/2b3c4d5e6f7g8h9i0j1k/edit',
        name: 'TypeScript Advanced Patterns',
        folderPath: '/Engineering/Documentation',
      },
      content: `TypeScript generics allow you to create reusable components that work with multiple types. A generic type parameter is defined using angle brackets. You can use constraints to limit the types that can be used with a generic. Conditional types enable you to create types that depend on other types.`,
      hotspots: [
        {
          id: 'h3',
          startIndex: 120,
          endIndex: 180,
          intensity: 75,
          userCount: 12,
          unmetNeed: 'Generic constraints need more examples',
        },
      ],
    },
  }

  // AI Suggestions with Google Doc file references
  // In production, this would come from: GET /api/suggestions?documentId=xxx
  const aiSuggestions: AISuggestion[] = [
    {
      id: 's1',
      documentId: '1',
      googleDoc: {
        fileId: '1a2b3c4d5e6f7g8h9i0j',
        url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
        name: 'React Best Practices Guide',
      },
      hotspotId: 'h1',
      originalText: 'The dependency array determines when the effect runs.',
      suggestedText: 'The dependency array controls when the effect runs: include all values from component scope that change between renders. If omitted, the effect runs after every render.',
      confidence: 92,
      reasoning: 'Users need explicit explanation of dependency array behavior with examples',
      googleDocRange: {
        startIndex: 200,
        endIndex: 280,
      },
    },
    {
      id: 's2',
      documentId: '1',
      googleDoc: {
        fileId: '1a2b3c4d5e6f7g8h9i0j',
        url: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
        name: 'React Best Practices Guide',
      },
      hotspotId: 'h2',
      originalText: 'When you call useState, it returns a pair: the current state value and a function to update it.',
      suggestedText: 'useState returns an array with two elements: [currentValue, setValue]. Use array destructuring to access them: const [count, setCount] = useState(0)',
      confidence: 88,
      reasoning: 'Adding code example clarifies the return value structure',
      googleDocRange: {
        startIndex: 100,
        endIndex: 150,
      },
    },
    {
      id: 's3',
      documentId: '2',
      googleDoc: {
        fileId: '2b3c4d5e6f7g8h9i0j1k',
        url: 'https://docs.google.com/document/d/2b3c4d5e6f7g8h9i0j1k/edit',
        name: 'TypeScript Advanced Patterns',
      },
      hotspotId: 'h3',
      originalText: 'A generic type parameter is defined using angle brackets.',
      suggestedText: 'A generic type parameter is defined using angle brackets: <T>. You can use constraints like <T extends string> to limit the types that can be used.',
      confidence: 85,
      reasoning: 'Generic constraints need more examples and clearer explanation',
      googleDocRange: {
        startIndex: 120,
        endIndex: 180,
      },
    },
  ]

  const selectedDocument = selectedDocumentId
    ? documentContents[selectedDocumentId] || null
    : null

  // Filter suggestions based on selected document
  const filteredSuggestions = selectedDocumentId
    ? aiSuggestions.filter((s) => s.documentId === selectedDocumentId)
    : []

  // Clear selected hotspot when document changes
  const handleDocumentSelect = (docId: string) => {
    setSelectedDocumentId(docId)
    setSelectedHotspotId(null)
    // Clear selected suggestions when switching documents
    setSelectedSuggestionIds(new Set())
  }

  const handleHotspotHover = (hotspot: any) => {
    if (hotspot) {
      setSelectedHotspotId(hotspot.id)
    } else {
      setSelectedHotspotId(null)
    }
  }

  const handleHotspotClick = (hotspot: any) => {
    setSelectedHotspotId(hotspot.id)
    // The AISuggestionsQueue will auto-scroll to the matching suggestion
  }

  const handleSelectSuggestion = (suggestionId: string, selected: boolean) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(suggestionId)
      } else {
        next.delete(suggestionId)
      }
      return next
    })
  }

  const handleGenerateReport = () => {
    if (selectedSuggestionIds.size === 0 || !selectedDocumentId) return

    setIsGeneratingReport(true)

    // Get selected suggestions with their data (already filtered by document)
    const selectedSuggestions = filteredSuggestions.filter((s) => selectedSuggestionIds.has(s.id))
    const documentTitle = selectedDocument?.title || 'Unknown Document'

    // Get hotspot info for each suggestion
    const suggestionsWithHotspotInfo = selectedSuggestions.map((suggestion) => {
      const hotspot = selectedDocument?.hotspots.find((h) => h.id === suggestion.hotspotId)
      return {
        ...suggestion,
        hotspotInfo: hotspot
          ? `${hotspot.userCount} users struggled with this section`
          : 'User confusion detected',
      }
    })

    // Navigate to exports page with data
    navigate('/enterprise/exports', {
      state: {
        exportData: {
          documentTitle,
          suggestions: suggestionsWithHotspotInfo,
        },
      },
    })
  }

  const handleAccept = (suggestionId: string) => {
    console.log('Accepting suggestion:', suggestionId)
    // API call would go here
  }

  const handleReject = (suggestionId: string) => {
    console.log('Rejecting suggestion:', suggestionId)
    // API call would go here
  }

  /**
   * Send suggestion edit to Google Docs via backend API
   * 
   * Backend Integration Point:
   * POST /api/google-docs/apply-edit
   * Body: ApplyEditRequest
   * Response: ApplyEditResponse
   */
  const handleExportToSource = async (suggestionId: string) => {
    const suggestion = filteredSuggestions.find((s) => s.id === suggestionId)
    if (!suggestion || !selectedDocumentId) {
      alert('Please select a document first')
      return
    }

    const document = documentContents[selectedDocumentId]
    if (!document) return

    // Set loading state for this specific suggestion
    setSendingToGoogleDocs((prev) => new Set(prev).add(suggestionId))

    try {
      // Prepare request payload matching ApplyEditRequest type
      const requestPayload: ApplyEditRequest = {
        suggestionId: suggestion.id,
        googleDoc: suggestion.googleDoc,
        originalText: suggestion.originalText,
        suggestedText: suggestion.suggestedText,
        range: suggestion.googleDocRange,
      }

      // Backend API call - Replace this with your actual endpoint
      // const response = await fetch('/api/google-docs/apply-edit', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${authToken}`,
      //   },
      //   body: JSON.stringify(requestPayload),
      // })
      // 
      // if (!response.ok) {
      //   throw new Error(`API error: ${response.statusText}`)
      // }
      // 
      // const result: ApplyEditResponse = await response.json()

      // Simulate API call for now
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const result: ApplyEditResponse = {
        success: true,
        message: 'Edit applied successfully',
        googleDocUrl: suggestion.googleDoc.url,
        appliedAt: new Date().toISOString(),
      }

      if (result.success) {
        console.log('✅ Successfully sent to Google Docs:', {
          suggestionId,
          googleDocFileId: suggestion.googleDoc.fileId,
          googleDocName: suggestion.googleDoc.name,
          googleDocUrl: result.googleDocUrl,
          appliedAt: result.appliedAt,
        })

        alert(
          `✅ Changes sent to Google Docs!\n\n` +
          `File: ${suggestion.googleDoc.name}\n` +
          `Document: ${document.title}\n\n` +
          `Original: "${suggestion.originalText}"\n\n` +
          `Will be replaced with: "${suggestion.suggestedText}"\n\n` +
          `The agent will apply this change to your Google Doc automatically.\n\n` +
          `View: ${suggestion.googleDoc.url}`
        )
      } else {
        throw new Error(result.message || 'Failed to apply edit')
      }

      // Remove from loading state
      setSendingToGoogleDocs((prev) => {
        const next = new Set(prev)
        next.delete(suggestionId)
        return next
      })
    } catch (error) {
      console.error('❌ Error sending to Google Docs:', error)
      alert(
        `❌ Failed to send changes to Google Docs.\n\n` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        `Please try again or contact support.`
      )
      setSendingToGoogleDocs((prev) => {
        const next = new Set(prev)
        next.delete(suggestionId)
        return next
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Building2 className="w-6 h-6" />
              <div>
                <h1 className="text-2xl font-bold">Diagnostic Command Center</h1>
                <p className="text-sm text-muted-foreground">
                  Identify and resolve documentation friction across your organization
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/enterprise/profile')}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
              >
                <Building2 className="w-4 h-4" />
                <span>Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Padding-top accounts for: Nav bar (73px) + Header bar (~50px) = ~123px */}
      <div className="max-w-[1920px] mx-auto px-4 pb-6 pt-[123px]">
        {/* Top-Level: Efficiency & Unmet Need KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Time Reclaimed */}
          <TimeReclaimed timeReclaimed={245.8} totalTriggers={310} />

          {/* Top Documents by Friction */}
          <TopDocuments
            topDocuments={documents.map((doc) => ({
              id: doc.id,
              title: doc.title,
              frictionScore: doc.confusionDensity,
              triggersPerUser: doc.totalTriggers / doc.usersAffected,
            }))}
          />

          {/* Efficiency Prediction Chart */}
          <EfficiencyPredictionChart
            data={[
              { date: 'Week 1', actual: 62.5 },
              { date: 'Week 2', actual: 64.2 },
              { date: 'Week 3', actual: 65.8 },
              { date: 'Week 4', actual: 67.1 },
              { date: 'Week 5', actual: 68.3, predicted: 68.3 },
              { date: 'Week 6', actual: 0, predicted: 70.1 },
              { date: 'Week 7', actual: 0, predicted: 71.8 },
              { date: 'Week 8', actual: 0, predicted: 73.5 },
            ]}
            currentEfficiency={68.3}
            predictedEfficiency={73.5}
            timeframe="8 weeks"
          />
        </div>

        {/* Middle Level: Friction Heatmap & Document Detail & AI Suggestions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6" style={{ minHeight: '600px' }}>
          {/* Left: Document List */}
          <div className="lg:col-span-3 flex flex-col">
            <FrictionHeatmap
              documents={documents.map((doc) => ({
                id: doc.id,
                title: doc.title,
                confusionDensity: doc.confusionDensity,
                totalTriggers: doc.totalTriggers,
                usersAffected: doc.usersAffected,
                googleDoc: doc.googleDoc,
              }))}
              onDocumentSelect={handleDocumentSelect}
              selectedDocumentId={selectedDocumentId}
            />
          </div>

          {/* Center: Document Detail View with Heatmap */}
          <div className="lg:col-span-5 flex flex-col">
            <DocumentHeatmapView
              document={selectedDocument}
              onHotspotHover={handleHotspotHover}
              onHotspotClick={handleHotspotClick}
              selectedHotspotId={selectedHotspotId}
            />
          </div>

          {/* Right: AI Suggestions Queue */}
          <div className="lg:col-span-4 flex flex-col">
            <AISuggestionsQueue
              suggestions={filteredSuggestions}
              selectedHotspotId={selectedHotspotId}
              selectedSuggestionIds={selectedSuggestionIds}
              sendingToGoogleDocs={sendingToGoogleDocs}
              onSelectSuggestion={handleSelectSuggestion}
              onAccept={handleAccept}
              onReject={handleReject}
              onExportToSource={handleExportToSource}
            />
          </div>
        </div>
      </div>

      {/* Batch Export Footer */}
      <BatchExportFooter
        selectedCount={selectedSuggestionIds.size}
        onGenerateReport={handleGenerateReport}
        isGenerating={isGeneratingReport}
      />
    </div>
  )
}
