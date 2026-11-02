import { useAuth } from '@clerk/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, useLocation } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import LoginScreen from './components/LoginScreen'
import ClerkLoginScreen from './components/ClerkLoginScreen'
import WorkspaceLoading from './components/WorkspaceLoading'
import SessionLoading from './components/SessionLoading'
import SessionErrorScreen from './components/SessionErrorScreen'
import type { DashboardUser } from './components/DashboardShell'
import { neurocropApi } from './services/api/neurocropApi'
import { ApiError } from './services/api/client'
import { canAccessWorkspaceRoute, useWorkspaceAccess, WorkspaceAccessProvider, workspaceStageRedirect } from './state/workspaceAccess'
import { FieldComingSoonScreen, ProductEntryScreen } from './features/auth/ProductEntryScreen'
import EuFundedProjectPage from './features/auth/EuFundedProject'
import { useProductChoice } from './features/auth/productChoice'
import './App.css'
import './styles/approved-dashboard.css'
import './styles/typography-system.css'
import './styles/redesign-sidebar.css'
import './styles/neurocrop-color-system.css'
import './styles/neurocrop-typography-system.css'
import './styles/app-shell.css'
import './styles/operational-consistency.css'
import './styles/mobile-experience.css'
import './styles/monitoring-workspace.css'
import './styles/ui-controls.css'

declare global {
  interface Window {
    echarts?: unknown
    NEUROCROP_CONFIG?: { apiBaseUrl?: string; greenhouseMapBeta?: boolean }
  }
}

const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const GreenhouseMapTestPage = lazy(() => import('./features/greenhouse-map/GreenhouseMapTestPage'))
const SpatialWorkspaceDemo = lazy(() => import('./features/living-greenhouse/SpatialWorkspaceDemo'))
const EquipmentModelPreview = lazy(() => import('./features/living-greenhouse/EquipmentModelPreview'))
const SitePlanDemo = lazy(() => import('./features/living-greenhouse/SitePlanDemo'))
const clerkConfigured = Boolean(String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim())

function AuthenticatedMainRoute({ clerkUserId, onClerkSignOut }: { clerkUserId?: string; onClerkSignOut?: () => Promise<void> }) {
  const location = useLocation()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [authError, setAuthError] = useState<unknown>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authAttempt, setAuthAttempt] = useState(0)
  const { product, selectedNow, chooseProduct, clearProduct } = useProductChoice()

  function signOutCurrentUser() {
    clearProduct()
    setUser(null)
    void onClerkSignOut?.()
  }

  useEffect(() => {
    document.body.classList.add('designer-app')
    let active = true
    void neurocropApi.getCurrentUser()
      .then((response) => {
        const current = (response as { user?: DashboardUser }).user
        if (clerkUserId && !current?.email) throw new ApiError('The account response is incomplete.', 502, 'INVALID_ACCOUNT_RESPONSE')
        if (active && current?.email) setUser(current)
      })
      .catch((reason) => {
        if (active && clerkUserId) {
          setAuthError(reason || new Error('Could not verify workspace access.'))
        }
      })
      .finally(() => {
        if (active) setAuthChecked(true)
      })
    return () => {
      active = false
      document.body.classList.remove('designer-app')
      delete document.body.dataset.primaryPage
    }
  }, [clerkUserId, authAttempt])

  if (!authChecked) return <SessionLoading />

  if (authError) {
    return <SessionErrorScreen reason={authError} onSignOut={onClerkSignOut} onRetry={() => {
      setAuthError(null)
      setAuthChecked(false)
      setAuthAttempt((attempt) => attempt + 1)
    }} />
  }

  if (!user) return clerkConfigured
    ? <SessionLoading />
    : <LoginScreen onAuthenticated={(current) => { clearProduct(); setUser(current) }} />

  if (!product) return <ProductEntryScreen onSelect={chooseProduct} onSignOut={signOutCurrentUser} />
  if (product === 'field') return <FieldComingSoonScreen onBack={clearProduct} onSignOut={signOutCurrentUser} />

  return (
    <WorkspaceAccessProvider bypass={user.isPlatformAdmin === true}>
      <AuthenticatedWorkspace
        user={user}
        pathname={location.pathname}
        onSignedOut={signOutCurrentUser}
        showWorkspacePreparation={selectedNow}
      />
    </WorkspaceAccessProvider>
  )
}

function ClerkMainRoute() {
  const { isLoaded, isSignedIn, userId, sessionId, signOut } = useAuth()
  if (!isLoaded) return <SessionLoading />
  if (!isSignedIn || !userId) return <ClerkLoginScreen />
  return <AuthenticatedMainRoute key={`${userId}:${sessionId}`} clerkUserId={userId} onClerkSignOut={() => signOut()} />
}

function MainRoute() {
  return clerkConfigured ? <ClerkMainRoute /> : <AuthenticatedMainRoute />
}

function RegistrationRoute() {
  return clerkConfigured
    ? <ClerkLoginScreen mode="sign-up" />
    : <Suspense fallback={null}><RegisterPage /></Suspense>
}

function AuthenticatedWorkspace({ user, pathname, onSignedOut, showWorkspacePreparation }: { user: DashboardUser; pathname: string; onSignedOut: () => void; showWorkspacePreparation: boolean }) {
  const access = useWorkspaceAccess()
  const loading = showWorkspacePreparation ? <WorkspaceLoading /> : <SessionLoading />
  if (access.status === 'loading') return loading
  if (!canAccessWorkspaceRoute(access.stage, pathname)) return <Navigate to={workspaceStageRedirect(access.stage)} replace />
  return (
    <Suspense fallback={loading}>
      {pathname === '/area-map'
        ? <GreenhouseMapTestPage />
        : <DashboardPage user={user} onSignedOut={onSignedOut} />}
    </Suspense>
  )
}

export default function App() {
  const [router] = useState(() => createBrowserRouter(createRoutesFromElements(<>
    <Route path="/es-finansuojamas-projektas" element={<EuFundedProjectPage />} />
    <Route path="/sign-up" element={<RegistrationRoute />} />
    <Route path="/register" element={<RegistrationRoute />} />
    <Route path="/accept-invite" element={<Suspense fallback={null}><AcceptInvitePage clerkEnabled={clerkConfigured} /></Suspense>} />
    <Route path="/forgot-password" element={clerkConfigured ? <ClerkLoginScreen mode="recovery" /> : <Suspense fallback={null}><ForgotPasswordPage /></Suspense>} />
    <Route path="/reset-password" element={clerkConfigured ? <Navigate to="/" replace /> : <Suspense fallback={null}><ResetPasswordPage /></Suspense>} />
    <Route path="/greenhouse-map-test" element={<Suspense fallback={null}><GreenhouseMapTestPage /></Suspense>} />
    <Route path="/greenhouse-live/models" element={<Suspense fallback={<SessionLoading />}><EquipmentModelPreview /></Suspense>} />
    <Route path="/greenhouse-live/demo" element={<Suspense fallback={<SessionLoading />}><SpatialWorkspaceDemo /></Suspense>} />
    <Route path="/greenhouse-live/site-demo" element={<Suspense fallback={<SessionLoading />}><SitePlanDemo /></Suspense>} />
    <Route path="*" element={<MainRoute />} />
  </>)))
  return <RouterProvider router={router} />
}
