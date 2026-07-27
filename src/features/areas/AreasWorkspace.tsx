import { translateInterfaceText as tx } from '../../i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import { notifyWorkspaceStructureChanged } from '../../state/dashboardStore'
import '../../styles/areas-workspace.css'

// API payloads include both current management fields and dashboard aliases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Health = 'stable' | 'attention' | 'critical' | 'unconfigured'
type HealthFilter = 'all' | Health
type SortMode = 'name' | 'health' | 'sections' | 'nodes'
type Editor = { mode: 'create' | 'edit'; id?: string; name: string; kind: string; location: string }
type DeleteState = { id: string; name: string; sectionCount: number; keepSections: boolean }
type Feedback = { tone: 'success' | 'warning'; message: string } | null
type AreaRow = {
  id: string
  name: string
  kind: string
  location: string
  createdAt: string
  sections: JsonRecord[]
  nodes: JsonRecord[]
  sectionCount: number
  nodeCount: number
  reportingCount: number
  score: number | null
  health: Health
}

const areaKinds = ['Greenhouse', 'Field', 'Growing room', 'Laboratory', 'Trial facility', 'Other']
const healthPriority: Record<Health, number> = { critical: 0, attention: 1, unconfigured: 2, stable: 3 }

function asArray(payload: JsonRecord | null | undefined, keys: string[]) {
  if (Array.isArray(payload)) return payload as JsonRecord[]
  for (const root of [payload, payload?.data, payload?.dashboard, payload?.workspace]) {
    if (!root || typeof root !== 'object') continue
    for (const key of keys) if (Array.isArray(root[key])) return root[key] as JsonRecord[]
  }
  return []
}

