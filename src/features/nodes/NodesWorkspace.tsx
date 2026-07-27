import { translateInterfaceText as tx } from '../../i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import { notifyWorkspaceStructureChanged } from '../../state/dashboardStore'
import '../../styles/nodes-page.css'
import {
  formatLastPayload,
  formatSignal,
  getDetectedSensorNames,
  getHealthSummary,
  getReportingModeLabel,
} from './model'

// Node firmware and API versions can add diagnostic fields independently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Area = { id: string; name: string }
type Section = { id: string; name: string; areaId: string; areaName: string }
type NodeRow = JsonRecord & {
  id: string
  devEui: string
  name: string
  areaId: string
  areaName: string
  sectionId: string
  sectionName: string
  transportStatus: string
  ageSec: number | null
  health?: { state?: string; label?: string; detail?: string; reasons?: Array<{ label?: string }> } | null
  sensorPresence?: Record<string, boolean>
  errorFlags?: Record<string, boolean>
  errorCounters?: Record<string, number>
  rssi?: number
  snr?: number
  spreadingFactor?: number
  lastReceivedAt?: string | null
  lastSeen?: string | null
}
type Editor = {
  node: NodeRow
  name: string
  devEui: string
  areaId: string
  sectionId: string
  history: 'keep' | 'delete'
  confirmed: boolean
}
type Registration = { areaId: string; sectionId: string; devEui: string }
type Sensor = { port?: string; detected?: boolean; metrics?: string[]; role?: string; label?: string }

const translate = (english: string) => english

function records(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload as JsonRecord[]
  const value = payload as JsonRecord | null
  for (const root of [value, value?.data]) {
    if (!root || typeof root !== 'object') continue
    for (const key of keys) if (Array.isArray(root[key])) return root[key] as JsonRecord[]
  }
  return []
}

function text(value: unknown, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

function identity(value: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = text(value[key]).trim()
    if (candidate) return candidate
  }
  return ''
}

