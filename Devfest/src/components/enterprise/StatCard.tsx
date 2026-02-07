import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCardProps {
  title: string
  value: string
  change: string
  trend: 'up' | 'down'
  icon: LucideIcon
}

export function StatCard({ title, value, change, trend, icon: Icon }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-primary/20 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
          {trend === 'up' ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span>{change}</span>
        </div>
      </div>
      <h3 className="text-2xl font-bold mb-1">{value}</h3>
      <p className="text-sm text-muted-foreground">{title}</p>
    </motion.div>
  )
}
