import { translateInterfaceText as tx } from '../../i18n'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import { openTrend, setDashboardContext, useDashboardState } from '../../state/dashboardStore'
import '../../styles/overview-workspace.css'

const loadReadingsClimateMap = () => import('../readings/ReadingsClimateMap')
const ReadingsClimateMap = lazy(loadReadingsClimateMap)

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
  scoreDriver: string | null
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

const METRIC_LABELS: Record<string, string> = {
  airTemp: 'Air temperature',
  humidity: 'Relative humidity',
  co2: 'CO2',
  lux: 'Light',
  soilTemp: 'Soil temperature',
  soilMoisture: 'Soil moisture',
  soilEc: 'Soil EC',
  leafTemp: 'Leaf temperature',
  waterTemp: 'Water temperature',
  vpd: 'VPD',
  ec: 'EC',
  ph: 'pH',
}

const METRIC_UNITS: Record<string, string> = {
  airTemp: '°C',
  humidity: '%',
  co2: 'ppm',
  lux: 'lx',
  soilTemp: '°C',
  soilMoisture: '%',
  soilEc: 'mS/cm',
  leafTemp: '°C',
  waterTemp: '°C',
  vpd: 'kPa',
  ec: 'mS/cm',
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value : []
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
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)} h ago`
}

function metricLabel(value: unknown) {
  const key = String(value || '')
  return METRIC_LABELS[key] || key || 'Condition'
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

function scoreColor(value: number | null) {
  if (value === null) return '#7d8982'
  const score = Math.max(1, Math.min(100, value))
  const hue = ((score - 1) / 99) * 128
  return `hsl(${hue} 68% 38%)`
}

function unitSuffix(unit: string) {
  return unit === '%' ? '%' : unit ? ` ${unit}` : ''
}

function formatMeasurement(value: number | null, unit: string) {
  if (value === null) return '—'
  return `${formatNumber(value)}${unitSuffix(unit)}`
}

function formatDifference(value: number, unit: string) {
  const difference = formatNumber(Math.abs(value))
  return unit === '%' ? `${difference} percentage point${difference === '1' ? '' : 's'}` : formatMeasurement(Math.abs(value), unit)
}

function formatDeviation(value: number | null, direction: OverviewRow['direction'], unit: string) {
  if (value === null || direction === 'unknown') return '—'
  if (direction === 'inside') return 'Inside target'
  return `${formatDifference(value, unit)} ${direction} target`
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

function correctionInstruction(
  label: string,
  deviation: number | null,
  direction: OverviewRow['direction'],
  target: [number, number] | null,
  unit: string,
) {
  if (deviation === null || !target || (direction !== 'above' && direction !== 'below')) {
    return `${label} is outside its target range.`
  }
  const difference = Math.abs(deviation)
  const boundary = direction === 'above' ? target[1] : target[0]
  const change = direction === 'above' ? 'Decrease' : 'Increase'
  return `${label} is ${formatDifference(difference, unit)} ${direction} target. ${change} by at least ${formatDifference(difference, unit)} to ${formatMeasurement(boundary, unit)}; target range ${formatNumber(target[0])}–${formatNumber(target[1])}${unitSuffix(unit)}.`
}

function rowConditionSummary(row: OverviewRow) {
  if (row.currentValue === null || !row.target) return row.detail
  return `${row.metricLabel} ${formatMeasurement(row.currentValue, row.unit)} · target ${formatNumber(row.target[0])}–${formatNumber(row.target[1])}${unitSuffix(row.unit)}`
}

function rowCorrectionSummary(row: OverviewRow) {
  if (row.deviation === null || (row.direction !== 'above' && row.direction !== 'below')) return ''
  return `${row.direction === 'above' ? 'Decrease' : 'Increase'} by ${formatDifference(row.deviation, row.unit)}`
}

function AgronomicDiagnosis({ action }: { action: JsonRecord }) {
  const readings = asArray(action?.relatedReadings)
  const diagnosis = action?.diagnosis as JsonRecord | undefined
  if (!diagnosis) return null
  const status = String(diagnosis.status || 'insufficient_data')
  const missingMetrics = asArray(diagnosis.missingMetrics).map((metric) => metricLabel(metric))
  return <section className="nc-related-evidence">
    <header><span>{tx("Agronomic diagnosis")}</span><strong data-tone={status}>{diagnosis.label ||tx("Insufficient data")}</strong></header>
    <h3>{diagnosis.title || action.title ||tx("Condition requires review")}</h3>
    <p className="nc-diagnosis-summary">{diagnosis.summary || action.reason}</p>
    {readings.length
      ? <div>
          {readings.map((reading) => {
            const unit = normalizeUnit(reading.unit)
            const value = Number(reading.value)
            return <article key={String(reading.metricId)}>
              <small>{reading.metricLabel || metricLabel(reading.metricId)}</small>
              <strong>{formatMeasurement(Number.isFinite(value) ? value : null, unit)}</strong>
              <p>{formatTarget(targetRange(reading.target), unit)}</p>
            </article>
          })}
        </div>
      : null}
    {missingMetrics.length
      ? <p className="nc-diagnosis-missing"><i className="fa-solid fa-circle-info" /> {missingMetrics.join(' or ')} {tx("data would increase confidence in this diagnosis.")}</p>
      : null}
  </section>
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

async function enrichLegacyDashboardConditions(
  dashboard: JsonRecord,
  profilesPayload: JsonRecord,
) {
  const profiles = new Map(asArray(profilesPayload?.profiles).map((profile) => [String(profile.id), profile]))
  const sites = asArray(dashboard?.sites)
  const pending = sites.flatMap((site) => asArray(site.zones)
    .filter((zone) => !zone.mainCondition && zone.mainDriver && statusTone(zone.conditionStatus) !== 'good')
    .map((zone) => ({ zone, sectionId: String(zone.id), metricId: String(zone.mainDriver) })))

  if (!pending.length) return dashboard

  const conditions = new Map<string, JsonRecord>()
  await Promise.all(pending.map(async ({ zone, sectionId, metricId }) => {
    try {
      const latest = await neurocropApi.getLatestReadings(sectionId) as JsonRecord
      const observation = latest?.observations?.[metricId] as JsonRecord | undefined
      const value = Number(observation?.value)
      const profileId = String(zone.profile?.id || zone.profile || zone.profileId || zone.cropProfile || '')
      const target = targetRange(profiles.get(profileId)?.metrics?.[metricId]?.optimal)
      if (!Number.isFinite(value) || !target) return
      conditions.set(sectionId, {
        metricId,
        value,
        target,
        unit: observation?.unit || METRIC_UNITS[metricId] || '',
      })
    } catch {
      // The normal dashboard still renders if optional legacy enrichment is unavailable.
    }
  }))

  if (!conditions.size) return dashboard
  return {
    ...dashboard,
    sites: sites.map((site) => ({
      ...site,
      zones: asArray(site.zones).map((zone) => ({
        ...zone,
        mainCondition: zone.mainCondition || conditions.get(String(zone.id)) || null,
      })),
    })),
  }
}

function buildModel(dashboard: JsonRecord, actionPayload: JsonRecord, selectedAreaId: string): OverviewModel | null {
  const sites = asArray(dashboard?.sites)
  if (!sites.length) return null
  const allActions = asArray(actionPayload?.actions)
  const actions = allActions.filter((action) => !action.feedback || action.feedback?.status === 'in_progress')
  const priorityAreaId = String(actions[0]?.areaId || '')
  const site = sites.find((item) => String(item.id) === selectedAreaId)
    || sites.find((item) => String(item.id) === priorityAreaId)
    || sites[0]
  const areaActions = actions.filter((action) => String(action.areaId) === String(site.id))
  const actionBySection = new Map(areaActions.map((action) => [String(action.sectionId), action]))
  const zones = asArray(site.zones)
  const rows = zones.map((zone): OverviewRow => {
    const action = actionBySection.get(String(zone.id))
    const condition = action || zone.mainCondition
    const rawScore = zone.score === null || zone.score === undefined || zone.score === ''
      ? null
      : Number.isFinite(Number(zone.score)) ? Number(zone.score) : null
    const metricKey = String(action?.metricId || action?.metricKey || condition?.metricId || zone.mainDriver || '')
    const numericValue = condition?.value === null || condition?.value === undefined ? Number.NaN : Number(condition.value)
    const currentValue = Number.isFinite(numericValue) ? numericValue : null
    const unit = normalizeUnit(action?.unit || condition?.unit || METRIC_UNITS[metricKey])
    const target = targetRange(condition?.target)
    const deviation = deviationFromTarget(currentValue, target)
    const direction = deviation === null ? 'unknown' : deviation > 0 ? 'above' : deviation < 0 ? 'below' : 'inside'
    const actionCanBeVerified = Boolean(action && currentValue !== null && target && deviation !== null)
    const conditionCanBeVerified = Boolean(currentValue !== null && target && deviation !== null)
    const actionTone = statusTone(action?.state)
    const tone = actionCanBeVerified
      ? actionTone === 'watch' ? 'watch' : 'action'
      : conditionCanBeVerified ? statusTone(zone.conditionStatus) : action ? 'unknown' : statusTone(zone.conditionStatus)
    const score = tone === 'unknown' ? null : rawScore
    const rowMetricLabel = String(action?.metricLabel || metricLabel(metricKey))
    const reportingNodes = Number(zone.nodeSummary?.reporting || zone.sensorCount || 0)
    const totalNodes = Number(zone.nodeSummary?.registered || zone.sensorCount || 0)
    return {
      id: String(zone.id),
      name: String(zone.name || 'Unnamed Section'),
      crop: profileLabel(zone),
      status: tone === 'action' ? 'Needs action' : tone === 'watch' ? 'Watch' : tone === 'good' ? 'Inside target' : 'Unverified',
      detail: actionCanBeVerified
        ? correctionInstruction(rowMetricLabel, deviation, direction, target, unit)
        : conditionCanBeVerified
          ? correctionInstruction(rowMetricLabel, deviation, direction, target, unit)
        : tone === 'good'
          ? 'Current conditions normal'
          : tone === 'watch'
            ? `${rowMetricLabel} is outside its target range`
            : 'Current data or crop target is incomplete',
      updated: relativeTime(action?.observedAt || zone.computedAt),
      tone,
      score,
      metricKey,
      metricLabel: rowMetricLabel,
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
  const reviewableActions = areaActions.filter((action) =>
    rows.some((row) => row.id === String(action.sectionId) && (row.tone === 'action' || row.tone === 'watch')),
  )
  const priority = reviewableActions.find((action) =>
    rows.some((row) => row.id === String(action.sectionId) && row.tone === 'action'),
  ) || null
  const scoreDriver = rows
    .filter((row) => (row.tone === 'action' || row.tone === 'watch') && row.metricKey)
    .sort((left, right) => (left.score ?? 101) - (right.score ?? 101))[0]?.metricLabel || null
  return {
    areaId: String(site.id),
    areaName: String(site.name || 'Growing Area'),
    rows,
    actions: reviewableActions,
    priority,
    reporting: `${reportingNodes} of ${totalNodes} nodes reporting`,
    updated: relativeTime(areaActions[0]?.observedAt || zones[0]?.computedAt),
    growingScore: availableScores.length
      ? Math.round(availableScores.reduce((sum, score) => sum + score, 0) / availableScores.length)
      : null,
    scoreDriver,
  }
}

function MiniTrend({ points, target, unit }: {
  points: TrendPoint[]
  target: [number, number] | null
  unit: string
}) {
  if (points.length < 2) return <div className="nc-evidence-trend-empty">{tx("24-hour history is not available for this metric.")}</div>
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
    <div><span>{tx("24-hour trend")}</span><strong>{formatMeasurement(latest.value, unit)}</strong></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`24-hour trend ending at ${formatMeasurement(latest.value, unit)}`}>
      {target ? <rect x={padding} y={targetTop} width={width - padding * 2} height={targetHeight} rx="4" /> : null}
      <polygon points={area} />
      <polyline points={line} />
      <circle cx={x(points.length - 1)} cy={y(latest.value)} r="4" />
    </svg>
    <footer><span>{tx("24h ago")}</span><span>{tx("Now")}</span></footer>
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
  const activeAction = sectionAction || (!row ? model.priority : null)
  const conclusion = row
    ? row.status
    : model.priority ? model.priority.title : `All ${model.rows.length} Sections are stable.`
  const evidence = row
    ? row.detail
    : model.priority?.reason || 'Every Section is inside its current crop-profile target range.'
  const score = row ? row.score : model.growingScore

  useEffect(() => {
    if (!row || !row.metricKey) return
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
  }, [row])

  function openTrends() {
    onClose()
    if (row?.metricKey) {
      openTrend({
        areaId: model.areaId,
        sectionId: row.id,
        metricKey: row.metricKey,
      })
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
        <div><span>{row ?tx("Section evidence") :tx("Area evidence")}</span><h2 id="overview-evidence-title">{row?.name || model.areaName}</h2>{row ? <p>{model.areaName}</p> : null}</div>
        <button type="button" onClick={onClose} aria-label={tx("Close evidence")}><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-evidence-summary">
        <span>{tx("Current conclusion")}</span>
        <strong>{conclusion}</strong>
        <p>{evidence}</p>
      </section>
      {activeAction ? <AgronomicDiagnosis action={activeAction} /> : null}
      {row && row.currentValue !== null && row.target ? <section className="nc-evidence-metrics">
        <div><span>{tx("Current")}</span><strong>{formatMeasurement(row.currentValue, row.unit)}</strong></div>
        <div><span>{tx("Target")}</span><strong>{row.target ? `${formatNumber(row.target[0])}–${formatNumber(row.target[1])}${unitSuffix(row.unit)}` :tx("Not set")}</strong></div>
        <div data-tone={row.tone}><span>{tx("Deviation")}</span><strong>{formatDeviation(row.deviation, row.direction, row.unit)}</strong></div>
        <div><span>{tx("Latest reading")}</span><strong>{row.updated}</strong></div>
      </section> : null}
      {row && row.currentValue !== null && row.target
        ? trendState === 'loading'
          ? <div className="nc-evidence-trend-empty loading">{tx("Loading 24-hour trend…")}</div>
          : <MiniTrend points={trendPoints} target={row.target} unit={row.unit} />
        : null}
      <dl>
        <div><dt>{tx("Current overall score")}</dt><dd>{score === null ?tx("Not available") : `${score} / 100`}</dd></div>
        {row ? <div><dt>{tx("Crop profile")}</dt><dd>{row.crop}</dd></div> : null}
        <div><dt>{tx("Data confidence")}</dt><dd>{row?.reporting || model.reporting} {tx("· updated")} {row?.updated || model.updated}</dd></div>
      </dl>
      <footer>
        <button type="button" onClick={openSection}>{tx("Open Section")}</button>
        <button type="button" className="primary" onClick={openTrends}>{tx("Open Trends")} <i className="fa-solid fa-arrow-right" /></button>
      </footer>
    </aside>
  </div>
}

type WorkflowItemState = {
  status: 'open' | 'in-progress' | 'submitting' | 'submitted'
  note: string
  executionType: string
  adjustment: string
  duration: string
  error: string
}

function ActionWorkflow({ actions, rows, areaName, onClose }: {
  actions: JsonRecord[]
  rows: OverviewRow[]
  areaName: string
  onClose: () => void
}) {
  const [items, setItems] = useState<Record<string, WorkflowItemState>>(() => Object.fromEntries(
    actions.map((action) => [String(action.id), {
      status: action.feedback?.status === 'completed'
        ? 'submitted'
        : action.feedback?.status === 'in_progress'
          ? 'in-progress'
          : 'open',
      note: '',
      executionType: '',
      adjustment: '',
      duration: '',
      error: '',
    }]),
  ))
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  function updateItem(actionId: string, update: Partial<WorkflowItemState>) {
    setItems((current) => ({
      ...current,
      [actionId]: { ...current[actionId], ...update },
    }))
  }

  async function completeAction(action: JsonRecord) {
    const actionId = String(action.id)
    const workflowAction = action.workflowAction || action
    const item = items[actionId]
    if (!item || item.status === 'submitting' || item.status === 'submitted') return
    if (item.status === 'open') {
      updateItem(actionId, { status: 'submitting', error: '' })
      try {
        if (neurocropApi.isConnected()) {
          await neurocropApi.submitTodayActionFeedback(actionId, {
            status: 'in_progress',
            note: '',
            action,
          })
        }
        updateItem(actionId, { status: 'in-progress' })
      } catch (reason) {
        updateItem(actionId, {
          status: 'open',
          error: reason instanceof Error ? reason.message : 'The check could not be started.',
        })
      }
      return
    }
    if (!item.executionType) {
      updateItem(actionId, { error: 'Select what was actually done.' })
      return
    }
    if (!item.adjustment.trim()) {
      updateItem(actionId, { error: 'Describe the actual change or finding.' })
      return
    }
    const durationMinutes = item.duration === '' ? null : Number(item.duration)
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
      updateItem(actionId, { error: 'Duration must be between 1 and 1440 minutes.' })
      return
    }
    updateItem(actionId, { status: 'submitting', error: '' })
    try {
      if (neurocropApi.isConnected()) {
        await neurocropApi.submitTodayActionFeedback(actionId, {
          status: 'completed',
          note: item.note,
          executionDetails: {
            type: item.executionType,
            adjustment: item.adjustment.trim(),
            durationMinutes,
          },
          action: workflowAction,
        })
      }
      updateItem(actionId, { status: 'submitted' })
    } catch (reason) {
      updateItem(actionId, {
        status: 'in-progress',
        error: reason instanceof Error ? reason.message : 'The result could not be saved.',
      })
    }
  }

  return <div className="nc-overview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="nc-overview-drawer nc-action-drawer nc-action-list-drawer" role="dialog" aria-modal="true" aria-labelledby="overview-action-title">
      <header>
        <div><span>{tx("Recommended checks")}</span><h2 id="overview-action-title">{tx("Review")} {actions.length} {tx("affected Section")}{actions.length === 1 ? '' : 's'}</h2><p>{areaName}</p></div>
        <button type="button" onClick={onClose} aria-label={tx("Close action")}><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-action-guidance">
        <i className="fa-solid fa-circle-info" />
        <p>{tx("NeuroCrop recommends what to inspect. It does not control ventilation, heating, irrigation, or other equipment.")}</p>
      </section>
      <section className="nc-action-items">
        {actions.map((action) => {
          const actionId = String(action.id)
          const item = items[actionId] || { status: 'open', note: '', executionType: '', adjustment: '', duration: '', error: '' }
          const row = rowsById.get(String(action.sectionId))
          const actionValue = Number(action.value)
          const currentValue = row?.currentValue ?? (Number.isFinite(actionValue) ? actionValue : null)
          const unit = row?.unit || normalizeUnit(action.unit)
          return <article className="nc-action-item" data-status={item.status} key={actionId}>
            <header>
              <div><span>{action.metricLabel ||tx("Condition check")}</span><h3>{action.sectionName || row?.name ||tx("Unnamed Section")}</h3></div>
              <span className={`nc-workflow-status ${item.status}`}><i />{item.status === 'submitted' ?tx("Awaiting verification") : item.status === 'open' ?tx("Not started") :tx("In progress")}</span>
            </header>
            <div className="nc-action-values">
              <div><span>{tx("Current")}</span><strong>{formatMeasurement(currentValue, unit)}</strong></div>
              <div><span>{tx("Target")}</span><strong>{row?.target ? `${formatNumber(row.target[0])}–${formatNumber(row.target[1])}${unitSuffix(row.unit)}` : formatTarget(targetRange(action.target), unit).replace(/^Target /, '')}</strong></div>
              <div><span>{tx("Deviation")}</span><strong>{row ? formatDeviation(row.deviation, row.direction, row.unit) : action.reason}</strong></div>
              <div><span>{tx("Latest reading")}</span><strong>{row?.updated ||tx("Unavailable")}</strong></div>
            </div>
            {action.ruleType === 'interaction'
              ? <div className="nc-action-diagnosis"><span>{tx("Why NeuroCrop recommends this")}</span><strong>{action.title}</strong><p>{action.reason}</p></div>
              : null}
            <AgronomicDiagnosis action={action} />
            <div className="nc-action-recommendation"><span>{tx("Recommended check")}</span><p>{action.recommendedAction ||tx("Inspect the relevant controls and sensor placement.")}</p></div>
            {item.status !== 'open'
              ? <div className="nc-action-record">
                <label><span>{tx("What was done")}</span><select value={item.executionType} onChange={(event) => updateItem(actionId, { executionType: event.target.value })} disabled={item.status === 'submitted'}>
                  <option value="">{tx("Select performed action")}</option>
                  <option value="ventilation_increased">{tx("Ventilation increased")}</option>
                  <option value="ventilation_reduced">{tx("Ventilation reduced")}</option>
                  <option value="vents_opened">{tx("Vents opened")}</option>
                  <option value="heating_increased">{tx("Heating increased")}</option>
                  <option value="heating_reduced">{tx("Heating reduced")}</option>
                  <option value="cooling_increased">{tx("Cooling increased")}</option>
                  <option value="cooling_reduced">{tx("Cooling reduced")}</option>
                  <option value="humidification_increased">{tx("Humidification increased")}</option>
                  <option value="humidification_reduced">{tx("Humidification reduced")}</option>
                  <option value="irrigation_adjusted">{tx("Irrigation adjusted")}</option>
                  <option value="shading_adjusted">{tx("Shading adjusted")}</option>
                  <option value="equipment_checked">{tx("Equipment checked")}</option>
                  <option value="other">{tx("Other")}</option>
                </select></label>
                <label><span>{tx("Actual change or finding")}</span><input value={item.adjustment} onChange={(event) => updateItem(actionId, { adjustment: event.target.value })} placeholder={tx("Example: AC setpoint increased from 18 to 20 °C")} maxLength={160} disabled={item.status === 'submitted'} /></label>
                <label><span>{tx("Duration, minutes (optional)")}</span><input type="number" min="1" max="1440" value={item.duration} onChange={(event) => updateItem(actionId, { duration: event.target.value })} disabled={item.status === 'submitted'} /></label>
                <label><span>{tx("Additional note (optional)")}</span><textarea value={item.note} onChange={(event) => updateItem(actionId, { note: event.target.value })} placeholder={tx("Anything the next employee should know")} maxLength={500} disabled={item.status === 'submitted'} /></label>
              </div>
              : null}
            {item.error ? <p className="nc-action-error" role="alert">{item.error}</p> : null}
            <footer>
              <button className={item.status === 'submitted' ? 'checked' : ''} type="button" onClick={() => completeAction(action)} disabled={item.status === 'submitting' || item.status === 'submitted'}>
                {item.status === 'open' ?tx("Start check") : item.status === 'submitted' ?tx("Awaiting verification") : item.status === 'submitting' ?tx("Saving…") :tx("Submit for verification")}
              </button>
            </footer>
          </article>
        })}
      </section>
      <footer>
        <button type="button" onClick={onClose}>{tx("Close")}</button>
      </footer>
    </aside>
  </div>
}

export default function OverviewWorkspace() {
  const navigate = useNavigate()
  const dashboardState = useDashboardState()
  const [dashboard, setDashboard] = useState<JsonRecord | null>(null)
  const [actions, setActions] = useState<JsonRecord | null>(null)
  const selectedAreaId = dashboardState.context.areaId
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<OverviewRow | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    void loadReadingsClimateMap()
  }, [])

  useEffect(() => {
    let active = true
    Promise.all(neurocropApi.isConnected()
      ? [neurocropApi.getDashboard(), neurocropApi.getTodayActions(), neurocropApi.getCropProfiles()]
      : [Promise.resolve(demoDashboard), Promise.resolve({ actions: demoActions }), Promise.resolve({ profiles: [] })])
      .then(async ([nextDashboard, nextActions, nextProfiles]) => {
        const enrichedDashboard = neurocropApi.isConnected()
          ? await enrichLegacyDashboardConditions(nextDashboard as JsonRecord, nextProfiles as JsonRecord)
          : nextDashboard as JsonRecord
        if (!active) return
        setDashboard(enrichedDashboard)
        setActions(nextActions as JsonRecord)
        setError('')
        setLoadState(asArray(enrichedDashboard?.sites).length ? 'ready' : 'empty')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Overview could not be loaded.')
        // A background refresh must never replace an already usable Overview
        // with a full-page error. Keep the last successful snapshot visible and
        // let the next scheduled refresh recover from a transient API failure.
        setLoadState((current) => current === 'loading' ? 'error' : current)
      })
    return () => { active = false }
  }, [refreshKey])

  const model = useMemo(
    () => dashboard && actions ? buildModel(dashboard, actions, selectedAreaId) : null,
    [dashboard, actions, selectedAreaId],
  )

  useEffect(() => {
    if (!neurocropApi.isConnected()) return
    const interval = window.setInterval(() => {
      if (!document.hidden) setRefreshKey((value) => value + 1)
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (loadState === 'empty') navigate('/areas', { replace: true })
  }, [loadState, navigate])

  const areaOptions = useMemo(
    () => asArray(dashboard?.sites).map((site) => ({
      id: String(site.id),
      name: String(site.name || 'Unnamed Area'),
      sectionCount: Number(site.sectionCount ?? asArray(site.zones || site.sections).length),
    })),
    [dashboard],
  )

  if (loadState === 'loading') return <section className="nc-overview-state" aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><h1>{tx("Preparing your live overview")}</h1><p>{tx("Evaluating Sections against their active crop profiles.")}</p></section>
  if (loadState === 'error') return <section className="nc-overview-state" role="alert"><i className="fa-solid fa-cloud-arrow-down" /><h1>{tx("Overview could not be loaded")}</h1><p>{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>{tx("Try again")}</button></section>
  if (loadState === 'empty' || !model) return <section className="nc-overview-state"><i className="fa-solid fa-seedling" /><h1>{tx("Create your first Area")}</h1><p>{tx("Add its first Section to begin monitoring.")}</p></section>

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
  const actionHeadline = model.priority?.ruleType === 'interaction'
    ? model.priority.title
    : actionRows.length && maximumDeviation !== null && actionRows[0].direction !== 'unknown'
    ? `${actionRows.length} Section${actionRows.length === 1 ? '' : 's'} ${actionRows.length === 1 ? 'is' : 'are'} up to ${formatMeasurement(maximumDeviation, actionRows[0].unit)} ${actionRows[0].direction} target.`
    : model.priority?.title
  const headline = stable
    ? `All ${model.rows.length} Sections are stable.`
    : actionHeadline
      || (watchRows.length
        ? `${watchRows.length} Section${watchRows.length === 1 ? ' needs' : 's need'} monitoring.`
        : `${model.rows.length - verifiedRows.length} Sections cannot be verified.`)
  const explanation = stable
    ? 'Every Section is inside its current target range.'
    : model.priority?.ruleType === 'interaction'
      ? model.priority.reason
      : actionRows.length
      ? `${actionRows[0].metricLabel} is outside the active crop-profile target in ${actionRows.length} of ${model.rows.length} Sections.`
      : watchRows.length
        ? `${watchRows.length} Section${watchRows.length === 1 ? ' has' : 's have'} a current reading outside target. Review the recommended checks before the condition escalates.`
        : model.priority?.reason || 'Current data or an active crop profile is missing.'
  const unknownRows = model.rows.filter((row) => row.tone === 'unknown')
  const visibleActions = model.actions.filter((action) =>
    actionRows.some((row) => row.id === String(action.sectionId)),
  )
  const watchActions = model.actions.filter((action) =>
    watchRows.some((row) => row.id === String(action.sectionId)),
  )
  const fallbackWatchActions = watchRows
    .filter((row) => row.metricKey && row.currentValue !== null && row.target && (row.direction === 'above' || row.direction === 'below'))
    .map((row) => ({
      id: `${row.id}:${row.metricKey}:${row.direction === 'above' ? 'high' : 'low'}`,
      areaId: model.areaId,
      areaName: model.areaName,
      sectionId: row.id,
      sectionName: row.name,
      metricId: row.metricKey,
      metricLabel: row.metricLabel,
      state: 'warning',
      priority: 'monitor',
      direction: row.direction === 'above' ? 'high' : 'low',
      value: row.currentValue,
      unit: row.unit,
      target: row.target,
      title: `Review ${row.metricLabel.toLowerCase()}`,
      reason: row.detail,
      recommendedAction: `${rowCorrectionSummary(row)} and verify the relevant controls and sensor placement.`,
      expectedEffect: `${row.metricLabel} moves into the configured target range.`,
      observedAt: null,
      confidence: row.reporting.startsWith('0 of') ? 'medium' : 'high',
    }))
  const effectiveWatchActions = watchActions.length ? watchActions : fallbackWatchActions
  const reviewActions = visibleActions.length ? visibleActions : effectiveWatchActions
  const reviewRows = visibleActions.length ? actionRows : watchRows
  const scopeLabel = stable
    ? `All ${model.rows.length} Sections`
    : actionRows.length
      ? `Affects ${actionRows.length} of ${model.rows.length} Sections`
      : watchRows.length
        ? `${watchRows.length} of ${model.rows.length} Sections on watch`
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
    setDashboardContext({ areaId, sectionId: '' })
  }

  const overviewTone = stable ? 'stable' : model.priority ? 'action' : watchRows.length ? 'watch' : 'unknown'

  return <div className={`nc-overview ${overviewTone}`} data-nc-react-workspace="overview">
    <section className="nc-overview-stage">
      <div className="nc-overview-main">
        <section className="nc-overview-copy" aria-live="polite">
          <div className="nc-overview-area-picker">
            <span>{tx("Active Area")}</span>
            <div role="group" aria-label={tx("Select active Area")}>
              {areaOptions.map((area) => <button type="button" key={area.id} data-active={area.id === model.areaId} aria-pressed={area.id === model.areaId} onClick={() => changeArea(area.id)}><i className="fa-solid fa-layer-group" aria-hidden="true" /><span>{area.name}</span></button>)}
            </div>
          </div>
          <div className="nc-overview-kicker">
            <span>{stable ?tx("All systems normal") : model.priority ?tx("Action recommended") : watchRows.length ?tx("Monitoring recommended") :tx("Setup required")}</span>
            <strong>{scopeLabel}</strong>
          </div>
          <h1>{headline}</h1>
          <p>{explanation}</p>
          {model.priority
            ? <button className="nc-overview-action" type="button" onClick={() => setActionOpen(true)}>{tx("Review")} {visibleActions.length} {tx("affected Section")}{visibleActions.length === 1 ? '' : 's'}<i className="fa-solid fa-arrow-right" /></button>
            : stable
              ? <div className="nc-overview-normal"><i className="fa-regular fa-circle-check" />{tx("No action required")}</div>
              : effectiveWatchActions.length
                ? <button className="nc-overview-action" type="button" onClick={() => setActionOpen(true)}>{tx("Review")} {effectiveWatchActions.length} {tx("Watch check")}{effectiveWatchActions.length === 1 ? '' : 's'}<i className="fa-solid fa-arrow-right" /></button>
                : <button className="nc-overview-action" type="button" onClick={() => navigate('/sections')}>{tx("Review Section setup")}<i className="fa-solid fa-arrow-right" /></button>}
          {unknownRows.length && effectiveWatchActions.length
            ? <button className="nc-overview-setup-link" type="button" onClick={() => navigate('/sections')}><i className="fa-solid fa-sliders" />{tx("Review setup for")} {unknownRows.length} {tx("unverified Section")}{unknownRows.length === 1 ? '' : 's'}</button>
            : null}
        </section>

        <figure className="nc-coverage" aria-labelledby="nc-coverage-title">
          <div className="nc-coverage-summary">
            <div className="nc-section-summary">
              <p id="nc-coverage-title">{tx("Live status")}</p>
              <div>
                <span className="action"><i />{actionRows.length} {tx("need")}{actionRows.length === 1 ? 's' : ''} {tx("action")}</span>
                <span className="watch"><i />{watchRows.length} {tx("watch")}</span>
                <span className="good"><i />{stableRows.length} {tx("stable")}</span>
                {unknownRows.length ? <span className="unknown"><i />{unknownRows.length} {tx("unverified")}</span> : null}
              </div>
            </div>
            <div className="nc-growing-score">
              <span>{tx("Current Growing Score")}</span>
              <p><strong>{model.growingScore ?? '—'}</strong>{model.growingScore === null ? null : <small>/ 100</small>}</p>
              {model.scoreDriver ? <em>{tx("Limited by")} {model.scoreDriver.toLowerCase()}</em> : null}
            </div>
          </div>
          <div className="nc-coverage-list">
            {model.rows.map((row) => <button className={`nc-coverage-row ${row.tone}`} type="button" key={row.id} onClick={() => openSectionEvidence(row)} aria-label={`View evidence for ${row.name}`}>
              <i><span /></i>
              <div className="nc-section-identity"><strong>{row.name}</strong><small>{row.crop}</small></div>
              <div className="nc-section-score">
                <span>{tx("Growing Score")}</span>
                <strong style={{ color: scoreColor(row.score) }}>{row.score ?? '—'}{row.score === null ? null : <small>/100</small>}</strong>
              </div>
              <p>
                <strong>{row.status}</strong>
                {row.deviation !== null
                  ? <small className="nc-row-deviation"><b>{rowConditionSummary(row)}</b><em>{rowCorrectionSummary(row)}</em></small>
                  : <small>{row.detail}</small>}
                <time>{row.updated}</time>
              </p>
              <i className="fa-solid fa-chevron-right nc-coverage-chevron" aria-hidden="true" />
            </button>)}
          </div>
          <div className="nc-coverage-footer">
            <figcaption><i className="fa-solid fa-circle-check" />{tx("Current Growing Score combines all available metrics; status and deviation show the limiting condition.")}</figcaption>
            <button type="button" onClick={() => navigate('/sections')}>{tx("View all")} {model.rows.length} {tx("Sections")} <i className="fa-solid fa-arrow-right" /></button>
          </div>
        </figure>
      </div>
      <footer className="nc-overview-trust">
        <span><i />{model.reporting}</span>
        <span>{model.updated}</span>
        <span>{actionRows.length} {tx("actions ·")} {watchRows.length} {tx("watch conditions")}</span>
        <button type="button" onClick={openAreaEvidence}>{tx("Open Area analysis")} <i className="fa-solid fa-arrow-right" /></button>
      </footer>
    </section>
    <section className="nc-overview-insights" aria-label={tx("Operational overview")}>
      <article className="nc-overview-climate-card">
        <Suspense fallback={<div className="nc-climate-map-state" data-state="loading" aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><strong>{tx("Loading live climate map…")}</strong></div>}>
          <ReadingsClimateMap
            key={model.areaId}
            areaId={model.areaId}
            refreshToken={refreshKey}
            presentation="overview"
            areaNavigation={<nav className="nc-area-tabs" role="tablist" aria-label={tx("Choose Area for climate snapshot")}>{areaOptions.map((area) => <button type="button" role="tab" aria-selected={area.id === model.areaId} className={area.id === model.areaId ? 'active' : ''} onClick={() => changeArea(area.id)} key={area.id}>{area.name}<b aria-label={`${area.sectionCount} sections`}>{area.sectionCount}</b></button>)}</nav>}
          />
        </Suspense>
      </article>
    </section>
    {evidenceOpen ? <EvidenceDrawer model={model} row={selectedEvidenceRow} onClose={() => setEvidenceOpen(false)} /> : null}
    {actionOpen && reviewActions.length ? <ActionWorkflow actions={reviewActions} rows={reviewRows} areaName={model.areaName} onClose={() => { setActionOpen(false); setRefreshKey((value) => value + 1) }} /> : null}
  </div>
}
