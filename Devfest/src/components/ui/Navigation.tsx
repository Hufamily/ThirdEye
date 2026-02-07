import { useNavigate, useLocation } from 'react-router-dom'
import { Home, User, Building2, Download, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { LoginModal } from '../auth/LoginModal'
import logoImage from '../../assets/logo.png'

export function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user, accountType, logout } = useAuthStore()
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginAccountType, setLoginAccountType] = useState<'personal' | 'enterprise' | undefined>()

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handlePersonalLogin = () => {
    setLoginAccountType('personal')
    setLoginModalOpen(true)
  }

  const handleEnterpriseLogin = () => {
    setLoginAccountType('enterprise')
    setLoginModalOpen(true)
  }

  // TODO: Backend logic - Check if user has enterprise access
  // If accountType is 'personal' and user doesn't have enterprise access,
  // the enterprise section should show "NA" or be disabled
  // This requires backend API call to check user's enterprise permissions
  const hasEnterpriseAccess = accountType === 'enterprise' // Placeholder - replace with backend check

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/personal', label: 'Personal', icon: User },
    { 
      path: '/enterprise', 
      label: 'Enterprise', 
      icon: Building2,
      disabled: isAuthenticated && accountType === 'personal' && !hasEnterpriseAccess,
    },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src={logoImage} alt="Third Eye Logo" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold">Third Eye</span>
          </button>
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              const isDisabled = item.disabled
              
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    if (isDisabled) return
                    if (!isAuthenticated && item.path === '/personal') {
                      handlePersonalLogin()
                    } else if (!isAuthenticated && item.path === '/enterprise') {
                      handleEnterpriseLogin()
                    } else {
                      navigate(item.path)
                    }
                  }}
                  disabled={isDisabled}
                  className={`
                    relative px-4 py-2 text-sm font-medium transition-colors
                    flex items-center gap-2 rounded-lg
                    ${
                      isDisabled
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : active
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }
                  `}
                  title={isDisabled ? 'NA - Enterprise access required' : undefined}
                >
                  {active && !isDisabled && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-primary/10 rounded-lg"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">
                    {item.label}
                    {isDisabled && ' (NA)'}
                  </span>
                </button>
              )
            })}
            {isAuthenticated && user && (
              <div className="ml-4 flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg">
                {user.picture && (
                  <img
                    src={user.picture}
                    alt={user.name || 'User'}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-medium">{user.name}</span>
                  {accountType && (
                    <span className="text-xs text-muted-foreground capitalize">
                      {accountType}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
            {!isAuthenticated && (
              <button
                onClick={() => {
                  // Extension download logic - could open Chrome Web Store or download page
                  window.open('https://chrome.google.com/webstore', '_blank')
                }}
                className="ml-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Extension</span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        initialAccountType={loginAccountType}
      />
    </nav>
  )
}
