import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

    window.addEventListener('message', handleMessage)

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
  return <BrowserRouter><Routes>
    <Route path="/" element={<ApprovedDashboard />} />
    <Route path="/areas" element={<ApprovedDashboard />} />
    <Route path="/sections" element={<ApprovedDashboard />} />
    <Route path="/nodes" element={<ApprovedDashboard />} />
    <Route path="/alerts" element={<ApprovedDashboard />} />
    <Route path="/history" element={<ApprovedDashboard />} />
    <Route path="/settings" element={<ApprovedDashboard />} />
    <Route path="/crop-profiles" element={<ApprovedDashboard />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>
}

export default App
