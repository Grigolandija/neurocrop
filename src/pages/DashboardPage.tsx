import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import DashboardShell, { type DashboardUser } from '../components/DashboardShell'
import WorkspaceLoading from '../components/WorkspaceLoading'
import { useInterfaceLanguage } from '../i18n'
import { invalidateRequestCache } from '../services/api/client'
import { neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { useDashboardState } from '../state/dashboardStore'
import { installEChartsEngine } from '../vendor/echartsEngine'
import '../styles/approved-dashboard.css'
import '../styles/typography-system.css'
import '../styles/redesign-sidebar.css'
import '../styles/neurocrop-color-system.css'
import '../styles/neurocrop-typography-system.css'
import '../styles/app-shell.css'
import '../styles/operational-consistency.css'
import '../styles/mobile-experience.css'

const loadAreasWorkspace = () => import('../features/areas/AreasWorkspace')
const loadReadingsWorkspace = () => import('../features/readings/ReadingsWorkspace')
const loadSectionsWorkspace = () => import('../features/sections/SectionsWorkspace')
const loadSettingsWorkspace = () => import('../features/settings/SettingsWorkspace')
const loadOrganizationWorkspace = () => import('../features/settings/OrganizationWorkspace')
const loadAdminWorkspace = () => import('../features/settings/AdminWorkspace')
const loadAdminIntegrationsWorkspace = () => import('../features/settings/AdminIntegrationsWorkspace')
const loadOverviewWorkspace = () => import('../features/overview/OverviewWorkspace')
const loadSimulatorWorkspace = () => import('../features/simulator/SimulatorWorkspace')
const loadActionsWorkspace = () => import('../features/actions/ActionsWorkspace')
const loadAlertsWorkspace = () => import('../features/alerts/AlertsWorkspace')
const loadTrendsWorkspace = () => import('../features/trends/TrendsWorkspace')
const loadNodesWorkspace = () => import('../features/nodes/NodesWorkspace')
const loadCropProfilesWorkspace = () => import('../features/settings/CropProfilesWorkspace')

const AreasWorkspace = lazy(loadAreasWorkspace)
const ReadingsWorkspace = lazy(loadReadingsWorkspace)
const SectionsWorkspace = lazy(loadSectionsWorkspace)
const SettingsWorkspace = lazy(loadSettingsWorkspace)
const OrganizationWorkspace = lazy(loadOrganizationWorkspace)
const AdminWorkspace = lazy(loadAdminWorkspace)
const AdminIntegrationsWorkspace = lazy(loadAdminIntegrationsWorkspace)
const OverviewWorkspace = lazy(loadOverviewWorkspace)
const SimulatorWorkspace = lazy(loadSimulatorWorkspace)
const ActionsWorkspace = lazy(loadActionsWorkspace)
const AlertsWorkspace = lazy(loadAlertsWorkspace)
const TrendsWorkspace = lazy(loadTrendsWorkspace)
const NodesWorkspace = lazy(loadNodesWorkspace)
const CropProfilesWorkspace = lazy(loadCropProfilesWorkspace)

const preloaders = [
  loadOverviewWorkspace, loadAreasWorkspace, loadSectionsWorkspace, loadNodesWorkspace,
  loadReadingsWorkspace, loadTrendsWorkspace, loadAlertsWorkspace, loadActionsWorkspace,
  loadCropProfilesWorkspace, loadSimulatorWorkspace, loadSettingsWorkspace,
  loadOrganizationWorkspace, loadAdminWorkspace, loadAdminIntegrationsWorkspace,
]

const supportedRoutes = new Set([
  '/', '/areas', '/sections', '/nodes', '/readings', '/alerts', '/actions',
  '/history', '/settings', '/organization', '/crop-profiles', '/admin',
  '/admin/integrations', '/simulator',
])

const workspaceHostIds: Partial<Record<string, string>> = {
  '/nodes': 'nodesManagementSection',
}

function isSupportedRoute(pathname: string) {
  const route = String(pathname || '/').split(/[?#]/, 1)[0] || '/'
  return supportedRoutes.has(route) || /^\/nodes\/[^/]+$/.test(route)
}

function Login({ onAuthenticated }: { onAuthenticated: (user: DashboardUser) => void }) {
  const { language, setLanguage, t } = useInterfaceLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await neurocropApi.login(email.trim(), password) as { user?: DashboardUser }
      invalidateRequestCache()
      const current = response.user || (await neurocropApi.getCurrentUser() as { user?: DashboardUser }).user
      if (!current?.email) throw new Error('The account response is incomplete.')
      await prefetchWorkspaceData()
      onAuthenticated(current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16"><i className="fa-solid fa-seedling" /></div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">{t('Know what your crop needs next.')}</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">{t('A single workspace for live growing conditions, section history, alerts, and sensor health.')}</p>
          <div className="relative mt-12 flex items-center gap-3 text-sm font-semibold text-white/76"><span className="h-2.5 w-2.5 rounded-full bg-[#88c69f]" />{t('Workspace access')}</div>
        </aside>
        <section className="login-form-panel" aria-labelledby="loginTitle">
          <div className="language-switch login-language-switch" role="group" aria-label={t('Language')}>
            <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
            <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">{t('Workspace access')}</p>
          <h2 id="loginTitle" className="mt-3 font-display text-3xl font-bold text-ink">{t('Sign in to NeuroCrop')}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">{t('Use the email address assigned to your farm workspace.')}</p>
          <form id="loginForm" className="mt-8 space-y-5" autoComplete="on" noValidate onSubmit={(event) => void submit(event)}>
            <label className="block"><span className="text-sm font-bold text-ink/76">{t('Email address')}</span><input id="loginEmail" className="login-field mt-2" name="username" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@farm.com" required /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">{t('Password')}</span><input id="loginPassword" className="login-field mt-2" name="password" type="password" autoComplete="current-password" maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Enter your password')} required /></label>
            {error ? <p id="loginError" className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
            <button id="loginSubmit" type="submit" className="login-submit" disabled={busy || !email.trim() || !password}>{t(busy ? 'Signing in…' : 'Sign in')} <i className="fa-solid fa-arrow-right ml-2" /></button>
          </form>
          <p className="mt-7 text-xs leading-5 text-ink/46">{t('Need access?')} <a className="font-bold text-pine underline underline-offset-4" href="/register">{t('Create account and request workspace')}</a>.</p>
        </section>
      </div>
    </main>
  )
}

function Workspaces({ pathname }: { pathname: string }) {
  const { language } = useInterfaceLanguage()
  const hostsRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const root = hostsRef.current
    if (!root) return
    let frame = 0
    const update = () => {
      const hosts = Array.from(root.querySelectorAll<HTMLElement>('[data-workspace-host]'))
      if (hosts.length !== 14 || hosts.some((host) => !host.childElementCount || host.querySelector('[aria-busy="true"]'))) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setReady(true))
    }
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['aria-busy'], childList: true, subtree: true })
    update()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])

  const visible = (route: string) => route === '/nodes'
    ? pathname === route || pathname.startsWith('/nodes/')
    : pathname === route
  const workspace = (route: string, content: ReactNode) => (
    <div id={workspaceHostIds[route]} data-workspace-host hidden={!visible(route)}>
      <Suspense fallback={<div aria-busy="true" />}>{content}</Suspense>
    </div>
  )

  return (
    <>
      {!ready ? <WorkspaceLoading /> : null}
      <div ref={hostsRef} hidden={!ready} data-interface-language={language}>
        {workspace('/', <OverviewWorkspace />)}
        {workspace('/areas', <AreasWorkspace />)}
        {workspace('/sections', <SectionsWorkspace />)}
        {workspace('/nodes', <NodesWorkspace />)}
        {workspace('/readings', <ReadingsWorkspace />)}
        {workspace('/history', <TrendsWorkspace />)}
        {workspace('/alerts', <AlertsWorkspace />)}
        {workspace('/actions', <ActionsWorkspace />)}
        {workspace('/crop-profiles', <CropProfilesWorkspace />)}
        {workspace('/simulator', <SimulatorWorkspace />)}
        {workspace('/settings', <SettingsWorkspace />)}
        {workspace('/organization', <OrganizationWorkspace />)}
        {workspace('/admin', <AdminWorkspace />)}
        {workspace('/admin/integrations', <AdminIntegrationsWorkspace />)}
      </div>
    </>
  )
}

