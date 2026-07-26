import { useEffect, useMemo, useRef, useState } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { neurocropApi } from '../../services/api/neurocropApi'
import { renderTrendChart } from './sharedTrendChart'
import '../../styles/trends-workspace.css'

// API records remain open because telemetry payloads can gain metrics independently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type RangeKey = '24h' | '7d' | '30d'
type TrendScope = 'section' | 'nodes'
type Point = { observedAt: string; value: number }
type Section = { id: string; name: string; areaId: string; areaName: string; profileId: string; available: Set<string> }
type NodeOption = { devEui: string; name: string; sectionId: string; transportStatus: string }
type Metric = { key: string; label: string; short: string; unit: string; decimals: number; icon: string }
type LoadState = 'loading' | 'ready' | 'empty' | 'error'

const metrics: Metric[] = [
  { key: 'airTemp', label: 'Air temperature', short: 'Temperature', unit: '°C', decimals: 1, icon: 'fa-temperature-half' },
  { key: 'humidity', label: 'Relative humidity', short: 'Humidity', unit: '%', decimals: 1, icon: 'fa-droplet' },
  { key: 'vpd', label: 'Vapour pressure deficit', short: 'VPD', unit: 'kPa', decimals: 2, icon: 'fa-wave-square' },
  { key: 'co2', label: 'Carbon dioxide', short: 'CO₂', unit: 'ppm', decimals: 0, icon: 'fa-wind' },
  { key: 'leafTemp', label: 'Leaf temperature', short: 'Leaf temp.', unit: '°C', decimals: 1, icon: 'fa-leaf' },
  { key: 'soilMoisture', label: 'Soil moisture', short: 'Moisture', unit: '%', decimals: 1, icon: 'fa-water' },
  { key: 'soilTemp', label: 'Soil temperature', short: 'Soil temp.', unit: '°C', decimals: 1, icon: 'fa-seedling' },
  { key: 'ec', label: 'Electrical conductivity', short: 'EC', unit: 'mS/cm', decimals: 2, icon: 'fa-bolt' },
  { key: 'ph', label: 'pH', short: 'pH', unit: 'pH', decimals: 1, icon: 'fa-flask' },
  { key: 'waterTemp', label: 'Water temperature', short: 'Water temp.', unit: '°C', decimals: 1, icon: 'fa-temperature-low' },
  { key: 'lux', label: 'Light', short: 'Light', unit: 'lx', decimals: 0, icon: 'fa-sun' },
  { key: 'batteryLevel', label: 'Battery level', short: 'Battery', unit: '%', decimals: 0, icon: 'fa-battery-half' },
]

const rangeConfig: Record<RangeKey, { hours: number; stepMinutes: number; label: string }> = {
  '24h': { hours: 24, stepMinutes: 10, label: 'Last 24 hours' },
  '7d': { hours: 168, stepMinutes: 60, label: 'Last 7 days' },
  '30d': { hours: 720, stepMinutes: 240, label: 'Last 30 days' },
}
const storageKey = 'neurocrop-trends-workspace-v2'
const chartColors = ['#287f70', '#d87655', '#507ea2', '#b18a35', '#845f8e', '#68746f']

function arrays(payload: JsonRecord | null | undefined, keys: string[]) {
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

function areaIdentity(area: JsonRecord) {
  return text(area.id || area.areaId || area.area_id || area.siteId || area.site_id)
}

function areaLabel(area: JsonRecord) {
  return text(area.name || area.areaName || area.area_name || area.siteName || area.site_name || area.id, 'Unnamed area')
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

function nodeList(payload: JsonRecord): NodeOption[] {
  return arrays(payload, ['nodes', 'items']).map((node): NodeOption | null => {
    const devEui = text(node.devEui || node.dev_eui).trim().toLowerCase()
    const sectionId = text(node.sectionId || node.section_id)
    if (!devEui || !sectionId) return null
    return {
      devEui,
      name: text(node.name || node.nodeName || node.node_name || node.id, devEui),
      sectionId,
      transportStatus: text(node.transportStatus || node.transport_status, 'unknown'),
    }
  }).filter((node): node is NodeOption => Boolean(node))
}

function metricSet(section: JsonRecord) {
  const values = [
    ...arrays({ items: section.availableMetrics || section.available_metrics }, ['items']),
    ...arrays({ items: section.configuredMetrics || section.configured_metrics }, ['items']),
  ]
  const available = new Set(values.map((item) => typeof item === 'string' ? item : text(item?.key || item?.metric)).filter(Boolean))
  if (available.has('airTemp') && available.has('humidity')) available.add('vpd')
  return available
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function format(value: number | null, metric: Metric) {
  return value === null ? '—' : new Intl.NumberFormat(undefined, {
    minimumFractionDigits: metric.decimals,
    maximumFractionDigits: metric.decimals,
  }).format(value)
}

function loadStoredSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return typeof value === 'object' && value ? value : {}
  } catch {
    return {}
  }
}

function sectionList(dashboard: JsonRecord, areaPayload: JsonRecord, sectionPayload: JsonRecord): Section[] {
  const dashboardAreas = arrays(dashboard, ['sites', 'areas'])
  const managementAreas = arrays(areaPayload, ['areas', 'sites', 'items'])
  const areaMap = new Map<string, string>()
  ;[...dashboardAreas, ...managementAreas].forEach((area) => {
    const id = areaIdentity(area)
    if (id) areaMap.set(id, areaLabel(area))
  })

  const dashboardSections = new Map<string, { area: JsonRecord; section: JsonRecord }>()
  dashboardAreas.forEach((area) => arrays(area, ['zones', 'sections']).forEach((section) => {
    const id = sectionIdentity(section)
    if (id) dashboardSections.set(id, { area, section })
  }))

  const managementSections = arrays(sectionPayload, ['sections', 'zones', 'items'])
  const sourceSections = managementSections.length
    ? managementSections
    : [...dashboardSections.values()].map(({ section }) => section)

  return sourceSections.map((source): Section | null => {
    const id = sectionIdentity(source)
    if (!id) return null
    const dashboardEntry = dashboardSections.get(id)
    const merged = { ...(dashboardEntry?.section || {}), ...source }
    const areaId = sectionAreaId(merged) || areaIdentity(dashboardEntry?.area || {})
    if (!areaId) return null
    const areaName = areaMap.get(areaId) || text(merged.areaName || merged.area_name, areaId)
    const available = metricSet(merged)
    return {
      id,
      name: text(merged.name || merged.sectionName || merged.section_name || id),
      areaId,
      areaName,
      profileId: sectionProfileId(merged),
      available,
    }
  }).filter((section): section is Section => Boolean(section))
}

function historyPoints(payload: JsonRecord): Point[] {
  return arrays(payload, ['points', 'items', 'history']).map((point) => ({
    observedAt: String(point.observedAt || point.receivedAt || point.time || ''),
    value: Number(point.value),
  })).filter((point) => point.observedAt && Number.isFinite(point.value))
    .sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime())
}

