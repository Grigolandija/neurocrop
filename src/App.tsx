import { useEffect, useState } from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import { LoginPage } from './components/LoginPage'
import { mockDashboardData } from './data/mock'
import { api } from './lib/api'
import { AlertsPage } from './pages/AlertsPage'
import { BlocksPage } from './pages/BlocksPage'
import { HistoryPage } from './pages/HistoryPage'
import { LocationsPage } from './pages/LocationsPage'
import { NodesPage } from './pages/NodesPage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import type { DashboardData, Page, ViewMode } from './types'

const dataKey = 'neurocrop-react-dashboard-v1'
const sessionKey = 'neurocrop-react-session-v1'
const validPages: Page[] = ['overview', 'locations', 'blocks', 'nodes', 'alerts', 'history', 'settings']

function readData(): DashboardData {
  try { return JSON.parse(localStorage.getItem(dataKey) || '') as DashboardData }
  catch { return structuredClone(mockDashboardData) }
}

function readPage(): Page {
  const hash = location.hash.replace('#/', '') as Page
  return validPages.includes(hash) ? hash : 'overview'
}

function App() {
  const [email, setEmail] = useState(() => sessionStorage.getItem(sessionKey) || '')
  const [page, setPage] = useState<Page>(readPage)
  const [mode, setMode] = useState<ViewMode>('simple')
  const [data, setData] = useState<DashboardData>(readData)
  const [activeBlockId, setActiveBlockId] = useState(() => readData().blocks[0]?.id || '')

  const activeBlock = data.blocks.find((block) => block.id === activeBlockId) || data.blocks[0]
  const lowBatteryCount = data.blocks.flatMap((block) => block.nodes).filter((node) => node.battery < 35).length

  useEffect(() => {
    localStorage.setItem(dataKey, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    function hashChanged() { setPage(readPage()) }
    window.addEventListener('hashchange', hashChanged)
    return () => window.removeEventListener('hashchange', hashChanged)
  }, [])

  useEffect(() => {
    if (!email || !api.configured) return
    api.dashboard().then((remote) => {
      if (remote.locations?.length && remote.blocks?.length) {
        setData(remote)
        setActiveBlockId(remote.blocks[0].id)
      }
    }).catch(() => undefined)
  }, [email])

  async function login(nextEmail: string, password: string) {
    const resolvedEmail = api.configured ? (await api.login(nextEmail, password)).user.email : nextEmail
    sessionStorage.setItem(sessionKey, resolvedEmail)
    setEmail(resolvedEmail)
  }

  function navigate(next: Page) { location.hash = `/${next}`; setPage(next) }
  function logout() { sessionStorage.removeItem(sessionKey); setEmail('') }
  function addLocation(name: string) { setData((current) => ({ ...current, locations: [...current.locations, { id: `location-${Date.now()}`, name }] })) }
  function addBlock(locationId: string, name: string) { setData((current) => ({ ...current, blocks: [...current.blocks, { id: `block-${Date.now()}`, locationId, name, cropProfile: 'Unassigned crop profile', nodes: [], installedMetrics: ['airTemp', 'humidity'], readings: { airTemp: 22, humidity: 68 } }] })) }
  function addNode(blockId: string, devEui: string) { setData((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, nodes: [...block.nodes, { id: `NS-${String(current.blocks.flatMap((item) => item.nodes).length + 1).padStart(6, '0')}`, devEui, battery: 100, active: true }] } : block) })) }

  if (!email) return <LoginPage onLogin={login} />
  if (!activeBlock) return <div className="empty-state">No blocks are configured.</div>

  return <AppShell page={page} email={email} lowBatteryCount={lowBatteryCount} mode={mode} onNavigate={navigate} onMode={setMode} onLogout={logout}>
    {page === 'overview' && <OverviewPage locations={data.locations} blocks={data.blocks} activeBlock={activeBlock} mode={mode} onBlock={setActiveBlockId} />}
    {page === 'locations' && <LocationsPage locations={data.locations} blocks={data.blocks} onAdd={addLocation} />}
    {page === 'blocks' && <BlocksPage locations={data.locations} blocks={data.blocks} onAdd={addBlock} />}
    {page === 'nodes' && <NodesPage locations={data.locations} blocks={data.blocks} onAdd={addNode} />}
    {page === 'alerts' && <AlertsPage locations={data.locations} blocks={data.blocks} />}
    {page === 'history' && <HistoryPage locations={data.locations} blocks={data.blocks} />}
    {page === 'settings' && <SettingsPage />}
  </AppShell>
}

export default App
