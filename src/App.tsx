import { startTransition, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LoginPage } from './components/LoginPage'
import { mockDashboardData } from './data/mock'
import { api } from './lib/api'
import { AlertsPage } from './pages/AlertsPage'
import { BlocksPage } from './pages/BlocksPage'
import { CropProfilesPage } from './pages/CropProfilesPage'
import { HistoryPage } from './pages/HistoryPage'
import { LocationsPage } from './pages/LocationsPage'
import { NodesPage } from './pages/NodesPage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import type { DashboardData, ViewMode } from './types'
import './App.css'

const demoAccount = { email: 'admin@neurocrop.lt' }

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

function DashboardApp({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [data, setData] = useState<DashboardData>(mockDashboardData)
  const [activeBlockId, setActiveBlockId] = useState(mockDashboardData.sections[0]?.id || '')
  const [mode, setMode] = useState<ViewMode>('simple')

  useEffect(() => {
    if (!api.configured) return
    let active = true
    api.dashboard()
      .then((nextData) => {
        if (!active) return
        startTransition(() => {
          setData(nextData)
          setActiveBlockId((current) => (
            nextData.sections.some((block) => block.id === current)
              ? current
              : nextData.sections[0]?.id || ''
          ))
        })
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const activeBlock = data.sections.find((block) => block.id === activeBlockId) || data.sections[0]
  const lowBatteryCount = data.sections.flatMap((block) => block.nodes).filter((node) => node.battery < 35).length

  function addLocation(name: string) {
    setData((current) => ({
      ...current,
      areas: [...current.areas, { id: makeId('area'), name }],
    }))
  }

  function addBlock(locationId: string, name: string) {
    setData((current) => ({
      ...current,
      sections: [...current.sections, {
        id: makeId('section'),
        locationId,
        name,
        cropProfile: 'No crop profile assigned',
        nodes: [],
        installedMetrics: ['airTemp', 'humidity'],
        readings: {},
      }],
    }))
  }

  function addNode(blockId: string, devEui: string) {
    setData((current) => ({
      ...current,
      sections: current.sections.map((block) => block.id === blockId
        ? {
          ...block,
          nodes: [...block.nodes, {
            id: `NS-${String(current.sections.flatMap((item) => item.nodes).length + 1).padStart(6, '0')}`,
            devEui,
            battery: 100,
            active: true,
          }],
        }
        : block),
    }))
  }

  function updateLocation(id: string, name: string) {
    setData((current) => ({
      ...current,
      areas: current.areas.map((item) => item.id === id ? { ...item, name } : item),
    }))
  }

  function deleteLocation(id: string, moveToLocationId: string) {
    setData((current) => ({
      areas: current.areas.filter((item) => item.id !== id),
      sections: current.sections.map((block) => block.locationId === id
        ? { ...block, locationId: moveToLocationId }
        : block),
    }))
  }

  function updateBlock(id: string, patch: { name: string; locationId: string; cropProfile: string }) {
    setData((current) => ({
      ...current,
      sections: current.sections.map((block) => block.id === id ? { ...block, ...patch } : block),
    }))
  }

  function deleteBlock(id: string) {
    setData((current) => ({ ...current, sections: current.sections.filter((block) => block.id !== id) }))
    if (activeBlockId === id) {
      setActiveBlockId(data.sections.find((block) => block.id !== id)?.id || '')
    }
  }

  function updateNode(originalBlockId: string, nodeId: string, patch: { blockId: string; devEui: string; active: boolean }) {
    setData((current) => {
      const node = current.sections.find((block) => block.id === originalBlockId)?.nodes.find((item) => item.id === nodeId)
      if (!node) return current
      return {
        ...current,
        sections: current.sections.map((block) => {
          const withoutNode = block.id === originalBlockId
            ? block.nodes.filter((item) => item.id !== nodeId)
            : block.nodes
          return block.id === patch.blockId
            ? { ...block, nodes: [...withoutNode, { ...node, devEui: patch.devEui, active: patch.active }] }
            : { ...block, nodes: withoutNode }
        }),
      }
    })
  }

  function deleteNode(blockId: string, nodeId: string) {
    setData((current) => ({
      ...current,
      sections: current.sections.map((block) => block.id === blockId
        ? { ...block, nodes: block.nodes.filter((node) => node.id !== nodeId) }
        : block),
    }))
  }

  if (!activeBlock) {
    return <div className="fatal-state">No growing sections are configured.</div>
  }

  return (
    <AppShell
      email={email}
      lowBatteryCount={lowBatteryCount}
      mode={mode}
      onMode={setMode}
      onLogout={onLogout}
    >
      <Routes>
        <Route path="/" element={<OverviewPage locations={data.areas} blocks={data.sections} activeBlock={activeBlock} mode={mode} onBlock={setActiveBlockId} />} />
        <Route path="/areas" element={<LocationsPage locations={data.areas} blocks={data.sections} onAdd={addLocation} onUpdate={updateLocation} onDelete={deleteLocation} />} />
        <Route path="/sections" element={<BlocksPage locations={data.areas} blocks={data.sections} onAdd={addBlock} onUpdate={updateBlock} onDelete={deleteBlock} />} />
        <Route path="/nodes" element={<NodesPage locations={data.areas} blocks={data.sections} onAdd={addNode} onUpdate={updateNode} onDelete={deleteNode} />} />
        <Route path="/alerts" element={<AlertsPage blocks={data.sections} locations={data.areas} />} />
        <Route path="/history" element={<HistoryPage locations={data.areas} blocks={data.sections} />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/crop-profiles" element={<CropProfilesPage blocks={data.sections} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

function App() {
  const [account, setAccount] = useState<{ email: string } | null>(() => {
    const saved = window.sessionStorage.getItem('neurocrop-account')
    return saved ? { email: saved } : null
  })

  async function login(email: string, password: string) {
    const nextAccount = api.configured
      ? (await api.login(email, password)).user
      : { email: email || demoAccount.email }
    window.sessionStorage.setItem('neurocrop-account', nextAccount.email)
    setAccount(nextAccount)
  }

  function logout() {
    window.sessionStorage.removeItem('neurocrop-account')
    setAccount(null)
  }

  if (!account) return <LoginPage onLogin={login} />

  return (
    <BrowserRouter>
      <DashboardApp email={account.email} onLogout={logout} />
    </BrowserRouter>
  )
}

export default App
