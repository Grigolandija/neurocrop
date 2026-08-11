import { useAuth } from '@clerk/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import LoginScreen from './components/LoginScreen'
import ClerkLoginScreen from './components/ClerkLoginScreen'
import WorkspaceLoading from './components/WorkspaceLoading'
import SessionLoading from './components/SessionLoading'
import type { DashboardUser } from './components/DashboardShell'
import { neurocropApi } from './services/api/neurocropApi'
import { canAccessWorkspaceRoute, useWorkspaceAccess, WorkspaceAccessProvider, workspaceStageRedirect } from './state/workspaceAccess'
import { useInterfaceLanguage } from './i18n'
import { FieldComingSoonScreen, ProductEntryScreen } from './features/auth/ProductEntryScreen'
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
const clerkConfigured = Boolean(String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim())

function AuthenticatedMainRoute({ clerkUserId, onClerkSignOut }: { clerkUserId?: string; onClerkSignOut?: () => Promise<void> }) {
  const location = useLocation()
  const { t } = useInterfaceLanguage()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [authError, setAuthError] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
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
        if (active && current?.email) setUser(current)
      })
      .catch((reason) => {
        if (active && clerkUserId) {
          setAuthError(reason instanceof Error ? reason.message : 'This account could not be connected to NeuroCrop.')
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
  }, [clerkUserId])

  if (!authChecked) return <SessionLoading />

  if (authError) {
    const approvalPending = authError === 'Your workspace request is awaiting administrator approval.'
    const approvalRejected = authError === 'Your workspace request was not approved.'
    return (
      <main className="login-screen">
        <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-8 text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-3xl text-xl ${approvalPending ? 'bg-[#e5f1ea] text-pine' : 'bg-[#f9e3df] text-ember'}`}><i className={`fa-solid ${approvalPending ? 'fa-clock' : 'fa-triangle-exclamation'}`} /></div>
          <h1 className="mt-6 font-display text-3xl font-bold text-ink">{t(approvalPending ? 'Workspace request pending' : approvalRejected ? 'Workspace request declined' : 'Account connection required')}</h1>
          <p className="mt-3 text-sm leading-6 text-ink/60">{t(authError)}</p>
          {approvalPending || approvalRejected ? null : <p className="mt-2 text-sm leading-6 text-ink/60">{t('Use the same verified email address as your existing NeuroCrop account.')}</p>}
          <button className="login-submit mt-7 max-w-xs" type="button" onClick={() => void onClerkSignOut?.()}>{t('Sign out')}</button>
        </section>
      </main>
    )
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
  const { isLoaded, isSignedIn, userId, signOut } = useAuth()
  if (!isLoaded) return <SessionLoading />
  if (!isSignedIn || !userId) return <ClerkLoginScreen />
  return <AuthenticatedMainRoute key={userId} clerkUserId={userId} onClerkSignOut={() => signOut()} />
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-up" element={<RegistrationRoute />} />
        <Route path="/register" element={<RegistrationRoute />} />
        <Route path="/accept-invite" element={<Suspense fallback={null}><AcceptInvitePage clerkEnabled={clerkConfigured} /></Suspense>} />
        <Route path="/forgot-password" element={clerkConfigured ? <ClerkLoginScreen mode="recovery" /> : <Suspense fallback={null}><ForgotPasswordPage /></Suspense>} />
        <Route path="/reset-password" element={clerkConfigured ? <Navigate to="/" replace /> : <Suspense fallback={null}><ResetPasswordPage /></Suspense>} />
        <Route path="/greenhouse-map-test" element={<Suspense fallback={null}><GreenhouseMapTestPage /></Suspense>} />
        <Route path="*" element={<MainRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
