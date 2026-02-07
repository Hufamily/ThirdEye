import { Clock, TrendingUp } from 'lucide-react'

interface TimeSavedStatsProps {
  totalHours?: number
  thisWeek?: number
  thisMonth?: number
  breakdown?: {
    category: string
    hours: number
  }[]
}

export function TimeSavedStats({
  totalHours = 0,
  thisWeek = 0,
  thisMonth = 0,
  breakdown = [],
}: TimeSavedStatsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <h3 className="text-base font-semibold">Time Saved Statistics</h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-muted/50 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground mb-1">Total</div>
          <div className="text-lg font-bold">{totalHours.toFixed(1)}h</div>
        </div>
        <div className="p-2 bg-muted/50 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground mb-1">Week</div>
          <div className="text-lg font-bold">{thisWeek.toFixed(1)}h</div>
        </div>
        <div className="p-2 bg-muted/50 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground mb-1">Month</div>
          <div className="text-lg font-bold">{thisMonth.toFixed(1)}h</div>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="p-2 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3 h-3 text-muted-foreground" />
            <h4 className="text-sm font-medium">Breakdown</h4>
          </div>
          <div className="space-y-1">
            {breakdown.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate">{item.category}</span>
                <span className="font-medium ml-2">{item.hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
