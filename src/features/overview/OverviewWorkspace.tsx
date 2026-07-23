import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { neurocropApi } from '../../services/api/neurocropApi'
import TopographicField from './TopographicField'

// Dashboard payloads intentionally remain open because firmware and API versions
// can add telemetry fields without requiring an Overview release.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Tone = 'action' | 'watch' | 'good' | 'unknown'
type LoadState = 'loading' | 'ready' | 'empty' | 'error'

type OverviewRow = {
  id: string
  name: string
  crop: string
  status: string
  detail: string
  updated: string
  tone: Tone
  score: number | null
  metricKey: string
  metricLabel: string
  currentValue: number | null
  target: [number, number] | null
  unit: string
  deviation: number | null
  duration: string
  direction: 'above' | 'below' | 'inside' | 'unknown'
  reporting: string
}

type OverviewModel = {
  areaId: string
  areaName: string
  rows: OverviewRow[]
  actions: JsonRecord[]
  priority: JsonRecord | null
  reporting: string
  updated: string
  growingScore: number | null
}

type TrendPoint = {
  observedAt: string
  value: number
}

const demoDashboard = {
  sites: [
    {
      id: 'greenhouse-1',
      name: 'Greenhouse No. 1',
      zones: [
        { id: 'tomato-a-back', name: 'Tomato Block A, Rear', profile: 'Tomato · Vegetative', score: 78, conditionStatus: 'warning', sensorCount: 4 },
        { id: 'lettuce-rack-under', name: 'Lettuce Rack, Under Shelf', profile: 'Lettuce · Intensive growth', score: 86, conditionStatus: 'watch', sensorCount: 5 },
        { id: 'tomato-a-front', name: 'Tomato Block A, Front', profile: 'Tomato · Vegetative', score: 94, conditionStatus: 'optimal', sensorCount: 3 },
      ],
    },
    {
      id: 'greenhouse-2',
      name: 'Greenhouse No. 2',
      zones: [
        { id: 'strawberry-north', name: 'Strawberry · North', profile: 'Fruiting', score: 94, conditionStatus: 'optimal', sensorCount: 4 },
        { id: 'strawberry-south', name: 'Strawberry · South', profile: 'Fruiting', score: 92, conditionStatus: 'optimal', sensorCount: 3 },
        { id: 'lettuce-west', name: 'Lettuce · West bench', profile: 'Intensive growth', score: 96, conditionStatus: 'optimal', sensorCount: 3 },
      ],
    },
    {
      id: 'north-field',
      name: 'North field trial',
      zones: [
        { id: 'basil-north', name: 'Basil · North bed', profile: 'Profile not assigned', score: null, conditionStatus: 'unknown', sensorCount: 2 },
        { id: 'basil-south', name: 'Basil · South bed', profile: 'Vegetative', score: 88, conditionStatus: 'optimal', sensorCount: 2 },
      ],
    },
  ],
}

const demoActions = [{
  id: 'tomato-a-back:soilMoisture:low',
  areaId: 'greenhouse-1',
  areaName: 'Greenhouse No. 1',
  sectionId: 'tomato-a-back',
  sectionName: 'Tomato Block A, Rear',
  metricId: 'soilMoisture',
  metricLabel: 'Substrate moisture',
  value: 42,
  unit: '%',
  target: [45, 60],
  title: 'Check the rear irrigation line.',
  reason: 'Moisture is below target and has fallen 4 percentage points in 3 hours.',
  recommendedAction: 'Check rear valve and dripper line.',
  confidence: 'high',
  observedAt: new Date().toISOString(),
}]

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value : []
}

function readSelectedAreaId() {
  try {
    const stored = JSON.parse(localStorage.getItem('neurocrop-active-context-v1') || 'null')
    const scope = stored?.lastScopeKey
    return String(stored?.contexts?.[scope]?.siteId || stored?.siteId || '')
  } catch {
    return ''
  }
}

