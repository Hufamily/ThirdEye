import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface GoogleUser {
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
  // TODO: Backend - Add hasEnterpriseAccess flag
  // This should be fetched from backend API after login to check if a personal account
  // has enterprise access. If not, enterprise section should show "NA"
  // Example: hasEnterpriseAccess: boolean
  login: (user: GoogleUser, token: string) => void
  logout: () => void
  setAccountType: (type: 'personal' | 'enterprise') => void
}

export const useAuthStore = create<AuthState>()(
    persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      accountType: null,
      token: null,
      login: (user, token) => {
        localStorage.setItem('auth_token', token)
        set({ user, token, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ user: null, token: null, isAuthenticated: false, accountType: null })
      },
      setAccountType: (type) => set({ accountType: type }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accountType: state.accountType,
        token: state.token,
      }),
    }
  )
)
