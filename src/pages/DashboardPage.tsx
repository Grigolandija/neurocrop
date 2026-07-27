import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
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