function timestamp(value: unknown) {
  if (!value) return null
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeDevEui(value: unknown) {
  return text(value).trim().replace(/[^0-9a-f]/gi, '').toUpperCase()
}

function nodeFreshness(node: JsonRecord) {
  const explicit = text(node.transportStatus || node.transport_status).toLowerCase()
  const last = timestamp(node.lastReceivedAt || node.last_received_at || node.lastSeen || node.last_seen)
  const ageSec = last === null ? null : Math.max(0, Math.round((Date.now() - last) / 1000))
  if (['live', 'delayed', 'stale', 'offline'].includes(explicit)) return { transportStatus: explicit, ageSec }
  const expected = Math.max(30, Number(node.expectedUplinkIntervalSec || node.expected_uplink_interval_sec || 600))
  if (ageSec === null) return { transportStatus: node.active === true ? 'live' : 'offline', ageSec }
  if (ageSec <= expected * 2) return { transportStatus: 'live', ageSec }
  if (ageSec <= expected * 4) return { transportStatus: 'delayed', ageSec }
  if (ageSec <= expected * 6) return { transportStatus: 'stale', ageSec }
  return { transportStatus: 'offline', ageSec }
}

function normalizeNodes(payload: unknown, areas: Area[], sections: Section[]) {
  const areaMap = new Map(areas.map((area) => [area.id, area]))
  const sectionMap = new Map(sections.map((section) => [section.id, section]))
  return records(payload, ['nodes', 'items']).map((source): NodeRow => {
    const devEui = normalizeDevEui(source.devEui || source.dev_eui)
    const sectionId = identity(source, ['sectionId', 'section_id', 'zoneId', 'zone_id'])
    const section = sectionMap.get(sectionId)
    const areaId = identity(source, ['areaId', 'area_id', 'siteId', 'site_id']) || section?.areaId || ''
    const freshness = nodeFreshness(source)
    return {
      ...source,
      id: text(source.id || source.name || devEui, devEui),
      devEui,
      name: text(source.name || source.id || devEui, devEui),
      areaId,
      areaName: text(source.areaName || source.area_name || areaMap.get(areaId)?.name, 'Unassigned'),
      sectionId,
      sectionName: text(source.sectionName || source.section_name || section?.name, 'Unassigned'),
      transportStatus: freshness.transportStatus,
      ageSec: freshness.ageSec,
      level: Number.isFinite(Number(source.level ?? source.batteryPercent ?? source.battery_percent))
        ? Number(source.level ?? source.batteryPercent ?? source.battery_percent)
        : null,
      batteryMv: Number.isFinite(Number(source.batteryMv ?? source.battery_mv))
        ? Number(source.batteryMv ?? source.battery_mv)
        : null,
    }
  }).sort((left, right) => left.name.localeCompare(right.name))
}

function nodeState(node: NodeRow) {
  const health = getHealthSummary(node, node)
  if (node.transportStatus === 'offline') return { key: 'offline', label: 'Offline', tone: 'offline' }
  if (health.tone === 'critical') return { key: 'fault', label: 'Fault', tone: 'critical' }
  if (health.tone === 'warning') return { key: 'fault', label: 'Watch', tone: 'watch' }
  return { key: 'healthy', label: 'Healthy', tone: 'good' }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function sensorLabel(sensor: Sensor) {
  if (sensor.label) return sensor.label
  if (sensor.port === 'internal') return 'Temperature and humidity'
  if (sensor.port === 'i2c' && sensor.metrics?.includes('co2')) return 'CO₂ sensor'
  if (sensor.port === 'i2c' && sensor.metrics?.includes('lux')) return 'Light sensor'
  if (sensor.port === 'onewire') return 'Temperature probe'
  return 'Detected sensor'
}

const sensorRoles = [
  ['unassigned_temperature', 'Choose purpose'],
  ['substrate_temperature', 'Substrate temperature'],
  ['water_temperature', 'Water temperature'],
  ['pipe_temperature', 'Pipe temperature'],
  ['custom_temperature', 'Other temperature'],
] as const

export default function NodesWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const [areas, setAreas] = useState<Area[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [query, setQuery] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [modalError, setModalError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [sensorsLoading, setSensorsLoading] = useState(false)

  useEffect(() => {
    document.body.dataset.reactNodesActive = 'true'
    return () => { delete document.body.dataset.reactNodesActive }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setError('')
      try {
        const [areaPayload, sectionPayload, nodePayload] = await Promise.all([
          neurocropApi.getAreas(), neurocropApi.getSections(), neurocropApi.getNodes(),
        ])
        if (cancelled) return
        const nextAreas = records(areaPayload, ['areas', 'sites', 'items']).map((area) => ({
          id: identity(area, ['id', 'areaId', 'area_id', 'siteId', 'site_id']),
          name: text(area.name, 'Unnamed Area'),
        })).filter((area) => area.id)
        const areaMap = new Map(nextAreas.map((area) => [area.id, area]))
        const nextSections = records(sectionPayload, ['sections', 'zones', 'items']).map((section) => {
          const areaId = identity(section, ['areaId', 'area_id', 'siteId', 'site_id'])
          return {
            id: identity(section, ['id', 'sectionId', 'section_id', 'zoneId', 'zone_id']),
            name: text(section.name, 'Unnamed Section'),
            areaId,
            areaName: text(section.areaName || section.area_name || areaMap.get(areaId)?.name, 'Unassigned'),
          }
        }).filter((section) => section.id)
        const nextNodes = normalizeNodes(nodePayload, nextAreas, nextSections)
        setAreas(nextAreas)
        setSections(nextSections)
        setNodes(nextNodes)
        setStatus('ready')
      } catch (loadError) {
        if (cancelled) return
        setError(errorMessage(loadError, 'Nodes could not be loaded.'))
        setStatus('error')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [location.pathname, refreshToken])

  const routeNodeId = /^\/nodes\/([^/]+)$/.exec(location.pathname)?.[1]
  const selectedNode = routeNodeId
    ? nodes.find((node) => [node.id, node.devEui].some((value) => text(value).toLowerCase() === decodeURIComponent(routeNodeId).toLowerCase())) || null
    : null

  useEffect(() => {
    if (status === 'ready' && !areas.length) navigate('/areas', { replace: true })
  }, [areas.length, navigate, status])

  useEffect(() => {
    if (!selectedNode?.devEui) {
      queueMicrotask(() => setSensors([]))
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setSensorsLoading(true)
    })
    neurocropApi.getNodeSensors(selectedNode.devEui)
      .then((payload) => {
        if (!cancelled) setSensors(records(payload, ['sensors']))
      })
      .catch(() => {
        if (!cancelled) setSensors([])
      })
      .finally(() => {
        if (!cancelled) setSensorsLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedNode?.devEui, refreshToken])

  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return nodes.filter((node) => areaFilter === 'all' || node.areaId === areaFilter)
      .filter((node) => stateFilter === 'all' || nodeState(node).key === stateFilter)
      .filter((node) => !needle || `${node.name} ${node.devEui} ${node.areaName} ${node.sectionName}`.toLowerCase().includes(needle))
  }, [areaFilter, nodes, query, stateFilter])

  const counts = useMemo(() => ({
    online: nodes.filter((node) => node.transportStatus === 'live').length,
    lowBattery: nodes.filter((node) => Number.isFinite(node.level) && Number(node.level) < 30).length,
    faults: nodes.filter((node) => nodeState(node).key === 'fault').length,
    offline: nodes.filter((node) => node.transportStatus === 'offline').length,
  }), [nodes])

  function defaultAssignment() {
    const area = areas.find((item) => sections.some((section) => section.areaId === item.id)) || areas[0]
    const section = sections.find((item) => item.areaId === area?.id)
    return { areaId: area?.id || '', sectionId: section?.id || '' }
  }

  function openRegistration() {
    const assignment = defaultAssignment()
    setModalError('')
    setRegistration({ ...assignment, devEui: '' })
  }

  function openEditor(node: NodeRow) {
    setModalError('')
    setEditor({
      node,
      name: node.name,
      devEui: node.devEui,
      areaId: node.areaId || '',
      sectionId: node.sectionId,
      history: 'keep',
      confirmed: false,
    })
  }

  function chooseRegistrationArea(areaId: string) {
    setRegistration((current) => current ? {
      ...current,
      areaId,
      sectionId: sections.find((section) => section.areaId === areaId)?.id || '',
    } : current)
  }

  function chooseEditorArea(areaId: string) {
    setEditor((current) => current ? {
      ...current,
      areaId,
      sectionId: sections.find((section) => section.areaId === areaId)?.id || '',
    } : current)
  }

  async function registerNode(event: FormEvent) {
    event.preventDefault()
    if (!registration || busy) return
    const devEui = normalizeDevEui(registration.devEui)
    if (!registration.sectionId) return setModalError('Choose the Area and Section where this node is installed.')
    if (!/^[0-9A-F]{16}$/.test(devEui)) return setModalError('DevEUI must be 16 hexadecimal characters.')
    setBusy(true); setModalError('')
    try {
      await neurocropApi.registerNode({ devEui, sectionId: registration.sectionId })
      setRegistration(null)
      setFeedback(`Node ${devEui} registered. It will appear when sensor readings begin arriving.`)
      notifyWorkspaceStructureChanged()
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'The node could not be registered.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveNode(event: FormEvent) {
    event.preventDefault()
    if (!editor || busy) return
    const devEui = normalizeDevEui(editor.devEui)
    if (!editor.name.trim()) return setModalError('Enter a node display name.')
    if (!/^[0-9A-F]{16}$/.test(devEui)) return setModalError('DevEUI must be 16 hexadecimal characters.')
    if (!editor.sectionId) return setModalError('Choose a section for the selected area.')
    setBusy(true); setModalError('')
    try {
      await neurocropApi.updateNode(editor.node.devEui, { name: editor.name.trim(), devEui, sectionId: editor.sectionId })
      setEditor(null)
      setFeedback(`${editor.name.trim()} saved.`)
      notifyWorkspaceStructureChanged()
      setRefreshToken((value) => value + 1)
      if (routeNodeId) navigate(`/nodes/${encodeURIComponent(devEui.toLowerCase())}`, { replace: true })
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'The node could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeNode() {
    if (!editor?.confirmed || busy) return
    setBusy(true); setModalError('')
    try {
      await neurocropApi.deleteNode(editor.node.devEui, { history: editor.history })
      const removedName = editor.name
      setEditor(null)
      setFeedback(editor.history === 'delete'
        ? `${removedName} and its measurement history were permanently deleted.`
        : `${removedName} removed. Its measurement history was retained.`)
      notifyWorkspaceStructureChanged()
      navigate('/nodes', { replace: true })
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'The node could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveSensor(sensor: Sensor, role: string, label: string) {
    if (!selectedNode?.devEui || busy) return
    setBusy(true); setModalError('')
    try {
      const payload = await neurocropApi.updateNodeSensor(selectedNode.devEui, sensor.port || 'onewire', { role, label })
      setSensors(records(payload, ['sensors']))
      setFeedback('Sensor purpose saved.')
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'Sensor purpose could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <div className="node-detail-empty" data-react-nodes-workspace aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><h2>{tx("Loading sensor nodes…")}</h2></div>
  if (status === 'error') return <div className="node-detail-empty" data-react-nodes-workspace role="alert"><h2>{tx("Nodes could not be loaded")}</h2><p>{error}</p><button className="button-new secondary" onClick={() => setRefreshToken((value) => value + 1)}>{tx("Try again")}</button></div>

  if (routeNodeId) {
    if (!selectedNode) return <div className="node-detail-page" data-react-nodes-workspace><button type="button" className="node-detail-back" onClick={() => navigate('/nodes')}><i className="fa-solid fa-chevron-left" />{tx("Nodes")}</button><section className="node-detail-empty"><h2>{tx("Node not found")}</h2><p>{tx("This node is no longer available in the current workspace.")}</p></section></div>
    const health = getHealthSummary(selectedNode, selectedNode)
    const state = nodeState(selectedNode)
    const lastPayload = formatLastPayload(selectedNode, selectedNode, translate)
    const detected = sensors.length ? sensors.filter((sensor) => sensor.detected) : getDetectedSensorNames(selectedNode).map((label) => ({ label, detected: true }))
    const flags = Object.entries(selectedNode.errorFlags || {}).filter(([, active]) => active).map(([key]) => key.replaceAll('_', ' '))
    const counters = selectedNode.errorCounters || {}
    return <div className="node-detail-page" data-react-nodes-workspace>
      <nav className="node-detail-breadcrumbs" aria-label="Breadcrumb"><button onClick={() => navigate('/nodes')}>{tx("Nodes")}</button><i className="fa-solid fa-chevron-right" /><span>{selectedNode.name}</span></nav>
      <header className="node-detail-head"><div><p>{selectedNode.devEui}</p><h2>{selectedNode.name}</h2><span>{selectedNode.areaName} · {selectedNode.sectionName}</span></div><div className="node-detail-actions"><button type="button" className="node-detail-secondary-action actionable" onClick={() => openEditor(selectedNode)}><i className="fa-solid fa-pen" />{tx("Edit node")}</button></div></header>
      {feedback ? <div className="management-notice success"><i className="fa-solid fa-circle-check" />{feedback}</div> : null}
      {modalError && !editor ? <div className="management-notice warning"><i className="fa-solid fa-triangle-exclamation" />{modalError}</div> : null}
      <section className="node-detail-overview">
        <div className="node-detail-health"><span className="node-detail-orbit" data-tone={state.tone}><i className="fa-solid fa-microchip" /></span><div><span className="node-detail-status" data-tone={state.tone}><i className="fa-solid fa-circle" />{state.label}</span><h3>{selectedNode.transportStatus === 'offline' ?tx("No recent uplink") : health.tone === 'optimal' ?tx("Reporting normally") :tx("Device diagnostics require review")}</h3><p>{tx("Last payload")} {lastPayload.relative}</p></div></div>
        <div className="node-detail-facts">
          <div><small>{tx("Battery")}</small><strong>{Number.isFinite(selectedNode.level) ? `${selectedNode.level}%` : '—'}</strong><span className="node-detail-track"><i style={{ width: `${Number(selectedNode.level) || 0}%` }} /></span>{Number.isFinite(selectedNode.batteryMv) ? <p>{(selectedNode.batteryMv / 1000).toFixed(2)} V</p> : null}</div>
          <div><small>{tx("Signal")}</small><strong>{Number.isFinite(selectedNode.rssi) ? `${selectedNode.rssi} dBm` : '—'}</strong><p>{Number.isFinite(selectedNode.snr) ? `SNR ${selectedNode.snr}${Number.isFinite(selectedNode.spreadingFactor) ? ` · SF${selectedNode.spreadingFactor}` : ''}` : 'SNR unavailable'}</p></div>
          <div><small>{tx("Reporting mode")}</small><strong>{getReportingModeLabel(selectedNode.profile)}</strong><p>{selectedNode.transportStatus === 'live' ?tx("Live uplink") : state.label}</p></div>
        </div>
      </section>
      <div className="node-detail-columns">
        <section className="node-detail-section"><header><p>{tx("Hardware")}</p><h3>{tx("Installed sensors")}</h3></header><div className="node-detail-sensors">
          {sensorsLoading ? <p className="node-detail-muted"><i className="fa-solid fa-spinner fa-spin" /> {tx("Loading detected sensors…")}</p> : detected.length ? detected.map((sensor, index) => {
            const configurable = 'port' in sensor && sensor.port === 'onewire'
            return <SensorRow sensor={sensor as Sensor} index={index} configurable={configurable} busy={busy} onSave={saveSensor} key={`${(sensor as Sensor).port || sensorLabel(sensor as Sensor)}-${index}`} />
          }) : <p className="node-detail-muted">{tx("No sensor presence information was reported.")}</p>}
        </div></section>
        <section className="node-detail-section"><header><p>{tx("Diagnostics")}</p><h3>{tx("Latest device report")}</h3></header><dl className="node-detail-diagnostics">
          <div><dt>{tx("Firmware")}</dt><dd>{selectedNode.firmwareVersion ||tx("Unavailable")}</dd></div>
          <div><dt>{tx("Read failures")}</dt><dd>{Number.isFinite(Number(counters.read_fail)) ? counters.read_fail :tx("Unavailable")}</dd></div>
          <div><dt>{tx("Transmit failures")}</dt><dd>{Number.isFinite(Number(counters.tx_fail)) ? counters.tx_fail :tx("Unavailable")}</dd></div>
          <div><dt>{tx("Last payload")}</dt><dd>{lastPayload.absolute}</dd></div>
          {flags.length ? <div><dt>{tx("Fault flags")}</dt><dd>{flags.join(' · ')}</dd></div> : null}
          <div><dt>{tx("Signal detail")}</dt><dd>{formatSignal(selectedNode)}</dd></div>
        </dl></section>
      </div>
      {editor ? <NodeEditor editor={editor} areas={areas} sections={sections} busy={busy} error={modalError} onChange={setEditor} onAreaChange={chooseEditorArea} onClose={() => setEditor(null)} onSave={saveNode} onRemove={removeNode} /> : null}
    </div>
  }

  return <div className="node-fleet-page" data-react-nodes-workspace>
    <header className="node-fleet-page-head"><div><p>{tx("Device fleet")}</p><h2>{tx("Sensor nodes")}</h2><span>{tx("Hardware availability, battery, signal, installed sensors, and latest uplink freshness.")}</span></div><button type="button" className="node-fleet-primary-action actionable" onClick={openRegistration}><i className="fa-solid fa-plus" />{tx("Register node")}</button></header>
    <section className="node-fleet-stats" aria-label="Node fleet status">
      <div><span data-tone="optimal"><i className="fa-solid fa-signal" /></span><strong>{counts.online}</strong><small>{tx("Online")}</small></div>
      <div><span data-tone="warning"><i className="fa-solid fa-battery-quarter" /></span><strong>{counts.lowBattery}</strong><small>{tx("Low battery")}</small></div>
      <div><span data-tone="critical"><i className="fa-solid fa-triangle-exclamation" /></span><strong>{counts.faults}</strong><small>{tx("Faults")}</small></div>
      <div><span data-tone="offline"><i className="fa-solid fa-link-slash" /></span><strong>{counts.offline}</strong><small>{tx("Offline")}</small></div>
    </section>
    {feedback ? <div className="management-notice success"><i className="fa-solid fa-circle-check" />{feedback}</div> : null}
    <section className="nc-node-list">
      <div className="nc-list-toolbar"><label className="nc-search-field"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, DevEUI or section" /></label><div className="nc-toolbar-selects">
        <label className="block"><span className="sr-only">{tx("Filter by area")}</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">{tx("All areas")}</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
        <label className="block"><span className="sr-only">{tx("Filter by state")}</span><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">{tx("All states")}</option><option value="healthy">{tx("Healthy")}</option><option value="fault">{tx("Fault")}</option><option value="offline">{tx("Offline")}</option></select></label>
      </div></div>
      <div className="nc-data-table-wrap"><table className="nc-data-table nc-node-table"><thead><tr><th>{tx("Node")}</th><th>{tx("Location")}</th><th>{tx("State")}</th><th>{tx("Battery")}</th><th>{tx("Signal")}</th><th>{tx("Last payload")}</th><th /></tr></thead><tbody>
        {visibleNodes.length ? visibleNodes.map((node) => {
          const state = nodeState(node)
          const lastPayload = formatLastPayload(node, node, translate)
          const batteryLow = Number.isFinite(node.level) && Number(node.level) < 30
          return <tr key={node.devEui || node.id}>
            <td><button type="button" className="nc-node-identity" onClick={() => navigate(`/nodes/${encodeURIComponent((node.devEui || node.id).toLowerCase())}`)}><strong>{node.name}</strong><small>{node.devEui || node.id}</small></button></td>
            <td><strong>{node.sectionName}</strong><small>{node.areaName}</small></td>
            <td><span className={`nc-status-new ${state.tone}`}><span className={`nc-state-dot ${state.tone}`} />{state.label}</span></td>
            <td><span className={`nc-node-battery ${batteryLow ? 'is-low' : ''}`}><i className={`fa-solid ${Number(node.level) < 25 ? 'fa-battery-quarter' : 'fa-battery-three-quarters'}`} />{Number.isFinite(node.level) ? `${node.transportStatus === 'offline' ? 'Last ' : ''}${node.level}%` :tx("Battery unknown")}</span></td>
            <td>{Number.isFinite(node.rssi) ? `${node.rssi} dBm` : '—'}</td><td>{lastPayload.relative}</td>
            <td><button type="button" className="nc-row-arrow" onClick={() => navigate(`/nodes/${encodeURIComponent((node.devEui || node.id).toLowerCase())}`)} aria-label={`Open ${node.name} details`}><i className="fa-solid fa-chevron-right" /></button></td>
          </tr>
        }) : <tr><td colSpan={7} className="nc-node-empty">{nodes.length ?tx("No nodes match these filters.") :tx("No nodes registered yet.")}</td></tr>}
      </tbody></table></div>
    </section>
    {registration ? <RegistrationModal registration={registration} areas={areas} sections={sections} busy={busy} error={modalError} onChange={setRegistration} onAreaChange={chooseRegistrationArea} onClose={() => setRegistration(null)} onSubmit={registerNode} /> : null}
  </div>
}

function SensorRow({ sensor, index, configurable, busy, onSave }: { sensor: Sensor; index: number; configurable: boolean; busy: boolean; onSave: (sensor: Sensor, role: string, label: string) => Promise<void> }) {
  const [role, setRole] = useState(sensor.role || 'unassigned_temperature')
  const [label, setLabel] = useState(sensor.label || 'Temperature probe')
  return <div className="nc-node-sensor-row"><span><i className={`fa-solid ${index % 2 ? 'fa-temperature-half' : 'fa-wave-square'}`} /></span><div><strong>{sensorLabel(sensor)}</strong><small>{tx("Detected ·")} {sensor.port || `Port ${index + 1}`}</small>{configurable ? <div className="nc-node-sensor-config"><select value={role} onChange={(event) => setRole(event.target.value)}>{sensorRoles.map(([value, copy]) => <option value={value} key={value}>{copy}</option>)}</select><input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /><button type="button" disabled={busy} onClick={() => void onSave(sensor, role, label.trim() || 'Temperature probe')}>{tx("Save purpose")}</button></div> : null}</div><span className="node-detail-status" data-tone="optimal"><i className="fa-solid fa-circle" />{tx("Active")}</span></div>
}

function RegistrationModal({ registration, areas, sections, busy, error, onChange, onAreaChange, onClose, onSubmit }: { registration: Registration; areas: Area[]; sections: Section[]; busy: boolean; error: string; onChange: (value: Registration) => void; onAreaChange: (id: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const availableSections = sections.filter((section) => section.areaId === registration.areaId)
  return <div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" onClick={onClose} aria-label={tx("Close")} /><section className="management-modal-shell node-edit-modal node-register-modal" role="dialog" aria-modal="true" aria-labelledby="nodeRegistrationTitle"><header className="node-edit-modal-head"><div><p className="eyebrow">{tx("Register hardware")}</p><h2 id="nodeRegistrationTitle">{tx("Connect a sensor node")}</h2><span>{tx("Assign its DevEUI to the monitored section that will receive incoming readings.")}</span></div><button type="button" className="node-edit-close" onClick={onClose} aria-label="Close register node dialog"><i className="fa-solid fa-xmark" /></button></header>
    {areas.length ? <form className="node-edit-form node-register-modal-form" onSubmit={onSubmit}><label className="node-edit-field"><span>{tx("Area")}</span><select value={registration.areaId} onChange={(event) => onAreaChange(event.target.value)}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label className="node-edit-field"><span>{tx("Section")}</span><select value={registration.sectionId} disabled={!availableSections.length} onChange={(event) => onChange({ ...registration, sectionId: event.target.value })}>{availableSections.length ? availableSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>) : <option value="">{tx("No sections in this area")}</option>}</select></label><label className="node-edit-field field-wide"><span>DevEUI</span><input autoFocus value={registration.devEui} onChange={(event) => onChange({ ...registration, devEui: normalizeDevEui(event.target.value) })} placeholder="70B3D57ED006ABCD" minLength={16} maxLength={16} pattern="[0-9A-Fa-f]{16}" required /></label>{error ? <p className="management-modal-error field-wide" role="alert">{error}</p> : null}<footer className="node-edit-footer field-wide"><button type="button" className="button-new secondary" onClick={onClose}>{tx("Cancel")}</button><button type="submit" className="button-new primary" disabled={busy || !registration.sectionId}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-plus'}`} />{busy ? 'Registering…' :tx("Register node")}</button></footer></form> : <div className="node-register-empty"><p>{tx("Create an Area and its first Section before registering a node.")}</p><button type="button" className="button-new secondary" onClick={onClose}>{tx("Close")}</button></div>}
  </section></div>
}

function NodeEditor({ editor, areas, sections, busy, error, onChange, onAreaChange, onClose, onSave, onRemove }: { editor: Editor; areas: Area[]; sections: Section[]; busy: boolean; error: string; onChange: (value: Editor) => void; onAreaChange: (id: string) => void; onClose: () => void; onSave: (event: FormEvent) => void; onRemove: () => Promise<void> }) {
  const availableSections = sections.filter((section) => section.areaId === editor.areaId)
  return <div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" onClick={onClose} aria-label={tx("Close")} /><section className="management-modal-shell node-edit-modal" role="dialog" aria-modal="true" aria-labelledby="nodeManagementTitle"><header className="node-edit-modal-head"><div><p className="eyebrow">{tx("Node configuration")}</p><h2 id="nodeManagementTitle">{tx("Edit node")}</h2><span>{tx("Update its identity and assignment.")}</span></div><button type="button" className="node-edit-close" onClick={onClose} aria-label="Close edit node dialog"><i className="fa-solid fa-xmark" /></button></header>
    <form className="node-edit-form" onSubmit={onSave}><label className="node-edit-field"><span>{tx("Node display name")}</span><input name="modalNodeName" autoFocus required value={editor.name} onChange={(event) => onChange({ ...editor, name: event.target.value })} /></label><label className="node-edit-field"><span>DevEUI</span><input name="modalNodeDevEui" required value={editor.devEui} minLength={16} maxLength={16} pattern="[0-9A-Fa-f]{16}" onChange={(event) => onChange({ ...editor, devEui: normalizeDevEui(event.target.value) })} /></label><label className="node-edit-field"><span>{tx("Assigned area")}</span><select name="modalNodeSiteId" value={editor.areaId} onChange={(event) => onAreaChange(event.target.value)}><option value="">{tx("Unassigned")}</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label className="node-edit-field"><span>{tx("Assigned section")}</span><select name="modalNodeSectionId" required={availableSections.length > 0} disabled={!availableSections.length} value={editor.sectionId} onChange={(event) => onChange({ ...editor, sectionId: event.target.value })}>{availableSections.length ? availableSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>) : <option value="">{tx("No sections available")}</option>}</select></label><p className="node-move-note field-wide">{tx("Moving a node keeps its identity. Future readings will belong to the selected Area and Section.")}</p>
      {error ? <p className="management-modal-error field-wide" role="alert">{error}</p> : null}
      <section className="node-remove-zone field-wide" aria-labelledby="remove-node-title"><div className="node-remove-head"><h3 id="remove-node-title">{tx("Remove node")}</h3><p>{tx("Choose what should happen to measurements already collected by this node.")}</p></div><fieldset className="node-delete-history-options"><legend>{tx("Measurement history")}</legend><label><input type="radio" checked={editor.history === 'keep'} onChange={() => onChange({ ...editor, history: 'keep' })} /><span><strong>{tx("Keep measurement history")}</strong><small>{tx("Retain historical data for trends and exports.")}</small></span></label><label data-danger><input type="radio" checked={editor.history === 'delete'} onChange={() => onChange({ ...editor, history: 'delete' })} /><span><strong>{tx("Delete measurement history")}</strong><small>{tx("Permanently delete every measurement collected by this node.")}</small></span></label></fieldset><div className="node-remove-actions"><label><input type="checkbox" checked={editor.confirmed} onChange={(event) => onChange({ ...editor, confirmed: event.target.checked })} /><span>{tx("I understand and want to remove this node")}</span></label><button type="button" disabled={!editor.confirmed || busy} onClick={() => void onRemove()}><i className="fa-solid fa-trash-can" />{tx("Remove node")}</button></div></section>
      <footer className="node-edit-footer field-wide"><button type="button" className="button-new secondary" onClick={onClose}>{tx("Cancel")}</button><button type="submit" className="button-new primary" disabled={busy || !editor.sectionId}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-check'}`} />{busy ?tx("Saving…") :tx("Save changes")}</button></footer>
    </form>
  </section></div>
}