function profileRange(profiles: JsonRecord[], profileId: string, metricKey: string): [number, number] | null {
  const profile = profiles.find((item) => String(item.id || item.profileId) === profileId)
  const raw = profile?.metrics?.[metricKey]?.optimal
  const minimum = number(raw?.[0])
  const maximum = number(raw?.[1])
  return minimum === null || maximum === null ? null : [minimum, maximum]
}

function trendSummary(points: Point[], target: [number, number] | null, metric: Metric) {
  if (!points.length) return { tone: 'neutral', title: 'Waiting for measured history', body: 'No trend can be interpreted until sensor history is available.' }
  const first = points[0].value
  const current = points.at(-1)!.value
  const delta = current - first
  const movement = Math.abs(delta) <= Math.max(10 ** -metric.decimals, Math.abs(current) * .005)
    ? 'stable' : delta > 0 ? 'rising' : 'falling'
  if (!target) return {
    tone: 'neutral',
    title: `${metric.label} is ${movement}`,
    body: `It changed by ${delta > 0 ? '+' : ''}${format(delta, metric)} ${metric.unit} across the selected period. Configure a crop target to evaluate agronomic direction.`,
  }
  const outside = current < target[0] || current > target[1]
  if (!outside) return {
    tone: 'good',
    title: movement === 'stable' ? 'Holding inside target' : 'Inside target with active movement',
    body: `${format(current, metric)} ${metric.unit} is currently inside ${format(target[0], metric)}–${format(target[1], metric)} ${metric.unit}; the period trend is ${movement}.`,
  }
  const above = current > target[1]
  const recovering = (above && delta < 0) || (!above && delta > 0)
  const distance = above ? current - target[1] : target[0] - current
  return {
    tone: recovering ? 'watch' : 'critical',
    title: recovering ? 'Outside target, but moving toward recovery' : `Persistent ${above ? 'high' : 'low'} condition`,
    body: `${metric.label} is ${format(distance, metric)} ${metric.unit} ${above ? 'above' : 'below'} target and is ${movement} across this period.`,
  }
}

type ChartInput = {
  name: string
  points: Point[]
  color: string
}

type MetricChartInput = {
  metric: Metric
  points: Point[]
  color: string
  target: [number, number] | null
}

function TrendChart({ series, metric, target, range }: { series: ChartInput[]; metric: Metric; target: [number, number] | null; range: RangeKey }) {
  const ref = useRef<HTMLDivElement>(null)
  const { language } = useInterfaceLanguage()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const chart = renderTrendChart(element, {
      metric,
      series,
      target,
      rangeKey: range,
    })
    if (!chart) return
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
  }, [language, metric, range, series, target])
  return <div className="nc-trends-chart" ref={ref} role="img" aria-label={`${metric.label}, ${range} trend`} />
}

