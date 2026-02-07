import { useNavigate } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Navigation } from '../../components/ui/Navigation'
import { Building2, BarChart3 } from 'lucide-react'

const lineData = [
  { month: 'Jan', users: 400, sessions: 1200 },
  { month: 'Feb', users: 500, sessions: 1500 },
  { month: 'Mar', users: 600, sessions: 1800 },
  { month: 'Apr', users: 700, sessions: 2100 },
  { month: 'May', users: 800, sessions: 2400 },
  { month: 'Jun', users: 900, sessions: 2700 },
]

const barData = [
  { department: 'Engineering', concepts: 450, engagement: 92 },
  { department: 'Product', concepts: 320, engagement: 88 },
  { department: 'Design', concepts: 280, engagement: 85 },
  { department: 'Marketing', concepts: 190, engagement: 78 },
]

const pieData = [
  { name: 'React', value: 35 },
  { name: 'TypeScript', value: 25 },
  { name: 'State Management', value: 20 },
  { name: 'Testing', value: 12 },
  { name: 'Other', value: 8 },
]

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#6e6e6e', '#282626', '#4b5563']

export default function EnterpriseCharts() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Header */}
      <div className="sticky top-[73px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BarChart3 className="w-6 h-6" />
              <div>
                <h1 className="text-2xl font-bold">Analytics & Charts</h1>
                <p className="text-sm text-muted-foreground">
                  Visual insights into learning patterns and engagement
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

        {/* Line Chart */}
        <div className="mb-6 p-6 bg-muted/50 border border-border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Growth Trends</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={lineData}>
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
              <Legend />
              <Line
                type="monotone"
                dataKey="users"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Active Users"
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                name="Sessions"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="mb-6 p-6 bg-muted/50 border border-border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Department Performance</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="department" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--muted))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="concepts" fill="hsl(var(--primary))" name="Concepts Learned" />
              <Bar dataKey="engagement" fill="hsl(var(--accent))" name="Engagement %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="p-6 bg-muted/50 border border-border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Topic Distribution</h3>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--muted))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
