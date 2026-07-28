import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import LoginScreen from './components/LoginScreen'
import WorkspaceLoading from './components/WorkspaceLoading'
import type { DashboardUser } from './components/DashboardShell'
import { neurocropApi } from './services/api/neurocropApi'
import { canAccessWorkspaceRoute, useWorkspaceAccess, WorkspaceAccessProvider, workspaceStageRedirect } from './state/workspaceAccess'
import './App.css'
import './styles/approved-dashboard.css'
import './styles/typography-system.css'
import './styles/redesign-sidebar.css'
import './styles/neurocrop-color-system.css'
import './styles/neurocrop-typography-system.css'
import './styles/app-shell.css'
import './styles/operational-consistency.css'
import './styles/mobile-experience.css'

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

function MainRoute() {
  const location = useLocation()
  const [user, setUser] = useState<DashboardUser | null>(null)

  useEffect(() => {
    document.body.classList.add('designer-app')
    let active = true
    void neurocropApi.getCurrentUser()
      .then((response) => {
        const current = (response as { user?: DashboardUser }).user
        if (active && current?.email) setUser(current)
      })
      .catch(() => undefined)
    return () => {
      active = false
      document.body.classList.remove('designer-app')
      delete document.body.dataset.primaryPage
    }
  }, [])

  if (!user) return <LoginScreen onAuthenticated={setUser} />

  return (
    <WorkspaceAccessProvider bypass={user.isPlatformAdmin === true}>
      <AuthenticatedWorkspace user={user} pathname={location.pathname} onSignedOut={() => setUser(null)} />
    </WorkspaceAccessProvider>
  )
}

function AuthenticatedWorkspace({ user, pathname, onSignedOut }: { user: DashboardUser; pathname: string; onSignedOut: () => void }) {
  const access = useWorkspaceAccess()
  if (access.status === 'loading') return <WorkspaceLoading />
  if (!canAccessWorkspaceRoute(access.stage, pathname)) return <Navigate to={workspaceStageRedirect(access.stage)} replace />
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      {pathname === '/area-map'
        ? <GreenhouseMapTestPage />
        : <DashboardPage user={user} onSignedOut={onSignedOut} />}
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Suspense fallback={null}><RegisterPage /></Suspense>} />
        <Route path="/accept-invite" element={<Suspense fallback={null}><AcceptInvitePage /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPasswordPage /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={null}><ResetPasswordPage /></Suspense>} />
        <Route path="/greenhouse-map-test" element={<Suspense fallback={null}><GreenhouseMapTestPage /></Suspense>} />
        <Route path="*" element={<MainRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