function statusTone(value: unknown): Tone {
  const status = String(value || '').toLowerCase()
  if (status.includes('critical') || status.includes('action') || status.includes('danger') || status.includes('alarm')) return 'action'
  if (status.includes('warning') || status.includes('watch') || status.includes('attention') || status.includes('stale')) return 'watch'
  if (status.includes('optimal') || status.includes('stable') || status.includes('healthy')) return 'good'
  return 'unknown'
}

function relativeTime(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return 'Current'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds} sec ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)} h ago`
}

function normalizeUnit(value: unknown) {
  const unit = String(value || '').trim()
  if (/^(degc|°c|celsius)$/i.test(unit)) return '°C'
  if (/^(degf|°f|fahrenheit)$/i.test(unit)) return '°F'
  return unit
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function unitSuffix(unit: string) {
  return unit === '%' ? '%' : unit ? ` ${unit}` : ''
}

function formatMeasurement(value: number | null, unit: string) {
  if (value === null) return '—'
  return `${formatNumber(value)}${unitSuffix(unit)}`
}

function formatDeviation(value: number | null, direction: OverviewRow['direction'], unit: string) {
  if (value === null || direction === 'unknown') return '—'
  if (direction === 'inside') return 'Inside target'
  return `${formatMeasurement(Math.abs(value), unit)} ${direction} target`
}

function targetRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const minimum = Number(value[0])
  const maximum = Number(value[1])
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? [minimum, maximum] : null
}

function formatTarget(target: [number, number] | null, unit: string) {
  if (!target) return 'Target not set'
  return `Target ${formatNumber(target[0])}–${formatNumber(target[1])}${unitSuffix(unit)}`
}

function deviationFromTarget(value: number | null, target: [number, number] | null) {
  if (value === null || !target) return null
  if (value > target[1]) return value - target[1]
  if (value < target[0]) return value - target[0]
  return 0
}

function formatDuration(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return 'Duration unavailable'
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}

function profileLabel(zone: JsonRecord) {
  const value = String(zone.profileName || zone.profile || zone.cropProfileName || '')
  return value && !value.includes('-') ? value : 'Active crop profile'
}

function buildModel(dashboard: JsonRecord, actionPayload: JsonRecord, selectedAreaId: string): OverviewModel | null {
  const sites = asArray(dashboard?.sites)
  if (!sites.length) return null
  const actions = asArray(actionPayload?.actions).filter((action) => action.feedback?.status !== 'completed')
  const priorityAreaId = String(actions[0]?.areaId || '')
  const site = sites.find((item) => String(item.id) === selectedAreaId)
    || sites.find((item) => String(item.id) === priorityAreaId)
    || sites[0]
  const areaActions = actions.filter((action) => String(action.areaId) === String(site.id))
  const actionBySection = new Map(areaActions.map((action) => [String(action.sectionId), action]))
  const zones = asArray(site.zones)
  const rows = zones.map((zone): OverviewRow => {
    const action = actionBySection.get(String(zone.id))
    const tone = action ? 'action' : statusTone(zone.conditionStatus)
    const score = Number.isFinite(Number(zone.score)) ? Number(zone.score) : null
    const numericValue = Number(action?.value)
    const currentValue = Number.isFinite(numericValue) ? numericValue : null
    const unit = normalizeUnit(action?.unit)
    const target = targetRange(action?.target)
    const deviation = deviationFromTarget(currentValue, target)
    const direction = deviation === null ? 'unknown' : deviation > 0 ? 'above' : deviation < 0 ? 'below' : 'inside'
    const metricLabel = String(action?.metricLabel || 'Condition')
    const reportingNodes = Number(zone.nodeSummary?.reporting || zone.sensorCount || 0)
    const totalNodes = Number(zone.nodeSummary?.registered || zone.sensorCount || 0)
    return {
      id: String(zone.id),
      name: String(zone.name || 'Unnamed Section'),
      crop: profileLabel(zone),
      status: tone === 'action' ? 'Needs action' : tone === 'watch' ? 'Watch' : tone === 'good' ? 'Inside target' : 'Not verified',
      detail: action
        ? `${metricLabel} ${formatMeasurement(currentValue, unit)} · ${formatTarget(target, unit)}`
        : tone === 'good'
          ? 'Current conditions normal'
          : tone === 'watch'
            ? 'A current condition is outside its target range'
            : 'Current data or crop target is incomplete',
      updated: relativeTime(action?.observedAt || zone.computedAt),
      tone,
      score,
      metricKey: String(action?.metricId || action?.metricKey || ''),
      metricLabel,
      currentValue,
      target,
      unit,
      deviation,
      duration: action ? formatDuration(action.outsideTargetSince || action.startedAt || action.firstObservedAt || action.observedAt) : '',
      direction,
      reporting: `${reportingNodes} of ${totalNodes} nodes reporting`,
    }
  }).sort((left, right) => ['action', 'watch', 'unknown', 'good'].indexOf(left.tone) - ['action', 'watch', 'unknown', 'good'].indexOf(right.tone))

  const reportingNodes = zones.reduce((sum, zone) => sum + Number(zone.nodeSummary?.reporting || zone.sensorCount || 0), 0)
  const totalNodes = zones.reduce((sum, zone) => sum + Number(zone.nodeSummary?.registered || zone.sensorCount || 0), 0)
  const availableScores = rows.map((row) => row.score).filter((score): score is number => score !== null)
  return {
    areaId: String(site.id),
    areaName: String(site.name || 'Growing Area'),
    rows,
    actions: areaActions,
    priority: areaActions[0] || null,
    reporting: `${reportingNodes} of ${totalNodes} nodes reporting`,
    updated: relativeTime(areaActions[0]?.observedAt || zones[0]?.computedAt),
    growingScore: availableScores.length
      ? Math.round(availableScores.reduce((sum, score) => sum + score, 0) / availableScores.length)
      : null,
  }
}

function MiniTrend({ points, target, unit }: {
  points: TrendPoint[]
  target: [number, number] | null
  unit: string
}) {
  if (points.length < 2) return <div className="nc-evidence-trend-empty">24-hour history is not available for this metric.</div>
  const width = 360
  const height = 112
  const padding = 10
  const values = points.map((point) => point.value)
  if (target) values.push(...target)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = Math.max(maximum - minimum, 1)
  const x = (index: number) => padding + index * (width - padding * 2) / (points.length - 1)
  const y = (value: number) => padding + (maximum - value) / range * (height - padding * 2)
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`
  const targetTop = target ? y(target[1]) : 0
  const targetHeight = target ? Math.max(2, y(target[0]) - targetTop) : 0
  const latest = points[points.length - 1]

  return <div className="nc-evidence-trend">
    <div><span>24-hour trend</span><strong>{formatMeasurement(latest.value, unit)}</strong></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`24-hour trend ending at ${formatMeasurement(latest.value, unit)}`}>
      {target ? <rect x={padding} y={targetTop} width={width - padding * 2} height={targetHeight} rx="4" /> : null}
      <polygon points={area} />
      <polyline points={line} />
      <circle cx={x(points.length - 1)} cy={y(latest.value)} r="4" />
    </svg>
    <footer><span>24h ago</span><span>Now</span></footer>
  </div>
}

