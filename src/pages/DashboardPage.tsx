import { Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import { installNeuroCropApi, neurocropApi, prefetchWorkspaceData } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'
import { installEChartsEngine } from '../vendor/echartsEngine'
import AreasWorkspace from '../features/areas/AreasWorkspace'
import ReadingsWorkspace from '../features/readings/ReadingsWorkspace'
import SectionsWorkspace from '../features/sections/SectionsWorkspace'
import SettingsWorkspace from '../features/settings/SettingsWorkspace'
import OrganizationWorkspace from '../features/settings/OrganizationWorkspace'
import AdminWorkspace from '../features/settings/AdminWorkspace'
import AdminIntegrationsWorkspace from '../features/settings/AdminIntegrationsWorkspace'
import OverviewWorkspace from '../features/overview/OverviewWorkspace'
import SimulatorWorkspace from '../features/simulator/SimulatorWorkspace'
import ActionsWorkspace from '../features/actions/ActionsWorkspace'
import AlertsWorkspace from '../features/alerts/AlertsWorkspace'
import TrendsWorkspace from '../features/trends/TrendsWorkspace'

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
    }
  }, [navigate])

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
    {alertsMount
      ? createPortal(<div hidden={location.pathname !== '/alerts'}><Suspense fallback={null}><AlertsWorkspace /></Suspense></div>, alertsMount)
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
