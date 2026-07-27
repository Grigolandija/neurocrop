import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import DashboardShell, { type DashboardUser } from '../components/DashboardShell'
import WorkspaceLoading from '../components/WorkspaceLoading'
import { useInterfaceLanguage } from '../i18n'
import { invalidateRequestCache } from '../services/api/client'
import { neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { useDashboardState } from '../state/dashboardStore'
import { installEChartsEngine } from '../vendor/echartsEngine'

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

function Workspaces({ pathname }: { pathname: string }) {
  const { language } = useInterfaceLanguage()
  const hostRef = useRef<HTMLDivElement>(null)
  const route = pathname.startsWith('/nodes/') ? '/nodes' : pathname
  const [readyRoute, setReadyRoute] = useState('')
  const ready = readyRoute === route

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const update = () => {
      if (!host.childElementCount || host.querySelector('[data-workspace-suspense]')) return
      if (route === '/' && !host.querySelector('[data-overview-heatmap-settled="true"]')) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setReadyRoute(route))
    }
    const observer = new MutationObserver(update)
    observer.observe(host, { attributes: true, childList: true, subtree: true })
    update()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [route])

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
      {!ready ? <WorkspaceLoading /> : null}
      <div
        ref={hostRef}
        id={workspaceHostIds[route]}
        hidden={!ready}
        data-workspace-host
        data-interface-language={language}
      >
        <Suspense fallback={<div data-workspace-suspense aria-busy="true" />}>
          {workspace}
        </Suspense>
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
    installEChartsEngine()
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
