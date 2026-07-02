import { useEffect, useRef } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import approvedMarkup from './approved-dashboard-markup.html?raw'
import './App.css'
import './styles/approved-dashboard.css'

declare global {
  interface Window {
    echarts?: unknown
  }
}

const supportedRoutes = new Set(['/', '/areas', '/sections', '/nodes', '/alerts', '/history', '/settings', '/crop-profiles'])

function ApprovedDashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const runtimeReady = useRef(false)

  useEffect(() => {
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

    function handleNavigationClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const action = target.closest<HTMLElement>('[data-sidebar-action]')?.dataset.sidebarAction
      if (!action) return

      const routeByAction: Record<string, string> = {
        overview: '/',
        sites: '/areas',
        zones: '/sections',
        nodes: '/nodes',
        alerts: '/alerts',
        history: '/history',
        analytics: '/history',
        settings: '/settings',
      }
      const route = routeByAction[action]
      if (!route || route === window.location.pathname) return
      window.history.pushState({}, '', route)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    window.addEventListener('message', handleMessage)
    document.addEventListener('click', handleNavigationClick, true)

    const loadRuntime = () => {
      if (document.querySelector('script[data-neurocrop-runtime]')) return
      const runtime = document.createElement('script')
      runtime.src = '/approved-dashboard-runtime.js'
      runtime.dataset.neurocropRuntime = 'true'
      runtime.onload = () => {
        runtimeReady.current = true
        window.postMessage({ type: 'neurocrop:route', route: window.location.pathname }, window.location.origin)
      }
      document.body.appendChild(runtime)
    }

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
      document.removeEventListener('click', handleNavigationClick, true)
      document.body.classList.remove('designer-app')
    }
  }, [navigate])

  useEffect(() => {
    if (!runtimeReady.current) return
    window.postMessage({ type: 'neurocrop:route', route: location.pathname }, window.location.origin)
  }, [location.pathname])

  return <div dangerouslySetInnerHTML={{ __html: approvedMarkup }} />
}

function App() {
  return <BrowserRouter><Routes><Route path="*" element={<ApprovedDashboard />} /></Routes></BrowserRouter>
}

export default App
