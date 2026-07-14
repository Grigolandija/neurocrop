import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { NeuroCropApi } from './services/api/neurocropApi'
import type { NeuroCropFeatures } from './features/installFeatures'
import './App.css'
import './styles/approved-dashboard.css'
import './styles/nodes-page.css'

declare global {
  interface Window {
    echarts?: unknown
    NeuroCropStateEngine?: unknown
    NEUROCROP_CONFIG?: { apiBaseUrl?: string }
    NeuroCropApi?: NeuroCropApi
    NeuroCropFeatures?: NeuroCropFeatures
  }
}

const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))

function RouteLoading() {
  return <main className="app-route-loading" aria-busy="true" aria-label="Loading NeuroCrop" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<DashboardPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