function text(value: unknown, fallback = '') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function numeric(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function areaId(area: JsonRecord) {
  return text(area.id || area.areaId || area.area_id || area.siteId || area.site_id)
}

function sectionId(section: JsonRecord) {
  return text(section.id || section.sectionId || section.section_id || section.zoneId || section.zone_id)
}

function sectionAreaId(section: JsonRecord) {
  return text(section.areaId || section.area_id || section.siteId || section.site_id || section.area?.id || section.site?.id)
}

function nodeAreaId(node: JsonRecord) {
  return text(node.areaId || node.area_id || node.siteId || node.site_id || node.area?.id)
}

function nodeSectionId(node: JsonRecord) {
  return text(node.sectionId || node.section_id || node.zoneId || node.zone_id || node.section?.id)
}

function isReporting(node: JsonRecord) {
  if (node.archived === true || node.archived_at) return false
  const explicit = text(node.transportStatus || node.transport_status || node.status || node.state).toLowerCase()
  if (['online', 'active', 'healthy', 'connected', 'live'].includes(explicit) || node.active === true) return true
  const timestamp = node.lastReceivedAt || node.last_received_at || node.lastSeen || node.last_seen || node.lastPayloadAt || node.last_payload_at
  if (!timestamp) return false
  const age = Date.now() - new Date(String(timestamp)).getTime()
  const expected = Math.max(30, Number(node.expectedUplinkIntervalSec || node.expected_uplink_interval_sec || 600))
  return Number.isFinite(age) && age <= expected * 6 * 1000
}

function dashboardHealth(zones: JsonRecord[], nodeCount: number, reportingCount: number): Pick<AreaRow, 'score' | 'health'> {
  if (!zones.length) return { score: null, health: 'unconfigured' }
  const states = zones.map((zone) => text(zone.overall?.state || zone.conditionStatus || zone.condition_status || zone.state).toLowerCase())
  const scores = zones.map((zone) => numeric(zone.overall?.score ?? zone.score ?? zone.conditionScore ?? zone.condition_score)).filter((score): score is number => score !== null)
  const score = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null
  if (states.some((state) => ['critical', 'danger', 'error'].includes(state)) || (score !== null && score < 50)) return { score, health: 'critical' }
  if (states.some((state) => state && !['optimal', 'good', 'stable', 'healthy'].includes(state)) || (score !== null && score < 75) || (nodeCount > 0 && reportingCount < nodeCount)) return { score, health: 'attention' }
  return { score, health: 'stable' }
}

function healthCopy(health: Health) {
  if (health === 'stable') return 'Stable'
  if (health === 'critical') return 'Action required'
  if (health === 'attention') return 'Watch'
  return 'Not configured'
}

function kindIcon(kind: string) {
  const normalized = kind.toLowerCase()
  if (normalized.includes('field')) return 'fa-wheat-awn'
  if (normalized.includes('lab')) return 'fa-flask'
  if (normalized.includes('room')) return 'fa-door-open'
  if (normalized.includes('trial')) return 'fa-seedling'
  return 'fa-house-chimney-window'
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export default function AreasWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const greenhouseMapBeta = window.NEUROCROP_CONFIG?.greenhouseMapBeta === true
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [modalError, setModalError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [query, setQuery] = useState('')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [sort, setSort] = useState<SortMode>('name')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.body.dataset.reactAreasActive = 'true'
    return () => { delete document.body.dataset.reactAreasActive }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setError('')
      try {
        const [dashboardResult, areasResult, sectionsResult, nodesResult] = await Promise.allSettled([
          neurocropApi.getDashboard(), neurocropApi.getAreas(), neurocropApi.getSections(), neurocropApi.getNodes(),
        ])
        if (cancelled) return
        if (areasResult.status === 'rejected' && dashboardResult.status === 'rejected') throw areasResult.reason
        const managementAreas = areasResult.status === 'fulfilled' ? asArray(areasResult.value as JsonRecord, ['areas', 'sites', 'items']) : []
        const dashboardAreas = dashboardResult.status === 'fulfilled' ? asArray(dashboardResult.value as JsonRecord, ['sites', 'areas']) : []
        const sections = sectionsResult.status === 'fulfilled' ? asArray(sectionsResult.value as JsonRecord, ['sections', 'zones', 'items']) : []
        const nodes = nodesResult.status === 'fulfilled' ? asArray(nodesResult.value as JsonRecord, ['nodes', 'items']) : []
        const dashboardMap = new Map(dashboardAreas.map((area) => [areaId(area), area]))
        const managementMap = new Map(managementAreas.map((area) => [areaId(area), area]))
        const ids = new Set([...dashboardMap.keys(), ...managementMap.keys()].filter(Boolean))
        const normalized = [...ids].map((id): AreaRow => {
          const management = managementMap.get(id) || {}
          const dashboard = dashboardMap.get(id) || {}
          const dashboardSections = asArray(dashboard, ['zones', 'sections'])
          const managedSections = sections.filter((section) => sectionAreaId(section) === id)
          const areaSections = managedSections.length ? managedSections : dashboardSections
          const sectionIds = new Set(areaSections.map(sectionId).filter(Boolean))
          const areaNodes = nodes.filter((node) => nodeAreaId(node) === id || sectionIds.has(nodeSectionId(node)))
          const sectionCount = Number(management.sections ?? management.sectionCount ?? areaSections.length) || areaSections.length
          const nodeCount = Number(management.nodes ?? management.nodeCount ?? areaNodes.length) || areaNodes.length
          const reportingCount = areaNodes.filter(isReporting).length
          const health = dashboardHealth(dashboardSections, nodeCount, reportingCount)
          return {
            id,
            name: text(management.name || dashboard.name || id, 'Unnamed area'),
            kind: text(management.kind || dashboard.kind || management.type || dashboard.type, 'Growing area'),
            location: text(management.location || dashboard.location),
            createdAt: text(management.created_at || management.createdAt),
            sections: areaSections,
            nodes: areaNodes,
            sectionCount,
            nodeCount,
            reportingCount,
            ...health,
          }
        })
        setAreas(normalized)
        setExpandedId((current) => current && normalized.some((area) => area.id === current) ? current : null)
        setStatus('ready')
      } catch (loadError) {
        if (cancelled) return
        setStatus('error')
        setError(errorMessage(loadError, 'Areas could not be loaded.'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [location.pathname, refreshToken])

  useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuId])

  const summary = useMemo(() => ({
    sections: areas.reduce((sum, area) => sum + area.sectionCount, 0),
    nodes: areas.reduce((sum, area) => sum + area.nodeCount, 0),
    attention: areas.filter((area) => area.health === 'attention' || area.health === 'critical').length,
  }), [areas])

  const visibleAreas = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return areas
      .filter((area) => healthFilter === 'all' || area.health === healthFilter)
      .filter((area) => !needle || `${area.name} ${area.kind} ${area.location}`.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === 'health') return healthPriority[left.health] - healthPriority[right.health] || left.name.localeCompare(right.name)
        if (sort === 'sections') return right.sectionCount - left.sectionCount || left.name.localeCompare(right.name)
        if (sort === 'nodes') return right.nodeCount - left.nodeCount || left.name.localeCompare(right.name)
        return left.name.localeCompare(right.name)
      })
  }, [areas, healthFilter, query, sort])

  function openCreate() {
    setModalError('')
    setEditor({ mode: 'create', name: '', kind: 'Greenhouse', location: '' })
  }

  function openEdit(area: AreaRow) {
    setMenuId(null)
    setModalError('')
    setEditor({ mode: 'edit', id: area.id, name: area.name, kind: area.kind, location: area.location })
  }

  async function saveArea(event: FormEvent) {
    event.preventDefault()
    if (!editor || !editor.name.trim()) return
    setBusy(true)
    setModalError('')
    try {
      const payload = { name: editor.name.trim(), kind: editor.kind, location: editor.location.trim() }
      if (editor.mode === 'edit' && editor.id) await neurocropApi.updateArea(editor.id, payload)
      else {
        await neurocropApi.createArea(payload)
        notifyWorkspaceStructureChanged()
      }
      setFeedback({ tone: 'success', message: editor.mode === 'edit' ? 'Area updated.' : 'Area created.' })
      setEditor(null)
      setRefreshToken((value) => value + 1)
    } catch (saveError) {
      setModalError(errorMessage(saveError, 'Area could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteArea() {
    if (!deleteState) return
    setBusy(true)
    setModalError('')
    try {
      await neurocropApi.deleteArea(deleteState.id, { keepSections: deleteState.keepSections })
      setFeedback({ tone: 'success', message: deleteState.keepSections ? 'Area deleted. Its sections are now unassigned.' : 'Area and its sections were deleted.' })
      setDeleteState(null)
      setRefreshToken((value) => value + 1)
    } catch (deleteError) {
      setModalError(errorMessage(deleteError, 'Area could not be deleted.'))
    } finally {
      setBusy(false)
    }
  }

  function addSection(area: AreaRow) {
    navigate(`/sections?area=${encodeURIComponent(area.id)}&create=1`)
  }

  return <div className="nc-areas-page">
    <header className="nc-areas-head">
      <div><p>{tx("Workspace structure")}</p><h1>{tx("Areas")}</h1><span>{tx("Top-level monitored environments: greenhouses, fields, rooms, and trial facilities.")}</span></div>
      <button type="button" className="nc-areas-button primary" onClick={openCreate}><i className="fa-solid fa-plus" />{tx("Create area")}</button>
    </header>

    {feedback ? <div className={`nc-areas-feedback ${feedback.tone}`} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} /><span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)} aria-label={tx("Dismiss")}><i className="fa-solid fa-xmark" /></button></div> : null}

    <section className="nc-areas-summary" aria-label={tx("Area summary")}>
      <button type="button" className={healthFilter === 'all' ? 'active' : ''} onClick={() => setHealthFilter('all')}><strong>{areas.length}</strong><span>{tx("Active areas")}</span></button>
      <div><strong>{summary.sections}</strong><span>{tx("Sections")}</span></div>
      <div><strong>{summary.nodes}</strong><span>{tx("Sensor nodes")}</span></div>
      <button type="button" className={`attention ${healthFilter === 'attention' ? 'active' : ''}`} onClick={() => setHealthFilter(healthFilter === 'attention' ? 'all' : 'attention')}><strong>{summary.attention}</strong><span>{tx("Need attention")}</span></button>
    </section>

    <section className="nc-areas-register">
      <div className="nc-areas-toolbar">
        <label className="nc-areas-search"><span>{tx("Search areas")}</span><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Name, environment, location…")} />{query ? <button type="button" onClick={() => setQuery('')} aria-label={tx("Clear search")}><i className="fa-solid fa-xmark" /></button> : null}</label>
        <label><span>{tx("Health")}</span><select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}><option value="all">{tx("All health states")}</option><option value="stable">{tx("Stable")}</option><option value="attention">{tx("Watch")}</option><option value="critical">{tx("Action required")}</option><option value="unconfigured">{tx("Not configured")}</option></select></label>
        <label><span>{tx("Sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="name">{tx("Name A–Z")}</option><option value="health">{tx("Health priority")}</option><option value="sections">{tx("Most sections")}</option><option value="nodes">{tx("Most nodes")}</option></select></label>
      </div>

      {status === 'loading' ? <div className="nc-areas-loading" aria-busy="true"><span /><span /><span /></div> : null}
      {status === 'error' ? <div className="nc-areas-empty"><i className="fa-solid fa-triangle-exclamation" /><h2>{tx("Areas could not be loaded")}</h2><p>{error}</p><button type="button" onClick={() => setRefreshToken((value) => value + 1)}>{tx("Try again")}</button></div> : null}
      {status === 'ready' && !areas.length ? <div className="nc-areas-empty"><i className="fa-solid fa-map-location-dot" /><h2>{tx("Create your first area")}</h2><p>{tx("An area groups sections and nodes into one monitored environment.")}</p><button type="button" onClick={openCreate}>{tx("Create area")}</button></div> : null}
      {status === 'ready' && areas.length && !visibleAreas.length ? <div className="nc-areas-empty compact"><i className="fa-solid fa-filter-circle-xmark" /><h2>{tx("No matching areas")}</h2><p>{tx("Clear the search or health filter to see the full directory.")}</p><button type="button" onClick={() => { setQuery(''); setHealthFilter('all') }}>{tx("Clear filters")}</button></div> : null}

      {status === 'ready' && visibleAreas.length ? <div className="nc-area-list">
        <div className="nc-area-list-head"><span>{tx("Area")}</span><span>{tx("Environment")}</span><span>{tx("Coverage")}</span><span>{tx("Health")}</span><span /></div>
        {visibleAreas.map((area) => <article className={expandedId === area.id ? 'expanded' : ''} key={area.id}>
          <div className="nc-area-row">
            <button type="button" className="nc-area-name" onClick={() => setExpandedId(expandedId === area.id ? null : area.id)} aria-expanded={expandedId === area.id}>
              <span className="nc-area-glyph"><i className={`fa-solid ${kindIcon(area.kind)}`} /></span>
              <span><strong>{area.name}</strong><small>{area.location ||tx("Location not specified")}</small></span>
              <i className={`fa-solid fa-chevron-${expandedId === area.id ? 'up' : 'down'}`} />
            </button>
            <span className="nc-area-kind">{area.kind}</span>
            <span className="nc-area-coverage"><strong>{area.sectionCount} {tx("sections")}</strong><small>{area.nodeCount} {tx("nodes ·")} {area.reportingCount} {tx("reporting")}</small></span>
            <span className="nc-area-health">{area.score !== null ? <b>{area.score}</b> : <b>—</b>}<i data-health={area.health}>{healthCopy(area.health)}</i></span>
            <div className="nc-area-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); setMenuId(menuId === area.id ? null : area.id) }} aria-label={`Actions for ${area.name}`} aria-expanded={menuId === area.id}><i className="fa-solid fa-ellipsis-vertical" /></button>
              {menuId === area.id ? <div onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => openEdit(area)}><i className="fa-solid fa-pen" />{tx("Edit area")}</button>
                <button type="button" onClick={() => addSection(area)}><i className="fa-solid fa-plus" />{tx("Add section")}</button>
                {greenhouseMapBeta ? <button type="button" onClick={() => navigate(`/area-map?area=${encodeURIComponent(area.id)}`)}><i className="fa-solid fa-draw-polygon" />{tx("Open Area Map")} <small>{tx("Beta")}</small></button> : null}
                <button type="button" onClick={() => navigate('/nodes')}><i className="fa-solid fa-microchip" />{tx("Manage nodes")}</button>
                <button type="button" className="danger" onClick={() => { setMenuId(null); setModalError(''); setDeleteState({ id: area.id, name: area.name, sectionCount: area.sectionCount, keepSections: true }) }}><i className="fa-solid fa-trash" />{tx("Delete area")}</button>
              </div> : null}
            </div>
          </div>
          {expandedId === area.id ? <div className="nc-area-detail">
            <div><p>{tx("Environment")}</p><strong>{area.kind}</strong><span>{area.location ||tx("No location details added")}</span></div>
            <div><p>{tx("Coverage")}</p><strong>{area.sectionCount} {tx("sections ·")} {area.nodeCount} {tx("nodes")}</strong><span>{area.nodeCount ? `${area.reportingCount} of ${area.nodeCount} nodes currently reporting` :tx("No hardware assigned yet")}</span></div>
            <div><p>{tx("Health")}</p><strong>{healthCopy(area.health)}{area.score !== null ? ` · ${area.score}/100` : ''}</strong><span>{area.health === 'stable' ?tx("All available signals are within expected state.") : area.health === 'unconfigured' ?tx("Add a section to begin monitoring.") :tx("Review sections and reporting hardware.")}</span></div>
            <nav><button type="button" onClick={() => addSection(area)}><i className="fa-solid fa-plus" />{tx("Add section")}</button>{greenhouseMapBeta ? <button type="button" onClick={() => navigate(`/area-map?area=${encodeURIComponent(area.id)}`)}><i className="fa-solid fa-draw-polygon" />{tx("Area Map")} <small>{tx("Beta")}</small></button> : null}<button type="button" onClick={() => navigate('/sections')}><i className="fa-solid fa-layer-group" />{tx("Open sections")}</button><button type="button" onClick={() => openEdit(area)}><i className="fa-solid fa-pen" />{tx("Edit area")}</button></nav>
          </div> : null}
        </article>)}
      </div> : null}
      {status === 'ready' && areas.length ? <footer><span>{tx("Showing")} {visibleAreas.length} {tx("of")} {areas.length} {tx("areas")}</span><span><i /> {tx("Stable")} <i /> {tx("Watch")} <i /> {tx("Action required")}</span></footer> : null}
    </section>

    {editor ? <div className="nc-areas-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null) }}><form className="nc-areas-modal" onSubmit={saveArea} role="dialog" aria-modal="true" aria-labelledby="nc-area-editor-title">
      <header><div><p>{editor.mode === 'create' ?tx("New environment") :tx("Area details")}</p><h2 id="nc-area-editor-title">{editor.mode === 'create' ?tx("Create area") :tx("Edit area")}</h2><span>{tx("Define the top-level location that will contain sections and sensor nodes.")}</span></div><button type="button" onClick={() => setEditor(null)} disabled={busy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header>
      {modalError ? <div className="nc-areas-modal-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{modalError}</div> : null}
      <div className="nc-areas-form">
        <label><span>{tx("Area name")}</span><input autoFocus required maxLength={120} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="e.g. North greenhouse" /></label>
        <label><span>{tx("Environment")}</span><select value={editor.kind} onChange={(event) => setEditor({ ...editor, kind: event.target.value })}>{areaKinds.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></label>
        <label><span>{tx("Location")}</span><input maxLength={180} value={editor.location} onChange={(event) => setEditor({ ...editor, location: event.target.value })} placeholder="e.g. Kaunas district · Building 2" /></label>
      </div>
      <footer><button type="button" className="nc-areas-button secondary" onClick={() => setEditor(null)} disabled={busy}>{tx("Cancel")}</button><button type="submit" className="nc-areas-button primary" disabled={busy || !editor.name.trim()}>{busy ?tx("Saving…") : editor.mode === 'create' ?tx("Create area") :tx("Save changes")}</button></footer>
    </form></div> : null}

    {deleteState ? <div className="nc-areas-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeleteState(null) }}><section className="nc-areas-modal danger" role="dialog" aria-modal="true" aria-labelledby="nc-area-delete-title">
      <header><div><p>{tx("Destructive action")}</p><h2 id="nc-area-delete-title">{tx("Delete “")}{deleteState.name}”?</h2><span>{tx("This removes the area from the workspace. Choose what happens to its sections.")}</span></div><button type="button" onClick={() => setDeleteState(null)} disabled={busy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header>
      {modalError ? <div className="nc-areas-modal-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{modalError}</div> : null}
      <div className="nc-area-delete-choice">
        {deleteState.sectionCount ? <><label><input type="radio" checked={deleteState.keepSections} onChange={() => setDeleteState({ ...deleteState, keepSections: true })} /><span><strong>{tx("Keep")} {deleteState.sectionCount} {tx("sections")}</strong><small>{tx("Sections become unassigned and can be moved to another area.")}</small></span></label><label><input type="radio" checked={!deleteState.keepSections} onChange={() => setDeleteState({ ...deleteState, keepSections: false })} /><span><strong>{tx("Delete area and sections")}</strong><small>{tx("This permanently removes all sections in the area.")}</small></span></label></> : <p>{tx("This area has no sections and can be safely removed.")}</p>}
      </div>
      <footer><button type="button" className="nc-areas-button secondary" onClick={() => setDeleteState(null)} disabled={busy}>{tx("Cancel")}</button><button type="button" className="nc-areas-button danger" onClick={deleteArea} disabled={busy}>{busy ?tx("Deleting…") :tx("Delete area")}</button></footer>
    </section></div> : null}
  </div>
}
