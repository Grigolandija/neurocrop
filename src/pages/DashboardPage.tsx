import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import { installNeuroCropApi, neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'

declare const __BUILD_VERSION__: string

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
const loadTrendsWorkspace = () => import('../features/trends/TrendsWorkspace')

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
const TrendsWorkspace = lazy(loadTrendsWorkspace)

const backgroundWorkspaceLoaders = [
  loadAreasWorkspace,
  loadSectionsWorkspace,
  loadReadingsWorkspace,
  loadTrendsWorkspace,
  loadActionsWorkspace,
  loadSettingsWorkspace,
  loadOrganizationWorkspace,
  loadSimulatorWorkspace,
  loadAdminWorkspace,
  loadAdminIntegrationsWorkspace,
]

const navigationIntentLoaders: Record<string, () => Promise<unknown>> = {
  sites: loadAreasWorkspace,
  zones: loadSectionsWorkspace,
  readings: loadReadingsWorkspace,
  history: loadTrendsWorkspace,
  actions: loadActionsWorkspace,
  settings: loadSettingsWorkspace,
  'crop-profiles': loadSettingsWorkspace,
  organization: loadOrganizationWorkspace,
  simulator: loadSimulatorWorkspace,
  admin: loadAdminWorkspace,
}

async function prefetchRouteWorkspaces() {
  for (const loadWorkspace of backgroundWorkspaceLoaders) {
    if (document.hidden) return
    try {
      await loadWorkspace()
    } catch {
      // Navigation still performs the normal lazy-load retry.
    }
  }
}

let chartEnginePromise: Promise<void> | null = null
let dashboardStorePromise: Promise<void> | null = null
let lithuanianTranslationsPromise: Promise<void> | null = null

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
    vendor.src = `/vendor/echarts.min.js?v=${__BUILD_VERSION__}`
    vendor.dataset.neurocropVendor = 'true'
    vendor.onload = () => resolve()
    vendor.onerror = () => reject(new Error('Chart engine could not be loaded.'))
    document.body.appendChild(vendor)
  })
  return chartEnginePromise
}

function ensureOptionalDashboardStore() {
  if (neurocropApi.isConnected() || window.NeuroCropStore) return Promise.resolve()
  if (dashboardStorePromise) return dashboardStorePromise
  dashboardStorePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-neurocrop-store]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Local dashboard store could not be loaded.')), { once: true })
      return
    }
    const store = document.createElement('script')
    store.src = `/neurocrop-dashboard-store.js?v=${__BUILD_VERSION__}`
    store.dataset.neurocropStore = 'true'
    store.onload = () => resolve()
    store.onerror = () => reject(new Error('Local dashboard store could not be loaded.'))
    document.body.appendChild(store)
  })
  return dashboardStorePromise
}

function prefersLithuanianInterface() {
  try {
    const storedLanguage = window.localStorage.getItem('neurocrop-interface-language-v1')
    if (storedLanguage === 'lt' || storedLanguage === 'en') return storedLanguage === 'lt'
    const settings = JSON.parse(window.localStorage.getItem('neurocrop-dashboard-settings-v1') || '{}')
    return settings?.preferences?.locale === 'lt-LT'
  } catch {
    return false
  }
}

function ensureLithuanianTranslations(force = false) {
  if (window.NeuroCropLithuanianText) return Promise.resolve()
  if (!force && !prefersLithuanianInterface()) return Promise.resolve()
  if (lithuanianTranslationsPromise) return lithuanianTranslationsPromise
  lithuanianTranslationsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-neurocrop-i18n-lt]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Lithuanian translations could not be loaded.')), { once: true })
      return
    }
    const translations = document.createElement('script')
    translations.src = `/neurocrop-i18n-lt.js?v=${__BUILD_VERSION__}`
    translations.dataset.neurocropI18nLt = 'true'
    translations.onload = () => resolve()
    translations.onerror = () => reject(new Error('Lithuanian translations could not be loaded.'))
    document.body.appendChild(translations)
  })
  return lithuanianTranslationsPromise
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
  '/', '/areas', '/sections', '/nodes', '/readings', '/alerts', '/actions',
  '/history', '/settings', '/organization', '/crop-profiles', '/admin',
  '/admin/integrations', '/simulator',
])

