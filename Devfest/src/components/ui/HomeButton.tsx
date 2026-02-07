import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'

export function HomeButton() {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/')}
      className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors text-sm font-medium"
      aria-label="Go to home"
    >
      <Home className="w-4 h-4" />
      <span>Home</span>
    </button>
  )
}
