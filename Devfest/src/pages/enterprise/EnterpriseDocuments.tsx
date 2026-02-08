import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Clock, TrendingUp, Building2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { EmptyState } from '../../components/ui/EmptyState'
import { Navigation } from '../../components/ui/Navigation'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { FileText as FileTextIcon } from 'lucide-react'
import { getEnterpriseDocuments } from '../../utils/api'

interface Document {
  id: string
  title: string
  lastUpdated: string
  views: number
  concepts: number
  engagement: number
}

export default function EnterpriseDocuments() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true)
        const response = await getEnterpriseDocuments(50, 0)
        // Transform API response to match component interface
        const transformedDocs: Document[] = response.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          lastUpdated: doc.googleDoc.lastModified 
            ? new Date(doc.googleDoc.lastModified).toLocaleDateString()
            : 'Unknown',
          views: doc.usersAffected,
          concepts: Math.round(doc.totalTriggers / 3), // Estimate concepts from triggers
          engagement: Math.min(100, Math.round(doc.confusionDensity))
        }))
        setDocuments(transformedDocs)
      } catch (err) {
        console.error('Failed to fetch documents:', err)
        setError(err instanceof Error ? err.message : 'Failed to load documents')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDocuments()
  }, [])

  const mockDocuments: Document[] = [
    {
      id: '1',
      title: 'React Best Practices Guide',
      lastUpdated: '2 hours ago',
      views: 1234,
      concepts: 45,
      engagement: 87,
    },
    {
      id: '2',
      title: 'TypeScript Advanced Patterns',
      lastUpdated: '1 day ago',
      views: 892,
      concepts: 32,
      engagement: 92,
    },
    {
      id: '3',
      title: 'State Management Comparison',
      lastUpdated: '3 days ago',
      views: 567,
      concepts: 28,
      engagement: 75,
    },
    {
      id: '4',
      title: 'Performance Optimization Techniques',
      lastUpdated: '5 days ago',
      views: 445,
      concepts: 21,
      engagement: 68,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileText className="w-6 h-6" />
              <div>
                <h1 className="text-2xl font-bold">Documents</h1>
                <p className="text-sm text-muted-foreground">
                  Manage and track learning documents across your organization
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
      <div className="max-w-7xl mx-auto px-4 pb-6 pt-[123px]">

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-center text-red-500 py-12">
            {error}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title="No documents yet"
            description="Documents will appear here once they're created and shared."
            action={{
              label: 'Create Document',
              onClick: () => {},
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc, index) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-6 bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-primary/20 rounded-lg group-hover:bg-primary/30 transition-colors">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-1 line-clamp-2">{doc.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {doc.lastUpdated}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Views</span>
                    <span className="font-medium">{doc.views.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Concepts</span>
                    <span className="font-medium">{doc.concepts}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Engagement
                    </span>
                    <span className="font-medium">{doc.engagement}%</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