function EvidenceDrawer({ model, row, onClose }: {
  model: OverviewModel
  row: OverviewRow | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [trendState, setTrendState] = useState<'idle' | 'loading' | 'ready' | 'empty'>(
    row && row.metricKey ? 'loading' : 'idle',
  )
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const sectionAction = row
    ? model.actions.find((action) => String(action.sectionId) === row.id)
    : null
  const conclusion = row
    ? row.status
    : model.priority ? model.priority.title : `All ${model.rows.length} Sections are stable.`
  const evidence = row
    ? row.detail
    : model.priority?.reason || 'Every Section is inside its current crop-profile target range.'
  const score = row ? row.score : model.growingScore

  useEffect(() => {
    if (!row || !sectionAction || !row.metricKey) return
    let active = true
    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
    const request = neurocropApi.isConnected()
      ? neurocropApi.getHistory({
          sectionId: row.id,
          metric: row.metricKey,
          from: from.toISOString(),
          to: to.toISOString(),
          stepMinutes: 60,
        })
      : Promise.resolve({
          points: Array.from({ length: 13 }, (_, index) => ({
            observedAt: new Date(from.getTime() + index * 2 * 60 * 60 * 1000).toISOString(),
            value: (() => {
              const current = row.currentValue ?? row.target?.[1] ?? 20
              const start = row.target ? (row.target[0] + row.target[1]) / 2 : current
              const progress = index / 12
              return start + (current - start) * progress + Math.sin(progress * Math.PI) * .35
            })(),
          })),
        })
    request.then((payload) => {
      if (!active) return
      const points = asArray((payload as JsonRecord)?.points)
        .map((point) => ({
          observedAt: String(point.observedAt || point.receivedAt || ''),
          value: Number(point.value),
        }))
        .filter((point) => point.observedAt && Number.isFinite(point.value))
      setTrendPoints(points)
      setTrendState(points.length >= 2 ? 'ready' : 'empty')
    }).catch(() => {
      if (!active) return
      setTrendPoints([])
      setTrendState('empty')
    })
    return () => { active = false }
  }, [row, sectionAction])

  function openTrends() {
    onClose()
    if (row?.metricKey) {
      sessionStorage.setItem('neurocrop-pending-trend', JSON.stringify({
        areaId: model.areaId,
        sectionId: row.id,
        metricKey: row.metricKey,
      }))
    }
    navigate('/history')
  }

  function openSection() {
    onClose()
    navigate('/sections')
  }

  return <div className="nc-overview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="nc-overview-drawer" role="dialog" aria-modal="true" aria-labelledby="overview-evidence-title">
      <header>
        <div><span>{row ? 'Section evidence' : 'Area evidence'}</span><h2 id="overview-evidence-title">{row?.name || model.areaName}</h2>{row ? <p>{model.areaName}</p> : null}</div>
        <button type="button" onClick={onClose} aria-label="Close evidence"><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-evidence-summary">
        <span>Current conclusion</span>
        <strong>{conclusion}</strong>
        <p>{evidence}</p>
      </section>
      {row && sectionAction ? <section className="nc-evidence-metrics">
        <div><span>Current</span><strong>{formatMeasurement(row.currentValue, row.unit)}</strong></div>
        <div><span>Target</span><strong>{row.target ? `${formatNumber(row.target[0])}–${formatNumber(row.target[1])}${unitSuffix(row.unit)}` : 'Not set'}</strong></div>
        <div data-tone={row.tone}><span>Deviation</span><strong>{formatDeviation(row.deviation, row.direction, row.unit)}</strong></div>
        <div><span>Outside target for</span><strong>{row.duration}</strong></div>
      </section> : null}
      {row && sectionAction
        ? trendState === 'loading'
          ? <div className="nc-evidence-trend-empty loading">Loading 24-hour trend…</div>
          : <MiniTrend points={trendPoints} target={row.target} unit={row.unit} />
        : null}
      <dl>
        <div><dt>7-day Growing Score</dt><dd>{score === null ? 'Not available' : `${score} / 100`}</dd></div>
        {row ? <div><dt>Crop profile</dt><dd>{row.crop}</dd></div> : null}
        <div><dt>Data confidence</dt><dd>{row?.reporting || model.reporting} · updated {row?.updated || model.updated}</dd></div>
      </dl>
      <footer>
        <button type="button" onClick={openSection}>Open Section</button>
        <button type="button" className="primary" onClick={openTrends}>Open Trends <i className="fa-solid fa-arrow-right" /></button>
      </footer>
    </aside>
  </div>
}

function ActionWorkflow({ action, onClose, onSubmitted }: {
  action: JsonRecord
  onClose: () => void
  onSubmitted: () => void
}) {
  const [assignee, setAssignee] = useState('Me')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'open' | 'in-progress' | 'submitting' | 'checked'>(
    action.feedback?.status === 'completed' ? 'checked' : 'open',
  )
  const [error, setError] = useState('')

  async function completeAction() {
    if (status === 'open') {
      setStatus('in-progress')
      return
    }
    if (status === 'checked') return
    setStatus('submitting')
    setError('')
    try {
      if (neurocropApi.isConnected()) {
        await neurocropApi.submitTodayActionFeedback(String(action.id), {
          status: 'completed',
          note,
          executionDetails: { type: 'equipment_checked', adjustment: action.recommendedAction || 'Checked equipment', durationMinutes: null },
          action,
        })
      }
      setStatus('checked')
      onSubmitted()
    } catch (reason) {
      setStatus('in-progress')
      setError(reason instanceof Error ? reason.message : 'The result could not be saved.')
    }
  }

  return <div className="nc-overview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="nc-overview-drawer nc-action-drawer" role="dialog" aria-modal="true" aria-labelledby="overview-action-title">
      <header>
        <div><span className={`nc-workflow-status ${status}`}><i />{status === 'checked' ? 'Checked' : status === 'open' ? 'Ready to start' : 'In progress'}</span><h2 id="overview-action-title">{action.title}</h2><p>{action.areaName} · {action.sectionName}</p></div>
        <button type="button" onClick={onClose} aria-label="Close action"><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-action-brief">
        <span>Why this matters</span>
        <p>{action.reason}</p>
        <div><strong>Recommended check</strong><p>{action.recommendedAction}</p></div>
      </section>
      <section className="nc-action-form">
        <label><span>Assigned to</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option>Me</option><option>Grower on duty</option><option>Technician</option></select></label>
        <label><span>Result note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you find or change?" maxLength={500} /></label>
        {error ? <p className="nc-action-error" role="alert">{error}</p> : null}
      </section>
      <footer>
        <button type="button" onClick={onClose}>Cancel</button>
        <button className={`primary ${status}`} type="button" onClick={completeAction} disabled={status === 'submitting'}>
          {status === 'open' ? 'Start check' : status === 'checked' ? 'Checked' : status === 'submitting' ? 'Saving…' : 'Mark as checked'}
        </button>
      </footer>
    </aside>
  </div>
}

export default function OverviewWorkspace() {
  const [dashboard, setDashboard] = useState<JsonRecord | null>(null)
  const [actions, setActions] = useState<JsonRecord | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState(readSelectedAreaId)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<OverviewRow | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const updateContext = (event: Event) => {
      const detail = (event as CustomEvent<{ siteId?: string }>).detail
      setSelectedAreaId(String(detail?.siteId || readSelectedAreaId()))
    }
    window.addEventListener('neurocrop:context-change', updateContext)
    return () => window.removeEventListener('neurocrop:context-change', updateContext)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all(neurocropApi.isConnected()
      ? [neurocropApi.getDashboard(), neurocropApi.getTodayActions()]
      : [Promise.resolve(demoDashboard), Promise.resolve({ actions: demoActions })])
      .then(([nextDashboard, nextActions]) => {
        if (!active) return
        setDashboard(nextDashboard as JsonRecord)
        setActions(nextActions as JsonRecord)
        setLoadState(asArray((nextDashboard as JsonRecord)?.sites).length ? 'ready' : 'empty')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Overview could not be loaded.')
        setLoadState('error')
      })
    return () => { active = false }
  }, [refreshKey])

  useEffect(() => {
    if (!neurocropApi.isConnected()) return
    const interval = window.setInterval(() => {
      if (!document.hidden) setRefreshKey((value) => value + 1)
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const model = useMemo(
    () => dashboard && actions ? buildModel(dashboard, actions, selectedAreaId) : null,
    [dashboard, actions, selectedAreaId],
  )
  const areaOptions = useMemo(
    () => asArray(dashboard?.sites).map((site) => ({
      id: String(site.id),
      name: String(site.name || 'Unnamed Area'),
    })),
    [dashboard],
  )

  function handleActionSubmitted(actionId: string) {
    if (neurocropApi.isConnected()) {
      setRefreshKey((value) => value + 1)
      return
    }
    setActions((current) => current ? {
      ...current,
      actions: asArray(current.actions).filter((action) => String(action.id) !== actionId),
    } : current)
  }

  if (loadState === 'loading') return <section className="nc-overview-state" aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><h1>Preparing your live overview</h1><p>Evaluating Sections against their active crop profiles.</p></section>
  if (loadState === 'error') return <section className="nc-overview-state" role="alert"><i className="fa-solid fa-cloud-arrow-down" /><h1>Overview could not be loaded</h1><p>{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Try again</button></section>
  if (loadState === 'empty' || !model) return <section className="nc-overview-state"><i className="fa-solid fa-seedling" /><h1>Your workspace is ready</h1><p>Create an Area and its first Section to begin monitoring.</p></section>

  const actionRows = model.rows.filter((row) => row.tone === 'action')
  const watchRows = model.rows.filter((row) => row.tone === 'watch')
  const stableRows = model.rows.filter((row) => row.tone === 'good')
  const verifiedRows = model.rows.filter((row) => row.tone !== 'unknown')
  const stable = !model.priority && actionRows.length === 0 && watchRows.length === 0 && verifiedRows.length === model.rows.length
  const comparableActionRows = actionRows.filter((row) =>
    row.metricKey
    && row.metricKey === actionRows[0]?.metricKey
    && row.direction === actionRows[0]?.direction
    && row.deviation !== null,
  )
  const maximumDeviation = comparableActionRows.length === actionRows.length
    ? Math.max(...comparableActionRows.map((row) => Math.abs(row.deviation || 0)))
    : null
  const actionHeadline = actionRows.length && maximumDeviation !== null && actionRows[0].direction !== 'unknown'
    ? `${actionRows.length} Section${actionRows.length === 1 ? '' : 's'} ${actionRows.length === 1 ? 'is' : 'are'} up to ${formatMeasurement(maximumDeviation, actionRows[0].unit)} ${actionRows[0].direction} target.`
    : model.priority?.title
  const headline = stable
    ? `All ${model.rows.length} Sections are stable.`
    : actionHeadline || `${model.rows.length - verifiedRows.length} Sections cannot be verified.`
  const explanation = stable
    ? 'Every Section is inside its current target range.'
    : actionRows.length
      ? `${actionRows[0].metricLabel} is outside the active crop-profile target in ${actionRows.length} of ${model.rows.length} Sections.`
      : model.priority?.reason || 'Current data or an active crop profile is missing.'
  const unknownRows = model.rows.filter((row) => row.tone === 'unknown')
  const scopeLabel = stable
    ? `All ${model.rows.length} Sections`
    : actionRows.length
      ? `Affects ${actionRows.length} of ${model.rows.length} Sections`
      : `${unknownRows.length} of ${model.rows.length} Sections unverified`

  function openAreaEvidence() {
    setSelectedEvidenceRow(null)
    setEvidenceOpen(true)
  }

  function openSectionEvidence(row: OverviewRow) {
    setSelectedEvidenceRow(row)
    setEvidenceOpen(true)
  }

  function changeArea(areaId: string) {
    setSelectedAreaId(areaId)
    window.dispatchEvent(new CustomEvent('neurocrop:overview-area-change', {
      detail: { siteId: areaId },
    }))
  }

  const overviewTone = stable ? 'stable' : model.priority ? 'action' : watchRows.length ? 'watch' : 'unknown'

  return <div className={`nc-overview ${overviewTone}`} data-nc-react-workspace="overview">
    <section className="nc-overview-stage">
      <TopographicField tone={overviewTone} />
      <div className="nc-overview-main">
        <section className="nc-overview-copy" aria-live="polite">
          <div className="nc-overview-area-picker">
            <span>Active Area</span>
            <div role="group" aria-label="Select active Area">
              {areaOptions.map((area) => <button type="button" key={area.id} data-active={area.id === model.areaId} aria-pressed={area.id === model.areaId} onClick={() => changeArea(area.id)}><i className="fa-solid fa-layer-group" aria-hidden="true" /><span>{area.name}</span></button>)}
            </div>
          </div>
          <div className="nc-overview-kicker">
            <span>{stable ? 'All systems normal' : model.priority ? 'Action recommended' : 'Setup required'}</span>
            <strong>{scopeLabel}</strong>
          </div>
          <h1>{headline}</h1>
          <p>{explanation}</p>
          {model.priority
            ? <button className="nc-overview-action" type="button" onClick={() => setActionOpen(true)}>{String(model.priority.recommendedAction || 'Review recommended action').replace(/\.$/, '')}<i className="fa-solid fa-arrow-right" /></button>
            : stable
              ? <div className="nc-overview-normal"><i className="fa-regular fa-circle-check" />No action required</div>
              : <a className="nc-overview-action" href="/sections">Review Section setup<i className="fa-solid fa-arrow-right" /></a>}
        </section>

        <figure className="nc-coverage" aria-labelledby="nc-coverage-title">
          <div className="nc-coverage-summary">
            <div className="nc-section-summary">
              <p id="nc-coverage-title">Live status</p>
              <div>
                <span className="action"><i />{actionRows.length} need{actionRows.length === 1 ? 's' : ''} action</span>
                <span className="watch"><i />{watchRows.length} watch</span>
                <span className="good"><i />{stableRows.length} stable</span>
                {unknownRows.length ? <span className="unknown"><i />{unknownRows.length} unverified</span> : null}
              </div>
            </div>
            <div className="nc-growing-score">
              <span>7-day Growing Score</span>
              <p><strong>{model.growingScore ?? '—'}</strong>{model.growingScore === null ? null : <small>/ 100</small>}</p>
            </div>
          </div>
          <div className="nc-coverage-list">
            {model.rows.map((row) => <button className={`nc-coverage-row ${row.tone}`} type="button" key={row.id} onClick={() => openSectionEvidence(row)} aria-label={`View evidence for ${row.name}`}>
              <i><span /></i>
              <div><strong>{row.name}</strong><small>{row.crop}</small><small className="nc-row-growing-score">7-day score <b>{row.score ?? '—'}{row.score === null ? '' : ' / 100'}</b></small></div>
              <p>
                <strong>{row.status}</strong>
                {row.deviation !== null
                  ? <small className="nc-row-deviation"><b>{formatDeviation(row.deviation, row.direction, row.unit)}</b><em>for {row.duration}</em></small>
                  : <small>{row.detail}</small>}
                <time>{row.updated}</time>
              </p>
              <i className="fa-solid fa-chevron-right nc-coverage-chevron" aria-hidden="true" />
            </button>)}
          </div>
          <figcaption><i className="fa-solid fa-circle-check" />Growing Score summarizes overall conditions; status highlights current target deviations.</figcaption>
        </figure>
      </div>
      <footer className="nc-overview-trust">
        <span><i />{model.reporting}</span>
        <span>{model.updated}</span>
        <span>{actionRows.length} actions · {watchRows.length} watch conditions</span>
        <button type="button" onClick={openAreaEvidence}>Open Area analysis <i className="fa-solid fa-arrow-right" /></button>
      </footer>
    </section>
    {evidenceOpen ? <EvidenceDrawer model={model} row={selectedEvidenceRow} onClose={() => setEvidenceOpen(false)} /> : null}
    {actionOpen && model.priority ? <ActionWorkflow action={model.priority} onClose={() => setActionOpen(false)} onSubmitted={() => handleActionSubmitted(String(model.priority?.id || ''))} /> : null}
  </div>
}