function isSupportedRoute(pathname: string) {
  const routePathname = String(pathname || '/').split(/[?#]/, 1)[0] || '/'
  return supportedRoutes.has(routePathname) || /^\/nodes\/[^/]+$/.test(routePathname)
}

const routeOwnedSections = [
  { id: 'locationsManagementSection', matches: (pathname: string) => pathname === '/areas' },
  { id: 'blocksManagementSection', matches: (pathname: string) => pathname === '/sections' },
  { id: 'nodesManagementSection', matches: (pathname: string) => pathname === '/nodes' || /^\/nodes\/[^/]+$/.test(pathname) },
  { id: 'alertsManagementSection', matches: (pathname: string) => pathname === '/alerts' },
  { id: 'actionsManagementSection', matches: (pathname: string) => pathname === '/actions' },
  {
    id: 'settingsManagementSection',
    matches: (pathname: string) => [
      '/settings',
      '/organization',
      '/crop-profiles',
      '/admin',
      '/admin/integrations',
      '/simulator',
    ].includes(pathname),
  },
  { id: 'metricsSection', matches: (pathname: string) => pathname === '/readings' },
  { id: 'historySection', matches: (pathname: string) => pathname === '/history' },
]

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
  const [simulatorMount, setSimulatorMount] = useState<HTMLElement | null>(null)
  const [actionsMount, setActionsMount] = useState<HTMLElement | null>(null)
  const [trendsMount, setTrendsMount] = useState<HTMLElement | null>(null)

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
    setSimulatorMount(hostRef.current?.querySelector<HTMLElement>('#simulatorWorkspaceMount') || null)
    setActionsMount(hostRef.current?.querySelector<HTMLElement>('#actionsWorkspaceMount') || null)
    setTrendsMount(hostRef.current?.querySelector<HTMLElement>('#trendsWorkspaceMount') || null)

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

    function preloadNavigationTarget(event: Event) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-sidebar-action]')
        : null
      const loadWorkspace = target
        ? navigationIntentLoaders[String(target.dataset.sidebarAction || '')]
        : undefined
      if (loadWorkspace) void loadWorkspace().catch(() => undefined)
    }

    function attachRuntime() {
      const activateRuntime = () => {
        runtimeReady.current = true
        const notifyRoute = () => notifyRuntimeRoute(window.location.pathname)
        if (routeNeedsCharts(window.location.pathname)) {
          ensureChartEngine().then(notifyRoute).catch(notifyRoute)
        } else {
          notifyRoute()
        }
      }
      if (document.querySelector('script[data-neurocrop-runtime]')) {
        activateRuntime()
        return
      }
      const runtime = document.createElement('script')
      runtime.src = `/approved-dashboard-runtime.js?v=${__BUILD_VERSION__}`
      runtime.dataset.neurocropRuntime = 'true'
      runtime.onload = activateRuntime
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
    hostRef.current?.addEventListener('pointerover', preloadNavigationTarget)
    hostRef.current?.addEventListener('focusin', preloadNavigationTarget)
    window.NeuroCropLoadLithuanianTranslations = () => ensureLithuanianTranslations(true)
    void Promise.allSettled([
      ensureOptionalDashboardStore(),
      ensureLithuanianTranslations(),
    ]).then(loadRuntime)
    let prefetchIdleId: number | null = null
    const prefetchTimer = window.setTimeout(() => {
      const prefetch = () => {
        void neurocropApi.getCurrentUser()
          .then((response) => {
            const user = (response as { user?: { email?: unknown } } | null)?.user
            if (!user?.email) return
            void prefetchWorkspaceData()
            void prefetchRouteWorkspaces()
          })
          .catch(() => undefined)
      }
      if ('requestIdleCallback' in window) {
        prefetchIdleId = window.requestIdleCallback(prefetch, { timeout: 3_000 })
      } else {
        prefetch()
      }
    }, 2_000)

    return () => {
      window.clearTimeout(prefetchTimer)
      if (prefetchIdleId !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(prefetchIdleId)
      delete window.NeuroCropLoadLithuanianTranslations
      window.removeEventListener('message', handleMessage)
      hostRef.current?.removeEventListener('pointerover', preloadNavigationTarget)
      hostRef.current?.removeEventListener('focusin', preloadNavigationTarget)
      document.body.classList.remove('designer-app')
      setReadingsMount(null)
      setAreasMount(null)
      setOverviewMount(null)
      setSectionsMount(null)
      setSettingsMount(null)
      setOrganizationMount(null)
      setAdminMount(null)
      setAdminIntegrationsMount(null)
      setSimulatorMount(null)
      setActionsMount(null)
      setTrendsMount(null)
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

  useEffect(() => {
    if (!hostRef.current) return
    const sections = routeOwnedSections
      .map((section) => ({
        ...section,
        element: hostRef.current?.querySelector<HTMLElement>(`#${section.id}`) || null,
      }))

    // Route ownership is enforced in one place so an asynchronous legacy render
    // cannot leave content from the previous page visible after navigation.
    const synchronizeVisibility = () => {
      sections.forEach(({ element, matches }) => {
        if (!element) return
        const shouldBeVisible = matches(location.pathname)
        if (element.hidden === shouldBeVisible) element.hidden = !shouldBeVisible
      })
    }

    synchronizeVisibility()
    const observer = new MutationObserver(synchronizeVisibility)
    sections.forEach(({ element }) => {
      if (!element) return
      observer.observe(element, { attributes: true, attributeFilter: ['hidden'] })
    })
    return () => observer.disconnect()
  }, [location.pathname])

  return <>
    <div ref={hostRef} />
    {location.pathname === '/' && overviewMount
      ? createPortal(
          <Suspense fallback={<div className="app-route-loading" aria-busy="true" aria-label="Loading Overview" />}>
            <OverviewWorkspace />
          </Suspense>,
          overviewMount,
        )
      : null}
    {location.pathname === '/readings' && readingsMount
      ? createPortal(<Suspense fallback={null}><ReadingsWorkspace /></Suspense>, readingsMount)
      : null}
    {location.pathname === '/areas' && areasMount
      ? createPortal(<Suspense fallback={null}><AreasWorkspace /></Suspense>, areasMount)
      : null}
    {location.pathname === '/sections' && sectionsMount
      ? createPortal(<Suspense fallback={null}><SectionsWorkspace /></Suspense>, sectionsMount)
      : null}
    {location.pathname === '/settings' && settingsMount
      ? createPortal(<Suspense fallback={null}><SettingsWorkspace /></Suspense>, settingsMount)
      : null}
    {location.pathname === '/organization' && organizationMount
      ? createPortal(<Suspense fallback={null}><OrganizationWorkspace /></Suspense>, organizationMount)
      : null}
    {location.pathname === '/admin' && adminMount
      ? createPortal(<Suspense fallback={null}><AdminWorkspace /></Suspense>, adminMount)
      : null}
    {location.pathname === '/admin/integrations' && adminIntegrationsMount
      ? createPortal(<Suspense fallback={null}><AdminIntegrationsWorkspace /></Suspense>, adminIntegrationsMount)
      : null}
    {location.pathname === '/simulator' && simulatorMount
      ? createPortal(<Suspense fallback={null}><SimulatorWorkspace /></Suspense>, simulatorMount)
      : null}
    {location.pathname === '/actions' && actionsMount
      ? createPortal(<Suspense fallback={null}><ActionsWorkspace /></Suspense>, actionsMount)
      : null}
    {location.pathname === '/history' && trendsMount
      ? createPortal(<Suspense fallback={null}><TrendsWorkspace /></Suspense>, trendsMount)
      : null}
  </>
}

export default function DashboardPage() {
  const location = useLocation()
  return isSupportedRoute(location.pathname) ? <ApprovedDashboard /> : <Navigate to="/" replace />
}
