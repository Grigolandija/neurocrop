import { useEffect, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import approvedMarkup from '../approved-dashboard-markup.html?raw'
import { installNeuroCropApi } from '../services/api/neurocropApi'
import { installNeuroCropFeatures } from '../features/installFeatures'

declare const __BUILD_VERSION__: string

const supportedRoutes = new Set([
  '/', '/areas', '/sections', '/nodes', '/readings', '/alerts',
  '/history', '/settings', '/crop-profiles', '/admin',
])

function ApprovedDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeReady = useRef(false)

  useEffect(() => {
    installNeuroCropApi()
    installNeuroCropFeatures()
    if (hostRef.current && !hostRef.current.childElementCount) {
      hostRef.current.innerHTML = approvedMarkup
    }

    document.body.classList.add('designer-app')
    document.body.dataset.dashboardState = 'optimal'
    document.body.dataset.workspaceFocus = 'all'

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== 'neurocrop:navigate') return
      const route = supportedRoutes.has(payload.route) ? payload.route : '/'
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
    }
  }, [navigate])

  useEffect(() => {
    if (!runtimeReady.current) return
    window.postMessage({ type: 'neurocrop:route', route: location.pathname }, window.location.origin)
  }, [location.pathname])

  return <div ref={hostRef} />
}

export default function DashboardPage() {
  const location = useLocation()
  return supportedRoutes.has(location.pathname) ? <ApprovedDashboard /> : <Navigate to="/" replace />
}
