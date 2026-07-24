import { useEffect, useMemo, useRef, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// API records are intentionally open because dashboard and sensor payloads evolve independently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type ReadingMode = 'value' | 'target' | 'change'
type TrendRangeKey = '24h' | '7d' | '30d'
type ReadingQuality = 'live' | 'stale' | 'offline' | 'no-data' | 'not-installed' | 'calibration'
type ReadingTone = 'good' | 'watch' | 'critical' | 'neutral'

type Metric = {
  key: string
  label: string
  short: string
  unit: string
  decimals: number
  group: 'climate' | 'root' | 'lighting' | 'system'
  icon: string
}

type SectionReading = {
  id: string
  name: string
  areaId: string
  areaName: string
  profileId: string
  profileName: string
  availableMetrics: Set<string>
  configuredMetrics: Set<string>
  nodes: JsonRecord[]
  latest: JsonRecord | null
  loadFailed: boolean
}

type HistoryPoint = {
  observedAt: string
  value: number
}

type PinnedHistoryState = {
  status: 'loading' | 'ready' | 'empty' | 'error' | 'unsupported'
  points: HistoryPoint[]
}

type EChartsInstance = {
  resize: () => void
  dispose: () => void
}

type SharedTrendChartsApi = {
  render: (element: HTMLElement, input: {
    points: HistoryPoint[]
    metricKey: string
    label: string
    unit: string
    decimals: number
    target: [number, number] | null
    rangeKey: TrendRangeKey
  }) => EChartsInstance | null
}

const metrics: Metric[] = [
  { key: 'airTemp', label: 'Air temperature', short: 'Temperature', unit: '°C', decimals: 1, group: 'climate', icon: 'fa-temperature-half' },
  { key: 'humidity', label: 'Relative humidity', short: 'Humidity', unit: '%', decimals: 0, group: 'climate', icon: 'fa-droplet' },
  { key: 'vpd', label: 'Vapour pressure deficit', short: 'VPD', unit: 'kPa', decimals: 2, group: 'climate', icon: 'fa-wave-square' },
  { key: 'co2', label: 'Carbon dioxide', short: 'CO₂', unit: 'ppm', decimals: 0, group: 'climate', icon: 'fa-wind' },
  { key: 'leafTemp', label: 'Leaf temperature', short: 'Leaf temp.', unit: '°C', decimals: 1, group: 'climate', icon: 'fa-leaf' },
  { key: 'soilMoisture', label: 'Soil moisture', short: 'Moisture', unit: '%', decimals: 0, group: 'root', icon: 'fa-water' },
  { key: 'soilTemp', label: 'Soil temperature', short: 'Soil temp.', unit: '°C', decimals: 1, group: 'root', icon: 'fa-seedling' },
  { key: 'ec', label: 'Electrical conductivity', short: 'EC', unit: 'mS/cm', decimals: 2, group: 'root', icon: 'fa-bolt' },
  { key: 'ph', label: 'pH', short: 'pH', unit: 'pH', decimals: 1, group: 'root', icon: 'fa-flask' },
  { key: 'waterTemp', label: 'Water temperature', short: 'Water temp.', unit: '°C', decimals: 1, group: 'root', icon: 'fa-temperature-low' },
  { key: 'lux', label: 'Light', short: 'Light', unit: 'lx', decimals: 0, group: 'lighting', icon: 'fa-sun' },
  { key: 'batteryLevel', label: 'Battery level', short: 'Battery', unit: '%', decimals: 0, group: 'system', icon: 'fa-battery-half' },
]

const presets = [
  { key: 'essential', label: 'Essential', icon: 'fa-layer-group', keys: ['airTemp', 'humidity', 'vpd', 'co2', 'soilMoisture'] },
  { key: 'climate', label: 'Climate', icon: 'fa-cloud-sun', keys: ['airTemp', 'humidity', 'vpd', 'co2', 'leafTemp'] },
  { key: 'root', label: 'Root zone', icon: 'fa-seedling', keys: ['soilMoisture', 'soilTemp', 'ec', 'ph', 'waterTemp'] },
  { key: 'lighting', label: 'Lighting', icon: 'fa-sun', keys: ['lux'] },
  { key: 'system', label: 'System', icon: 'fa-microchip', keys: ['batteryLevel'] },
] as const

const qualityLabels: Record<ReadingQuality, string> = {
  live: 'Live', stale: 'Delayed', offline: 'Offline', 'no-data': 'No data',
  'not-installed': 'Not installed', calibration: 'Calibration needed',
}

const historySupportedMetricKeys = new Set([
  'airTemp', 'humidity', 'vpd', 'co2', 'leafTemp',
  'soilMoisture', 'soilTemp', 'ec', 'ph', 'waterTemp', 'lux', 'batteryLevel',
])

const trendRanges: Record<TrendRangeKey, { hours: number; stepMinutes: number }> = {
  '24h': { hours: 24, stepMinutes: 10 },
  '7d': { hours: 24 * 7, stepMinutes: 60 },
  '30d': { hours: 24 * 30, stepMinutes: 240 },
}

function asArray<T = JsonRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function recordArray(payload: JsonRecord | null | undefined, keys: string[]) {
  if (Array.isArray(payload)) return payload as JsonRecord[]
  for (const root of [payload, payload?.data, payload?.dashboard, payload?.workspace]) {
    if (!root || typeof root !== 'object') continue
    for (const key of keys) {
      if (Array.isArray(root[key])) return root[key] as JsonRecord[]
    }
  }
  return []
}

function areaIdentity(area: JsonRecord) {
  return String(area.id || area.areaId || area.area_id || area.siteId || area.site_id || '')
}

function areaLabel(area: JsonRecord) {
  return String(area.name || area.areaName || area.area_name || area.siteName || area.site_name || area.id || 'Unnamed area')
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getMetricDefinition(profile: JsonRecord | undefined, metric: Metric) {
  return profile?.metrics?.[metric.key] || null
}

function getRange(profile: JsonRecord | undefined, metric: Metric, key = 'optimal'): [number, number] | null {
  const range = getMetricDefinition(profile, metric)?.[key]
  if (!Array.isArray(range) || range.length < 2) return null
  const minimum = numeric(range[0])
  const maximum = numeric(range[1])
  return minimum === null || maximum === null ? null : [minimum, maximum]
}

function getObservation(section: SectionReading, metric: Metric): JsonRecord | null {
  const observation = section.latest?.observations?.[metric.key]
  return observation && typeof observation === 'object' ? observation : null
}

function getValue(section: SectionReading, metric: Metric): number | null {
  if (metric.key === 'batteryLevel') {
    const levels = section.nodes.map((node) => numeric(node.level ?? node.batteryPercent)).filter((value): value is number => value !== null)
    if (levels.length) return Math.min(...levels)
  }
  return numeric(getObservation(section, metric)?.value)
}

function getAgeSeconds(section: SectionReading) {
  const receivedAt = section.latest?.lastReceivedAt
    || section.nodes.map((node) => node.lastReceivedAt || node.lastSeen).filter(Boolean).sort().at(-1)
  const receivedMs = receivedAt ? new Date(receivedAt).getTime() : NaN
  return Number.isFinite(receivedMs) ? Math.max(0, (Date.now() - receivedMs) / 1000) : null
}

function getSectionFreshness(section: SectionReading): Extract<ReadingQuality, 'live' | 'stale' | 'offline'> {
  const age = getAgeSeconds(section)
  const expected = Math.max(30, numeric(section.latest?.expectedUplinkIntervalSec) || 600)
  if (section.loadFailed || age === null || age > expected * 6) return 'offline'
  if (age > expected * 2.5) return 'stale'
  return 'live'
}

function getMetricFreshness(section: SectionReading, metric: Metric): Extract<ReadingQuality, 'live' | 'stale' | 'offline'> {
  const observation = getObservation(section, metric)
  const observedAt = observation?.lastObservedAt
  const observedMs = observedAt ? new Date(observedAt).getTime() : NaN
  if (!Number.isFinite(observedMs)) return getSectionFreshness(section)
  const age = Math.max(0, (Date.now() - observedMs) / 1000)
  const expected = Math.max(30, numeric(observation?.expectedIntervalSec) || numeric(section.latest?.expectedUplinkIntervalSec) || 600)
  if (section.loadFailed || age > expected * 6) return 'offline'
  if (age > expected * 2.5) return 'stale'
  return 'live'
}

function getQuality(section: SectionReading, metric: Metric): ReadingQuality {
  const observation = getObservation(section, metric)
  const value = getValue(section, metric)
  const installed = section.availableMetrics.has(metric.key) || section.configuredMetrics.has(metric.key) || observation !== null || value !== null
  if (!installed) return 'not-installed'
  if (section.loadFailed) return 'offline'
  const state = String(observation?.state || observation?.status || '').toLowerCase()
  if (state.includes('calibrat')) return 'calibration'
  if (state.includes('offline') || state.includes('missing') || state.includes('disconnect')) return 'offline'
  if (value === null) return 'no-data'
  return getMetricFreshness(section, metric)
}

function getTone(section: SectionReading, metric: Metric, profile: JsonRecord | undefined): ReadingTone {
  const value = getValue(section, metric)
  const quality = getQuality(section, metric)
  if (value === null || ['offline', 'no-data', 'not-installed', 'calibration'].includes(quality)) return 'neutral'
  const observation = getObservation(section, metric)
  const backendTone = String(observation?.agronomicStatus || observation?.conditionStatus || observation?.evaluation?.state || '').toLowerCase()
  if (backendTone.includes('critical')) return 'critical'
  if (backendTone.includes('warning') || backendTone.includes('watch')) return 'watch'
  if (backendTone.includes('optimal') || backendTone.includes('healthy')) return 'good'
  const optimal = getRange(profile, metric)
  if (!optimal) return 'neutral'
  if (value >= optimal[0] && value <= optimal[1]) return 'good'
  const critical = getRange(profile, metric, 'critical')
  if (critical) {
    const criticalWrapsOptimal = critical[0] <= optimal[0] && critical[1] >= optimal[1]
    if (criticalWrapsOptimal ? value < critical[0] || value > critical[1] : value >= critical[0] && value <= critical[1]) return 'critical'
  }
  return 'watch'
}

function getDelta(section: SectionReading, metric: Metric): number | null {
  const observation = getObservation(section, metric)
  return numeric(observation?.change1h ?? observation?.delta1h ?? observation?.hourChange)
}

function formatValue(value: number | null, metric: Metric) {
  if (value === null) return '—'
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals }).format(value)
}