function MultiMetricChart({ items, range }: { items: MetricChartInput[]; range: RangeKey }) {
  const ref = useRef<HTMLDivElement>(null)
  const { language } = useInterfaceLanguage()
  useEffect(() => {
    const echarts = window.echarts as {
      init?: (element: HTMLElement) => { setOption: (option: JsonRecord) => void; resize: () => void; dispose: () => void }
    } | undefined
    const visibleItems = items.filter((item) => item.points.length > 1)
    if (!ref.current || !visibleItems.length) return
    if (visibleItems.length === 1) {
      const item = visibleItems[0]
      const singleChart = renderTrendChart(ref.current, {
        metric: item.metric,
        series: [{ name: item.metric.label, color: item.color, points: item.points }],
        target: item.target,
        rangeKey: range,
      })
      if (!singleChart) return
      const singleObserver = new ResizeObserver(() => singleChart.resize())
      singleObserver.observe(ref.current)
      return () => {
        singleObserver.disconnect()
        singleChart.dispose()
      }
    }
    if (!echarts?.init) return
    const chart = echarts.init(ref.current)
    const stacked = visibleItems.length > 2
    const axisStyle = (item: MetricChartInput, index: number) => {
      const values = item.points.map((point) => point.value)
      const domain = item.target ? [...values, ...item.target] : values
      const minimum = Math.min(...domain)
      const maximum = Math.max(...domain)
      const padding = Math.max((maximum - minimum) * .12, 10 ** -item.metric.decimals * 4)
      const axisMinimum = item.metric.key === 'batteryLevel' ? 0 : minimum - padding
      const axisMaximum = item.metric.key === 'batteryLevel' ? 100 : maximum + padding
      return {
        type: 'value',
        gridIndex: stacked ? index : 0,
        position: !stacked && index === 1 ? 'right' : 'left',
        min: axisMinimum,
        max: axisMaximum,
        splitNumber: stacked ? 3 : 4,
        name: `${item.metric.short} (${item.metric.unit})`,
        nameLocation: 'middle',
        nameGap: 56,
        nameRotate: !stacked && index === 1 ? -90 : 90,
        axisLine: { show: true, lineStyle: { color: item.color, width: 1.2 } },
        axisTick: { show: true, lineStyle: { color: item.color } },
        axisLabel: { color: item.color, fontSize: 11, fontWeight: 500, margin: 12, formatter: (value: number) => format(value, item.metric) },
        nameTextStyle: { color: item.color, fontSize: 11, fontWeight: 600 },
        splitLine: { show: index === 0 || stacked, lineStyle: { color: 'rgba(216, 219, 215, .72)', width: 1 } },
      }
    }
    const timeAxis = (index: number) => ({
      type: 'time',
      gridIndex: stacked ? index : 0,
      boundaryGap: false,
      name: !stacked || index === visibleItems.length - 1 ? `Time (${range})` : '',
      nameLocation: 'middle',
      nameGap: 34,
      axisLine: { show: true, lineStyle: { color: 'rgba(32, 37, 34, .30)', width: 1.2 } },
      axisTick: { show: !stacked || index === visibleItems.length - 1 },
      axisLabel: { show: !stacked || index === visibleItems.length - 1, color: '#5d655f', fontSize: 11, fontWeight: 500, hideOverlap: true },
      nameTextStyle: { color: '#5d655f', fontSize: 11, fontWeight: 600 },
      splitLine: { show: false },
    })
    chart.setOption({
      animation: false,
      color: visibleItems.map((item) => item.color),
      textStyle: { fontFamily: 'IBM Plex Sans, sans-serif', color: '#202522' },
      grid: stacked
        ? visibleItems.map((_, index) => ({ left: 88, right: 36, top: `${10 + index * 29}%`, height: '21%' }))
        : { left: 88, right: 88, top: 58, bottom: 52 },
      legend: {
        top: 10,
        left: 88,
        right: 36,
        type: 'scroll',
        itemWidth: 18,
        itemHeight: 3,
        icon: 'roundRect',
        textStyle: { color: '#5d655f', fontSize: 12, fontWeight: 500 },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(37, 43, 41, .97)',
        borderColor: 'rgba(255, 255, 255, .22)',
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: '#fff', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12 },
        axisPointer: { type: 'cross', label: { backgroundColor: '#252b29', color: '#fff' } },
      },
      axisPointer: stacked ? { link: [{ xAxisIndex: 'all' }] } : undefined,
      xAxis: stacked ? visibleItems.map((_, index) => timeAxis(index)) : timeAxis(0),
      yAxis: visibleItems.map(axisStyle),
      series: visibleItems.map((item, index) => ({
        name: item.metric.label,
        type: 'line',
        xAxisIndex: stacked ? index : 0,
        yAxisIndex: index,
        showSymbol: false,
        smooth: range === '24h' ? .32 : false,
        smoothMonotone: range === '24h' ? 'x' : undefined,
        connectNulls: false,
        animation: false,
        lineStyle: { width: 2, cap: 'round', join: 'round' },
        emphasis: { focus: 'series' },
        tooltip: { valueFormatter: (value: unknown) => `${format(Number(value), item.metric)} ${item.metric.unit}` },
        data: item.points.map((point) => [new Date(point.observedAt).getTime(), point.value]),
        markArea: item.target ? {
          silent: true,
          itemStyle: { color: `${item.color}14` },
          data: [[{ yAxis: item.target[0] }, { yAxis: item.target[1] }]],
        } : undefined,
        markLine: item.target ? {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { color: item.color, width: 1, type: 'dashed', opacity: .65 },
          label: {
            show: stacked,
            position: 'insideStartTop',
            color: item.color,
            fontSize: 10,
            formatter: (parameters: JsonRecord) => `${format(Number(parameters.value), item.metric)} ${item.metric.unit}`,
          },
          data: [{ yAxis: item.target[0] }, { yAxis: item.target[1] }],
        } : undefined,
      })),
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [items, language, range])
  return <div className="nc-trends-chart nc-trends-multi-chart" ref={ref} role="img" aria-label={`${items.map((item) => item.metric.label).join(', ')}, ${range} trend`} />
}

export default function TrendsWorkspace() {
  const [stored] = useState(() => loadStoredSelection())
  const hydrationBusyRef = useRef(false)
  const retryContextAfterLoginRef = useRef(false)
  const sectionsRef = useRef<Section[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [nodes, setNodes] = useState<NodeOption[]>([])
  const [profiles, setProfiles] = useState<JsonRecord[]>([])
  const [areaId, setAreaId] = useState(String(stored.areaId || ''))
  const [sectionId, setSectionId] = useState(String(stored.sectionId || ''))
  const [metricKey, setMetricKey] = useState(String(stored.metricKey || 'airTemp'))
  const [secondaryMetricKeys, setSecondaryMetricKeys] = useState<string[]>(
    Array.isArray(stored.secondaryMetricKeys) ? stored.secondaryMetricKeys.map(String).slice(0, 2) : [],
  )
  const [range, setRange] = useState<RangeKey>(['24h', '7d', '30d'].includes(stored.range) ? stored.range : '24h')
  const [scope, setScope] = useState<TrendScope>(stored.scope === 'nodes' ? 'nodes' : 'section')
  const [recentSectionIds, setRecentSectionIds] = useState<string[]>(Array.isArray(stored.recentSectionIds) ? stored.recentSectionIds.map(String).slice(0, 5) : [])
  const [compare, setCompare] = useState(false)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    Array.isArray(stored.selectedNodeIds) ? stored.selectedNodeIds.map(String).slice(0, 5) : [],
  )
  const [nodeSeries, setNodeSeries] = useState<ChartInput[]>([])
  const [nodeHistoryLoading, setNodeHistoryLoading] = useState(false)
  const [nodeHistoryError, setNodeHistoryError] = useState('')
  const [points, setPoints] = useState<Point[]>([])
  const [metricHistories, setMetricHistories] = useState<Record<string, Point[]>>({})
  const [comparison, setComparison] = useState<ChartInput[]>([])
  const [analytics, setAnalytics] = useState<JsonRecord | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const selectedSection = sections.find((section) => section.id === sectionId)
    || sections.find((section) => section.areaId === areaId)
    || sections[0]
  const selectedMetric = metrics.find((metric) => metric.key === metricKey) || metrics[0]
  const activeMetricKeys = [metricKey, ...secondaryMetricKeys.filter((key) => key !== metricKey)].slice(0, 3)
  const metricSelectionKey = activeMetricKeys.join(',')
  const areas = useMemo(() => [...new Map(sections.map((section) => [section.areaId, section.areaName])).entries()], [sections])
  const areaIdExists = areas.some(([id]) => id === areaId)
  const displayedAreaId = selectedSection?.areaId || (areaIdExists ? areaId : areas[0]?.[0] || '')
  const displayedAreaSections = sections.filter((section) => section.areaId === displayedAreaId)
  const displayedSectionId = selectedSection?.id || displayedAreaSections[0]?.id || ''
  const sectionNodes = useMemo(
    () => nodes.filter((node) => node.sectionId === selectedSection?.id),
    [nodes, selectedSection?.id],
  )
  const sectionNodeKey = sectionNodes.map((node) => node.devEui).join(',')
  const availableMetrics = metrics.filter((metric) => selectedSection?.available.has(metric.key))
  const target = profileRange(profiles, selectedSection?.profileId || '', selectedMetric.key)

  useEffect(() => {
    let active = true
    function applyWorkspaceContext(nextSections: Section[], nextProfiles?: JsonRecord[], requestedAreaId = '', requestedSectionId = '') {
      if (!active || !nextSections.length) return
      sectionsRef.current = nextSections
      setSections(nextSections)
      if (nextProfiles) setProfiles(nextProfiles)
      const initialSection = nextSections.find((section) => section.id === requestedSectionId)
        || nextSections.find((section) => section.id === sectionId)
        || nextSections.find((section) => section.areaId === requestedAreaId)
        || nextSections.find((section) => section.areaId === areaId)
        || nextSections[0]
      setAreaId(initialSection.areaId)
      setSectionId(initialSection.id)
      if (!initialSection.available.has(metricKey)) {
        setMetricKey(metrics.find((metric) => initialSection.available.has(metric.key))?.key || 'airTemp')
      }
      setSecondaryMetricKeys((current) => current.filter((key) => initialSection.available.has(key)).slice(0, 2))
    }
    async function hydrateContext() {
      if (hydrationBusyRef.current) return
      hydrationBusyRef.current = true
      retryContextAfterLoginRef.current = false
      try {
        const [dashboardResult, areaResult, sectionResult, profileResult, nodeResult] = await Promise.allSettled([
          neurocropApi.getDashboard(),
          neurocropApi.getAreas(),
          neurocropApi.getSections(),
          neurocropApi.getCropProfiles(),
          neurocropApi.getNodes(),
        ])
        if (!active) return
        if (dashboardResult.status === 'rejected' && sectionResult.status === 'rejected') throw dashboardResult.reason
        const dashboardPayload = dashboardResult.status === 'fulfilled' ? dashboardResult.value as JsonRecord : {}
        const areaPayload = areaResult.status === 'fulfilled' ? areaResult.value as JsonRecord : {}
        const sectionPayload = sectionResult.status === 'fulfilled' ? sectionResult.value as JsonRecord : {}
        const profilePayload = profileResult.status === 'fulfilled' ? profileResult.value as JsonRecord : {}
        const nextSections = sectionList(dashboardPayload, areaPayload, sectionPayload)
        const nextProfiles = arrays(profilePayload, ['profiles', 'items'])
        const nodePayload = nodeResult.status === 'fulfilled' ? nodeResult.value as JsonRecord : {}
        applyWorkspaceContext(nextSections, nextProfiles)
        setNodes(nodeList(nodePayload))
      } catch (reason) {
        if (!active) return
        retryContextAfterLoginRef.current = true
        setError(reason instanceof Error ? reason.message : 'Workspace context could not be loaded.')
        setStatus('error')
      } finally {
        hydrationBusyRef.current = false
      }
    }
    const retryAfterAuthentication = (event: Event) => {
      const connected = (event as CustomEvent<{ connected?: boolean }>).detail?.connected !== false
      if (connected && (retryContextAfterLoginRef.current || sectionsRef.current.length === 0)) void hydrateContext()
    }
    const syncRuntimeContext = (event: Event) => {
      const detail = (event as CustomEvent<{ siteId?: unknown; zoneId?: unknown }>).detail
      const nextAreaId = text(detail?.siteId)
      const nextSectionId = text(detail?.zoneId)
      if (nextAreaId) setAreaId(nextAreaId)
      if (nextSectionId) setSectionId(nextSectionId)
    }
    const useDashboardContext = (event: Event) => {
      const detail = (event as CustomEvent<{ sites?: JsonRecord[]; siteId?: unknown; zoneId?: unknown }>).detail
      if (!Array.isArray(detail?.sites) || !detail.sites.length) return
      const runtimeSections = sectionList({ sites: detail.sites }, {}, {})
      applyWorkspaceContext(runtimeSections, undefined, text(detail.siteId), text(detail.zoneId))
    }
    const existingDashboardContext = (window as typeof window & {
      NeuroCropDashboardContext?: { sites?: JsonRecord[]; siteId?: unknown; zoneId?: unknown }
    }).NeuroCropDashboardContext
    if (Array.isArray(existingDashboardContext?.sites) && existingDashboardContext.sites.length) {
      applyWorkspaceContext(
        sectionList({ sites: existingDashboardContext.sites }, {}, {}),
        undefined,
        text(existingDashboardContext.siteId),
        text(existingDashboardContext.zoneId),
      )
    }
    void hydrateContext()
    window.addEventListener('neurocrop:api-connection', retryAfterAuthentication)
    window.addEventListener('neurocrop:context-change', syncRuntimeContext)
    window.addEventListener('neurocrop:dashboard-context', useDashboardContext)
    return () => {
      active = false
      window.removeEventListener('neurocrop:api-connection', retryAfterAuthentication)
      window.removeEventListener('neurocrop:context-change', syncRuntimeContext)
      window.removeEventListener('neurocrop:dashboard-context', useDashboardContext)
    }
    // Initial workspace hydration intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sections.length) return
    const exactSection = sections.find((section) => section.id === sectionId)
    if (exactSection) {
      if (areaId !== exactSection.areaId) queueMicrotask(() => setAreaId(exactSection.areaId))
      return
    }
    const validSection = sections.find((section) => section.areaId === areaId) || sections[0]
    queueMicrotask(() => {
      setAreaId(validSection.areaId)
      setSectionId(validSection.id)
    })
  }, [areaId, sectionId, sections])

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'neurocrop:open-trend') return
      if (event.data.areaId) setAreaId(String(event.data.areaId))
      if (event.data.sectionId) setSectionId(String(event.data.sectionId))
      if (event.data.metricKey) setMetricKey(String(event.data.metricKey))
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])

  useEffect(() => {
    if (!selectedSection) {
      queueMicrotask(() => {
        setPoints([])
        setMetricHistories({})
        setAnalytics(null)
        setStatus('empty')
        setUpdatedAt(null)
      })
      return
    }
    const config = rangeConfig[range]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    const requestedMetricKeys = compare || scope === 'nodes' ? [metricKey] : activeMetricKeys
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setStatus('loading')
      setError('')
      setComparison([])
    })
    Promise.all([
      Promise.all(requestedMetricKeys.map((key) => neurocropApi.getHistory({
        sectionId: selectedSection.id,
        metric: key,
        from: from.toISOString(),
        to: to.toISOString(),
        stepMinutes: config.stepMinutes,
      }).then((payload) => [key, historyPoints(payload as JsonRecord)] as const))),
      neurocropApi.getSectionAnalytics({ sectionId: selectedSection.id, metric: metricKey, from: from.toISOString(), to: to.toISOString(), stepMinutes: config.stepMinutes })
        .catch(() => null),
    ]).then(([histories, analyticsPayload]) => {
      if (!active) return
      const nextHistories = Object.fromEntries(histories)
      const nextPoints = nextHistories[metricKey] || []
      setMetricHistories(nextHistories)
      setPoints(nextPoints)
      setAnalytics(analyticsPayload as JsonRecord)
      setStatus(nextPoints.length > 1 ? 'ready' : 'empty')
      setUpdatedAt(new Date())
    }).catch((reason) => {
      if (!active) return
      setPoints([])
      setMetricHistories({})
      setAnalytics(null)
      setError(reason instanceof Error ? reason.message : 'Trend data could not be loaded.')
      setStatus('error')
    })
    return () => { active = false }
  // metricSelectionKey intentionally represents the complete ordered metric selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare, metricKey, metricSelectionKey, range, refreshToken, scope, selectedSection])

  useEffect(() => {
    if (!selectedSection) return
    localStorage.setItem(storageKey, JSON.stringify({
      areaId: selectedSection.areaId,
      sectionId: selectedSection.id,
      metricKey,
      range,
      scope,
      recentSectionIds,
      secondaryMetricKeys,
      selectedNodeIds,
    }))
  }, [metricKey, range, recentSectionIds, scope, secondaryMetricKeys, selectedNodeIds, selectedSection])

  useEffect(() => {
    if (!compare || !selectedSection || comparisonIds.length < 2) {
      queueMicrotask(() => setComparison([]))
      return
    }
    const config = rangeConfig[range]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    let active = true
    neurocropApi.getSiteComparison({
      areaId: selectedSection.areaId,
      metric: metricKey,
      sectionIds: comparisonIds.join(','),
      from: from.toISOString(),
      to: to.toISOString(),
      stepMinutes: config.stepMinutes,
    }).then((payload) => {
      if (!active) return
      const series = arrays(payload as JsonRecord, ['series']).map((item, index) => ({
        name: String(item.sectionName || item.name || `Section ${index + 1}`),
        points: historyPoints({ points: item.points }),
        color: chartColors[index % chartColors.length],
      }))
      setComparison(series)
    }).catch(() => { if (active) setComparison([]) })
    return () => { active = false }
  }, [compare, comparisonIds, metricKey, range, selectedSection])

  useEffect(() => {
    if (!selectedSection) return
    const eligible = sections.filter((section) => section.areaId === selectedSection.areaId && section.available.has(metricKey))
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setComparisonIds((current) => {
        const valid = current.filter((id) => eligible.some((section) => section.id === id))
        return valid.includes(selectedSection.id)
          ? valid.slice(0, 6)
          : [selectedSection.id, ...valid].slice(0, 6)
      })
    })
    return () => { active = false }
  }, [metricKey, sections, selectedSection])

  useEffect(() => {
    if (scope !== 'nodes') {
      queueMicrotask(() => {
        setNodeSeries([])
        setNodeHistoryLoading(false)
        setNodeHistoryError('')
      })
      return
    }
    const eligibleIds = sectionNodes.map((node) => node.devEui)
    queueMicrotask(() => {
      setCompare(false)
      setSecondaryMetricKeys([])
      setSelectedNodeIds((current) => {
        const valid = current.filter((id) => eligibleIds.includes(id)).slice(0, 5)
        return valid.length ? valid : eligibleIds.slice(0, 3)
      })
    })
  // sectionNodes is represented by its stable identity list to avoid resetting selection on unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sectionNodeKey, selectedSection?.id])

  useEffect(() => {
    if (scope !== 'nodes' || !selectedSection || !selectedNodeIds.length) {
      queueMicrotask(() => {
        setNodeSeries([])
        setNodeHistoryLoading(false)
        setNodeHistoryError('')
      })
      return
    }
    const config = rangeConfig[range]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    const selectedNodes = sectionNodes.filter((node) => selectedNodeIds.includes(node.devEui)).slice(0, 5)
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setNodeHistoryLoading(true)
      setNodeHistoryError('')
    })
    Promise.all(selectedNodes.map((node, index) => neurocropApi.getHistory({
      sectionId: selectedSection.id,
      devEui: node.devEui,
      metric: metricKey,
      from: from.toISOString(),
      to: to.toISOString(),
      stepMinutes: config.stepMinutes,
    }).then((payload) => {
      const response = payload as JsonRecord
      const responseDevEui = text(response.devEui).trim().toLowerCase()
      const aggregation = text(response.aggregation)
      if (responseDevEui !== node.devEui || !aggregation.startsWith('node_')) {
        throw new Error('The API returned Section history instead of Node history.')
      }
      return {
        series: {
          name: node.name,
          points: historyPoints(response),
          color: chartColors[(index + 1) % chartColors.length],
        },
        failed: false,
      }
    }).catch(() => ({
      series: {
        name: node.name,
        points: [],
        color: chartColors[(index + 1) % chartColors.length],
      },
      failed: true,
    })))).then((results) => {
      if (!active) return
      setNodeSeries(results.filter((result) => !result.failed).map((result) => result.series))
      setNodeHistoryError(results.some((result) => result.failed)
        ? 'Node history is unavailable because the API has not applied the Node filter.'
        : '')
      setNodeHistoryLoading(false)
    })
    return () => { active = false }
  }, [metricKey, range, refreshToken, scope, sectionNodes, selectedNodeIds, selectedSection])

  const values = points.map((point) => point.value)
  const current = values.at(-1) ?? null
  const first = values[0] ?? null
  const delta = current !== null && first !== null ? current - first : null
  const minimum = values.length ? Math.min(...values) : null
  const maximum = values.length ? Math.max(...values) : null
  const summary = trendSummary(points, target, selectedMetric)
  const timeInTarget = analytics?.timeInTarget || {}
  const expectedMinutes = number(timeInTarget.expectedMinutes) || 0
  const optimalMinutes = number(timeInTarget.optimal) || 0
  const coveredMinutes = number(timeInTarget.coveredMinutes) || 0
  const targetPct = target && expectedMinutes
    ? Math.min(100, Math.max(0, Math.round(optimalMinutes / expectedMinutes * 100)))
    : null
  const coveragePct = expectedMinutes ? Math.min(100, Math.round(coveredMinutes / expectedMinutes * 100)) : null
  const showMeasuredConclusion = scope === 'section' && !compare && activeMetricKeys.length === 1 && Boolean(target) && points.length >= 6 && coveragePct !== null && coveragePct >= 50
  const events = Array.isArray(analytics?.events) ? analytics.events.slice(-6).reverse() : []
  const sectionSeries = { name: `${selectedSection?.name || 'Selected section'} · section median`, points, color: chartColors[0] }
  const chartSeries = scope === 'nodes'
    ? [sectionSeries, ...nodeSeries]
    : compare && comparison.length > 1
      ? comparison
      : [sectionSeries]
  const metricChartItems = activeMetricKeys.map((key, index) => {
    const metric = metrics.find((item) => item.key === key) || metrics[0]
    return {
      metric,
      points: metricHistories[key] || [],
      color: chartColors[index % chartColors.length],
      target: profileRange(profiles, selectedSection?.profileId || '', key),
    }
  })

  function changeArea(nextAreaId: string) {
    setAreaId(nextAreaId)
    const firstSection = sections.find((section) => section.areaId === nextAreaId)
    if (firstSection) setSectionId(firstSection.id)
    setCompare(false)
  }

  function changeSection(nextSectionId: string) {
    const section = sections.find((item) => item.id === nextSectionId)
    if (!section) return
    setSectionId(section.id)
    setAreaId(section.areaId)
    setRecentSectionIds((current) => [section.id, ...current.filter((id) => id !== section.id)].slice(0, 5))
    if (!section.available.has(metricKey)) setMetricKey(metrics.find((metric) => section.available.has(metric.key))?.key || metricKey)
    setSecondaryMetricKeys((current) => current.filter((key) => section.available.has(key)).slice(0, 2))
  }

  function toggleMetric(nextMetricKey: string) {
    const selectedKeys = activeMetricKeys
    if (compare || scope === 'nodes') {
      setMetricKey(nextMetricKey)
      setSecondaryMetricKeys([])
      return
    }
    if (selectedKeys.includes(nextMetricKey)) {
      if (selectedKeys.length === 1) return
      const remaining = selectedKeys.filter((key) => key !== nextMetricKey)
      setMetricKey(remaining[0])
      setSecondaryMetricKeys(remaining.slice(1, 3))
      return
    }
    if (selectedKeys.length >= 3) return
    setSecondaryMetricKeys((current) => [...current.filter((key) => key !== nextMetricKey), nextMetricKey].slice(0, 2))
  }

  function applyMetricPreset(preset: string[]) {
    const available = preset.filter((key) => selectedSection?.available.has(key)).slice(0, 3)
    if (!available.length) return
    setMetricKey(available[0])
    setSecondaryMetricKeys(available.slice(1))
  }

  function toggleComparison(id: string) {
    setComparisonIds((current) => current.includes(id)
      ? current.length > 1 ? current.filter((item) => item !== id) : current
      : [...current, id].slice(0, 6))
  }

  function changeScope(nextScope: TrendScope) {
    setScope(nextScope)
    if (nextScope === 'nodes') {
      setCompare(false)
      setSecondaryMetricKeys([])
    }
  }

  function toggleNode(devEui: string) {
    setSelectedNodeIds((current) => current.includes(devEui)
      ? current.filter((id) => id !== devEui)
      : current.length < 5 ? [...current, devEui] : current)
  }

  function exportCsv() {
    if (!selectedSection) return
    const config = rangeConfig[range]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    void neurocropApi.downloadMeasurementsCsv({
      areaId: selectedSection.areaId,
      sectionId: selectedSection.id,
      metrics: metricKey,
      from: from.toISOString(),
      to: to.toISOString(),
    })
  }

  return <main className="nc-trends-page">
    <header className="nc-trends-head">
      <div><p>Historical intelligence</p><h1>Trends</h1><span>See what changed, how long conditions stayed outside target, and whether intervention is working.</span></div>
      <div className="nc-trends-head-actions">
        <button type="button" onClick={() => setRefreshToken((value) => value + 1)}><i className="fa-solid fa-rotate" />Refresh</button>
        <button type="button" className="primary" onClick={exportCsv} disabled={!selectedSection}><i className="fa-solid fa-download" />Export CSV</button>
      </div>
    </header>

    <section className="nc-trends-context">
      <label>
        <span>Area</span>
        {areas.length
          ? <select
              aria-label="Select Area"
              value={displayedAreaId}
              onChange={(event) => changeArea(event.target.value)}
            >
              {areas.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select>
          : <span className="nc-trends-select-skeleton" aria-label="Preparing Area selection" />}
      </label>
      <label>
        <span>Section</span>
        {displayedAreaSections.length
          ? <select
              aria-label="Select Section"
              value={displayedSectionId}
              onChange={(event) => changeSection(event.target.value)}
            >
              {displayedAreaSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}
            </select>
          : <span className="nc-trends-select-skeleton" aria-label="Preparing Section selection" />}
      </label>
      <div className="nc-trends-scope" role="group" aria-label="Trend data level">
        <button type="button" className={scope === 'section' ? 'active' : ''} aria-pressed={scope === 'section'} onClick={() => changeScope('section')}><i className="fa-solid fa-layer-group" />Section</button>
        <button type="button" className={scope === 'nodes' ? 'active' : ''} aria-pressed={scope === 'nodes'} onClick={() => changeScope('nodes')}><i className="fa-solid fa-microchip" />Nodes</button>
      </div>
      <div className="nc-trends-range" role="group" aria-label="Trend period">{(Object.keys(rangeConfig) as RangeKey[]).map((key) => <button type="button" className={range === key ? 'active' : ''} onClick={() => setRange(key)} key={key}>{key}</button>)}</div>
      {scope === 'section' ? <button type="button" className={`nc-trends-compare-toggle ${compare ? 'active' : ''}`} onClick={() => setCompare((value) => !value)}><i className="fa-solid fa-code-compare" />Compare Sections</button> : null}
    </section>

    <section className="nc-trends-metric-controls">
      <div className="nc-trends-metric-presets">
        <span>{scope === 'nodes' ? 'Select one parameter to compare between nodes' : compare ? 'Select one parameter for comparison' : `Select up to 3 parameters · ${activeMetricKeys.length}/3 selected`}</span>
        {scope === 'section' && !compare ? <div>
          <button type="button" onClick={() => applyMetricPreset(['airTemp', 'humidity', 'vpd'])}>Climate</button>
          <button type="button" onClick={() => applyMetricPreset(['soilMoisture', 'ec', 'ph'])}>Root zone</button>
        </div> : null}
      </div>
      <nav className="nc-trends-metrics" aria-label="Metric">{(availableMetrics.length ? availableMetrics : metrics.slice(0, 4)).map((metric) => {
        const selectedIndex = (compare || scope === 'nodes' ? [metricKey] : activeMetricKeys).indexOf(metric.key)
        const selected = selectedIndex >= 0
        const selectionLimitReached = scope === 'section' && !compare && !selected && activeMetricKeys.length >= 3
        return <button type="button" data-active={selected} aria-pressed={selected} disabled={selectionLimitReached} title={selectionLimitReached ? 'Remove a selected parameter before adding another.' : undefined} onClick={() => toggleMetric(metric.key)} key={metric.key}>
          <i className={`fa-solid ${metric.icon}`} />
          <span>{metric.short}</span>
          {selected ? <b>{selectedIndex + 1}</b> : null}
        </button>
      })}</nav>
    </section>

    {compare ? <section className="nc-trends-comparison-picker"><div><strong>Compare Sections</strong><span>Select 2–6 Sections in {selectedSection?.areaName}.</span></div><div>{sections.filter((section) => section.areaId === selectedSection?.areaId && section.available.has(metricKey)).map((section) => <label key={section.id}><input type="checkbox" checked={comparisonIds.includes(section.id)} onChange={() => toggleComparison(section.id)} /><span>{section.name}</span></label>)}</div></section> : null}
    {scope === 'nodes' ? <section className="nc-trends-comparison-picker nc-trends-node-picker">
      <div><strong>Compare Nodes</strong><span>The Section median stays visible. Select up to 5 Nodes · {selectedNodeIds.length}/5 selected.</span></div>
      <div>{sectionNodes.length
        ? sectionNodes.map((node) => {
            const selected = selectedNodeIds.includes(node.devEui)
            const disabled = !selected && selectedNodeIds.length >= 5
            return <label key={node.devEui} title={`${node.devEui} · ${node.transportStatus}`}>
              <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleNode(node.devEui)} />
              <span><i data-status={node.transportStatus} />{node.name}</span>
            </label>
          })
        : <p>No Nodes are assigned to this Section.</p>}</div>
      {nodeHistoryError ? <p className="nc-trends-node-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{nodeHistoryError}</p> : null}
    </section> : null}

    <section className="nc-trends-kpis">
      <article><small>Current</small><strong>{format(current, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>{target ? `Target ${format(target[0], selectedMetric)}–${format(target[1], selectedMetric)} ${selectedMetric.unit}` : 'Target not configured'}</span></article>
      <article data-tone={delta === null ? 'neutral' : 'info'}><small>Period change</small><strong>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta, selectedMetric)}`} <em>{delta === null ? '' : selectedMetric.unit}</em></strong><span>{rangeConfig[range].label}</span></article>
      <article><small>Observed range</small><strong>{format(minimum, selectedMetric)}–{format(maximum, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>Minimum to maximum</span></article>
      <article data-tone={targetPct !== null && targetPct >= 80 ? 'good' : targetPct !== null && targetPct >= 50 ? 'watch' : 'critical'}><small>Time in target</small><strong>{targetPct === null ? '—' : `${targetPct}%`}</strong><span>{coveragePct === null ? 'No coverage result' : `${coveragePct}% sensor coverage`}</span></article>
    </section>

    <section className="nc-trends-main">
      <article className="nc-trends-chart-card">
        <header><div><p>{scope === 'nodes' ? 'Node comparison' : compare ? 'Section comparison' : activeMetricKeys.length > 1 ? 'Combined measured history' : 'Measured history'}</p><h2>{scope === 'nodes' || compare || activeMetricKeys.length === 1 ? selectedMetric.label : activeMetricKeys.map((key) => metrics.find((metric) => metric.key === key)?.short).filter(Boolean).join(' · ')}</h2><span>{selectedSection?.areaName} · {scope === 'nodes' ? `${selectedSection?.name} · Section median + ${selectedNodeIds.length} Nodes` : compare ? `${comparisonIds.length} Sections · one parameter` : selectedSection?.name}</span></div><span className="nc-trends-updated">{status === 'loading' || nodeHistoryLoading ? 'Loading…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not updated'}</span></header>
        {showMeasuredConclusion ? <div className="nc-trends-chart-conclusion" data-tone={summary.tone}>
          <span>Measured conclusion</span>
          <strong>{summary.title}</strong>
          <p>{summary.body}</p>
        </div> : null}
        {selectedSection && (status === 'ready' || comparison.length > 1)
          ? scope === 'nodes'
            ? <TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} />
            : compare
            ? <TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} />
            : activeMetricKeys.length > 1
              ? <MultiMetricChart items={metricChartItems} range={range} />
              : <TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} />
          : <div className="nc-trends-empty" data-state={status}><i className={`fa-solid ${status === 'loading' ? 'fa-spinner fa-spin' : status === 'error' ? 'fa-triangle-exclamation' : 'fa-chart-line'}`} /><strong>{!selectedSection ? 'Select an Area and Section' : status === 'loading' ? 'Loading measured history' : status === 'error' ? 'History could not be loaded' : 'Not enough measurements yet'}</strong><span>{!selectedSection ? 'Trend data is shown only for an explicitly selected Section.' : error || 'At least two measured points are required to draw a trend.'}</span></div>}
      </article>
    </section>

    <section className="nc-trends-lower">
      <article className="nc-trends-target-card">
        <header><div><p>Condition distribution</p><h2>Where the selected period went</h2></div><span>{rangeConfig[range].label}</span></header>
        <div className="nc-trends-distribution">
          {(['optimal', 'warning', 'critical', 'unavailable'] as const).map((key) => {
            const minutes = number(timeInTarget[key]) || 0
            const percentage = expectedMinutes ? Math.round(minutes / expectedMinutes * 100) : 0
            return <div data-state={key} key={key}><span><i />{key === 'optimal' ? 'In target' : key === 'unavailable' ? 'No data' : key[0].toUpperCase() + key.slice(1)}</span><strong>{percentage}%</strong><small>{Math.round(minutes / 60)} h</small><em style={{ width: `${percentage}%` }} /></div>
          })}
        </div>
      </article>
      <article className="nc-trends-events">
        <header><div><p>Sensor timeline</p><h2>Events in this period</h2></div><span>{events.length} detected</span></header>
        <div>{events.length ? events.map((event: JsonRecord, index: number) => <div key={`${event.occurredAt}-${index}`}><i className={`fa-solid ${event.type === 'delivery_gap' ? 'fa-signal' : event.type === 'transmission_failed' ? 'fa-triangle-exclamation' : 'fa-microchip'}`} /><span><strong>{String(event.type || 'sensor_event').replaceAll('_', ' ')}</strong><small>{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : 'Time unavailable'}{event.durationMinutes ? ` · ${event.durationMinutes} min` : ''}</small></span></div>) : <div className="nc-trends-no-events"><i className="fa-solid fa-circle-check" /><span><strong>No device events detected</strong><small>The selected history window contains no reported delivery gaps or transport faults.</small></span></div>}</div>
      </article>
    </section>
  </main>
}
