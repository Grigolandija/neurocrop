import { translateInterfaceText as tx } from '../../i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ModalPortal } from '../../components/ModalPortal'
import { neurocropApi } from '../../services/api/neurocropApi'
import '../../styles/nodes-page.css'
import {
  formatLastPayload,
  getDetectedSensorNames,
  getHealthSummary,
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
  targetName: string
  source: 'physical' | 'simulated'
  simulated: boolean
  transportStatus: string
  gatewayStatus?: string
  lastGatewayIds?: string[]
  receivingGateways?: Array<{
    gatewayId: string
    name?: string | null
    serialNumber?: string | null
    lastSeenAt?: string | null
  }>
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
type SensorContext = {
  role: string
  label: string
  medium: string
  targetType: string
  targetName: string
  spatialScope: 'point' | 'representative'
  depthCm: number | null
  heightCm: number | null
  useForSectionScore: boolean
  allowSpatialInterpolation: boolean
}
type Sensor = Omit<Partial<SensorContext>, 'spatialScope'> & {
  spatialScope?: SensorContext['spatialScope'] | 'unconfigured'
  port?: string
  sensorModel?: string | null
  detected?: boolean
  metrics?: string[]
  configurable?: boolean
}

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
      targetName: text(source.targetName || source.target_name),
      source: source.source === 'simulated' ? 'simulated' : 'physical',
      simulated: source.simulated === true || source.source === 'simulated',
      transportStatus: freshness.transportStatus,
      lastGatewayIds: source.lastGatewayIds || source.last_gateway_ids || [],
      receivingGateways: source.receivingGateways || source.receiving_gateways || [],
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
  if (sensor.port === 'sht45' || sensor.port === 'internal') return 'Temperature and humidity'
  if (sensor.port === 'scd4x' || sensor.metrics?.includes('co2')) return 'CO₂ sensor'
  if (sensor.port === 'bh1750' || sensor.metrics?.includes('lux')) return 'Light sensor'
  if (sensor.port === 'ds18b20' || sensor.port === 'onewire') return 'Temperature probe'
  return 'Detected sensor'
}

function isIntegratedSensor(sensor: Sensor) {
  const port = String(sensor.port || '').toLowerCase()
  const model = String(sensor.sensorModel || '').toLowerCase()
  return port === 'sht45' || (port === 'internal' && (!model || model.includes('sht45')))
}

function defaultSensorRole(sensor: Sensor) {
  const port = String(sensor.port || '').toLowerCase()
  if (port === 'ds18b20' || port === 'onewire') return 'unassigned_temperature'
  if (isIntegratedSensor(sensor)) return 'air_climate'
  if (port.startsWith('scd4') || sensor.metrics?.includes('co2')) return 'co2'
  if (port === 'bh1750' || sensor.metrics?.includes('lux')) return 'light'
  return 'environment'
}