export default function DashboardPage() {
  const location = useLocation()
  const dashboardState = useDashboardState()
  const [bootstrapped, setBootstrapped] = useState(false)
  const [user, setUser] = useState<DashboardUser | null>(null)

  useEffect(() => {
    document.body.classList.add('designer-app')
    installEChartsEngine()
    let active = true
    Promise.all(preloaders.map((load) => load()))
      .then(async () => {
        try {
          const response = await neurocropApi.getCurrentUser() as { user?: DashboardUser }
          if (response.user?.email) {
            await prefetchWorkspaceData()
            if (active) setUser(response.user)
          }
        } catch {
          if (active) setUser(null)
        }
      })
      .finally(() => { if (active) setBootstrapped(true) })
    return () => {
      active = false
      document.body.classList.remove('designer-app')
      delete document.body.dataset.primaryPage
    }
  }, [])

  useEffect(() => {
    if (dashboardState.unauthorizedVersion) queueMicrotask(() => setUser(null))
  }, [dashboardState.unauthorizedVersion])

  if (!isSupportedRoute(location.pathname)) return <Navigate to="/" replace />
  if (!bootstrapped) return <WorkspaceLoading />
  if (!user) return <Login onAuthenticated={setUser} />

  return (
    <DashboardShell user={user} onSignOut={async () => {
      try { await neurocropApi.logout() } finally {
        invalidateRequestCache()
        setUser(null)
      }
    }}>
      <Workspaces pathname={location.pathname} />
    </DashboardShell>
  )
}
