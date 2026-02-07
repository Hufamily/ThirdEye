import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()

  // If not authenticated, redirect to landing page
  // The landing page will handle showing the login modal
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
