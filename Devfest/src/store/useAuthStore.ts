import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface GoogleUser {
  id: string
  name: string
  email: string
  picture: string
  sub: string
}

interface AuthState {
  user: GoogleUser | null
  isAuthenticated: boolean
  accountType: 'personal' | 'enterprise' | null
  token: string | null
  hasEnterpriseAccess: boolean
  login: (user: GoogleUser, token: string, accountType: 'personal' | 'enterprise', hasEnterpriseAccess: boolean) => void
  logout: () => void
  setAccountType: (type: 'personal' | 'enterprise') => void
  setUser: (user: GoogleUser) => void
  setHasEnterpriseAccess: (hasAccess: boolean) => void
}

export const useAuthStore = create<AuthState>()(
    persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      accountType: null,
      token: null,
      hasEnterpriseAccess: false,
      login: (user, token, accountType, hasEnterpriseAccess) => {
        localStorage.setItem('auth_token', token)
        set({ user, token, isAuthenticated: true, accountType, hasEnterpriseAccess })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ user: null, token: null, isAuthenticated: false, accountType: null, hasEnterpriseAccess: false })
      },
      setAccountType: (type) => set({ accountType: type }),
      setUser: (user) => set({ user }),
      setHasEnterpriseAccess: (hasAccess) => set({ hasEnterpriseAccess: hasAccess }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accountType: state.accountType,
        token: state.token,
        hasEnterpriseAccess: state.hasEnterpriseAccess,
      }),
    }
  )
)
