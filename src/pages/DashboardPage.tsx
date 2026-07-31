import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import DashboardShell, { type DashboardUser } from '../components/DashboardShell'
import WorkspaceLoading from '../components/WorkspaceLoading'
import { getInterfaceLanguage, useInterfaceLanguage } from '../i18n'
import { invalidateRequestCache } from '../services/api/client'
import { neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { useDashboardState } from '../state/dashboardStore'
import ActionsWorkspace from '../features/actions/ActionsWorkspace'
import AlertsWorkspace from '../features/alerts/AlertsWorkspace'
import AreasWorkspace from '../features/areas/AreasWorkspace'
import NodesWorkspace from '../features/nodes/NodesWorkspace'
import OverviewWorkspace from '../features/overview/OverviewWorkspace'
import ReadingsWorkspace from '../features/readings/ReadingsWorkspace'
import SectionsWorkspace from '../features/sections/SectionsWorkspace'
import SettingsWorkspace from '../features/settings/SettingsWorkspace'
import OrganizationWorkspace from '../features/settings/OrganizationWorkspace'
import AdminWorkspace from '../features/settings/AdminWorkspace'
import AdminIntegrationsWorkspace from '../features/settings/AdminIntegrationsWorkspace'
import CropProfilesWorkspace from '../features/settings/CropProfilesWorkspace'
import SimulatorWorkspace from '../features/simulator/SimulatorWorkspace'
import TrendsWorkspace from '../features/trends/TrendsWorkspace'

let workspaceDataReady = false
let workspaceDataPromise: Promise<void> | null = null

function prepareWorkspaceData() {
  if (workspaceDataReady) return Promise.resolve()
  if (!workspaceDataPromise) {
    workspaceDataPromise = prefetchWorkspaceData().then(() => {
      workspaceDataReady = true
    })
  }
  return workspaceDataPromise
}

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
  const hostRef = useRef<HTMLDivElement>(null)
  const [allWorkspacesReady, setAllWorkspacesReady] = useState(false)
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

  useEffect(() => {
    if (allWorkspacesReady) return
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const update = () => {
      if (host.querySelectorAll('[data-workspace-route]').length !== workspaces.length) return
      if (host.querySelector('[aria-busy="true"]')) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setAllWorkspacesReady(true))
    }
    const observer = new MutationObserver(update)
    observer.observe(host, { attributes: true, childList: true, subtree: true, attributeFilter: ['aria-busy'] })
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [allWorkspacesReady, includeAdmin, workspaces.length])

  return <>
    {!allWorkspacesReady ? <WorkspaceLoading /> : null}
    <div ref={hostRef} hidden={!allWorkspacesReady} data-all-workspaces-mounted>
      {workspaces.map((workspace) => <div
        id={workspaceHostIds[workspace.route]}
        key={workspace.route}
        hidden={workspace.route !== activeRoute}
        data-workspace-host
        data-workspace-route={workspace.route}
        data-interface-language={language}
      >
        <WorkspaceErrorBoundary>{workspace.content}</WorkspaceErrorBoundary>
      </div>)}
    </div>
  </>
}

type DashboardPageProps = {
  user: DashboardUser
  onSignedOut: () => void
}

export default function DashboardPage({ user, onSignedOut }: DashboardPageProps) {
  const location = useLocation()
  const dashboardState = useDashboardState()
  const unauthorizedVersionAtMount = useRef(dashboardState.unauthorizedVersion)
  const [prepared, setPrepared] = useState(workspaceDataReady)

  useEffect(() => {
    let active = true
    void prepareWorkspaceData().finally(() => {
      if (active) setPrepared(true)
    })
    return () => {
      active = false
      delete document.body.dataset.primaryPage
    }
  }, [])

  useEffect(() => {
    if (dashboardState.unauthorizedVersion > unauthorizedVersionAtMount.current) queueMicrotask(onSignedOut)
  }, [dashboardState.unauthorizedVersion, onSignedOut])

  if (!isSupportedRoute(location.pathname)) return <Navigate to="/" replace />
  if (!prepared) return <WorkspaceLoading />

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
