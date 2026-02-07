import { TrendingUp, Clock, AlertCircle } from 'lucide-react'

interface OrgMetricsProps {
  confusionDensity?: number
  totalTimeSaved?: number
  activeUsers?: number
  documentsProcessed?: number
}

export function OrgMetrics({
  confusionDensity = 0,
  totalTimeSaved = 0,
  activeUsers = 0,
  documentsProcessed = 0,
}: OrgMetricsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Organization Metrics</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Confusion Density</div>
          </div>
          <div className="text-2xl font-bold">{confusionDensity.toFixed(1)}%</div>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Total Time Saved</div>
          </div>
          <div className="text-2xl font-bold">{totalTimeSaved.toFixed(1)}h</div>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="text-sm text-muted-foreground mb-2">Active Users</div>
          <div className="text-2xl font-bold">{activeUsers}</div>
        </div>
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="text-sm text-muted-foreground mb-2">Documents Processed</div>
          <div className="text-2xl font-bold">{documentsProcessed}</div>
        </div>
      </div>
    </div>
  )
}
