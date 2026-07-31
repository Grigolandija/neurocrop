import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import DashboardShell, { type DashboardUser } from '../components/DashboardShell'
import WorkspaceLoading from '../components/WorkspaceLoading'
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

function Workspaces({ pathname }: { pathname: string }) {
  const { language } = useInterfaceLanguage()
  const hostRef = useRef<HTMLDivElement>(null)
  const route = pathname.startsWith('/nodes/') ? '/nodes' : pathname
  const [initialWorkspaceReady, setInitialWorkspaceReady] = useState(false)

  useEffect(() => {
    if (initialWorkspaceReady) return
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const update = () => {
      if (!host.childElementCount || host.querySelector('[data-workspace-suspense]')) return
      if (route === '/' && !host.querySelector('[data-overview-heatmap-settled="true"]')) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        observer.disconnect()
        setInitialWorkspaceReady(true)
      })
    }
    const observer = new MutationObserver(update)
    observer.observe(host, { attributes: true, childList: true, subtree: true })
    update()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [initialWorkspaceReady, route])

  const workspace = (() => {
    switch (route) {
      case '/': return <OverviewWorkspace />
      case '/areas': return <AreasWorkspace />
      case '/sections': return <SectionsWorkspace />
      case '/nodes': return <NodesWorkspace />
      case '/readings': return <ReadingsWorkspace />
      case '/history': return <TrendsWorkspace />
      case '/alerts': return <AlertsWorkspace />
      case '/actions': return <ActionsWorkspace />
      case '/crop-profiles': return <CropProfilesWorkspace />
      case '/simulator': return <SimulatorWorkspace />
      case '/settings': return <SettingsWorkspace />
      case '/organization': return <OrganizationWorkspace />
      case '/admin': return <AdminWorkspace />
      case '/admin/integrations': return <AdminIntegrationsWorkspace />
      default: return null
    }
  })()

  return (
    <>
      {!initialWorkspaceReady ? <WorkspaceLoading /> : null}
      <div
        ref={hostRef}
        id={workspaceHostIds[route]}
        hidden={!initialWorkspaceReady}
        data-workspace-host
        data-interface-language={language}
      >
        <WorkspaceErrorBoundary key={route}>
          <Suspense fallback={<div data-workspace-suspense aria-busy="true" />}>
            {workspace}
          </Suspense>
        </WorkspaceErrorBoundary>
      </div>
    </>
  )
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
    // Once authentication succeeds, warm every workspace and its shared GET
    // data immediately. The active route can render in parallel, while later
    // navigation is served from the module and request caches.
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
      <Workspaces pathname={location.pathname} />
    </DashboardShell>
  )
}
