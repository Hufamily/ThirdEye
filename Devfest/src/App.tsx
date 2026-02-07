import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from './components/ui/Toaster'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { ProtectedRoute } from './components/auth/ProtectedRoute'

// Development mode logging
if (import.meta.env.DEV) {
  console.log('📦 App component loaded')
}

// Lazy load pages for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage'))
const PersonalPage = lazy(() => import('./pages/PersonalPage'))
const PersonalProfilePage = lazy(() => import('./pages/personal/PersonalProfilePage'))
const EnterpriseOverview = lazy(() => import('./pages/enterprise/EnterpriseOverview'))
const EnterpriseDocuments = lazy(() => import('./pages/enterprise/EnterpriseDocuments'))
const EnterpriseSuggestions = lazy(() => import('./pages/enterprise/EnterpriseSuggestions'))
const EnterpriseCharts = lazy(() => import('./pages/enterprise/EnterpriseCharts'))
const EnterpriseProfilePage = lazy(() => import('./pages/enterprise/EnterpriseProfilePage'))
const EnterpriseExports = lazy(() => import('./pages/enterprise/EnterpriseExports'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  )
}

function App() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🎯 App component mounted')
    }
  }, [])

  return (
    <>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/personal"
              element={
                <ProtectedRoute>
                  <PersonalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/personal/profile"
              element={
                <ProtectedRoute>
                  <PersonalProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise"
              element={
                <ProtectedRoute>
                  <EnterpriseOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise/documents"
              element={
                <ProtectedRoute>
                  <EnterpriseDocuments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise/suggestions"
              element={
                <ProtectedRoute>
                  <EnterpriseSuggestions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise/charts"
              element={
                <ProtectedRoute>
                  <EnterpriseCharts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise/profile"
              element={
                <ProtectedRoute>
                  <EnterpriseProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/enterprise/exports"
              element={
                <ProtectedRoute>
                  <EnterpriseExports />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </>
  )
}

export default App
