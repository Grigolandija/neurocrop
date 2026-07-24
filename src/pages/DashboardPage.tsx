import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import AreasWorkspace from '../features/areas/AreasWorkspace'
import ReadingsWorkspace from '../features/readings/ReadingsWorkspace'
import SectionsWorkspace from '../features/sections/SectionsWorkspace'
import SettingsWorkspace from '../features/settings/SettingsWorkspace'
import OrganizationWorkspace from '../features/settings/OrganizationWorkspace'
import AdminWorkspace from '../features/settings/AdminWorkspace'
import AdminIntegrationsWorkspace from '../features/settings/AdminIntegrationsWorkspace'
import OverviewWorkspace from '../features/overview/OverviewWorkspace'
import { installNeuroCropApi, neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'

declare const __BUILD_VERSION__: string

let chartEnginePromise: Promise<void> | null = null

function routeNeedsCharts(pathname: string) {
  return pathname === '/history' || pathname === '/readings'
}

function ensureChartEngine() {
  if (window.echarts) return Promise.resolve()
  if (chartEnginePromise) return chartEnginePromise
  chartEnginePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-neurocrop-vendor]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Chart engine could not be loaded.')), { once: true })
      return
    }
    const vendor = document.createElement('script')
    vendor.src = '/vendor/echarts.min.js'
    vendor.dataset.neurocropVendor = 'true'
    vendor.onload = () => resolve()
    vendor.onerror = () => reject(new Error('Chart engine could not be loaded.'))
    document.body.appendChild(vendor)
  })
  return chartEnginePromise
}

function notifyRuntimeRoute(pathname: string) {
  window.postMessage({ type: 'neurocrop:route', route: pathname }, window.location.origin)
  if (pathname !== '/history') return
  const pendingTrend = sessionStorage.getItem('neurocrop-pending-trend')
  if (!pendingTrend) return
  sessionStorage.removeItem('neurocrop-pending-trend')
  window.requestAnimationFrame(() => {
    try {
      window.postMessage({
        type: 'neurocrop:open-trend',
        ...JSON.parse(pendingTrend),
      }, window.location.origin)
    } catch {
      // Ignore an invalid local navigation payload and keep the default trend context.
    }
  })
}

const supportedRoutes = new Set([
  '/', '/areas', '/sections', '/nodes', '/readings', '/alerts',
  '/history', '/settings', '/organization', '/crop-profiles', '/admin',
  '/admin/integrations',
])

function isSupportedRoute(pathname: string) {
  return supportedRoutes.has(pathname) || /^\/nodes\/[^/]+$/.test(pathname)
}

function ApprovedDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeReady = useRef(false)
  const [readingsMount, setReadingsMount] = useState<HTMLElement | null>(null)
  const [areasMount, setAreasMount] = useState<HTMLElement | null>(null)
  const [overviewMount, setOverviewMount] = useState<HTMLElement | null>(null)
  const [sectionsMount, setSectionsMount] = useState<HTMLElement | null>(null)
  const [settingsMount, setSettingsMount] = useState<HTMLElement | null>(null)
  const [organizationMount, setOrganizationMount] = useState<HTMLElement | null>(null)
  const [adminMount, setAdminMount] = useState<HTMLElement | null>(null)
  const [adminIntegrationsMount, setAdminIntegrationsMount] = useState<HTMLElement | null>(null)

  useEffect(() => {
    installNeuroCropApi()
    installNeuroCropFeatures()
    if (hostRef.current && !hostRef.current.childElementCount) {
      hostRef.current.innerHTML = approvedMarkup
    }
    setReadingsMount(hostRef.current?.querySelector<HTMLElement>('#readingsWorkspaceMount') || null)
    setAreasMount(hostRef.current?.querySelector<HTMLElement>('#areasWorkspaceMount') || null)
    setOverviewMount(hostRef.current?.querySelector<HTMLElement>('#overviewWorkspaceMount') || null)
    setSectionsMount(hostRef.current?.querySelector<HTMLElement>('#sectionsWorkspaceMount') || null)
    setSettingsMount(hostRef.current?.querySelector<HTMLElement>('#settingsWorkspaceMount') || null)
    setOrganizationMount(hostRef.current?.querySelector<HTMLElement>('#organizationWorkspaceMount') || null)
    setAdminMount(hostRef.current?.querySelector<HTMLElement>('#adminWorkspaceMount') || null)
    setAdminIntegrationsMount(hostRef.current?.querySelector<HTMLElement>('#adminIntegrationsMount') || null)

    document.body.classList.add('designer-app')
    document.body.dataset.dashboardState = 'optimal'
    document.body.dataset.workspaceFocus = 'all'

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== 'neurocrop:navigate') return
      const route = isSupportedRoute(payload.route) ? payload.route : '/'
      if (route !== window.location.pathname) navigate(route, { replace: Boolean(payload.replace) })
    }

    function attachRuntime() {
      if (document.querySelector('script[data-neurocrop-runtime]')) return
      const runtime = document.createElement('script')
      runtime.src = `/approved-dashboard-runtime.js?v=${__BUILD_VERSION__}`
      runtime.dataset.neurocropRuntime = 'true'
      runtime.onload = () => {
        runtimeReady.current = true
        const notifyRoute = () => notifyRuntimeRoute(window.location.pathname)
        if (routeNeedsCharts(window.location.pathname)) {
          ensureChartEngine().then(notifyRoute).catch(notifyRoute)
        } else {
          notifyRoute()
        }
      }
      document.body.appendChild(runtime)
    }

    function loadRuntime() {
      if (window.NeuroCropStateEngine) {
        attachRuntime()
        return
      }
      const stateEngine = document.createElement('script')
      stateEngine.src = `/neurocrop-state-engine.js?v=${__BUILD_VERSION__}`
      stateEngine.dataset.neurocropStateEngine = 'true'
      stateEngine.onload = attachRuntime
      document.body.appendChild(stateEngine)
    }

    window.addEventListener('message', handleMessage)
    loadRuntime()
    const warmupTimer = window.setTimeout(() => {
      void neurocropApi.getCurrentUser()
        .then((response) => {
          const user = (response as { user?: { email?: unknown } } | null)?.user
          if (user?.email) return prefetchWorkspaceData()
        })
        .catch(() => undefined)
      void ensureChartEngine().catch(() => undefined)
    }, 250)

    return () => {
      window.clearTimeout(warmupTimer)
      window.removeEventListener('message', handleMessage)
      document.body.classList.remove('designer-app')
      setReadingsMount(null)
      setAreasMount(null)
      setOverviewMount(null)
      setSectionsMount(null)
      setSettingsMount(null)
      setOrganizationMount(null)
      setAdminMount(null)
      setAdminIntegrationsMount(null)
    }
  }, [navigate])

  useEffect(() => {
    if (!runtimeReady.current) return
    const notifyRoute = () => notifyRuntimeRoute(location.pathname)
    if (routeNeedsCharts(location.pathname)) {
      ensureChartEngine().then(notifyRoute).catch(notifyRoute)
    } else {
      notifyRoute()
    }
  }, [location.pathname])

  return <>
    <div ref={hostRef} />
    {location.pathname === '/' && overviewMount
      ? createPortal(<OverviewWorkspace />, overviewMount)
      : null}
    {location.pathname === '/readings' && readingsMount
      ? createPortal(<ReadingsWorkspace />, readingsMount)
      : null}
    {location.pathname === '/areas' && areasMount
      ? createPortal(<AreasWorkspace />, areasMount)
      : null}
    {location.pathname === '/sections' && sectionsMount
      ? createPortal(<SectionsWorkspace />, sectionsMount)
      : null}
    {location.pathname === '/settings' && settingsMount
      ? createPortal(<SettingsWorkspace />, settingsMount)
      : null}
    {location.pathname === '/organization' && organizationMount
      ? createPortal(<OrganizationWorkspace />, organizationMount)
      : null}
    {location.pathname === '/admin' && adminMount
      ? createPortal(<AdminWorkspace />, adminMount)
      : null}
    {location.pathname === '/admin/integrations' && adminIntegrationsMount
      ? createPortal(<AdminIntegrationsWorkspace />, adminIntegrationsMount)
      : null}
  </>
}

export default function DashboardPage() {
  const location = useLocation()
  return isSupportedRoute(location.pathname) ? <ApprovedDashboard /> : <Navigate to="/" replace />
}