function formatAge(section: SectionReading) {
  const age = getAgeSeconds(section)
  if (age === null) return 'No timestamp'
  if (age < 60) return `${Math.max(1, Math.round(age))} sec ago`
  if (age < 3600) return `${Math.round(age / 60)} min ago`
  return `${Math.round(age / 3600)} h ago`
}

function normalizedDeviation(section: SectionReading, metricList: Metric[], profiles: Map<string, JsonRecord>) {
  return metricList.reduce((total, metric) => {
    const value = getValue(section, metric)
    const range = getRange(profiles.get(section.profileId), metric)
    if (value === null || !range) return total
    if (value >= range[0] && value <= range[1]) return total
    const width = Math.max(0.001, range[1] - range[0])
    return total + Math.abs(value < range[0] ? value - range[0] : value - range[1]) / width
  }, 0)
}

function getDistributionVisual(section: SectionReading, metric: Metric, profile: JsonRecord | undefined) {
  const value = getValue(section, metric)
  const optimal = getRange(profile, metric)
  const warning = getRange(profile, metric, 'warning') || optimal
  const critical = getRange(profile, metric, 'critical') || warning
  if (!optimal || !warning || !critical) return { marker: 4, zones: [] as Array<{ tone: ReadingTone; left: number; width: number }> }
  const scaleMin = Math.min(critical[0], warning[0], optimal[0], value ?? critical[0])
  const scaleMax = Math.max(critical[1], warning[1], optimal[1], value ?? critical[1])
  const span = Math.max(.001, scaleMax - scaleMin)
  const position = (point: number) => Math.max(0, Math.min(100, ((point - scaleMin) / span) * 100))
  const zone = (tone: ReadingTone, start: number, end: number) => ({ tone, left: position(start), width: Math.max(0, position(end) - position(start)) })
  return {
    marker: Math.max(2, Math.min(98, position(value ?? scaleMin))),
    zones: [
      zone('critical', scaleMin, warning[0]),
      zone('watch', warning[0], optimal[0]),
      zone('good', optimal[0], optimal[1]),
      zone('watch', optimal[1], warning[1]),
      zone('critical', warning[1], scaleMax),
    ].filter((item) => item.width > 0),
  }
}

