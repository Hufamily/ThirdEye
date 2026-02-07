import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock } from 'lucide-react'

const data = [
  { month: 'Jan', hours: 120 },
  { month: 'Feb', hours: 180 },
  { month: 'Mar', hours: 210 },
  { month: 'Apr', hours: 250 },
  { month: 'May', hours: 280 },
  { month: 'Jun', hours: 320 },
]

export function TimeSavedChart() {
  return (
    <div className="p-6 bg-muted/50 border border-border rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Time Saved (Hours)</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Line
            type="monotone"
            dataKey="hours"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
