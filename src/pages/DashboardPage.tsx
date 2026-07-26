import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router'
import '../styles/approved-dashboard.css'
import '../styles/typography-system.css'
import '../styles/redesign-sidebar.css'
import '../styles/neurocrop-color-system.css'
import '../styles/neurocrop-typography-system.css'
import '../styles/app-shell.css'
import '../styles/operational-consistency.css'
import '../styles/mobile-experience.css'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import { installNeuroCropApi, neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'
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

const allWorkspacePreloaders = [
  loadOverviewWorkspace,
  loadAreasWorkspace,
  loadSectionsWorkspace,
  loadNodesWorkspace,
  loadReadingsWorkspace,
  loadTrendsWorkspace,
  loadAlertsWorkspace,
  loadActionsWorkspace,
  loadCropProfilesWorkspace,
  loadSimulatorWorkspace,
  loadSettingsWorkspace,
  loadOrganizationWorkspace,
  loadAdminWorkspace,
  loadAdminIntegrationsWorkspace,
]

let completeDashboardBootstrapPromise: Promise<void> | null = null

function preloadCompleteDashboard() {
  if (completeDashboardBootstrapPromise) return completeDashboardBootstrapPromise
  preloadDashboardRuntimeAssets()
  completeDashboardBootstrapPromise = Promise.all(allWorkspacePreloaders.map((loadWorkspace) => loadWorkspace()))
    .then(async () => {
      try {
        const response = await neurocropApi.getCurrentUser() as { user?: { email?: unknown } } | null
        if (response?.user?.email) await prefetchWorkspaceData()
      } catch {
        // A signed-out visitor still needs the complete application bundle so
        // the first authenticated navigation is instant after login.
      }
    })
  return completeDashboardBootstrapPromise
}

declare const __BUILD_VERSION__: string

let dashboardStorePromise: Promise<void> | null = null
let lithuanianTranslationsPromise: Promise<void> | null = null

function preloadDashboardRuntimeAssets() {
  const assets = [
    ['/neurocrop-state-engine.js', 'state-engine'],
    ['/approved-dashboard-runtime.js', 'dashboard-runtime'],
  ] as const
  assets.forEach(([path, key]) => {
    if (document.querySelector(`[data-neurocrop-preload="${key}"]`)) return
    const preload = document.createElement('link')
    preload.rel = 'preload'
    preload.as = 'script'
    preload.href = `${path}?v=${__BUILD_VERSION__}`
    preload.dataset.neurocropPreload = key
    document.head.appendChild(preload)
  })
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
  const navigateRef = useRef(navigate)
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
  const [alertsMount, setAlertsMount] = useState<HTMLElement | null>(null)
  const [trendsMount, setTrendsMount] = useState<HTMLElement | null>(null)
  const [nodesMount, setNodesMount] = useState<HTMLElement | null>(null)
  const [cropProfilesMount, setCropProfilesMount] = useState<HTMLElement | null>(null)
  const [allWorkspacesReady, setAllWorkspacesReady] = useState(false)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    installNeuroCropApi()
    installNeuroCropFeatures()
    installEChartsEngine()
    preloadDashboardRuntimeAssets()
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
    setAlertsMount(hostRef.current?.querySelector<HTMLElement>('#alertsManagementShell') || null)
    setTrendsMount(hostRef.current?.querySelector<HTMLElement>('#trendsWorkspaceMount') || null)
    const nodeHost = hostRef.current?.querySelector<HTMLElement>('#nodesManagementShell') || null
    // The React workspace owns this host completely. Clear any server-independent
    // legacy placeholder before the portal mounts so both implementations can
    // never appear together during a direct /nodes refresh.
    nodeHost?.replaceChildren()
    setNodesMount(nodeHost)
    setCropProfilesMount(hostRef.current?.querySelector<HTMLElement>('#cropProfilesWorkspaceMount') || null)

    document.body.classList.add('designer-app')
    document.body.dataset.dashboardState = 'optimal'
    document.body.dataset.workspaceFocus = 'all'

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== 'neurocrop:navigate') return
      const route = isSupportedRoute(payload.route) ? payload.route : '/'
      if (route !== window.location.pathname) navigateRef.current(route, { replace: Boolean(payload.replace) })
    }

    function attachRuntime() {
      const activateRuntime = () => {
        runtimeReady.current = true
        notifyRuntimeRoute(window.location.pathname)
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
    window.NeuroCropLoadLithuanianTranslations = () => ensureLithuanianTranslations(true)
    void Promise.allSettled([
      ensureOptionalDashboardStore(),
      ensureLithuanianTranslations(),
    ]).then(loadRuntime)
    void neurocropApi.getCurrentUser()
      .then((response) => {
        const user = (response as { user?: { email?: unknown } } | null)?.user
        if (user?.email) void prefetchWorkspaceData()
      })
      .catch(() => undefined)

    return () => {
      delete window.NeuroCropLoadLithuanianTranslations
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
      setSimulatorMount(null)
      setActionsMount(null)
      setAlertsMount(null)
      setTrendsMount(null)
      setNodesMount(null)
      setCropProfilesMount(null)
    }
  }, [])

  useEffect(() => {
    if (!runtimeReady.current) return
    notifyRuntimeRoute(location.pathname)
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
        if (shouldBeVisible) element.style.removeProperty('display')
        else element.style.setProperty('display', 'none', 'important')
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

  useEffect(() => {
    const mounts = [
      overviewMount, areasMount, sectionsMount, nodesMount, readingsMount, trendsMount,
      alertsMount, actionsMount, cropProfilesMount, simulatorMount, settingsMount,
      organizationMount, adminMount, adminIntegrationsMount,
    ]
    if (mounts.some((mount) => !mount)) return
    const elements = mounts as HTMLElement[]
    let readinessFrame = 0
    const updateReadiness = () => {
      const ready = elements.every((mount) =>
        mount.childElementCount > 0 && !mount.querySelector('[aria-busy="true"]'))
      if (!ready) return
      window.cancelAnimationFrame(readinessFrame)
      readinessFrame = window.requestAnimationFrame(() => setAllWorkspacesReady(true))
    }
    const observer = new MutationObserver(updateReadiness)
    elements.forEach((mount) => observer.observe(mount, {
      attributes: true,
      attributeFilter: ['aria-busy'],
      childList: true,
      subtree: true,
    }))
    updateReadiness()
    return () => {
      window.cancelAnimationFrame(readinessFrame)
      observer.disconnect()
    }
  }, [
    actionsMount, adminIntegrationsMount, adminMount, alertsMount, areasMount,
    cropProfilesMount, nodesMount, organizationMount, overviewMount, readingsMount,
    sectionsMount, settingsMount, simulatorMount, trendsMount,
  ])

  return <>
    <div ref={hostRef} hidden={!allWorkspacesReady} />
    {!allWorkspacesReady
      ? <main className="app-route-loading" aria-busy="true" aria-label="Loading every NeuroCrop workspace" />
      : null}
    {overviewMount
      ? createPortal(
          <div hidden={location.pathname !== '/'}>
            <Suspense fallback={<div className="app-route-loading" aria-busy="true" aria-label="Loading Overview" />}>
              <OverviewWorkspace />
            </Suspense>
          </div>,
          overviewMount,
        )
      : null}
    {readingsMount
      ? createPortal(<div hidden={location.pathname !== '/readings'}><Suspense fallback={<div aria-busy="true" />}><ReadingsWorkspace /></Suspense></div>, readingsMount)
      : null}
    {areasMount
      ? createPortal(<div hidden={location.pathname !== '/areas'}><Suspense fallback={<div aria-busy="true" />}><AreasWorkspace /></Suspense></div>, areasMount)
      : null}
    {sectionsMount
      ? createPortal(<div hidden={location.pathname !== '/sections'}><Suspense fallback={<div aria-busy="true" />}><SectionsWorkspace /></Suspense></div>, sectionsMount)
      : null}
    {settingsMount
      ? createPortal(<div hidden={location.pathname !== '/settings'}><Suspense fallback={<div aria-busy="true" />}><SettingsWorkspace /></Suspense></div>, settingsMount)
      : null}
    {organizationMount
      ? createPortal(<div hidden={location.pathname !== '/organization'}><Suspense fallback={<div aria-busy="true" />}><OrganizationWorkspace /></Suspense></div>, organizationMount)
      : null}
    {adminMount
      ? createPortal(<div hidden={location.pathname !== '/admin'}><Suspense fallback={<div aria-busy="true" />}><AdminWorkspace /></Suspense></div>, adminMount)
      : null}
    {adminIntegrationsMount
      ? createPortal(<div hidden={location.pathname !== '/admin/integrations'}><Suspense fallback={<div aria-busy="true" />}><AdminIntegrationsWorkspace /></Suspense></div>, adminIntegrationsMount)
      : null}
    {simulatorMount
      ? createPortal(<div hidden={location.pathname !== '/simulator'}><Suspense fallback={<div aria-busy="true" />}><SimulatorWorkspace /></Suspense></div>, simulatorMount)
      : null}
    {actionsMount
      ? createPortal(<div hidden={location.pathname !== '/actions'}><Suspense fallback={<div aria-busy="true" />}><ActionsWorkspace /></Suspense></div>, actionsMount)
      : null}
    {alertsMount
      ? createPortal(<div hidden={location.pathname !== '/alerts'}><Suspense fallback={<div aria-busy="true" />}><AlertsWorkspace /></Suspense></div>, alertsMount)
      : null}
    {trendsMount
      ? createPortal(<div hidden={location.pathname !== '/history'}><Suspense fallback={<div aria-busy="true" />}><TrendsWorkspace /></Suspense></div>, trendsMount)
      : null}
    {nodesMount
      ? createPortal(<div hidden={location.pathname !== '/nodes' && !/^\/nodes\/[^/]+$/.test(location.pathname)}><Suspense fallback={<div aria-busy="true" />}><NodesWorkspace /></Suspense></div>, nodesMount)
      : null}
    {cropProfilesMount
      ? createPortal(<div hidden={location.pathname !== '/crop-profiles'}><Suspense fallback={<div aria-busy="true" />}><CropProfilesWorkspace /></Suspense></div>, cropProfilesMount)
      : null}
  </>
}

export default function DashboardPage() {
  const location = useLocation()
  const [dashboardReady, setDashboardReady] = useState(false)

  useEffect(() => {
    let active = true
    void preloadCompleteDashboard().finally(() => {
      if (active) setDashboardReady(true)
    })
    return () => { active = false }
  }, [])

  if (!isSupportedRoute(location.pathname)) return <Navigate to="/" replace />
  if (!dashboardReady) {
    return <main className="app-route-loading" aria-busy="true" aria-label="Loading complete NeuroCrop workspace" />
  }
  return <ApprovedDashboard />
}