function ReadingCell({ section, metric, profile, mode, onOpenTrend }: { section: SectionReading; metric: Metric; profile?: JsonRecord; mode: ReadingMode; onOpenTrend: () => void }) {
  const value = getValue(section, metric)
  const quality = getQuality(section, metric)
  const tone = getTone(section, metric, profile)
  const target = getRange(profile, metric)
  const delta = getDelta(section, metric)
  let display = value === null ? qualityLabels[quality] : `${formatValue(value, metric)} ${metric.unit}`
  if (mode === 'target') {
    display = target ? `${formatValue(target[0], metric)}–${formatValue(target[1], metric)} ${metric.unit}` : 'No crop target'
  } else if (mode === 'change') {
    display = delta === null ? 'No 1h baseline' : `${delta > 0 ? '+' : ''}${formatValue(delta, metric)} ${metric.unit} / 1h`
  }
  return <button type="button" className="nc-reading-cell" data-tone={tone} data-quality={quality} onClick={onOpenTrend} title={`Open ${section.name} ${metric.label.toLowerCase()} trend`} aria-label={`Open ${section.name} ${metric.label} trend`}>
    <strong>{display}</strong><i aria-label={qualityLabels[quality]} />
  </button>
}

function PinnedSparkline({ points, target, metric, label, periodLabel = '24h' }: { points: HistoryPoint[]; target: [number, number] | null; metric: Metric; label: string; periodLabel?: string }) {
  const width = 320
  const height = 72
  const padding = 4
  const values = points.map((point) => point.value)
  const domainValues = target ? [...values, ...target] : values
  const rawMin = Math.min(...domainValues)
  const rawMax = Math.max(...domainValues)
  const rawSpan = Math.max(0.001, rawMax - rawMin)
  const domainPadding = Math.max(rawSpan * 0.08, 10 ** -metric.decimals)
  const domainMin = rawMin - domainPadding
  const domainMax = rawMax + domainPadding
  const domainSpan = Math.max(0.001, domainMax - domainMin)
  const x = (index: number) => padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
  const y = (value: number) => padding + ((domainMax - value) / domainSpan) * (height - padding * 2)
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`
  const targetTop = target ? Math.min(y(target[0]), y(target[1])) : 0
  const targetHeight = target ? Math.max(2, Math.abs(y(target[0]) - y(target[1]))) : 0
  const lastPoint = points.at(-1)
  const middlePoint = points[Math.floor((points.length - 1) / 2)]
  const formatTime = (point: HistoryPoint | undefined) => point?.observedAt
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(point.observedAt))
    : '—'

  return <figure className="nc-pinned-chart" data-metric={metric.key} aria-label={`${label}, ${periodLabel} history`}>
    <figcaption>{metric.label} over the last {periodLabel}</figcaption>
    <span className="nc-pinned-y-title">{metric.short} ({metric.unit})</span>
    <div className="nc-pinned-y-scale"><span>{formatValue(domainMax, metric)}</span><span>{formatValue((domainMin + domainMax) / 2, metric)}</span><span>{formatValue(domainMin, metric)}</span></div>
    <svg className="nc-pinned-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-hidden="true">
      <line className="nc-pinned-chart-grid" x1={padding} y1={padding} x2={width - padding} y2={padding} />
      <line className="nc-pinned-chart-grid" x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} />
      <line className="nc-pinned-chart-grid" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      {target ? <rect className="nc-pinned-chart-target" x={padding} y={targetTop} width={width - padding * 2} height={targetHeight} rx="2" /> : null}
      <polygon className="nc-pinned-chart-area" points={area} />
      <polyline className="nc-pinned-chart-line" points={line} />
      {lastPoint ? <circle className="nc-pinned-chart-point" cx={x(points.length - 1)} cy={y(lastPoint.value)} r="3.5" /> : null}
    </svg>
    <div className="nc-pinned-x-axis"><span>{formatTime(points[0])}</span><strong>Time ({periodLabel})</strong><span>{formatTime(middlePoint)}</span><span>{formatTime(lastPoint)}</span></div>
  </figure>
}

function TrendPreviewChart({ points, target, metric, periodLabel }: { points: HistoryPoint[]; target: [number, number] | null; metric: Metric; periodLabel: TrendRangeKey }) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const charts = (window as Window & { NeuroCropTrendCharts?: SharedTrendChartsApi }).NeuroCropTrendCharts
    const element = chartRef.current
    if (!charts || !element || points.length < 2) return
    const chart = charts.render(element, {
      points,
      metricKey: metric.key,
      label: metric.label,
      unit: metric.unit,
      decimals: metric.decimals,
      target,
      rangeKey: periodLabel,
    })
    if (!chart) return

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
  }, [metric, periodLabel, points, target])

  return <div ref={chartRef} className="nc-trend-echart" role="img" aria-label={`${metric.label} ${periodLabel} trend chart`} />
}

export default function ReadingsWorkspace() {
  const [sections, setSections] = useState<SectionReading[]>([])
  const [areaOptions, setAreaOptions] = useState<Array<[string, string]>>([])
  const [profiles, setProfiles] = useState<Map<string, JsonRecord>>(new Map())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [sortBy, setSortBy] = useState('severity')
  const [mode, setMode] = useState<ReadingMode>('value')
  const [activePreset, setActivePreset] = useState('essential')
  const [visibleKeys, setVisibleKeys] = useState<string[]>([...presets[0].keys])
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [pinned, setPinned] = useState<string[]>([])
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [lensOpen, setLensOpen] = useState(false)
  const [lensMetricKey, setLensMetricKey] = useState('humidity')
  const [pinnedHistory, setPinnedHistory] = useState<Record<string, PinnedHistoryState>>({})
  const [trendPreview, setTrendPreview] = useState<{ sectionId: string; metricKey: string } | null>(null)
  const [trendRange, setTrendRange] = useState<TrendRangeKey>('24h')
  const [trendPreviewHistory, setTrendPreviewHistory] = useState<PinnedHistoryState>({ status: 'empty', points: [] })
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setRefreshing(true)
      setError('')
      try {
        const [dashboardResult, profilesResult, areasResult, sectionsResult] = await Promise.allSettled([
          neurocropApi.getDashboard(),
          neurocropApi.getCropProfiles(),
          neurocropApi.getAreas(),
          neurocropApi.getSections(),
        ])
        if (cancelled) return
        if (dashboardResult.status === 'rejected' && sectionsResult.status === 'rejected') {
          throw dashboardResult.reason
        }
        const dashboardPayload = dashboardResult.status === 'fulfilled' ? dashboardResult.value as JsonRecord : {}
        const profilesPayload = profilesResult.status === 'fulfilled' ? profilesResult.value as JsonRecord : { profiles: [] }
        const areasPayload = areasResult.status === 'fulfilled' ? areasResult.value as JsonRecord : { areas: [] }
        const sectionsPayload = sectionsResult.status === 'fulfilled' ? sectionsResult.value as JsonRecord : { sections: [] }
        const profileMap = new Map<string, JsonRecord>()
        asArray(profilesPayload?.profiles).forEach((profile) => {
          const id = String(profile.id || profile.key || profile.slug || '')
          if (id) profileMap.set(id, profile)
        })
        const dashboardAreas = recordArray(dashboardPayload, ['sites', 'areas'])
        const managementAreas = recordArray(areasPayload, ['areas', 'sites', 'items'])
        const availableAreas = dashboardAreas.length ? dashboardAreas : managementAreas
        const mergedAreaOptions = new Map<string, string>()
        ;[...dashboardAreas, ...managementAreas].forEach((area) => {
          const id = areaIdentity(area)
          if (id) mergedAreaOptions.set(id, areaLabel(area))
        })
        setAreaOptions([...mergedAreaOptions])

        let flatSections = dashboardAreas.flatMap((site) => {
          const areaId = areaIdentity(site)
          return recordArray(site, ['zones', 'sections']).map((zone) => ({ site: { ...site, id: areaId, name: areaLabel(site) }, zone }))
        })
        if (!flatSections.length) {
          const managementSections = recordArray(sectionsPayload, ['sections', 'zones', 'items'])
          const areasById = new Map(availableAreas.map((area) => [areaIdentity(area), area]))
          flatSections = managementSections.map((zone) => {
            const areaId = String(zone.areaId || zone.area_id || zone.siteId || zone.site_id || zone.area?.id || zone.site?.id || '')
            const sourceArea = areasById.get(areaId) || zone.area || zone.site || { id: areaId, name: zone.areaName || zone.area_name || zone.siteName || zone.site_name || 'Unassigned' }
            return { site: { ...sourceArea, id: areaId, name: areaLabel(sourceArea) }, zone }
          })
        }
        const baseSections = flatSections.map(({ site, zone }): SectionReading => {
          const profileId = String(zone.profile?.id || zone.profile || zone.profileId || zone.profile_id || zone.cropProfile || zone.crop_profile || 'default')
          const profile = profileMap.get(profileId)
          return {
            id: String(zone.id), name: String(zone.name || zone.id), areaId: String(site.id), areaName: String(site.name || site.id),
            profileId, profileName: String(profile?.name || zone.profileName || profileId || 'No profile'),
            availableMetrics: new Set(asArray<string>(zone.availableMetrics)), configuredMetrics: new Set(asArray<string>(zone.configuredMetrics)),
            nodes: asArray(zone.batteryNodes), latest: null, loadFailed: false,
          }
        })
        setProfiles(profileMap)
        setSections((current) => baseSections.map((section) => {
          const previous = current.find((item) => item.id === section.id)
          return previous ? { ...section, latest: previous.latest, loadFailed: previous.loadFailed } : section
        }))
        setPinned((current) => current.filter((id) => baseSections.some((section) => section.id === id)))
        setStatus('ready')

        const latestResults = await mapWithConcurrency(baseSections, 6, async (section) => {
          try {
            const latest = await neurocropApi.getLatestReadings(section.id) as JsonRecord
            return { id: section.id, latest, loadFailed: false }
          } catch {
            return { id: section.id, latest: null, loadFailed: true }
          }
        })
        if (cancelled) return
        const latestBySection = new Map(latestResults.map((result) => [result.id, result]))
        setSections((current) => current.map((section) => {
          const result = latestBySection.get(section.id)
          if (!result) return section
          return {
            ...section,
            latest: result.latest || section.latest,
            loadFailed: result.loadFailed,
          }
        }))
      } catch (loadError) {
        if (cancelled) return
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : 'Live readings could not be loaded.')
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    }
    load()
    const interval = window.setInterval(() => {
      if (!document.hidden) setRefreshToken((value) => value + 1)
    }, 60_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [refreshToken])

  useEffect(() => {
    if (!drawerId && !trendPreview) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDrawerId(null)
      setTrendPreview(null)
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [drawerId, trendPreview])

  useEffect(() => {
    if (!pinned.length) return
    let cancelled = false
    if (!historySupportedMetricKeys.has(lensMetricKey)) return

    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
    pinned.forEach(async (sectionId) => {
      const key = `${sectionId}:${lensMetricKey}`
      try {
        const payload = await neurocropApi.getHistory({
          sectionId,
          metric: lensMetricKey,
          from: from.toISOString(),
          to: to.toISOString(),
          stepMinutes: 60,
        }) as JsonRecord
        if (cancelled) return
        const points = asArray(payload?.points).map((point) => ({
          observedAt: String(point.observedAt || point.receivedAt || ''),
          value: numeric(point.value),
        })).filter((point): point is HistoryPoint => Boolean(point.observedAt) && point.value !== null)
        setPinnedHistory((current) => ({ ...current, [key]: { status: points.length >= 2 ? 'ready' : 'empty', points } }))
      } catch {
        if (cancelled) return
        setPinnedHistory((current) => ({ ...current, [key]: { status: 'error', points: [] } }))
      }
    })

    return () => { cancelled = true }
  }, [pinned, lensMetricKey, refreshToken])

  useEffect(() => {
    if (!trendPreview) return
    let cancelled = false
    const range = trendRanges[trendRange]
    const to = new Date()
    const from = new Date(to.getTime() - range.hours * 60 * 60 * 1000)

    neurocropApi.getHistory({
      sectionId: trendPreview.sectionId,
      metric: trendPreview.metricKey,
      from: from.toISOString(),
      to: to.toISOString(),
      stepMinutes: range.stepMinutes,
    }).then((payload) => {
      if (cancelled) return
      const response = payload as JsonRecord
      const points = asArray(response?.points).map((point) => ({
        observedAt: String(point.observedAt || point.receivedAt || ''),
        value: numeric(point.value),
      })).filter((point): point is HistoryPoint => Boolean(point.observedAt) && point.value !== null)
      setTrendPreviewHistory({ status: points.length >= 2 ? 'ready' : 'empty', points })
    }).catch(() => {
      if (!cancelled) setTrendPreviewHistory({ status: 'error', points: [] })
    })

    return () => { cancelled = true }
  }, [trendPreview, trendRange, refreshToken])

  const visibleMetrics = useMemo(() => visibleKeys.map((key) => metrics.find((metric) => metric.key === key)).filter((metric): metric is Metric => Boolean(metric)), [visibleKeys])
  const visibleSections = useMemo(() => sections.filter((section) => {
    if (areaFilter !== 'all' && section.areaId !== areaFilter) return false
    if (!attentionOnly) return true
    return visibleMetrics.some((metric) => ['watch', 'critical'].includes(getTone(section, metric, profiles.get(section.profileId))) || getQuality(section, metric) !== 'live')
  }).sort((left, right) => {
    if (sortBy === 'freshest') return (getAgeSeconds(left) ?? Infinity) - (getAgeSeconds(right) ?? Infinity)
    if (sortBy === 'oldest') return (getAgeSeconds(right) ?? Infinity) - (getAgeSeconds(left) ?? Infinity)
    if (sortBy === 'area') return left.areaName.localeCompare(right.areaName) || left.name.localeCompare(right.name)
    if (sortBy === 'section') return left.name.localeCompare(right.name)
    return normalizedDeviation(right, visibleMetrics, profiles) - normalizedDeviation(left, visibleMetrics, profiles)
  }), [sections, areaFilter, attentionOnly, sortBy, visibleMetrics, profiles])

  const freshness = sections.reduce((counts, section) => {
    counts[getSectionFreshness(section)] += 1
    return counts
  }, { live: 0, stale: 0, offline: 0 })
  const readingsUnavailable = status === 'error' && !sections.length
  const selectedSection = sections.find((section) => section.id === drawerId)
  const trendPreviewSection = sections.find((section) => section.id === trendPreview?.sectionId)
  const trendPreviewMetric = metrics.find((metric) => metric.key === trendPreview?.metricKey)
  const pinnedSections = pinned.map((id) => sections.find((section) => section.id === id)).filter((section): section is SectionReading => Boolean(section))
  const lensMetric = metrics.find((metric) => metric.key === lensMetricKey) || metrics[0]
  const matrixStyle = { gridTemplateColumns: `minmax(15rem,1.3fr) repeat(${visibleMetrics.length},minmax(7.5rem,.7fr)) minmax(7.75rem,.72fr) 2.5rem`, minWidth: `${27 + visibleMetrics.length * 8}rem` }

  function selectPreset(preset: typeof presets[number]) {
    setActivePreset(preset.key)
    setVisibleKeys([...preset.keys])
  }

  function toggleMetric(key: string) {
    setVisibleKeys((current) => current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key])
    setActivePreset('custom')
  }

  function togglePin(id: string) {
    setPinned((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current)
  }

  function openMetricTrend(section: SectionReading, metric: Metric) {
    window.postMessage({
      type: 'neurocrop:open-trend',
      areaId: section.areaId,
      sectionId: section.id,
      metricKey: metric.key,
    }, window.location.origin)
  }

  function openTrendPreview(section: SectionReading, metric: Metric) {
    setDrawerId(null)
    setTrendRange('24h')
    setTrendPreviewHistory({ status: 'loading', points: [] })
    setTrendPreview({ sectionId: section.id, metricKey: metric.key })
  }

  function exportCsv() {
    const header = ['Section', 'Area', 'Crop profile', ...visibleMetrics.map((metric) => `${metric.label} (${metric.unit})`), 'Latest data']
    const rows = visibleSections.map((section) => [section.name, section.areaName, section.profileName, ...visibleMetrics.map((metric) => {
      const value = getValue(section, metric)
      return value === null ? qualityLabels[getQuality(section, metric)] : value
    }), formatAge(section)])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'neurocrop-live-readings.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <main className="nc-readings-workspace" aria-busy={status === 'loading'}>
    <header className="nc-readings-hero">
      <div><p className="nc-overline">Live workspace</p><h1>Live readings, section by section.</h1><p>Compare current measurements across the operation. Cell color shows crop status; the small marker shows whether the reading can be trusted.</p></div>
      <div className="nc-readings-actions"><span><strong>{readingsUnavailable ? 'Sections unavailable' : `${sections.length} sections monitored`}</strong><small>{refreshing ? 'Refreshing current measurements…' : readingsUnavailable ? 'Live data could not be loaded' : 'Updated from live node packets'}</small></span><button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={refreshing}><i className="fa-solid fa-rotate" />Refresh</button><button type="button" onClick={exportCsv} disabled={!visibleSections.length}><i className="fa-solid fa-download" />Export</button></div>
    </header>

    {status === 'error' ? <section className="nc-readings-state" role="alert"><i className="fa-solid fa-triangle-exclamation" /><div><strong>Readings could not be loaded</strong><p>{error}</p></div><button type="button" onClick={() => setRefreshToken((value) => value + 1)}>Try again</button></section> : null}
    <section className="nc-readings-health" aria-label="Live data availability"><div><b>{readingsUnavailable ? '—' : freshness.live}</b><span><strong>Current</strong><small>Arriving on schedule</small></span></div><div data-state="stale"><b>{readingsUnavailable ? '—' : freshness.stale}</b><span><strong>Delayed</strong><small>Usable, clearly marked</small></span></div><div data-state="offline"><b>{readingsUnavailable ? '—' : freshness.offline}</b><span><strong>Interrupted</strong><small>No current aggregate</small></span></div><p><i className="fa-solid fa-circle-info" /> Missing, stale and uninstalled sensors are never converted to zero.</p></section>

    <section className="nc-readings-matrix" aria-labelledby="nc-readings-title">
      <header><div><p className="nc-overline">Live section matrix</p><h2 id="nc-readings-title">Every current reading in one place</h2><span>Choose a working set instead of forcing all 13 parameters onto every screen.</span></div><div className="nc-segmented" role="group" aria-label="Reading display"><button className={mode === 'value' ? 'active' : ''} onClick={() => setMode('value')}>Values</button><button className={mode === 'target' ? 'active' : ''} onClick={() => setMode('target')}>Against target</button><button className={mode === 'change' ? 'active' : ''} onClick={() => setMode('change')}>1h change</button></div></header>
      <div className="nc-readings-viewbar"><div className="nc-reading-presets">{presets.map((preset) => <button type="button" className={activePreset === preset.key ? 'active' : ''} onClick={() => selectPreset(preset)} key={preset.key}><i className={`fa-solid ${preset.icon}`} />{preset.label}<b>{preset.keys.length}</b></button>)}</div><div className="nc-column-control"><button type="button" className={columnsOpen ? 'active' : ''} onClick={() => setColumnsOpen(!columnsOpen)}><i className="fa-solid fa-table-columns" />Columns <b>{visibleMetrics.length}/13</b></button>{columnsOpen ? <div className="nc-column-menu"><header><strong>Visible parameters</strong><button onClick={() => setColumnsOpen(false)} aria-label="Close"><i className="fa-solid fa-xmark" /></button></header>{(['climate', 'root', 'lighting', 'system'] as const).map((group) => <fieldset key={group}><legend>{group === 'root' ? 'Root zone' : group}</legend>{metrics.filter((metric) => metric.group === group).map((metric) => <label key={metric.key}><input type="checkbox" checked={visibleKeys.includes(metric.key)} onChange={() => toggleMetric(metric.key)} /><i className={`fa-solid ${metric.icon}`} /><span>{metric.label}</span><small>{metric.unit}</small></label>)}</fieldset>)}</div> : null}</div></div>
      <div className="nc-readings-controls"><div className="nc-area-tabs" role="tablist" aria-label="Filter by Area"><button type="button" role="tab" aria-selected={areaFilter === 'all'} className={areaFilter === 'all' ? 'active' : ''} onClick={() => setAreaFilter('all')}>All areas <b>{sections.length}</b></button>{areaOptions.map(([id, name]) => <button type="button" role="tab" aria-selected={areaFilter === id} className={areaFilter === id ? 'active' : ''} onClick={() => setAreaFilter(id)} key={id}>{name} <b>{sections.filter((section) => section.areaId === id).length}</b></button>)}</div><div className="nc-readings-control-actions"><button type="button" className={attentionOnly ? 'active' : ''} onClick={() => setAttentionOnly(!attentionOnly)}><i className="fa-solid fa-filter" />Needs attention</button><label className="nc-sort"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="severity">Most outside target</option><option value="freshest">Freshest data</option><option value="oldest">Oldest data</option><option value="area">Area</option><option value="section">Section</option></select></label></div></div>
      <div className="nc-reading-legend"><span><i data-state="good" />Within crop target</span><span><i data-state="watch" />Outside target</span><span><i data-state="critical" />Critical</span><span><b />Data quality marker</span></div>
      <div className="nc-readings-matrix-scroll">
        <div className="nc-readings-row nc-readings-row-head" style={matrixStyle}><span>Section</span>{visibleMetrics.map((metric) => <span key={metric.key}>{metric.short}<small>{metric.unit}</small></span>)}<span>Latest data</span><span /></div>
        {status === 'loading' && !sections.length ? Array.from({ length: 4 }, (_, index) => <div className="nc-reading-skeleton" key={index} />) : visibleSections.map((section) => <div className="nc-readings-row" style={matrixStyle} key={section.id}><div className="nc-reading-section"><span data-state={normalizedDeviation(section, visibleMetrics, profiles) > 0 ? 'watch' : 'good'} /><button type="button" onClick={() => setDrawerId(section.id)} title={`${section.name} · ${section.areaName} · ${section.profileName}`}><strong>{section.name}</strong></button><button type="button" className={pinned.includes(section.id) ? 'pinned' : ''} disabled={!pinned.includes(section.id) && pinned.length >= 3} onClick={() => togglePin(section.id)} aria-label={`${pinned.includes(section.id) ? 'Unpin' : 'Pin'} ${section.name}`}><i className="fa-solid fa-thumbtack" /></button></div>{visibleMetrics.map((metric) => <ReadingCell section={section} metric={metric} profile={profiles.get(section.profileId)} mode={mode} onOpenTrend={() => openTrendPreview(section, metric)} key={metric.key} />)}<span className="nc-reading-freshness" data-quality={getSectionFreshness(section)}><strong>{formatAge(section)} · {section.nodes.length ? `${section.nodes.length} nodes` : 'No nodes'}</strong></span><button className="nc-reading-open" onClick={() => setDrawerId(section.id)} aria-label={`Inspect ${section.name}`}><i className="fa-solid fa-arrow-right" /></button></div>)}
        {status === 'ready' && !visibleSections.length ? <div className="nc-readings-empty">No sections match the selected filters.</div> : null}
      </div>
    </section>

    {pinnedSections.length ? <section className="nc-pinned-comparison"><header><div><p className="nc-overline">Pinned comparison · {pinnedSections.length}/3</p><h2>Keep the sections you are managing together</h2></div><label><span>Compare</span><select value={lensMetricKey} onChange={(event) => setLensMetricKey(event.target.value)}>{metrics.map((metric) => <option value={metric.key} key={metric.key}>{metric.label}</option>)}</select></label></header><div>{pinnedSections.map((section) => {
      const value = getValue(section, lensMetric)
      const profile = profiles.get(section.profileId)
      const target = getRange(profile, lensMetric)
      const tone = getTone(section, lensMetric, profile)
      const history = historySupportedMetricKeys.has(lensMetricKey)
        ? pinnedHistory[`${section.id}:${lensMetricKey}`] || { status: 'loading', points: [] }
        : { status: 'unsupported' as const, points: [] }
      const firstPoint = history.points[0]
      const lastPoint = history.points.at(-1)
      const historyDelta = firstPoint && lastPoint ? lastPoint.value - firstPoint.value : null
      return <article data-tone={tone} key={section.id}>
        <div className="nc-pinned-card-head"><span><i /><span><small>{section.areaName}</small><h3>{section.name}</h3></span></span><button type="button" onClick={() => togglePin(section.id)} aria-label={`Unpin ${section.name}`}><i className="fa-solid fa-xmark" /></button></div>
        <div className="nc-pinned-value-row"><strong>{formatValue(value, lensMetric)} <small>{lensMetric.unit}</small></strong><span>{historyDelta === null ? '24h change pending' : `${historyDelta > 0 ? '+' : ''}${formatValue(historyDelta, lensMetric)} ${lensMetric.unit} / 24h`}</span></div>
        {history.status === 'ready' ? <PinnedSparkline points={history.points} target={target} metric={lensMetric} label={`${section.name} ${lensMetric.label}`} /> : <div className="nc-pinned-chart-state" data-state={history.status}>{history.status === 'loading' ? 'Loading 24h history…' : history.status === 'unsupported' ? `24h history is unavailable for ${lensMetric.label.toLowerCase()}` : history.status === 'error' ? 'History could not be loaded' : 'Not enough history for a graph yet'}</div>}
        <div className="nc-pinned-card-footer"><span><small>Crop target</small><strong>{target?.map((bound) => formatValue(bound, lensMetric)).join('–') || 'Not set'} {target ? lensMetric.unit : ''}</strong></span><button type="button" onClick={() => setDrawerId(section.id)}>Inspect <i className="fa-solid fa-arrow-right" /></button></div>
      </article>
    })}</div></section> : null}

    <section className="nc-signal-lens"><button type="button" onClick={() => setLensOpen(!lensOpen)} aria-expanded={lensOpen}><span><i className="fa-solid fa-chart-simple" /><span><strong>Profile-normalized signal lens</strong><small>Compare one parameter across different crop targets when you need deeper analysis.</small></span></span><i className={`fa-solid fa-chevron-${lensOpen ? 'up' : 'down'}`} /></button>{lensOpen ? <div className="nc-signal-lens-content"><header><h2>{lensMetric.label} across sections</h2><select value={lensMetricKey} onChange={(event) => setLensMetricKey(event.target.value)}>{metrics.map((metric) => <option value={metric.key} key={metric.key}>{metric.label}</option>)}</select></header>{visibleSections.map((section) => { const value = getValue(section, lensMetric); const visual = getDistributionVisual(section, lensMetric, profiles.get(section.profileId)); return <div className="nc-distribution-row" key={section.id}><span><strong>{section.name}</strong><small>{section.areaName} · {section.profileName}</small></span><div className="nc-distribution-track">{visual.zones.map((zone, index) => <span data-tone={zone.tone} style={{ left: `${zone.left}%`, width: `${zone.width}%` }} key={index} />)}<i style={{ left: `${visual.marker}%` }} data-tone={getTone(section, lensMetric, profiles.get(section.profileId))} /></div><strong>{formatValue(value, lensMetric)} <small>{lensMetric.unit}</small></strong><button onClick={() => togglePin(section.id)} disabled={!pinned.includes(section.id) && pinned.length >= 3}><i className="fa-solid fa-thumbtack" /></button></div>})}</div> : null}</section>

    {trendPreviewSection && trendPreviewMetric ? <div className="nc-readings-drawer-backdrop nc-trend-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setTrendPreview(null) }}><aside className="nc-readings-drawer nc-trend-preview" role="dialog" aria-modal="true" aria-label={`${trendPreviewSection.name} ${trendPreviewMetric.label} trend`}><header><div><p className="nc-overline">Measurement trend</p><h2>{trendPreviewMetric.label}</h2><span>{trendPreviewSection.areaName} · {trendPreviewSection.name}</span></div><button type="button" onClick={() => setTrendPreview(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button></header><div className="nc-trend-preview-body"><div className="nc-trend-current" data-tone={getTone(trendPreviewSection, trendPreviewMetric, profiles.get(trendPreviewSection.profileId))}><span><small>Current reading</small><strong>{formatValue(getValue(trendPreviewSection, trendPreviewMetric), trendPreviewMetric)} <em>{trendPreviewMetric.unit}</em></strong></span><span><small>Crop target</small><strong>{getRange(profiles.get(trendPreviewSection.profileId), trendPreviewMetric)?.map((bound) => formatValue(bound, trendPreviewMetric)).join('–') || 'Not set'} <em>{getRange(profiles.get(trendPreviewSection.profileId), trendPreviewMetric) ? trendPreviewMetric.unit : ''}</em></strong></span></div><div className="nc-trend-range" role="group" aria-label="Trend period">{(Object.keys(trendRanges) as TrendRangeKey[]).map((range) => <button type="button" className={trendRange === range ? 'active' : ''} onClick={() => { setTrendPreviewHistory({ status: 'loading', points: [] }); setTrendRange(range) }} key={range}>{range}</button>)}</div>{trendPreviewHistory.status === 'ready' ? <TrendPreviewChart points={trendPreviewHistory.points} target={getRange(profiles.get(trendPreviewSection.profileId), trendPreviewMetric)} metric={trendPreviewMetric} periodLabel={trendRange} /> : <div className="nc-trend-preview-state" data-state={trendPreviewHistory.status}>{trendPreviewHistory.status === 'loading' ? 'Loading measurement history…' : trendPreviewHistory.status === 'error' ? 'History could not be loaded' : 'Not enough measurements for this period'}</div>}<p className="nc-trend-preview-note"><i className="fa-solid fa-circle-info" /> Chart values are aggregated from this Section's sensor history. Drag or scroll the chart to inspect dense periods.</p></div><footer><button type="button" onClick={() => { setTrendPreviewHistory({ status: 'loading', points: [] }); setRefreshToken((value) => value + 1) }}><i className="fa-solid fa-rotate" />Refresh</button><button type="button" className="primary" onClick={() => { setTrendPreview(null); openMetricTrend(trendPreviewSection, trendPreviewMetric) }}>Open full Trends <i className="fa-solid fa-arrow-right" /></button></footer></aside></div> : null}

    {selectedSection ? <div className="nc-readings-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDrawerId(null) }}><aside className="nc-readings-drawer" role="dialog" aria-modal="true" aria-label={`${selectedSection.name} readings`}><header><div><p className="nc-overline">Section detail</p><h2>{selectedSection.name}</h2><span>{selectedSection.areaName} · {selectedSection.profileName}</span></div><button onClick={() => setDrawerId(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button></header><div className="nc-drawer-summary"><i className="fa-solid fa-tower-broadcast" /><span><strong>{formatAge(selectedSection)}</strong><small>{selectedSection.nodes.length} configured nodes</small></span></div><div className="nc-drawer-metrics">{metrics.map((metric) => <div className="nc-drawer-metric" data-tone={getTone(selectedSection, metric, profiles.get(selectedSection.profileId))} key={metric.key}><span><i className={`fa-solid ${metric.icon}`} /><span><strong>{metric.label}</strong><small>{qualityLabels[getQuality(selectedSection, metric)]}</small></span></span><span><strong>{formatValue(getValue(selectedSection, metric), metric)} {getValue(selectedSection, metric) === null ? '' : metric.unit}</strong><small>{getRange(profiles.get(selectedSection.profileId), metric)?.map((bound) => formatValue(bound, metric)).join('–') || 'No target'} {metric.unit}</small></span></div>)}</div><footer><button onClick={() => togglePin(selectedSection.id)} disabled={!pinned.includes(selectedSection.id) && pinned.length >= 3}><i className="fa-solid fa-thumbtack" />{pinned.includes(selectedSection.id) ? 'Unpin section' : 'Pin comparison'}</button><button className="primary" onClick={() => { window.postMessage({ type: 'neurocrop:navigate', route: '/sections' }, window.location.origin); setDrawerId(null) }}>Open Sections</button></footer></aside></div> : null}
  </main>
}
