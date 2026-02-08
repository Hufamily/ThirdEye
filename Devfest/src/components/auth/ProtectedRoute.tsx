import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { getCurrentUser } from '../../utils/api'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, token, login, setHasEnterpriseAccess, setAccountType, setUser } = useAuthStore()
  const location = useLocation()
  const [isVerifying, setIsVerifying] = useState(true)
  const [isValid, setIsValid] = useState(false)

  useEffect(() => {
    const verifyAuth = async () => {
      // If no token, not authenticated
      if (!token) {
        setIsValid(false)
        setIsVerifying(false)
        return
      }

      try {
        // Verify token with backend
        const response = await getCurrentUser()
        
        // Update store with fresh user data
        setUser({
          id: response.user.id || response.user.sub || '',
          name: response.user.name || '',
          email: response.user.email || '',
          picture: response.user.picture || '',
          sub: response.user.sub || response.user.id || '',
        })
        setAccountType(response.accountType)
        setHasEnterpriseAccess(response.hasEnterpriseAccess)
        
        // Update token if backend returned a new one
        if (response.token && response.token !== token) {
          localStorage.setItem('auth_token', response.token)
        }
        
        setIsValid(true)
      } catch (error) {
        console.error('Token verification failed:', error)
        // Token is invalid, clear it
        localStorage.removeItem('auth_token')
        setIsValid(false)
      } finally {
        setIsVerifying(false)
      }
    }

    verifyAuth()
  }, [token, login, setHasEnterpriseAccess, setAccountType, setUser])

  // Show loading while verifying
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // If not authenticated or token invalid, redirect to landing page
  if (!isAuthenticated || !isValid) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
