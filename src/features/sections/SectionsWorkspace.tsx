import { translateInterfaceText as tx } from '../../i18n'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ModalPortal } from '../../components/ModalPortal'
import { neurocropApi } from '../../services/api/neurocropApi'
import { useWorkspaceAccess } from '../../state/workspaceAccess'
import '../../styles/sections-workspace.css'

// Management payloads can contain both dashboard and API naming conventions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Readiness = 'ready' | 'attention' | 'unconfigured'
type ReadinessFilter = 'all' | Readiness
type SortMode = 'area' | 'name' | 'profile' | 'freshness'

type AreaOption = { id: string; name: string; kind: string; location: string }
type ProfileOption = { id: string; name: string; crop: string; stage: string }
type SectionRow = {
  id: string
  name: string
  areaId: string
  areaName: string
  profileId: string
  profileName: string
  hasProfile: boolean
  crop: string
  stage: string
  nodes: JsonRecord[]
  nodeCount: number
  reportingCount: number
  lastReceivedAt: string | null
  expectedIntervalSec: number
}
type EditorState = { mode: 'create' | 'edit'; id?: string; name: string; areaId: string; profileId: string }
type Feedback = { tone: 'success' | 'warning'; message: string } | null

function asArray<T = JsonRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function recordArray(payload: JsonRecord | null | undefined, keys: string[]) {
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

function number(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function areaIdentity(area: JsonRecord) {
  return text(area.id || area.areaId || area.area_id || area.siteId || area.site_id)
}

function areaName(area: JsonRecord) {
  return text(area.name || area.areaName || area.area_name || area.siteName || area.site_name || area.id, 'Unnamed area')
}

function profileIdentity(profile: JsonRecord) {
  return text(profile.id || profile.profileId || profile.profile_id || profile.key || profile.slug)
}

function sectionIdentity(section: JsonRecord) {
  return text(section.id || section.sectionId || section.section_id || section.zoneId || section.zone_id)
}

function sectionAreaId(section: JsonRecord) {
  return text(section.areaId || section.area_id || section.siteId || section.site_id || section.area?.id || section.site?.id)
}

function sectionProfileId(section: JsonRecord) {
  return text(section.profile?.id || section.profile || section.profileId || section.profile_id || section.cropProfile || section.crop_profile, 'default')
}

function nodeSectionId(node: JsonRecord) {
  return text(node.sectionId || node.section_id || node.zoneId || node.zone_id || node.section?.id || node.zone?.id)
}

function latestTimestamp(values: Array<unknown>) {
  const valid = values.map((value) => value ? new Date(String(value)).getTime() : NaN).filter(Number.isFinite)
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null
}

function ageSeconds(timestamp: string | null) {
  if (!timestamp) return null
  const time = new Date(timestamp).getTime()
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 1000) : null
}

function formatFreshness(section: SectionRow) {
  const age = ageSeconds(section.lastReceivedAt)
  if (age === null) return { label: 'No data', detail: 'Awaiting first packet', state: 'offline' as const }
  const expected = Math.max(30, section.expectedIntervalSec || 600)
  const state = age <= expected * 2.5 ? 'live' : age <= expected * 6 ? 'stale' : 'offline'
  const label = age < 60 ? `${Math.max(1, Math.round(age))} sec ago`
    : age < 3600 ? `${Math.round(age / 60)} min ago`
      : age < 86400 ? `${Math.round(age / 3600)} h ago` : `${Math.round(age / 86400)} d ago`
  return { label, detail: state === 'live' ? 'Current' : state === 'stale' ? 'Delayed' : 'Interrupted', state }
}

function readiness(section: SectionRow): Readiness {
  if (!section.hasProfile || section.nodeCount === 0) return 'unconfigured'
  if (section.reportingCount < section.nodeCount || formatFreshness(section).state !== 'live') return 'attention'
  return 'ready'
}

function readinessCopy(section: SectionRow) {
  const state = readiness(section)
  if (state === 'ready') return { label: 'Ready', detail: 'Profile, hardware and data aligned' }
  if (state === 'unconfigured') return { label: 'Not configured', detail: section.nodeCount ? 'Crop profile required' : 'No nodes assigned' }
  return { label: 'Needs attention', detail: section.reportingCount < section.nodeCount ? 'Hardware reporting gap' : 'Latest data is delayed' }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadCsv(rows: SectionRow[]) {
  const header = ['Area', 'Section', 'Crop profile', 'Assigned nodes', 'Reporting nodes', 'Latest data', 'Readiness']
  const body = rows.map((section) => [section.areaName, section.name, section.profileName, section.nodeCount, section.reportingCount, section.lastReceivedAt || '', readinessCopy(section).label])
  const blob = new Blob([[header, ...body].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'neurocrop-sections.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function SectionsWorkspace() {
  const navigate = useNavigate()
  const location = useLocation()
  const handledAreaCreate = useRef('')
  const handledContext = useRef('')
  const workspaceAccess = useWorkspaceAccess()
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [sections, setSections] = useState<SectionRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [modalError, setModalError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [query, setQuery] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [profileFilter, setProfileFilter] = useState('all')
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all')
  const [sort, setSort] = useState<SortMode>('area')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [collapsedAreas, setCollapsedAreas] = useState<string[] | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [bulkProfileOpen, setBulkProfileOpen] = useState(false)
  const [bulkProfileId, setBulkProfileId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.body.dataset.reactSectionsActive = 'true'
    return () => { delete document.body.dataset.reactSectionsActive }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const requestedAreaId = params.get('area') || ''
    const requestKey = params.get('create') === '1' ? location.search : ''
    if (!requestKey || handledAreaCreate.current === requestKey || !areas.some((area) => area.id === requestedAreaId) || !profiles.length) return
    handledAreaCreate.current = requestKey
    setAreaFilter(requestedAreaId)
    setModalError('')
    setEditor({ mode: 'create', name: '', areaId: requestedAreaId, profileId: profiles[0].id })
  }, [areas, location.search, profiles])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const requestedSectionId = params.get('section') || ''
    const requestedAreaId = params.get('area') || ''
    if (!requestedSectionId || handledContext.current === location.search) return
    const requestedSection = sections.find((section) => section.id === requestedSectionId)
    if (!requestedSection) return
    handledContext.current = location.search
    queueMicrotask(() => {
      setAreaFilter(requestedAreaId || requestedSection.areaId)
      setCollapsedAreas((current) => (current ?? areas.map((area) => area.id)).filter((id) => id !== requestedSection.areaId))
      setExpandedId(requestedSection.id)
    })
  }, [areas, location.search, sections])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus((current) => current === 'ready' ? current : 'loading')
      setError('')
      try {
        const [dashboardResult, areaResult, sectionResult, nodeResult, profileResult] = await Promise.allSettled([
          neurocropApi.getDashboard(), neurocropApi.getAreas(), neurocropApi.getSections(), neurocropApi.getNodes(), neurocropApi.getCropProfiles(),
        ])
        if (cancelled) return
        if (dashboardResult.status === 'rejected' && sectionResult.status === 'rejected') throw dashboardResult.reason
        const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value as JsonRecord : {}
        const areaPayload = areaResult.status === 'fulfilled' ? areaResult.value as JsonRecord : {}
        const sectionPayload = sectionResult.status === 'fulfilled' ? sectionResult.value as JsonRecord : {}
        const nodePayload = nodeResult.status === 'fulfilled' ? nodeResult.value as JsonRecord : {}
        const profilePayload = profileResult.status === 'fulfilled' ? profileResult.value as JsonRecord : {}

        const dashboardAreas = recordArray(dashboard, ['sites', 'areas'])
        const managementAreas = recordArray(areaPayload, ['areas', 'sites', 'items'])
        const areaMap = new Map<string, AreaOption>()
        ;[...dashboardAreas, ...managementAreas].forEach((area) => {
          const id = areaIdentity(area)
          if (!id) return
          areaMap.set(id, { id, name: areaName(area), kind: text(area.kind || area.type, 'Growing area'), location: text(area.location || area.siteName || area.site_name) })
        })

        const profileRows = recordArray(profilePayload, ['profiles', 'items']).map((profile): ProfileOption => {
          const id = profileIdentity(profile)
          return { id, name: text(profile.name || id, 'Unnamed profile'), crop: text(profile.crop || profile.cropName || profile.crop_name), stage: text(profile.stage || profile.growthStage || profile.growth_stage) }
        }).filter((profile) => profile.id)
        const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]))
        const nodes = recordArray(nodePayload, ['nodes', 'items'])
        const dashboardById = new Map<string, { area: JsonRecord; section: JsonRecord }>()
        dashboardAreas.forEach((area) => recordArray(area, ['zones', 'sections']).forEach((section) => {
          const id = sectionIdentity(section)
          if (id) dashboardById.set(id, { area, section })
        }))
        const managementSections = recordArray(sectionPayload, ['sections', 'zones', 'items'])
        const sourceSections = managementSections.length ? managementSections : [...dashboardById.values()].map((item) => item.section)
        const normalized = sourceSections.map((source): SectionRow | null => {
          const id = sectionIdentity(source)
          if (!id) return null
          const dashboardEntry = dashboardById.get(id)
          const merged = { ...(dashboardEntry?.section || {}), ...source }
          const areaId = sectionAreaId(merged) || areaIdentity(dashboardEntry?.area || {}) || 'unassigned'
          if (!areaMap.has(areaId)) areaMap.set(areaId, { id: areaId, name: text(merged.areaName || merged.area_name, 'Unassigned area'), kind: 'Growing area', location: '' })
          const profileId = sectionProfileId(merged)
          const profile = profileMap.get(profileId)
          const assignedNodes = nodes.filter((node) => nodeSectionId(node) === id)
          const embeddedNodes = asArray<JsonRecord>(merged.batteryNodes || merged.nodes)
          const sectionNodes = assignedNodes.length ? assignedNodes : embeddedNodes
          const explicitNodeCount = number(merged.nodeCount ?? merged.nodesCount ?? merged.nodes_count, sectionNodes.length)
          const latest = latestTimestamp([
            merged.lastReceivedAt, merged.last_received_at, merged.lastPayloadAt, merged.last_payload_at,
            ...sectionNodes.flatMap((node) => [node.lastReceivedAt, node.last_received_at, node.lastSeen, node.last_seen]),
          ])
          const expectedIntervalSec = Math.max(30, number(merged.expectedUplinkIntervalSec ?? merged.expected_uplink_interval_sec, 600))
          const temporary: SectionRow = {
            id, name: text(merged.name || id), areaId, areaName: areaMap.get(areaId)?.name || 'Unassigned area', profileId,
            profileName: profile?.name || text(merged.profileName || merged.profile_name, 'No profile'), hasProfile: Boolean(profile), crop: profile?.crop || '', stage: profile?.stage || '',
            nodes: sectionNodes, nodeCount: explicitNodeCount, reportingCount: 0, lastReceivedAt: latest, expectedIntervalSec,
          }
          const reporting = sectionNodes.filter((node) => {
            const nodeLatest = latestTimestamp([node.lastReceivedAt, node.last_received_at, node.lastSeen, node.last_seen])
            const nodeAge = ageSeconds(nodeLatest)
            const explicitOnline = node.active === true || ['online', 'active', 'healthy'].includes(text(node.status || node.state).toLowerCase())
            return nodeAge !== null ? nodeAge <= expectedIntervalSec * 6 : explicitOnline
          }).length
          temporary.reportingCount = number(merged.reportingCount ?? merged.onlineCount ?? merged.reporting_nodes, reporting)
          return temporary
        }).filter((section): section is SectionRow => Boolean(section))

        const nextAreas = [...areaMap.values()].sort((left, right) => left.name.localeCompare(right.name))
        setAreas(nextAreas)
        setCollapsedAreas((current) => current ?? nextAreas.map((area) => area.id))
        setProfiles(profileRows.sort((left, right) => left.name.localeCompare(right.name)))
        setSections(normalized)
        setSelectedIds((current) => current.filter((id) => normalized.some((section) => section.id === id)))
        setStatus('ready')
      } catch (loadError) {
        if (cancelled) return
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : 'Sections could not be loaded.')
      }
    }
    load()
    return () => { cancelled = true }
  }, [location.pathname, refreshToken])

  const counts = useMemo(() => ({
    total: sections.length,
    ready: sections.filter((section) => readiness(section) === 'ready').length,
    attention: sections.filter((section) => readiness(section) === 'attention').length,
    unconfigured: sections.filter((section) => readiness(section) === 'unconfigured').length,
  }), [sections])

  const filteredSections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sections.filter((section) => areaFilter === 'all' || section.areaId === areaFilter)
      .filter((section) => profileFilter === 'all' || section.profileId === profileFilter)
      .filter((section) => readinessFilter === 'all' || readiness(section) === readinessFilter)
      .filter((section) => !needle || `${section.name} ${section.areaName} ${section.profileName} ${section.crop} ${section.stage}`.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === 'name') return left.name.localeCompare(right.name)
        if (sort === 'profile') return left.profileName.localeCompare(right.profileName) || left.name.localeCompare(right.name)
        if (sort === 'freshness') return (ageSeconds(right.lastReceivedAt) ?? Infinity) - (ageSeconds(left.lastReceivedAt) ?? Infinity)
        return left.areaName.localeCompare(right.areaName) || left.name.localeCompare(right.name)
      })
  }, [areaFilter, profileFilter, query, readinessFilter, sections, sort])

  const areaGroups = areas.map((area) => ({ area, sections: filteredSections.filter((section) => section.areaId === area.id) })).filter((group) => group.sections.length)
  const visibleIds = filteredSections.map((section) => section.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function toggleAllVisible() {
    setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])])
  }

  function resetFilters() {
    setQuery(''); setAreaFilter('all'); setProfileFilter('all'); setReadinessFilter('all')
  }

  function openCreate() {
    setModalError('')
    setEditor({ mode: 'create', name: '', areaId: areaFilter !== 'all' ? areaFilter : areas[0]?.id || '', profileId: profiles[0]?.id || '' })
  }

  function openEdit(section: SectionRow) {
    setMenuId(null)
    setModalError('')
    setEditor({ mode: 'edit', id: section.id, name: section.name, areaId: section.areaId, profileId: section.profileId })
  }

  async function saveSection(event: FormEvent) {
    event.preventDefault()
    if (!editor || busy) return
    setBusy(true); setFeedback(null); setModalError('')
    try {
      const payload = { areaId: editor.areaId, name: editor.name.trim(), cropProfile: editor.profileId }
      if (editor.mode === 'edit' && editor.id) await neurocropApi.updateSection(editor.id, payload)
      else {
        await neurocropApi.createSection(payload)
        await workspaceAccess.refresh()
      }
      setFeedback({ tone: 'success', message: editor.mode === 'edit' ? 'Section updated.' : 'Section created.' })
      setEditor(null); setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setModalError(mutationError instanceof Error ? mutationError.message : 'Section could not be saved.')
    } finally { setBusy(false) }
  }

  async function duplicateSection(section: SectionRow) {
    if (busy) return
    setBusy(true); setMenuId(null); setFeedback(null)
    try {
      await neurocropApi.createSection({ areaId: section.areaId, name: `${section.name} copy`, cropProfile: section.profileId })
      setFeedback({ tone: 'success', message: `${section.name} duplicated.` }); setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setFeedback({ tone: 'warning', message: mutationError instanceof Error ? mutationError.message : 'Section could not be duplicated.' })
    } finally { setBusy(false) }
  }

  async function deleteSections() {
    if (!deleteIds.length || busy) return
    setBusy(true); setFeedback(null)
    try {
      await Promise.all(deleteIds.map((id) => neurocropApi.deleteSection(id)))
      await workspaceAccess.refresh()
      setFeedback({ tone: 'success', message: `${deleteIds.length} ${deleteIds.length === 1 ? 'section' : 'sections'} deleted.` })
      setDeleteIds([]); setSelectedIds([]); setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      await workspaceAccess.refresh()
      setFeedback({ tone: 'warning', message: mutationError instanceof Error ? mutationError.message : 'Not all sections could be deleted.' })
      setDeleteIds([])
      setRefreshToken((value) => value + 1)
    } finally { setBusy(false) }
  }

  async function assignBulkProfile(event: FormEvent) {
    event.preventDefault()
    if (!bulkProfileId || busy) return
    setBusy(true); setFeedback(null)
    try {
      const profile = profiles.find((item) => item.id === bulkProfileId)
      await Promise.all(selectedIds.map((id) => {
        const section = sections.find((item) => item.id === id)
        if (!section) return Promise.resolve()
        return neurocropApi.updateSection(id, { areaId: section.areaId, name: section.name, cropProfile: bulkProfileId })
      }))
      setFeedback({ tone: 'success', message: `${profile?.name || 'Crop profile'} assigned to ${selectedIds.length} sections.` })
      setBulkProfileOpen(false); setSelectedIds([]); setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setFeedback({ tone: 'warning', message: mutationError instanceof Error ? mutationError.message : 'Crop profile could not be assigned.' })
      setBulkProfileOpen(false)
    } finally { setBusy(false) }
  }

  return <main className="nc-sections-page">
    <header className="nc-sections-head">
      <div><p>{tx("Workspace structure")}</p><h1>{tx("Sections")}</h1><span>{tx("Organize growing zones, verify hardware coverage, and keep crop profiles assigned correctly.")}</span></div>
      <div><button type="button" className="nc-sections-button secondary" onClick={() => downloadCsv(filteredSections)} disabled={!filteredSections.length}><i className="fa-solid fa-download" />{tx("Export")}</button><button type="button" className="nc-sections-button primary" onClick={openCreate} disabled={!areas.length || !profiles.length}><i className="fa-solid fa-plus" />{tx("Create section")}</button></div>
    </header>

    <section className="nc-sections-summary" aria-label={tx("Section readiness summary")}>
      <div><strong>{counts.total}</strong><span>{tx("Active sections")}</span><small>{tx("Across")} {areas.length} {tx("areas")}</small></div>
      {(['ready', 'attention', 'unconfigured'] as const).map((state) => <button type="button" key={state} className={readinessFilter === state ? 'active' : ''} data-state={state} onClick={() => setReadinessFilter(readinessFilter === state ? 'all' : state)}><i /><strong>{counts[state]}</strong><span>{state === 'ready' ?tx("Ready") : state === 'attention' ?tx("Require attention") :tx("Not configured")}</span></button>)}
    </section>
    <p className="nc-sections-summary-note"><i className="fa-solid fa-circle-info" /><span><strong>{tx("Readiness is operational, not a growing score.")}</strong> {tx("It checks profile assignment, node coverage, and current data.")}</span></p>

    {feedback ? <div className="nc-sections-feedback" data-tone={feedback.tone} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} /><span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)} aria-label={tx("Dismiss")}><i className="fa-solid fa-xmark" /></button></div> : null}

    <section className="nc-sections-shell">
      <div className="nc-sections-command-bar">
        <div className="nc-sections-toolbar" data-obscured={selectedIds.length ? 'true' : undefined} aria-hidden={selectedIds.length ? true : undefined} inert={selectedIds.length ? true : undefined}>
          <label className="nc-sections-search"><span>{tx("Search sections")}</span><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Section, area or profile...")} />{query ? <button type="button" onClick={() => setQuery('')} aria-label={tx("Clear search")}><i className="fa-solid fa-xmark" /></button> : null}</label>
          <label><span>{tx("Area")}</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">{tx("All areas")}</option>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
          <label><span>{tx("Crop profile")}</span><select value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}><option value="all">{tx("All profiles")}</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
          <label><span>{tx("Sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="area">{tx("Area, then name")}</option><option value="name">{tx("Section name")}</option><option value="profile">{tx("Crop profile")}</option><option value="freshness">{tx("Oldest data first")}</option></select></label>
        </div>

        {selectedIds.length ? <div className="nc-sections-bulk"><strong>{selectedIds.length} {tx("selected")}</strong><button type="button" onClick={() => { setBulkProfileId(profiles[0]?.id || ''); setBulkProfileOpen(true) }}><i className="fa-solid fa-seedling" />{tx("Assign profile")}</button><button type="button" onClick={() => navigate('/nodes')}><i className="fa-solid fa-microchip" />{tx("Assign nodes")}</button><button type="button" className="danger" onClick={() => setDeleteIds(selectedIds)}><i className="fa-solid fa-trash" />{tx("Delete")}</button><button type="button" onClick={() => setSelectedIds([])}>{tx("Clear")}</button></div> : null}
      </div>

      {status === 'loading' ? <div className="nc-sections-loading" aria-busy="true"><span /><span /><span /><span /></div> : null}
      {status === 'error' ? <div className="nc-sections-empty"><i className="fa-solid fa-cloud-arrow-down" /><h2>{tx("Sections could not be loaded")}</h2><p>{error}</p><button type="button" onClick={() => setRefreshToken((value) => value + 1)}>{tx("Try again")}</button></div> : null}
      {status === 'ready' ? <div className="nc-section-register directory">
        <div className="nc-section-register-head directory"><label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label={tx("Select all visible sections")} /></label><span>{tx("Section")}</span><span>{tx("Crop profile")}</span><span>{tx("Assigned nodes")}</span><span>{tx("Latest data")}</span><span>{tx("Readiness")}</span><span /></div>
        {areaGroups.length ? areaGroups.map(({ area, sections: areaSections }) => {
          const collapsed = collapsedAreas?.includes(area.id) ?? true
          const readyCount = areaSections.filter((section) => readiness(section) === 'ready').length
          return <section className="nc-section-area" key={area.id}>
            <header><button type="button" onClick={() => setCollapsedAreas((current) => {
              const collapsedIds = current ?? areas.map((item) => item.id)
              return collapsedIds.includes(area.id) ? collapsedIds.filter((id) => id !== area.id) : [...collapsedIds, area.id]
            })}><i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'down'}`} /><span className="nc-section-area-icon"><i className="fa-solid fa-location-dot" /></span><span><strong>{area.name}</strong><small>{[area.kind, area.location].filter(Boolean).join(' · ')}</small></span><span>{areaSections.length} {tx("sections")}</span><span>{areaSections.reduce((sum, section) => sum + section.nodeCount, 0)} {tx("nodes")}</span><span>{readyCount}/{areaSections.length} {tx("ready")}</span></button></header>
            {!collapsed ? areaSections.map((section) => {
              const expanded = expandedId === section.id
              const fresh = formatFreshness(section)
              const ready = readinessCopy(section)
              return <article className={expanded ? 'expanded' : ''} key={section.id}>
                <div className="nc-section-row directory">
                  <label><input type="checkbox" checked={selectedIds.includes(section.id)} onChange={() => toggleSelected(section.id)} aria-label={`Select ${section.name}`} /></label>
                  <button type="button" className="nc-section-name" onClick={() => setExpandedId(expanded ? null : section.id)}><span data-state={readiness(section)}>{section.name.slice(0, 2).toUpperCase()}</span><span><strong>{section.name}</strong><small>{section.areaName}</small></span><i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`} /></button>
                  <div className="nc-section-profile"><strong>{section.profileName}</strong><small>{[section.crop, section.stage].filter(Boolean).join(' · ') ||tx("Crop evaluation profile")}</small></div><div className="nc-section-nodes"><strong>{section.nodeCount ? `${section.reportingCount}/${section.nodeCount} reporting` :tx("No nodes assigned")}</strong><span><i style={{ width: `${section.nodeCount ? Math.min(100, section.reportingCount / section.nodeCount * 100) : 0}%` }} /></span></div><div className="nc-section-freshness" data-state={fresh.state}><strong>{fresh.label}</strong><small>{fresh.detail}</small></div><span className="nc-section-status" data-state={readiness(section)}><i />{ready.label}</span>
                  <div className="nc-section-actions"><button type="button" aria-label={`Actions for ${section.name}`} onClick={() => setMenuId(menuId === section.id ? null : section.id)}><i className="fa-solid fa-ellipsis" /></button>{menuId === section.id ? <div><button type="button" onClick={() => openEdit(section)}><i className="fa-solid fa-pen" />{tx("Edit details")}</button><button type="button" onClick={() => navigate('/nodes')}><i className="fa-solid fa-microchip" />{tx("Assign nodes")}</button><button type="button" onClick={() => duplicateSection(section)}><i className="fa-regular fa-copy" />{tx("Duplicate")}</button><button type="button" className="danger" onClick={() => { setMenuId(null); setDeleteIds([section.id]) }}><i className="fa-solid fa-trash" />{tx("Delete")}</button></div> : null}</div>
                </div>
                {expanded ? <div className="nc-section-detail"><div><p>{tx("Section identity")}</p><dl><div><dt>{tx("Physical area")}</dt><dd>{section.areaName}</dd></div><div><dt>{tx("Crop profile")}</dt><dd>{section.profileName}</dd></div><div><dt>{tx("Section ID")}</dt><dd>{section.id}</dd></div></dl></div><div><p>{tx("Hardware assignment")}</p><dl><div><dt>{tx("Assigned nodes")}</dt><dd>{section.nodeCount}</dd></div><div><dt>{tx("Currently reporting")}</dt><dd>{section.reportingCount}</dd></div><div><dt>{tx("Data state")}</dt><dd>{fresh.detail}</dd></div></dl></div><div><p>{tx("Quick actions")}</p><nav><button type="button" onClick={() => openEdit(section)}><i className="fa-solid fa-pen" />{tx("Edit section")}</button><button type="button" onClick={() => navigate('/nodes')}><i className="fa-solid fa-microchip" />{tx("Manage nodes")}</button><button type="button" onClick={() => navigate('/readings')}><i className="fa-solid fa-wave-square" />{tx("Open readings")}</button></nav></div></div> : null}
              </article>
            }) : null}
          </section>
        }) : <div className="nc-sections-empty"><i className="fa-solid fa-filter-circle-xmark" /><h2>{tx("No sections match this view")}</h2><p>{tx("Clear one or more filters, or create a new section.")}</p><button type="button" onClick={resetFilters}>{tx("Reset filters")}</button></div>}
        <footer><span>{tx("Showing")} <strong>{filteredSections.length}</strong> {tx("of")} {sections.length} {tx("sections")}</span></footer>
      </div> : null}
    </section>

    {editor ? <ModalPortal><div className="nc-sections-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditor(null) }}><form className="nc-sections-modal" onSubmit={saveSection} role="dialog" aria-modal="true" aria-labelledby="nc-section-editor-title"><header><div><p>{editor.mode === 'create' ?tx("New growing zone") :tx("Section details")}</p><h2 id="nc-section-editor-title">{editor.mode === 'create' ?tx("Create section") :tx("Edit section")}</h2><span>{tx("Define where this section belongs and which profile evaluates its readings.")}</span></div><button type="button" onClick={() => setEditor(null)} disabled={busy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header>{modalError ? <div className="nc-sections-modal-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{modalError}</div> : null}<div className="nc-sections-form"><label><span>{tx("Section name")}</span><input required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="e.g. Tomato block A · Rear" /></label><label><span>{tx("Area")}</span><select required value={editor.areaId} onChange={(event) => setEditor({ ...editor, areaId: event.target.value })}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label><label><span>{tx("Crop profile")}</span><select required value={editor.profileId} onChange={(event) => setEditor({ ...editor, profileId: event.target.value })}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label></div><aside><i className="fa-solid fa-circle-info" /><span><strong>{tx("Hardware is assigned separately.")}</strong>{tx("A section is ready only after applicable nodes provide current data.")}</span></aside><footer><button type="button" className="nc-sections-button secondary" onClick={() => setEditor(null)} disabled={busy}>{tx("Cancel")}</button><button type="submit" className="nc-sections-button primary" disabled={busy || !editor.name.trim() || !editor.areaId || !editor.profileId}>{busy ?tx("Saving…") : editor.mode === 'create' ?tx("Create section") :tx("Save changes")}</button></footer></form></div></ModalPortal> : null}

    {bulkProfileOpen ? <ModalPortal><div className="nc-sections-modal-backdrop"><form className="nc-sections-modal compact" onSubmit={assignBulkProfile} role="dialog" aria-modal="true" aria-labelledby="nc-bulk-profile-title"><header><div><p>{tx("Bulk update")}</p><h2 id="nc-bulk-profile-title">{tx("Assign crop profile")}</h2><span>{tx("The selected profile will evaluate all")} {selectedIds.length} {tx("selected sections.")}</span></div><button type="button" onClick={() => setBulkProfileOpen(false)} disabled={busy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header><div className="nc-sections-form"><label><span>{tx("Crop profile")}</span><select required value={bulkProfileId} onChange={(event) => setBulkProfileId(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label></div><footer><button type="button" className="nc-sections-button secondary" onClick={() => setBulkProfileOpen(false)} disabled={busy}>{tx("Cancel")}</button><button type="submit" className="nc-sections-button primary" disabled={busy || !bulkProfileId}>{busy ?tx("Assigning…") :tx("Assign profile")}</button></footer></form></div></ModalPortal> : null}

    {deleteIds.length ? <ModalPortal><div className="nc-sections-modal-backdrop"><div className="nc-sections-modal compact danger" role="alertdialog" aria-modal="true" aria-labelledby="nc-delete-sections-title"><header><div><p>{tx("Permanent action")}</p><h2 id="nc-delete-sections-title">{tx("Delete")} {deleteIds.length === 1 ?tx("section") : `${deleteIds.length} sections`}?</h2><span>{tx("Only sections without assigned nodes can be deleted. Move or remove their nodes first; retained node measurements follow the backend retention policy.")}</span></div><button type="button" onClick={() => setDeleteIds([])} disabled={busy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header><aside><i className="fa-solid fa-triangle-exclamation" /><span><strong>{tx("This action cannot be undone here.")}</strong>{tx("Confirm only after checking the selected sections.")}</span></aside><footer><button type="button" className="nc-sections-button secondary" onClick={() => setDeleteIds([])} disabled={busy}>{tx("Cancel")}</button><button type="button" className="nc-sections-button danger" onClick={deleteSections} disabled={busy}>{busy ?tx("Deleting…") :tx("Delete permanently")}</button></footer></div></div></ModalPortal> : null}
  </main>
}
