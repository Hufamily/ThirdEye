import { Clock, TrendingUp, FileText } from 'lucide-react'
import { motion } from 'framer-motion'

interface TimeReclaimedProps {
  timeReclaimed: number
  totalTriggers: number
}

export function TimeReclaimed({ timeReclaimed, totalTriggers }: TimeReclaimedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-muted/50 rounded-lg border border-border h-full flex flex-col"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/20 rounded-lg">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-muted-foreground mb-2">Time Reclaimed</h3>
          <div className="text-4xl font-bold leading-tight">{timeReclaimed.toFixed(1)}h</div>
        </div>
      </div>
      <div className="text-sm text-muted-foreground mt-auto">
        {totalTriggers.toLocaleString()} triggers × 5s savings
      </div>
    </motion.div>
  )
}

interface TopDocumentsProps {
  topDocuments: Array<{
    id: string
    title: string
    frictionScore: number
    triggersPerUser: number
  }>
}

export function TopDocuments({ topDocuments }: TopDocumentsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-6 bg-muted/50 rounded-lg border border-border h-full flex flex-col"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/20 rounded-lg">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-muted-foreground">Top Documents by Friction</h3>
        </div>
      </div>
      <div className="space-y-3 flex-1">
        {topDocuments.slice(0, 3).map((doc) => (
          <div key={doc.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium truncate">{doc.title}</span>
            </div>
            <span className="text-lg font-bold ml-3">{doc.frictionScore.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
