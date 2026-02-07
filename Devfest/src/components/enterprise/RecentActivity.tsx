import { motion } from 'framer-motion'
import { Clock, User } from 'lucide-react'

interface Activity {
  id: string
  user: string
  action: string
  concept: string
  timestamp: string
}

export function RecentActivity() {
  const activities: Activity[] = [
    {
      id: '1',
      user: 'John Doe',
      action: 'learned',
      concept: 'React Hooks',
      timestamp: '2 minutes ago',
    },
    {
      id: '2',
      user: 'Jane Smith',
      action: 'completed',
      concept: 'TypeScript Fundamentals',
      timestamp: '15 minutes ago',
    },
    {
      id: '3',
      user: 'Bob Johnson',
      action: 'started',
      concept: 'State Management',
      timestamp: '1 hour ago',
    },
    {
      id: '4',
      user: 'Alice Williams',
      action: 'learned',
      concept: 'Performance Optimization',
      timestamp: '2 hours ago',
    },
  ]

  return (
    <div className="p-6 bg-muted/50 border border-border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">User</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Action</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Concept</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Time</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity, index) => (
              <motion.tr
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border-b border-border hover:bg-muted/50 transition-colors"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm">{activity.user}</span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-muted-foreground">{activity.action}</span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm font-medium">{activity.concept}</span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {activity.timestamp}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
