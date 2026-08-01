import { Component, lazy, Suspense, useEffect, useRef, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import DashboardShell, { type DashboardUser } from '../components/DashboardShell'
import { getInterfaceLanguage, useInterfaceLanguage } from '../i18n'
import { invalidateRequestCache } from '../services/api/client'
import { neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { useDashboardState } from '../state/dashboardStore'

type WorkspaceModule = { default: ComponentType }
const workspaceReloadKey = 'neurocrop-stale-workspace-reload'

function workspaceReloadMarker() {
  try { return sessionStorage.getItem(workspaceReloadKey) } catch { return null }
}

function setWorkspaceReloadMarker(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(workspaceReloadKey)
    else sessionStorage.setItem(workspaceReloadKey, value)
  } catch {
    // Import recovery must still work when browser storage is unavailable.
  }
}

function recoverWorkspaceImport<T extends WorkspaceModule>(name: string, loader: () => Promise<T>) {
  return async () => {
    try {
      const module = await loader()
      if (workspaceReloadMarker() === name) setWorkspaceReloadMarker(null)
      return module
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const staleDeploymentChunk = /dynamically imported module|failed to fetch|importing a module script|chunkloaderror/i.test(message)
      if (staleDeploymentChunk && workspaceReloadMarker() !== name) {
        setWorkspaceReloadMarker(name)
        window.location.reload()
        return new Promise<T>(() => undefined)
      }
      throw error
    }
  }
}

const loadAreasWorkspace = recoverWorkspaceImport('areas', () => import('../features/areas/AreasWorkspace'))
const loadReadingsWorkspace = recoverWorkspaceImport('readings', () => import('../features/readings/ReadingsWorkspace'))
const loadSectionsWorkspace = recoverWorkspaceImport('sections', () => import('../features/sections/SectionsWorkspace'))
const loadSettingsWorkspace = recoverWorkspaceImport('settings', () => import('../features/settings/SettingsWorkspace'))
const loadOrganizationWorkspace = recoverWorkspaceImport('organization', () => import('../features/settings/OrganizationWorkspace'))
const loadAdminWorkspace = recoverWorkspaceImport('admin', () => import('../features/settings/AdminWorkspace'))
const loadAdminIntegrationsWorkspace = recoverWorkspaceImport('admin-integrations', () => import('../features/settings/AdminIntegrationsWorkspace'))
const loadOverviewWorkspace = recoverWorkspaceImport('overview', () => import('../features/overview/OverviewWorkspace'))
const loadSimulatorWorkspace = recoverWorkspaceImport('simulator', () => import('../features/simulator/SimulatorWorkspace'))
const loadActionsWorkspace = recoverWorkspaceImport('actions', () => import('../features/actions/ActionsWorkspace'))
const loadAlertsWorkspace = recoverWorkspaceImport('alerts', () => import('../features/alerts/AlertsWorkspace'))
const loadTrendsWorkspace = recoverWorkspaceImport('trends', () => import('../features/trends/TrendsWorkspace'))
const loadNodesWorkspace = recoverWorkspaceImport('nodes', () => import('../features/nodes/NodesWorkspace'))
const loadCropProfilesWorkspace = recoverWorkspaceImport('crop-profiles', () => import('../features/settings/CropProfilesWorkspace'))

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

const workspaceModuleLoaders = [
  loadAreasWorkspace,
  loadReadingsWorkspace,
  loadSectionsWorkspace,
  loadSettingsWorkspace,
  loadOrganizationWorkspace,
  loadAdminWorkspace,
  loadAdminIntegrationsWorkspace,
  loadOverviewWorkspace,
  loadSimulatorWorkspace,
  loadActionsWorkspace,
  loadAlertsWorkspace,
  loadTrendsWorkspace,
  loadNodesWorkspace,
  loadCropProfilesWorkspace,
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

class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    console.error('[workspace] render failed', error, details.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const lithuanian = getInterfaceLanguage() === 'lt'
    return <div className="workspace-load-error" role="alert">
      <i className="fa-solid fa-triangle-exclamation" />
      <strong>{lithuanian ? 'Nepavyko atidaryti puslapio' : 'This page could not be opened'}</strong>
      <span>{lithuanian ? 'Atnaujinkite puslapį, kad būtų įkelta naujausia NeuroCrop versija.' : 'Refresh once to load the latest NeuroCrop version.'}</span>
      <button type="button" onClick={() => window.location.reload()}><i className="fa-solid fa-rotate" />{lithuanian ? 'Atnaujinti' : 'Refresh'}</button>
    </div>
  }
}

function Workspaces({ pathname, includeAdmin }: { pathname: string; includeAdmin: boolean }) {
  const { language } = useInterfaceLanguage()
  const activeRoute = pathname.startsWith('/nodes/') ? '/nodes' : pathname
  const workspaces = [
    { route: '/', content: <OverviewWorkspace /> },
    { route: '/areas', content: <AreasWorkspace /> },
    { route: '/sections', content: <SectionsWorkspace /> },
    { route: '/nodes', content: <NodesWorkspace /> },
    { route: '/readings', content: <ReadingsWorkspace /> },
    { route: '/history', content: <TrendsWorkspace /> },
    { route: '/alerts', content: <AlertsWorkspace /> },
    { route: '/actions', content: <ActionsWorkspace /> },
    { route: '/crop-profiles', content: <CropProfilesWorkspace /> },
    { route: '/simulator', content: <SimulatorWorkspace /> },
    { route: '/settings', content: <SettingsWorkspace /> },
    { route: '/organization', content: <OrganizationWorkspace /> },
    ...(includeAdmin ? [
      { route: '/admin', content: <AdminWorkspace /> },
      { route: '/admin/integrations', content: <AdminIntegrationsWorkspace /> },
    ] : []),
  ]
  const workspace = workspaces.find((candidate) => candidate.route === activeRoute) || workspaces[0]

  // Modules and shared API data are preloaded after sign-in, but only the
  // visible workspace is rendered. Mounting every chart, map, observer and
  // refresh timer at once can monopolize the browser's main thread.
  return <div
    id={workspaceHostIds[workspace.route]}
    data-workspace-host
    data-workspace-route={workspace.route}
    data-interface-language={language}
  >
    <WorkspaceErrorBoundary key={workspace.route}>
      <Suspense fallback={<div data-workspace-suspense aria-busy="true" />}>
        {workspace.content}
      </Suspense>
    </WorkspaceErrorBoundary>
  </div>
}

type DashboardPageProps = {
  user: DashboardUser
  onSignedOut: () => void
}

export default function DashboardPage({ user, onSignedOut }: DashboardPageProps) {
  const location = useLocation()
  const dashboardState = useDashboardState()
  const unauthorizedVersionAtMount = useRef(dashboardState.unauthorizedVersion)

  useEffect(() => {
    // Download every route module and warm shared GET data after sign-in. Only
    // the active route is rendered, so background charts and timers cannot
    // block the UI while later navigation still uses warm caches.
    void Promise.allSettled(workspaceModuleLoaders.map((load) => load()))
    void prefetchWorkspaceData()
    return () => {
      delete document.body.dataset.primaryPage
    }
  }, [])

  useEffect(() => {
    if (dashboardState.unauthorizedVersion > unauthorizedVersionAtMount.current) queueMicrotask(onSignedOut)
  }, [dashboardState.unauthorizedVersion, onSignedOut])

  if (!isSupportedRoute(location.pathname)) return <Navigate to="/" replace />

  return (
    <DashboardShell user={user} onSignOut={async () => {
      try { await neurocropApi.logout() } finally {
        invalidateRequestCache()
        onSignedOut()
      }
    }}>
      <Workspaces pathname={location.pathname} includeAdmin={user.isPlatformAdmin === true} />
    </DashboardShell>
  )
}
