import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GoogleLogin } from '@react-oauth/google'
import { X, User, Building2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useNavigate } from 'react-router-dom'

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
  const { login, setAccountType } = useAuthStore()
  const navigate = useNavigate()

  const handleGoogleSuccess = (credentialResponse: any) => {
    if (!credentialResponse.credential) {
      console.error('No credential received')
      return
    }

    // Decode the JWT token to get user info
    try {
      const base64Url = credentialResponse.credential.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
      const userData = JSON.parse(jsonPayload)

      const user = {
        name: userData.name || '',
        email: userData.email || '',
        picture: userData.picture || '',
        sub: userData.sub || '',
      }

      // Store the token and user info
      login(user, credentialResponse.credential)

      // If account type was pre-selected, use it; otherwise show selection
      if (selectedAccountType) {
        setAccountType(selectedAccountType)
        handleComplete(selectedAccountType)
      } else {
        setShowAccountSelection(true)
      }
    } catch (error) {
      console.error('Error decoding token:', error)
    }
  }

  const handleGoogleError = () => {
    console.error('Google login failed')
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

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="filled_black"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
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

              <div className="grid grid-cols-1 gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleComplete('personal')}
                  className="p-6 border-2 border-border rounded-xl hover:border-primary transition-colors text-left group"
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
                  onClick={() => handleComplete('enterprise')}
                  className="p-6 border-2 border-border rounded-xl hover:border-primary transition-colors text-left group"
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