const targetTypes = [
  ['section', 'Whole Section'], ['pot', 'Pot / container'], ['bed', 'Bed / growing table'],
  ['incubator', 'Incubator / chamber'], ['reservoir', 'Reservoir'], ['pipe', 'Pipe'],
  ['equipment', 'Equipment'], ['custom', 'Other target'],
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
    const interval = window.setInterval(() => setRefreshToken((value) => value + 1), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus((current) => current === 'ready' ? current : 'loading')
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
  const openSensorSetup = new URLSearchParams(location.search).get('setup') === 'sensors'
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
      .filter((node) => !needle || `${node.name} ${node.targetName} ${node.areaName} ${node.sectionName}`.toLowerCase().includes(needle))
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
        ? `${removedName} was unassigned and its measurement history was deleted. The hardware remains available for reassignment.`
        : `${removedName} was unassigned. The hardware remains available for reassignment.`)
      navigate('/nodes', { replace: true })
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'The node could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveSensor(sensor: Sensor, context: SensorContext) {
    if (!selectedNode?.devEui || busy) return false
    setBusy(true); setModalError('')
    try {
      const payload = await neurocropApi.updateNodeSensor(selectedNode.devEui, sensor.port || 'onewire', context)
      setSensors(records(payload, ['sensors']))
      setFeedback(tx("Sensor measurement settings saved."))
      return true
    } catch (mutationError) {
      setModalError(errorMessage(mutationError, 'Sensor purpose could not be saved.'))
      return false
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
    const integratedSensors = detected.filter((sensor) => isIntegratedSensor(sensor as Sensor)) as Sensor[]
    const connectedSensors = detected.filter((sensor) => !isIntegratedSensor(sensor as Sensor)) as Sensor[]
    return <div className="node-detail-page" data-react-nodes-workspace>
      <nav className="node-detail-breadcrumbs" aria-label="Breadcrumb"><button onClick={() => navigate('/nodes')}>{tx("Nodes")}</button><i className="fa-solid fa-chevron-right" /><span>{selectedNode.name}</span></nav>
      <header className="node-detail-head"><div><p>{tx("Sensor node")}</p><h2>{selectedNode.name}</h2><span>{selectedNode.simulated ? `${tx("Simulated")} · ` : ''}{selectedNode.areaName} · {selectedNode.sectionName}</span></div><div className="node-detail-actions"><button type="button" className="node-detail-secondary-action actionable" onClick={() => openEditor(selectedNode)}><i className="fa-solid fa-pen" />{tx("Edit node")}</button></div></header>
      {feedback ? <div className="management-notice success"><i className="fa-solid fa-circle-check" />{feedback}</div> : null}
      {modalError && !editor ? <div className="management-notice warning"><i className="fa-solid fa-triangle-exclamation" />{modalError}</div> : null}
      <section className="node-detail-overview">
        <div className="node-detail-health"><span className="node-detail-orbit" data-tone={state.tone}><i className="fa-solid fa-microchip" /></span><div><span className="node-detail-status" data-tone={state.tone}><i className="fa-solid fa-circle" />{state.label}</span><h3>{selectedNode.gatewayStatus === 'offline' ?tx("Gateway offline") : selectedNode.transportStatus === 'offline' ?tx("No recent uplink") : health.tone === 'optimal' ?tx("Reporting normally") :tx("Device diagnostics require review")}</h3><p>{tx("Last payload")} {lastPayload.relative}</p></div></div>
        <div className="node-detail-facts">
          <div><small>{tx("Battery")}</small><strong>{Number.isFinite(selectedNode.level) ? `${selectedNode.level}%` : '—'}</strong><span className="node-detail-track"><i style={{ width: `${Number(selectedNode.level) || 0}%` }} /></span><p>{Number.isFinite(selectedNode.level) && Number(selectedNode.level) < 25 ? tx("Charge or replace soon") : tx("Battery level")}</p></div>
          <div><small>{tx("Last connection")}</small><strong>{lastPayload.relative}</strong><p>{tx("Latest data received")}</p></div>
        </div>
      </section>
      <div className="node-detail-columns node-detail-columns-single">
        <section className="node-detail-section"><header><p>{tx("Hardware")}</p><h3>{tx("Installed sensors")}</h3><span className="nc-sensor-section-help">{tx("Only SHT45 is integrated into the Node. Configure every other connected sensor separately.")}</span></header>
          {sensorsLoading ? <p className="node-detail-muted"><i className="fa-solid fa-spinner fa-spin" /> {tx("Loading detected sensors…")}</p> : detected.length ? <div className="nc-sensor-groups">
            {integratedSensors.length ? <section className="nc-sensor-group"><header><div><h4>{tx("Integrated SHT45 sensor")}</h4><p>{tx("The Node's integrated SHT45 measures air temperature and humidity.")}</p></div></header><div className="node-detail-sensors">{integratedSensors.map((sensor, index) => <SensorRow sensor={sensor} index={index} configurable={sensor.configurable === true} initiallyOpen={openSensorSetup && index === 0} busy={busy} error={modalError} onSave={saveSensor} key={`${sensor.port || sensorLabel(sensor)}-${index}`} />)}</div></section> : null}
            {connectedSensors.length ? <section className="nc-sensor-group"><header><div><h4>{tx("Connected sensors and probes")}</h4><p>{tx("Configure the measurement location of each connected sensor separately.")}</p></div></header><div className="node-detail-sensors">{connectedSensors.map((sensor, index) => <SensorRow sensor={sensor} index={index + integratedSensors.length} configurable={sensor.configurable === true} initiallyOpen={openSensorSetup && !integratedSensors.length && index === 0} busy={busy} error={modalError} onSave={saveSensor} key={`${sensor.port || sensorLabel(sensor)}-${index}`} />)}</div></section> : null}
          </div> : <p className="node-detail-muted">{tx("No sensor presence information was reported.")}</p>}
        </section>
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
      <div className="nc-list-toolbar"><label className="nc-search-field"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Search name, place or section")} /></label><div className="nc-toolbar-selects">
        <label className="block"><span className="sr-only">{tx("Filter by area")}</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">{tx("All areas")}</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
        <label className="block"><span className="sr-only">{tx("Filter by state")}</span><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">{tx("All states")}</option><option value="healthy">{tx("Healthy")}</option><option value="fault">{tx("Fault")}</option><option value="offline">{tx("Offline")}</option></select></label>
      </div></div>
      <div className="nc-data-table-wrap"><table className="nc-data-table nc-node-table"><thead><tr><th>{tx("Node")}</th><th>{tx("Location")}</th><th>{tx("State")}</th><th>{tx("Battery")}</th><th>{tx("Last payload")}</th><th>{tx("Sensor setup")}</th><th /></tr></thead><tbody>
        {visibleNodes.length ? visibleNodes.map((node) => {
          const state = nodeState(node)
          const lastPayload = formatLastPayload(node, node, translate)
          const batteryLow = Number.isFinite(node.level) && Number(node.level) < 30
          return <tr key={node.devEui || node.id}>
            <td><button type="button" className="nc-node-identity" onClick={() => navigate(`/nodes/${encodeURIComponent((node.devEui || node.id).toLowerCase())}`)}><strong>{node.name}</strong>{node.simulated ? <em>{tx("Simulated")}</em> : null}{node.targetName ? <small>{node.targetName}</small> : null}</button></td>
            <td><strong>{node.sectionName}</strong><small>{node.areaName}</small></td>
            <td><span className={`nc-status-new ${state.tone}`}><span className={`nc-state-dot ${state.tone}`} />{state.label}</span></td>
            <td><span className={`nc-node-battery ${batteryLow ? 'is-low' : ''}`}><i className={`fa-solid ${Number(node.level) < 25 ? 'fa-battery-quarter' : 'fa-battery-three-quarters'}`} />{Number.isFinite(node.level) ? `${node.transportStatus === 'offline' ? 'Last ' : ''}${node.level}%` :tx("Battery unknown")}</span></td>
            <td>{lastPayload.relative}</td><td><button type="button" className="nc-node-sensor-setup-button" onClick={() => navigate(`/nodes/${encodeURIComponent((node.devEui || node.id).toLowerCase())}?setup=sensors`)}><i className="fa-solid fa-sliders" />{tx("Configure sensors")}</button></td>
            <td><button type="button" className="nc-row-arrow" onClick={() => navigate(`/nodes/${encodeURIComponent((node.devEui || node.id).toLowerCase())}`)} aria-label={`Open ${node.name} details`}><i className="fa-solid fa-chevron-right" /></button></td>
          </tr>
        }) : <tr><td colSpan={7} className="nc-node-empty">{nodes.length ?tx("No nodes match these filters.") :tx("No nodes registered yet.")}</td></tr>}
      </tbody></table></div>
    </section>
    {registration ? <RegistrationModal registration={registration} areas={areas} sections={sections} busy={busy} error={modalError} onChange={setRegistration} onAreaChange={chooseRegistrationArea} onClose={() => setRegistration(null)} onSubmit={registerNode} /> : null}
  </div>
}

function SensorRow({ sensor, index, configurable, initiallyOpen, busy, error, onSave }: { sensor: Sensor; index: number; configurable: boolean; initiallyOpen: boolean; busy: boolean; error: string; onSave: (sensor: Sensor, context: SensorContext) => Promise<boolean> }) {
  const [editing, setEditing] = useState(initiallyOpen)
  const isAirClimateSensor = ['sht45', 'internal'].includes(sensor.port || '')
  const isTemperatureProbe = ['ds18b20', 'onewire'].includes(sensor.port || '')
  const isConnectedProbe = isTemperatureProbe || String(sensor.port || '').endsWith('_probe')
  const unconfigured = sensor.spatialScope === 'unconfigured' || (isConnectedProbe && !sensor.targetType)
  const initialChoice = sensor.targetType === 'section' ? 'section' : 'target'
  const [choice, setChoice] = useState<'section' | 'target'>(initialChoice)
  const [context, setContext] = useState<SensorContext>({
    role: sensor.role || defaultSensorRole(sensor),
    label: sensor.label || sensorLabel(sensor),
    medium: sensor.medium || (sensor.port === 'ds18b20' ? 'substrate' : 'air'),
    targetType: sensor.targetType || (isConnectedProbe ? 'custom' : 'section'),
    targetName: sensor.targetName || '',
    spatialScope: sensor.spatialScope === 'unconfigured' ? 'point' : sensor.spatialScope || (isConnectedProbe ? 'point' : 'representative'),
    depthCm: sensor.depthCm ?? null,
    heightCm: sensor.heightCm ?? null,
    useForSectionScore: sensor.useForSectionScore ?? sensor.port !== 'ds18b20',
    allowSpatialInterpolation: sensor.allowSpatialInterpolation ?? sensor.port !== 'ds18b20',
  })
  const probeContext = (targetType: string) => {
    if (['pot', 'bed', 'section'].includes(targetType)) return { medium: 'substrate', role: 'substrate_temperature' }
    if (targetType === 'reservoir') return { medium: 'water', role: 'water_temperature' }
    if (targetType === 'pipe') return { medium: 'water', role: 'pipe_temperature' }
    return { medium: 'equipment', role: 'custom_temperature' }
  }
  const choosePurpose = (next: 'section' | 'target') => {
    setChoice(next)
    setContext((current) => next === 'section'
      ? { ...current, ...(isTemperatureProbe ? probeContext('section') : {}), targetType: 'section', targetName: '', spatialScope: 'representative', useForSectionScore: true, allowSpatialInterpolation: true }
      : { ...current, targetType: ['pot', 'bed', 'reservoir', 'pipe', 'incubator', 'equipment', 'custom'].includes(current.targetType) ? current.targetType : 'custom', targetName: '', spatialScope: 'point', useForSectionScore: false, allowSpatialInterpolation: false })
  }
  const chooseTargetType = (targetType: string) => setContext((current) => ({ ...current, ...(isTemperatureProbe ? probeContext(targetType) : {}), targetType }))
  const setSectionClimateUse = (enabled: boolean) => setContext((current) => ({
    ...current,
    useForSectionScore: enabled,
    allowSpatialInterpolation: enabled,
  }))
  const targetMissing = context.targetType !== 'section' && !context.targetName.trim()
  const editorConfigured = !unconfigured || context.targetType === 'section' || Boolean(context.targetName.trim())
  const summary = !editorConfigured ? tx("Measurement purpose not set") : context.targetType === 'section'
    ? tx("Represents the whole Section")
    : `${tx(context.targetType === 'incubator' || context.targetType === 'equipment' ? "Equipment measurement" : "Separate measurement")}: ${context.targetName || tx("name required")}`
  const setupComplete = editorConfigured && (context.targetType === 'section' || Boolean(context.targetName.trim()))
  const setupNeedsAttention = !setupComplete
  const displayName = sensorLabel(sensor)
  const sensorModel = sensor.sensorModel || sensor.port || displayName
  return <><div className="nc-node-sensor-row"><span><i className={`fa-solid ${index % 2 ? 'fa-temperature-half' : 'fa-wave-square'}`} /></span><div><strong>{displayName}</strong><small>{tx("Detected ·")} {sensorModel} · {summary}</small></div><div className="nc-node-sensor-actions"><span className="node-detail-status" data-tone={setupNeedsAttention ? 'warning' : 'optimal'}><i className="fa-solid fa-circle" />{tx(setupNeedsAttention ? "Needs setup" : "Ready")}</span>{configurable ? <button type="button" className="nc-sensor-context-toggle" onClick={() => setEditing(true)}><i className="fa-solid fa-sliders" />{tx(setupNeedsAttention ? "Set up" : "Measurement setup")}</button> : null}</div></div>{configurable && editing ? <ModalPortal><div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" onClick={() => setEditing(false)} aria-label={tx("Close")} /><section className="management-modal-shell nc-sensor-setup-modal" role="dialog" aria-modal="true" aria-labelledby={`sensorSetupTitle-${index}`}><header className="node-edit-modal-head"><div><p className="eyebrow">{tx("Sensor measurement")}</p><h2 id={`sensorSetupTitle-${index}`}>{displayName}</h2><span>{sensorModel} · {summary}</span></div><button type="button" className="node-edit-close" onClick={() => setEditing(false)} aria-label={tx("Close setup")}><i className="fa-solid fa-xmark" /></button></header><div className="nc-node-sensor-context">
      <div className="nc-sensor-purpose-question wide"><span className="nc-sensor-step">1</span><div><strong>{tx("What does this sensor represent?")}</strong><span>{tx("Configure this sensor separately from the other sensors connected to the node.")}</span></div></div>
      <div className="nc-sensor-purpose-cards wide">
        <button type="button" data-selected={choice === 'section'} onClick={() => choosePurpose('section')}><i className="fa-solid fa-layer-group" /><span><strong>{tx("The whole Section")}</strong><small>{tx("Use when this reading represents the general growing climate.")}</small></span><i className="fa-solid fa-circle-check nc-sensor-choice-check" /></button>
        <button type="button" data-selected={choice === 'target'} onClick={() => choosePurpose('target')}><i className="fa-solid fa-location-dot" /><span><strong>{tx("A specific place or object")}</strong><small>{tx("Use for one pot, bed, reservoir, pipe, incubator or other local target.")}</small></span><i className="fa-solid fa-circle-check nc-sensor-choice-check" /></button>
      </div>
      {choice === 'target' ? <div className="nc-sensor-target-fields wide"><div className="nc-sensor-purpose-question"><span className="nc-sensor-step">2</span><div><strong>{tx("Which exact place or object does it measure?")}</strong><span>{tx("This name will be shown in Readings and Trends.")}</span></div></div><div className="nc-sensor-target-inputs"><label><span>{tx("Place or object type")}</span><select value={context.targetType} onChange={(event) => chooseTargetType(event.target.value)}>{targetTypes.filter(([value]) => ['pot', 'bed', 'reservoir', 'pipe', 'incubator', 'equipment', 'custom'].includes(value)).map(([value, copy]) => <option value={value} key={value}>{tx(copy)}</option>)}</select></label><label><span>{tx("Give it a clear name")}</span><input value={context.targetName} maxLength={120} placeholder={['incubator', 'equipment'].includes(context.targetType) ? tx("e.g. Incubator 1") : tx("e.g. Pot 12")} onChange={(event) => setContext({ ...context, targetName: event.target.value })} /></label>{isTemperatureProbe && ['pot', 'bed'].includes(context.targetType) ? <label><span>{tx("Probe depth, cm (optional)")}</span><input type="number" min="0" max="1000" step="0.1" value={context.depthCm ?? ''} placeholder={tx("e.g. 10")} onChange={(event) => setContext({ ...context, depthCm: event.target.value === '' ? null : Number(event.target.value) })} /></label> : null}</div></div> : null}
      {choice === 'target' && isAirClimateSensor ? <label className="nc-sensor-section-inclusion wide" data-enabled={context.useForSectionScore}><input type="checkbox" checked={context.useForSectionScore} onChange={(event) => setSectionClimateUse(event.target.checked)} /><span><strong>{tx("Include air temperature and humidity in the Section climate")}</strong><small>{tx("Use this when the SHT45 still measures the surrounding room air, even though the Node is assigned to a specific place.")}</small></span></label> : null}
      <div className="nc-sensor-purpose-preview wide" data-section={choice === 'section' || context.useForSectionScore}><i className={`fa-solid ${choice === 'section' || context.useForSectionScore ? 'fa-circle-check' : 'fa-location-dot'}`} /><div><strong>{tx("How NeuroCrop will use this data")}</strong><span>{choice === 'section' ? tx("Included in the Section average, Growing Score, alerts and heatmap.") : context.useForSectionScore ? <>{tx("Shown as")} <strong>{context.targetName || tx("this spot")}</strong>. {tx("Air temperature and humidity will also be included in the Section climate, score, alerts and heatmap.")}</> : <>{tx("Shown separately as")} <strong>{context.targetName || tx("this spot")}</strong>. {tx("It will not change the Section average, Growing Score, Section alerts or heatmap.")}</>}</span></div></div>
      {error ? <p className="management-modal-error wide" role="alert">{error}</p> : null}
      <footer className="wide"><span>{targetMissing ? tx("Enter a name before saving.") : tx("You can change this later without deleting any readings.")}</span><button type="button" disabled={busy || targetMissing || !context.label.trim()} onClick={() => void onSave(sensor, { ...context, label: context.label.trim(), targetName: context.targetName.trim() }).then((saved) => { if (saved) setEditing(false) })}>{busy ? tx("Saving…") : tx("Save measurement use")}</button></footer>
    </div></section></div></ModalPortal> : null}</>
}

function RegistrationModal({ registration, areas, sections, busy, error, onChange, onAreaChange, onClose, onSubmit }: { registration: Registration; areas: Area[]; sections: Section[]; busy: boolean; error: string; onChange: (value: Registration) => void; onAreaChange: (id: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const availableSections = sections.filter((section) => section.areaId === registration.areaId)
  return <ModalPortal><div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" onClick={onClose} aria-label={tx("Close")} /><section className="management-modal-shell node-edit-modal node-register-modal" role="dialog" aria-modal="true" aria-labelledby="nodeRegistrationTitle"><header className="node-edit-modal-head"><div><p className="eyebrow">{tx("Register hardware")}</p><h2 id="nodeRegistrationTitle">{tx("Connect a sensor node")}</h2><span>{tx("Assign its DevEUI to the monitored section that will receive incoming readings.")}</span></div><button type="button" className="node-edit-close" onClick={onClose} aria-label="Close register node dialog"><i className="fa-solid fa-xmark" /></button></header>
    {areas.length ? <form className="node-edit-form node-register-modal-form" onSubmit={onSubmit}><label className="node-edit-field"><span>{tx("Area")}</span><select value={registration.areaId} onChange={(event) => onAreaChange(event.target.value)}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label className="node-edit-field"><span>{tx("Section")}</span><select value={registration.sectionId} disabled={!availableSections.length} onChange={(event) => onChange({ ...registration, sectionId: event.target.value })}>{availableSections.length ? availableSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>) : <option value="">{tx("No sections in this area")}</option>}</select></label><label className="node-edit-field field-wide"><span>DevEUI</span><input value={registration.devEui} onChange={(event) => onChange({ ...registration, devEui: normalizeDevEui(event.target.value) })} placeholder="70B3D57ED006ABCD" minLength={16} maxLength={16} pattern="[0-9A-Fa-f]{16}" required /></label>{error ? <p className="management-modal-error field-wide" role="alert">{error}</p> : null}<footer className="node-edit-footer field-wide"><button type="button" className="button-new secondary" onClick={onClose}>{tx("Cancel")}</button><button type="submit" className="button-new primary" disabled={busy || !registration.sectionId}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-plus'}`} />{busy ? 'Registering…' :tx("Register node")}</button></footer></form> : <div className="node-register-empty"><p>{tx("Create an Area and its first Section before registering a node.")}</p><button type="button" className="button-new secondary" onClick={onClose}>{tx("Close")}</button></div>}
  </section></div></ModalPortal>
}

function NodeEditor({ editor, areas, sections, busy, error, onChange, onAreaChange, onClose, onSave, onRemove }: { editor: Editor; areas: Area[]; sections: Section[]; busy: boolean; error: string; onChange: (value: Editor) => void; onAreaChange: (id: string) => void; onClose: () => void; onSave: (event: FormEvent) => void; onRemove: () => Promise<void> }) {
  const availableSections = sections.filter((section) => section.areaId === editor.areaId)
  return <ModalPortal><div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" onClick={onClose} aria-label={tx("Close")} /><section className="management-modal-shell node-edit-modal" role="dialog" aria-modal="true" aria-labelledby="nodeManagementTitle"><header className="node-edit-modal-head"><div><p className="eyebrow">{tx("Node configuration")}</p><h2 id="nodeManagementTitle">{tx("Edit node")}</h2><span>{tx("Update its identity and assignment.")}</span></div><button type="button" className="node-edit-close" onClick={onClose} aria-label="Close edit node dialog"><i className="fa-solid fa-xmark" /></button></header>
    <form className="node-edit-form" onSubmit={onSave}><label className="node-edit-field"><span>{tx("Node display name")}</span><input name="modalNodeName" required value={editor.name} onChange={(event) => onChange({ ...editor, name: event.target.value })} /></label><label className="node-edit-field"><span>DevEUI</span><input name="modalNodeDevEui" required value={editor.devEui} readOnly={editor.node.simulated} minLength={16} maxLength={16} pattern="[0-9A-Fa-f]{16}" onChange={(event) => onChange({ ...editor, devEui: normalizeDevEui(event.target.value) })} /></label><label className="node-edit-field"><span>{tx("Assigned area")}</span><select name="modalNodeSiteId" value={editor.areaId} onChange={(event) => onAreaChange(event.target.value)}><option value="">{tx("Unassigned")}</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label className="node-edit-field"><span>{tx("Assigned section")}</span><select name="modalNodeSectionId" required={availableSections.length > 0} disabled={!availableSections.length} value={editor.sectionId} onChange={(event) => onChange({ ...editor, sectionId: event.target.value })}>{availableSections.length ? availableSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>) : <option value="">{tx("No sections available")}</option>}</select></label><p className="node-move-note field-wide">{editor.node.simulated ? tx("This simulated node has a reserved DevEUI. Its Area and Section can be changed normally.") : tx("Moving a node keeps its identity. Future readings will belong to the selected Area and Section.")}</p>
      {error ? <p className="management-modal-error field-wide" role="alert">{error}</p> : null}
      <section className="node-remove-zone field-wide" aria-labelledby="remove-node-title"><div className="node-remove-head"><h3 id="remove-node-title">{tx("Unassign node")}</h3><p>{editor.node.simulated ? tx("The simulated node will return to free inventory and its generated measurement history will be cleared.") : tx("The node will leave this workspace but remain registered and available for reassignment.")}</p></div>{editor.node.simulated ? null : <fieldset className="node-delete-history-options"><legend>{tx("Measurement history")}</legend><label><input type="radio" checked={editor.history === 'keep'} onChange={() => onChange({ ...editor, history: 'keep' })} /><span><strong>{tx("Keep measurement history")}</strong><small>{tx("Keep the data available for recovery until the hardware is assigned again.")}</small></span></label><label data-danger><input type="radio" checked={editor.history === 'delete'} onChange={() => onChange({ ...editor, history: 'delete' })} /><span><strong>{tx("Delete measurement history")}</strong><small>{tx("Permanently delete every measurement, but keep the hardware registration.")}</small></span></label></fieldset>}<div className="node-remove-actions"><label><input type="checkbox" checked={editor.confirmed} onChange={(event) => onChange({ ...editor, confirmed: event.target.checked })} /><span>{tx("I understand and want to unassign this node")}</span></label><button type="button" disabled={!editor.confirmed || busy} onClick={() => void onRemove()}><i className="fa-solid fa-link-slash" />{tx("Unassign node")}</button></div></section>
      <footer className="node-edit-footer field-wide"><button type="button" className="button-new secondary" onClick={onClose}>{tx("Cancel")}</button><button type="submit" className="button-new primary" disabled={busy || !editor.sectionId}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-check'}`} />{busy ?tx("Saving…") :tx("Save changes")}</button></footer>
    </form>
  </section></div></ModalPortal>
}
