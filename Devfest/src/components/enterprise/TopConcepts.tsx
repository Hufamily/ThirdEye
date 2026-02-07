import { BookOpen } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { concept: 'React Hooks', count: 234 },
  { concept: 'TypeScript', count: 189 },
  { concept: 'State Management', count: 156 },
  { concept: 'Performance', count: 142 },
  { concept: 'Testing', count: 98 },
]

export function TopConcepts() {
  return (
    <div className="p-6 bg-muted/50 border border-border rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Top Concepts Learned</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
          <YAxis dataKey="concept" type="category" stroke="hsl(var(--muted-foreground))" width={100} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
