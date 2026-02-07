import { useState } from 'react'
import { Filter, X } from 'lucide-react'

interface SearchFiltersProps {
  conceptCategories: string[]
  docProviders: string[]
  onFiltersChange: (filters: {
    conceptCategory?: string
    docProvider?: string
    confidence?: 'low' | 'medium' | 'high' | 'all'
    orgVsPersonal?: 'org' | 'personal' | 'all'
  }) => void
}

export function SearchFilters({ conceptCategories, docProviders, onFiltersChange }: SearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filters, setFilters] = useState<{
    conceptCategory?: string
    docProvider?: string
    confidence?: 'low' | 'medium' | 'high' | 'all'
    orgVsPersonal?: 'org' | 'personal' | 'all'
  }>({
    confidence: 'all',
    orgVsPersonal: 'all',
  })

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const clearFilters = () => {
    const clearedFilters = {
      conceptCategory: undefined,
      docProvider: undefined,
      confidence: 'all',
      orgVsPersonal: 'all',
    }
    setFilters(clearedFilters)
    onFiltersChange(clearedFilters)
  }

  const hasActiveFilters =
    filters.conceptCategory ||
    filters.docProvider ||
    filters.confidence !== 'all' ||
    filters.orgVsPersonal !== 'all'

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm
          ${hasActiveFilters ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}
        `}
      >
        <Filter className="w-4 h-4" />
        Filters
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 bg-background/20 rounded text-xs">
            {[
              filters.conceptCategory,
              filters.docProvider,
              filters.confidence !== 'all' ? filters.confidence : null,
              filters.orgVsPersonal !== 'all' ? filters.orgVsPersonal : null,
            ].filter(Boolean).length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Concept Category */}
            <div>
              <label className="text-sm font-medium mb-1 block">Concept Category</label>
              <select
                value={filters.conceptCategory || ''}
                onChange={(e) =>
                  handleFilterChange('conceptCategory', e.target.value || undefined)
                }
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All categories</option>
                {conceptCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Doc Provider */}
            <div>
              <label className="text-sm font-medium mb-1 block">Doc Provider</label>
              <select
                value={filters.docProvider || ''}
                onChange={(e) =>
                  handleFilterChange('docProvider', e.target.value || undefined)
                }
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All providers</option>
                {docProviders.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>

            {/* Confidence */}
            <div>
              <label className="text-sm font-medium mb-1 block">Confidence</label>
              <select
                value={filters.confidence || 'all'}
                onChange={(e) =>
                  handleFilterChange('confidence', e.target.value as any)
                }
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All confidence levels</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Org vs Personal */}
            <div>
              <label className="text-sm font-medium mb-1 block">Source</label>
              <select
                value={filters.orgVsPersonal || 'all'}
                onChange={(e) =>
                  handleFilterChange('orgVsPersonal', e.target.value as any)
                }
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All sources</option>
                <option value="personal">Personal</option>
                <option value="org">Organization</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
