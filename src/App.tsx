import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'

type DashboardRoute = '/' | '/areas' | '/sections' | '/nodes' | '/history' | '/alerts' | '/settings' | '/crop-profiles'

const routeToHash: Record<DashboardRoute, string> = {
  '/': '#overview',
  '/areas': '#areas',
  '/sections': '#sections',
  '/nodes': '#nodes',
  '/history': '#history',
  '/alerts': '#alerts',
  '/settings': '#settings',
  '/crop-profiles': '#crop-profiles',
}

function normalizeRoute(pathname: string): DashboardRoute {
  switch (pathname) {
    case '/':
    case '/areas':
    case '/sections':
    case '/nodes':
    case '/history':
    case '/alerts':
    case '/settings':
    case '/crop-profiles':
      return pathname
    default:
      return '/'
  }
}

function buildDashboardSrc(route: DashboardRoute) {
  const url = new URL('/dashboard.html', window.location.origin)
  url.hash = routeToHash[route]
  return url.toString()
}

function DashboardFrame() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = normalizeRoute(location.pathname)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const initialDashboardSrc = useRef(buildDashboardSrc(route))

  function syncDashboardRoute() {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'neurocrop:route',
      route,
    }, window.location.origin)
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== 'neurocrop:navigate') return

      const nextRoute = normalizeRoute(typeof payload.route === 'string' ? payload.route : '/')
      if (nextRoute === route) return
      navigate(nextRoute, { replace: Boolean(payload.replace) })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate, route])

  useEffect(() => {
    syncDashboardRoute()
  }, [route])

  return (
    <main className="app-shell">
      <iframe
        ref={iframeRef}
        className="dashboard-frame"
        title="NeuroCrop Control Center"
        src={initialDashboardSrc.current}
        onLoad={syncDashboardRoute}
      />
    </main>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardFrame />} />
      <Route path="/areas" element={<DashboardFrame />} />
      <Route path="/sections" element={<DashboardFrame />} />
      <Route path="/nodes" element={<DashboardFrame />} />
      <Route path="/history" element={<DashboardFrame />} />
      <Route path="/alerts" element={<DashboardFrame />} />
      <Route path="/settings" element={<DashboardFrame />} />
      <Route path="/crop-profiles" element={<DashboardFrame />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
