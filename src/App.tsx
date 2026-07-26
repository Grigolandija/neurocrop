import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import type { NeuroCropApi } from './services/api/neurocropApi'
import type { NeuroCropFeatures } from './features/installFeatures'
import './App.css'
import './styles/approved-dashboard.css'
import './styles/nodes-page.css'
import './styles/typography-system.css'
import './styles/redesign-sidebar.css'
import './styles/neurocrop-color-system.css'
import './styles/neurocrop-typography-system.css'
import './styles/redesign-profiles.css'
import './styles/redesign-alerts.css'
import './styles/app-shell.css'
import './styles/operational-consistency.css'
import './styles/mobile-experience.css'

declare global {
  interface Window {
    echarts?: unknown
    NeuroCropStateEngine?: unknown
    NEUROCROP_CONFIG?: { apiBaseUrl?: string; greenhouseMapBeta?: boolean }
    NeuroCropApi?: NeuroCropApi
    NeuroCropFeatures?: NeuroCropFeatures
    NeuroCropStore?: unknown
    NeuroCropLithuanianText?: Readonly<Record<string, string>>
    NeuroCropLoadLithuanianTranslations?: () => Promise<void>
    NeuroCropI18n?: {
      getLanguage: () => 'en' | 'lt'
      setLanguage: (language: 'en' | 'lt') => void
      translate: (value: string) => string
    }
  }
}

const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const GreenhouseMapTestPage = lazy(() => import('./features/greenhouse-map/GreenhouseMapTestPage'))

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
          <Route path="/greenhouse-map-test" element={<GreenhouseMapTestPage />} />
          <Route path="/area-map" element={<GreenhouseMapTestPage />} />
          <Route path="*" element={<DashboardPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
