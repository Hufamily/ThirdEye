import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import './index.css'

// Development mode logging
if (import.meta.env.DEV) {
  console.log('🚀 React app initializing...')
  console.log('📍 Root element:', document.getElementById('root'))
}

// Ensure we have a root element
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found. Make sure there is a <div id="root"></div> in your HTML.')
}

// Note: Don't clear rootElement.innerHTML here - React will handle it
// Clearing it manually can cause refresh loops with HMR

// Create React root
const root = ReactDOM.createRoot(rootElement)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Get Google Client ID from environment
const fallbackGoogleClientId = '331266334090-nahb5m02sqd86tlh3fq1jjjur9msdk83.apps.googleusercontent.com'
const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || fallbackGoogleClientId).trim()
if (!googleClientId) {
  throw new Error(
    'Missing VITE_GOOGLE_CLIENT_ID. Add it to root .env and restart the Vite dev server.'
  )
}
if (import.meta.env.DEV && !import.meta.env.VITE_GOOGLE_CLIENT_ID) {
  console.warn('VITE_GOOGLE_CLIENT_ID missing; using fallback Google client ID.')
}

// Render the app - Vite's Fast Refresh handles HMR automatically
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={googleClientId}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

if (import.meta.env.DEV) {
  console.log('✅ React app rendered successfully')
}
