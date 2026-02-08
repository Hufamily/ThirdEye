import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GoogleLogin } from '@react-oauth/google'
import { X, User, Building2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useNavigate } from 'react-router-dom'
import { login as apiLogin } from '../../utils/api'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  initialAccountType?: 'personal' | 'enterprise'
}

export function LoginModal({ isOpen, onClose, initialAccountType }: LoginModalProps) {
  const [selectedAccountType, setSelectedAccountType] = useState<'personal' | 'enterprise' | null>(
    initialAccountType || null
  )
  const [showAccountSelection, setShowAccountSelection] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login, setAccountType } = useAuthStore()
  const navigate = useNavigate()

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) {
      console.error('No credential received')
      setError('No credential received from Google')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // If account type was pre-selected, use it; otherwise show selection first
      if (!selectedAccountType) {
        setShowAccountSelection(true)
        setIsLoading(false)
        return
      }

      // Call backend API to authenticate
      const response = await apiLogin(credentialResponse.credential, selectedAccountType)

      // Store the token and user info from backend response
      const user = {
        id: response.user.id || response.user.sub || '',
        name: response.user.name || '',
        email: response.user.email || '',
        picture: response.user.picture || '',
        sub: response.user.sub || response.user.id || '',
      }

      login(user, response.token, response.accountType, response.hasEnterpriseAccess)

      // Navigate to the selected account type
      handleComplete(response.accountType)
    } catch (error) {
      console.error('Error during login:', error)
      setError(error instanceof Error ? error.message : 'Failed to authenticate. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccountTypeSelect = async (accountType: 'personal' | 'enterprise') => {
    setSelectedAccountType(accountType)
    setIsLoading(true)
    setError(null)

    try {
      // Get the credential from storage (we need to store it temporarily)
      // For now, we'll need to trigger login again with the selected account type
      // This is a limitation - we'd need to store the credential temporarily
      // For a better UX, we could show account selection BEFORE Google login
      // But for now, let's handle it this way:
      const storedCredential = sessionStorage.getItem('pending_google_credential')
      if (storedCredential) {
        const response = await apiLogin(storedCredential, accountType)
        const user = {
          id: response.user.id || response.user.sub || '',
          name: response.user.name || '',
          email: response.user.email || '',
          picture: response.user.picture || '',
          sub: response.user.sub || response.user.id || '',
        }
        login(user, response.token, response.accountType, response.hasEnterpriseAccess)
        sessionStorage.removeItem('pending_google_credential')
        handleComplete(response.accountType)
      } else {
        setError('Please sign in with Google again')
        setShowAccountSelection(false)
      }
    } catch (error) {
      console.error('Error during login:', error)
      setError(error instanceof Error ? error.message : 'Failed to authenticate. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleError = () => {
    console.error('Google login failed')
    setError('Google authentication failed. Please try again.')
  }

  const handleComplete = (accountType: 'personal' | 'enterprise') => {
    setAccountType(accountType)
    onClose()
    
    // Navigate to the selected account type
    if (accountType === 'personal') {
      navigate('/personal')
    } else {
      navigate('/enterprise')
    }
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal - Centered vertically and horizontally */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-background border border-border rounded-2xl shadow-2xl max-w-md w-full p-8"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {!showAccountSelection ? (
            // Login step
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Welcome to Third Eye</h2>
                <p className="text-muted-foreground">
                  Sign in with your Google account to continue
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                {error && (
                  <div className="text-sm text-red-500 bg-red-500/10 px-4 py-2 rounded-lg">
                    {error}
                  </div>
                )}
                {isLoading ? (
                  <div className="text-sm text-muted-foreground">Authenticating...</div>
                ) : (
                  <GoogleLogin
                    onSuccess={(response) => {
                      // Store credential temporarily if account type not selected
                      if (!selectedAccountType) {
                        sessionStorage.setItem('pending_google_credential', response.credential)
                        setShowAccountSelection(true)
                      } else {
                        handleGoogleSuccess(response)
                      }
                    }}
                    onError={handleGoogleError}
                    useOneTap={false}
                    theme="filled_black"
                    size="large"
                    text="signin_with"
                    shape="rectangular"
                  />
                )}
              </div>
            </div>
          ) : (
            // Account type selection step
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Choose Your Account Type</h2>
                <p className="text-muted-foreground">
                  Select how you'd like to use Third Eye
                </p>
              </div>
              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 px-4 py-2 rounded-lg">
                  {error}
                </div>
              )}
              {isLoading && (
                <div className="text-sm text-muted-foreground text-center">Setting up your account...</div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAccountTypeSelect('personal')}
                  disabled={isLoading}
                  className="p-6 border-2 border-border rounded-xl hover:border-primary transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">Personal Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Your personal learning OS with session timeline, notes, and notebook entries
                      </p>
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAccountTypeSelect('enterprise')}
                  disabled={isLoading}
                  className="p-6 border-2 border-border rounded-xl hover:border-primary transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">Enterprise Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Clarity Analytics for organizations with team insights and documentation analysis
                      </p>
                    </div>
                  </div>
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
