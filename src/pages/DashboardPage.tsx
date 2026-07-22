import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import ReadingsWorkspace from '../features/readings/ReadingsWorkspace'
import SettingsWorkspace from '../features/settings/SettingsWorkspace'
import AdminWorkspace from '../features/settings/AdminWorkspace'
import AdminIntegrationsWorkspace from '../features/settings/AdminIntegrationsWorkspace'
import { installNeuroCropApi } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'

declare const __BUILD_VERSION__: string

const supportedRoutes = new Set([
  '/', '/areas', '/sections', '/nodes', '/readings', '/alerts',
  '/history', '/settings', '/crop-profiles', '/admin',
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
  const [settingsMount, setSettingsMount] = useState<HTMLElement | null>(null)
  const [adminMount, setAdminMount] = useState<HTMLElement | null>(null)
  const [adminIntegrationsMount, setAdminIntegrationsMount] = useState<HTMLElement | null>(null)

  useEffect(() => {
    installNeuroCropApi()
    installNeuroCropFeatures()
    if (hostRef.current && !hostRef.current.childElementCount) {
      hostRef.current.innerHTML = approvedMarkup
    }
    setReadingsMount(hostRef.current?.querySelector<HTMLElement>('#readingsWorkspaceMount') || null)
    setSettingsMount(hostRef.current?.querySelector<HTMLElement>('#settingsWorkspaceMount') || null)
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
        window.postMessage({ type: 'neurocrop:route', route: window.location.pathname }, window.location.origin)
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
    if (window.echarts) {
      loadRuntime()
    } else {
      const vendor = document.createElement('script')
      vendor.src = '/vendor/echarts.min.js'
      vendor.dataset.neurocropVendor = 'true'
      vendor.onload = loadRuntime
      document.body.appendChild(vendor)
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      document.body.classList.remove('designer-app')
      setReadingsMount(null)
      setSettingsMount(null)
      setAdminMount(null)
      setAdminIntegrationsMount(null)
    }
  }, [navigate])

  useEffect(() => {
    if (!runtimeReady.current) return
    window.postMessage({ type: 'neurocrop:route', route: location.pathname }, window.location.origin)
  }, [location.pathname])

  return <>
    <div ref={hostRef} />
    {location.pathname === '/readings' && readingsMount
      ? createPortal(<ReadingsWorkspace />, readingsMount)
      : null}
    {location.pathname === '/settings' && settingsMount
      ? createPortal(<SettingsWorkspace />, settingsMount)
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
