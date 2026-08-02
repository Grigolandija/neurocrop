import { translateInterfaceText as tx } from '../../i18n'
import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { useLocation } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import { ModalPortal } from '../../components/ModalPortal'
import { getMetricDefinition } from '../../domain/metricRegistry'
import { consumeTrendIntent, setDashboardContext, useDashboardState } from '../../state/dashboardStore'
import { resolveTrendContext } from './resolveTrendContext'
import { installEChartsEngine } from '../../vendor/echartsEngine'
import {
  buildNightIntervals,
  nightMarkAreaData,
  renderTrendChart,
  type TrendDayNightSchedule,
} from './sharedTrendChart'
import '../../styles/trends-workspace.css'

// API records remain open because telemetry payloads can gain metrics independently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type RangeKey = '24h' | '7d' | '30d'
type TrendScope = 'section' | 'nodes'
type Point = { observedAt: string; value: number }
type Section = { id: string; name: string; areaId: string; areaName: string; profileId: string; available: Set<string>; measured: Set<string> }
type NodeOption = { devEui: string; name: string; sectionId: string; transportStatus: string }
type Metric = { key: string; label: string; short: string; unit: string; decimals: number; icon: string }
type LoadState = 'loading' | 'ready' | 'empty' | 'error'
type ExportScope = 'section' | 'area'

const metrics: Metric[] = ([
  ['airTemp', 'Temperature', 'fa-temperature-half'],
  ['humidity', 'Humidity', 'fa-droplet'],
  ['vpd', 'VPD', 'fa-wave-square'],
  ['co2', 'CO₂', 'fa-wind'],
  ['leafTemp', 'Leaf temp.', 'fa-leaf'],
  ['soilMoisture', 'Moisture', 'fa-water'],
  ['soilTemp', 'Substrate temp.', 'fa-seedling'],
  ['ec', 'Nutrient EC', 'fa-bolt'],
  ['soilEc', 'Substrate EC', 'fa-bolt'],
  ['ph', 'pH', 'fa-flask'],
  ['waterTemp', 'Water temp.', 'fa-temperature-low'],
  ['lux', 'Light', 'fa-sun'],
  ['batteryLevel', 'Battery', 'fa-battery-half'],
] as const).map(([key, short, icon]) => {
  const definition = getMetricDefinition(key)
  if (!definition) throw new Error(`Unknown trend metric: ${key}`)
  return { key, short, icon, label: definition.label, unit: definition.unit, decimals: definition.decimals }
})

const rangeConfig: Record<RangeKey, { hours: number; stepMinutes: number; label: string }> = {
  '24h': { hours: 24, stepMinutes: 10, label: 'Last 24 hours' },
  '7d': { hours: 168, stepMinutes: 60, label: 'Last 7 days' },
  '30d': { hours: 720, stepMinutes: 240, label: 'Last 30 days' },
}
const storageKey = 'neurocrop-trends-workspace-v2'
const chartColors = ['#287f70', '#d87655', '#507ea2', '#b18a35', '#845f8e', '#68746f']
const metricKeys = new Set(metrics.map((metric) => metric.key))

function finiteExtent(values: Iterable<number>): [number, number] | null {
  let minimum = Infinity
  let maximum = -Infinity
  for (const rawValue of values) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) continue
    if (value < minimum) minimum = value
    if (value > maximum) maximum = value
  }
  return minimum === Infinity ? null : [minimum, maximum]
}

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

function measuredMetricSet(section: JsonRecord) {
  const available = new Set(
    arrays({ items: section.availableMetrics || section.available_metrics }, ['items'])
      .map((item) => typeof item === 'string' ? item : text(item?.key || item?.metric))
      .filter(Boolean),
  )
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const metricKey = metricKeys.has(String(value.metricKey)) ? String(value.metricKey) : 'airTemp'
    const secondaryMetricKeys = Array.isArray(value.secondaryMetricKeys)
      ? [...new Set<string>(value.secondaryMetricKeys.map((item: unknown) => String(item)))]
          .filter((key) => key !== metricKey && metricKeys.has(key))
          .slice(0, 2)
      : []
    return { ...value, metricKey, secondaryMetricKeys }
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
      measured: measuredMetricSet(merged),
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

function sectionAggregationLabel(aggregation: string | undefined) {
  return String(aggregation || '').startsWith('section_peak_') ? 'section peak' : 'section median'
}

function profileRange(profiles: JsonRecord[], profileId: string, metricKey: string): [number, number] | null {
  const profile = profiles.find((item) => String(item.id || item.profileId) === profileId)
  const raw = profile?.metrics?.[metricKey]?.optimal
  const minimum = number(raw?.[0])
  const maximum = number(raw?.[1])
  return minimum === null || maximum === null ? null : [minimum, maximum]
}

function profileDayNightSchedule(profiles: JsonRecord[], profileId: string): TrendDayNightSchedule {
  const profile = profiles.find((item) => String(item.id || item.profileId) === profileId)
  const schedule = profile?.metrics?.lux?.lightingSchedule
  const validClock = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback
  return {
    dayStartsAt: validClock(schedule?.start, '06:00'),
    dayEndsAt: validClock(schedule?.end, '22:00'),
    timeZone: typeof schedule?.timeZone === 'string' && schedule.timeZone
      ? schedule.timeZone
      : 'Europe/Vilnius',
  }
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

class TrendChartErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    console.error('[trends-chart] render failed', error, details.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <div className="nc-trends-empty" data-state="error" role="alert"><i className="fa-solid fa-triangle-exclamation" /><strong>{tx("Chart could not be rendered")}</strong><span>{tx("Change the parameter selection or refresh to try again.")}</span></div>
    }
    return this.props.children
  }
}

function TrendChart({ series, metric, target, range, dayNightSchedule }: { series: ChartInput[]; metric: Metric; target: [number, number] | null; range: RangeKey; dayNightSchedule: TrendDayNightSchedule }) {
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
      dayNightSchedule,
    })
    if (!chart) return
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
  }, [dayNightSchedule, language, metric, range, series, target])
  return <div className="nc-trends-chart" ref={ref} role="img" aria-label={`${metric.label}, ${range} trend`} />
}

function MultiMetricChart({ items, range, dayNightSchedule }: { items: MetricChartInput[]; range: RangeKey; dayNightSchedule: TrendDayNightSchedule }) {
  const ref = useRef<HTMLDivElement>(null)
  const [renderFailed, setRenderFailed] = useState(false)
  const { language } = useInterfaceLanguage()
  useEffect(() => {
    try {
      installEChartsEngine()
    const echarts = window.echarts as {
      init?: (element: HTMLElement) => { setOption: (option: JsonRecord) => void; resize: () => void; dispose: () => void }
      getInstanceByDom?: (element: HTMLElement) => { dispose: () => void } | undefined
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
        dayNightSchedule,
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
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current)
    const stacked = visibleItems.length > 2
    const timestamps = visibleItems.flatMap((item) =>
      item.points.map((point) => new Date(point.observedAt).getTime()).filter(Number.isFinite),
    )
    const timestampExtent = finiteExtent(timestamps)
    const nightAreas = timestampExtent
      ? nightMarkAreaData(buildNightIntervals(
          timestampExtent[0],
          timestampExtent[1],
          dayNightSchedule,
        ))
      : []
    const axisStyle = (item: MetricChartInput, index: number) => {
      const values = item.points.map((point) => point.value)
      const domain = item.target ? [...values, ...item.target] : values
      const [minimum, maximum] = finiteExtent(domain) || [0, 0]
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
      series: visibleItems.map((item, index) => {
        const areas = [
          ...(stacked || index === 0 ? nightAreas : []),
          ...(item.target
            ? [[
                { yAxis: item.target[0], itemStyle: { color: `${item.color}14` }, label: { show: false } },
                { yAxis: item.target[1] },
              ]]
            : []),
        ]
        return {
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
          markArea: areas.length ? { silent: true, data: areas } : undefined,
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
        }
      }),
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
      return () => {
        observer.disconnect()
        chart.dispose()
      }
    } catch (error) {
      console.error('[trends-chart] multi-metric chart failed', error)
      queueMicrotask(() => setRenderFailed(true))
    }
  }, [dayNightSchedule, items, language, range])
  if (renderFailed) return <div className="nc-trends-empty" data-state="error" role="alert"><i className="fa-solid fa-triangle-exclamation" /><strong>{tx("Chart could not be rendered")}</strong><span>{tx("Change the parameter selection or refresh to try again.")}</span></div>
  return <div className="nc-trends-chart nc-trends-multi-chart" ref={ref} role="img" aria-label={`${items.map((item) => item.metric.label).join(', ')}, ${range} trend`} />
}

export default function TrendsWorkspace() {
  const location = useLocation()
  const dashboardState = useDashboardState()
  const [stored] = useState(() => loadStoredSelection())
  const [sections, setSections] = useState<Section[]>([])
  const [nodes, setNodes] = useState<NodeOption[]>([])
  const [profiles, setProfiles] = useState<JsonRecord[]>([])
  const [areaId, setAreaId] = useState(String(dashboardState.context.areaId || stored.areaId || ''))
  const [sectionId, setSectionId] = useState(String(dashboardState.context.sectionId || stored.sectionId || ''))
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
  const [metricAggregations, setMetricAggregations] = useState<Record<string, string>>({})
  const [comparison, setComparison] = useState<ChartInput[]>([])
  const [analytics, setAnalytics] = useState<JsonRecord | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScope, setExportScope] = useState<ExportScope>('section')
  const [exportRange, setExportRange] = useState<RangeKey>(range)
  const [exportMetricKeys, setExportMetricKeys] = useState<string[]>(() => metrics.map((metric) => metric.key))
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')

  const selectedSection = sections.find((section) => section.id === sectionId)
    || sections.find((section) => section.areaId === areaId)
    || sections[0]
  const selectedMetric = metrics.find((metric) => metric.key === metricKey) || metrics[0]
  const activeMetricKeys = useMemo(
    () => [metricKey, ...secondaryMetricKeys.filter((key) => key !== metricKey)].slice(0, 3),
    [metricKey, secondaryMetricKeys],
  )
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
  const exportAvailableMetricKeys = useMemo(() => {
    const relevantSections = exportScope === 'area'
      ? sections.filter((section) => section.areaId === selectedSection?.areaId)
      : selectedSection ? [selectedSection] : []
    const available = new Set<string>()
    relevantSections.forEach((section) => section.measured.forEach((key) => available.add(key)))
    return metrics.map((metric) => metric.key).filter((key) => available.has(key))
  }, [exportScope, sections, selectedSection])
  const exportAvailableMetricKeySet = useMemo(() => new Set(exportAvailableMetricKeys), [exportAvailableMetricKeys])
  const target = profileRange(profiles, selectedSection?.profileId || '', selectedMetric.key)
  const dayNightSchedule = useMemo(
    () => profileDayNightSchedule(profiles, selectedSection?.profileId || ''),
    [profiles, selectedSection?.profileId],
  )

  useEffect(() => {
    let active = true
    function applyWorkspaceContext(nextSections: Section[], nextProfiles?: JsonRecord[], requestedAreaId = '', requestedSectionId = '') {
      if (!active || !nextSections.length) return
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
        setError(reason instanceof Error ? reason.message : 'Workspace context could not be loaded.')
        setStatus('error')
      }
    }
    void hydrateContext()
    return () => {
      active = false
    }
    // A connectivity transition safely retries the context load. The previous
    // request is ignored after cleanup, so a recovery cannot get lost while an
    // older request is still settling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardState.connected])

  useEffect(() => {
    const nextAreaId = dashboardState.context.areaId
    const nextSectionId = dashboardState.context.sectionId
    if (!nextAreaId && !nextSectionId) return
    const next = resolveTrendContext(sections, nextAreaId, nextSectionId, nextAreaId, nextSectionId)
    queueMicrotask(() => {
      setAreaId((current) => current === next.areaId ? current : next.areaId)
      setSectionId((current) => current === next.sectionId ? current : next.sectionId)
    })
  }, [dashboardState.context.areaId, dashboardState.context.sectionId, sections])

  useEffect(() => {
    if (location.pathname === '/history' && (areaId || sectionId)) {
      setDashboardContext({ areaId, sectionId })
    }
  }, [areaId, location.pathname, sectionId])

  useEffect(() => {
    if (!sections.length) return
    const exactSection = sections.find((section) => section.id === sectionId && section.areaId === areaId)
    if (exactSection) return
    const validSection = sections.find((section) => section.areaId === areaId) || sections[0]
    queueMicrotask(() => {
      setAreaId(validSection.areaId)
      setSectionId(validSection.id)
    })
  }, [areaId, sectionId, sections])

  useEffect(() => {
    const intent = dashboardState.trendIntent
    if (!intent) return
    queueMicrotask(() => {
      if (intent.areaId) setAreaId(String(intent.areaId))
      if (intent.sectionId) setSectionId(String(intent.sectionId))
      if (intent.metricKey) setMetricKey(String(intent.metricKey))
      consumeTrendIntent()
    })
  }, [dashboardState.trendIntent])

  useEffect(() => {
    if (!selectedSection) {
      queueMicrotask(() => {
        setPoints([])
        setMetricHistories({})
        setMetricAggregations({})
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
      }).then((payload) => {
        const response = payload as JsonRecord
        return [key, {
          points: historyPoints(response),
          aggregation: text(response.aggregation),
        }] as const
      }))),
      neurocropApi.getSectionAnalytics({ sectionId: selectedSection.id, metric: metricKey, from: from.toISOString(), to: to.toISOString(), stepMinutes: config.stepMinutes })
        .catch(() => null),
    ]).then(([histories, analyticsPayload]) => {
      if (!active) return
      const nextHistories = Object.fromEntries(histories.map(([key, history]) => [key, history.points]))
      const nextAggregations = Object.fromEntries(histories.map(([key, history]) => [key, history.aggregation]))
      const nextPoints = nextHistories[metricKey] || []
      setMetricHistories(nextHistories)
      setMetricAggregations(nextAggregations)
      setPoints(nextPoints)
      setAnalytics(analyticsPayload as JsonRecord)
      setStatus(nextPoints.length > 1 ? 'ready' : 'empty')
      setUpdatedAt(new Date())
    }).catch((reason) => {
      if (!active) return
      setPoints([])
      setMetricHistories({})
      setMetricAggregations({})
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
        return valid
      })
    })
  // sectionNodes is represented by its stable identity list to avoid resetting selection on unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sectionNodeKey, selectedSection?.id])

  useEffect(() => {
    if (scope === 'nodes' && !selectedNodeIds.length) {
      queueMicrotask(() => setScope('section'))
    }
  }, [scope, selectedNodeIds.length])

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
      const measurementContext = response.measurementContext as JsonRecord | undefined
      const targetName = text(measurementContext?.targetName || measurementContext?.target_name).trim()
      const targetType = text(measurementContext?.targetType || measurementContext?.target_type).trim()
      const isPointTarget = text(measurementContext?.spatialScope || measurementContext?.spatial_scope) === 'point'
      const seriesName = isPointTarget
        ? `${targetName || targetType || 'Monitored target'} · ${node.name}`
        : node.name
      return {
        series: {
          name: seriesName,
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
  const valueExtent = finiteExtent(values)
  const minimum = valueExtent?.[0] ?? null
  const maximum = valueExtent?.[1] ?? null
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
  const selectedAggregationLabel = sectionAggregationLabel(metricAggregations[metricKey])
  const sectionSeries = { name: `${selectedSection?.name || 'Selected section'} · ${selectedAggregationLabel}`, points, color: chartColors[0] }
  const chartSeries = scope === 'nodes'
    ? [sectionSeries, ...nodeSeries]
    : compare && comparison.length > 1
      ? comparison
      : [sectionSeries]
  const metricChartItems = useMemo(() => activeMetricKeys.map((key, index) => {
    const metric = metrics.find((item) => item.key === key) || metrics[0]
    return {
      metric,
      points: metricHistories[key] || [],
      color: chartColors[index % chartColors.length],
      target: profileRange(profiles, selectedSection?.profileId || '', key),
    }
  }), [activeMetricKeys, metricHistories, profiles, selectedSection?.profileId])
  function activateSection(section: Section, remember: boolean) {
    const nextMetricKey = section.available.has(metricKey)
      ? metricKey
      : metrics.find((metric) => section.available.has(metric.key))?.key || metricKey
    setAreaId(section.areaId)
    setSectionId(section.id)
    setDashboardContext({ areaId: section.areaId, sectionId: section.id })
    if (remember) setRecentSectionIds((current) => [section.id, ...current.filter((id) => id !== section.id)].slice(0, 5))
    if (nextMetricKey !== metricKey) setMetricKey(nextMetricKey)
    setSecondaryMetricKeys((current) => current.filter((key) => section.available.has(key) && key !== nextMetricKey).slice(0, 2))
    setSelectedNodeIds([])
    setScope('section')
    setCompare(false)
    setComparison([])
    setComparisonIds([])
    setNodeSeries([])
    setPoints([])
    setMetricHistories({})
    setMetricAggregations({})
    setAnalytics(null)
    setUpdatedAt(null)
    setError('')
    setStatus('loading')
  }

  function changeArea(nextAreaId: string) {
    const firstSection = sections.find((section) => section.areaId === nextAreaId)
    if (firstSection) activateSection(firstSection, false)
  }

  function changeSection(nextSectionId: string) {
    const section = sections.find((item) => item.id === nextSectionId)
    if (!section) return
    activateSection(section, true)
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

  function toggleNode(devEui: string) {
    const next = selectedNodeIds.includes(devEui)
      ? selectedNodeIds.filter((id) => id !== devEui)
      : selectedNodeIds.length < 5 ? [...selectedNodeIds, devEui] : selectedNodeIds
    setSelectedNodeIds(next)
    setScope(next.length ? 'nodes' : 'section')
    if (next.length) {
      setCompare(false)
      setSecondaryMetricKeys([])
    }
  }

  function selectAllNodes() {
    const next = sectionNodes.slice(0, 5).map((node) => node.devEui)
    setSelectedNodeIds(next)
    setScope(next.length ? 'nodes' : 'section')
    if (next.length) {
      setCompare(false)
      setSecondaryMetricKeys([])
    }
  }

  function clearNodes() {
    setSelectedNodeIds([])
    setScope('section')
  }

  function openExport() {
    if (!selectedSection) return
    setExportScope('section')
    setExportRange(range)
    setExportMetricKeys(metrics.map((metric) => metric.key).filter((key) => selectedSection.measured.has(key)))
    setExportError('')
    setExportOpen(true)
  }

  async function exportCsv() {
    if (!selectedSection || !exportMetricKeys.length || exportBusy) return
    const config = rangeConfig[exportRange]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    setExportBusy(true)
    setExportError('')
    try {
      await neurocropApi.downloadMeasurementsCsv({
        areaId: exportScope === 'area' ? selectedSection.areaId : undefined,
        sectionId: exportScope === 'section' ? selectedSection.id : undefined,
        metrics: exportMetricKeys.join(','),
        from: from.toISOString(),
        to: to.toISOString(),
      })
      setExportOpen(false)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'CSV export failed.')
    } finally {
      setExportBusy(false)
    }
  }

  return <main className="nc-trends-page" aria-busy={status === 'loading' || nodeHistoryLoading}>
    <header className="nc-trends-head">
      <div><p>{tx("Historical intelligence")}</p><h1>{tx("Trends")}</h1><span>{tx("See what changed, how long conditions stayed outside target, and whether intervention is working.")}</span></div>
      <div className="nc-trends-head-actions">
        <button type="button" onClick={() => setRefreshToken((value) => value + 1)}><i className="fa-solid fa-rotate" />{tx("Refresh")}</button>
        <button type="button" className="primary" onClick={openExport} disabled={!selectedSection}><i className="fa-solid fa-download" />{tx("Export CSV")}</button>
      </div>
    </header>

    <section className="nc-trends-context">
      <label>
        <span>{tx("Area")}</span>
        {areas.length
          ? <select
              aria-label={tx("Select Area")}
              value={displayedAreaId}
              onChange={(event) => changeArea(event.target.value)}
            >
              {areas.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select>
          : <span className="nc-trends-select-skeleton" aria-label={tx("Preparing Area selection")} />}
      </label>
      <label>
        <span>{tx("Section")}</span>
        {displayedAreaSections.length
          ? <select
              aria-label={tx("Select Section")}
              value={displayedSectionId}
              onChange={(event) => changeSection(event.target.value)}
            >
              {displayedAreaSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}
            </select>
          : <span className="nc-trends-select-skeleton" aria-label={tx("Preparing Section selection")} />}
      </label>
      <div className="nc-trends-range" role="group" aria-label={tx("Trend period")}>{(Object.keys(rangeConfig) as RangeKey[]).map((key) => <button type="button" className={range === key ? 'active' : ''} onClick={() => setRange(key)} key={key}>{key}</button>)}</div>
      <details className="nc-trends-node-select">
        <summary>
          <span><small>{tx("Displayed data")}</small><strong>{selectedNodeIds.length ? `${tx("Section")} + ${selectedNodeIds.length} ${tx("Nodes")}` : tx("Section only")}</strong></span>
          <i className="fa-solid fa-chevron-down" />
        </summary>
        <div className="nc-trends-node-menu">
          <header>
            <span><strong>{tx("Add Nodes to comparison")}</strong><small>{tx("Section aggregate is always shown")}</small></span>
            <span className="nc-trends-node-menu-actions">
              <button type="button" onClick={selectAllNodes} disabled={!sectionNodes.length}>{tx("Select all")}</button>
              <button type="button" onClick={clearNodes} disabled={!selectedNodeIds.length}>{tx("Clear")}</button>
            </span>
          </header>
          <div className="nc-trends-node-options">
            <div className="nc-trends-node-base"><i className="fa-solid fa-layer-group" /><span><strong>{tx("Section aggregate")}</strong><small>{tx("Always shown")}</small></span><b>{tx("Base")}</b></div>
            {sectionNodes.length ? sectionNodes.map((node) => {
              const selected = selectedNodeIds.includes(node.devEui)
              const disabled = !selected && selectedNodeIds.length >= 5
              return <label key={node.devEui} data-disabled={disabled || undefined}>
                <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleNode(node.devEui)} />
                <i data-status={node.transportStatus} />
                <span><strong>{node.name}</strong></span>
                <i className="fa-solid fa-check nc-trends-node-check" />
              </label>
            }) : <p>{tx("No Nodes are assigned to this Section.")}</p>}
          </div>
        </div>
      </details>
      <button type="button" className={`nc-trends-compare-toggle ${compare ? 'active' : ''}`} onClick={() => { clearNodes(); setCompare((value) => !value) }}><i className="fa-solid fa-code-compare" />{tx("Compare Sections")}</button>
    </section>
    {scope === 'nodes' && nodeHistoryError ? <p className="nc-trends-node-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{nodeHistoryError}</p> : null}

    <section className="nc-trends-metric-controls">
      <div className="nc-trends-metric-presets">
        <span>{scope === 'nodes' ?tx("Select one parameter to compare between nodes") : compare ?tx("Select one parameter for comparison") : `Select up to 3 parameters · ${activeMetricKeys.length}/3 selected`}</span>
        {scope === 'section' && !compare ? <div>
          <button type="button" onClick={() => applyMetricPreset(['airTemp', 'humidity', 'vpd'])}>{tx("Climate")}</button>
          <button type="button" onClick={() => applyMetricPreset(['soilMoisture', 'ec', 'ph'])}>{tx("Root zone")}</button>
        </div> : null}
      </div>
      <nav className="nc-trends-metrics" aria-label={tx("Metric")}>{(availableMetrics.length ? availableMetrics : metrics.slice(0, 4)).map((metric) => {
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

    {compare ? <section className="nc-trends-comparison-picker"><div><strong>{tx("Compare Sections")}</strong><span>{tx("Select 2–6 Sections in")} {selectedSection?.areaName}.</span></div><div>{sections.filter((section) => section.areaId === selectedSection?.areaId && section.available.has(metricKey)).map((section) => <label key={section.id}><input type="checkbox" checked={comparisonIds.includes(section.id)} onChange={() => toggleComparison(section.id)} /><span>{section.name}</span></label>)}</div></section> : null}
    <section className="nc-trends-kpis">
      <article><small>{tx("Current")}</small><strong>{format(current, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>{target ? `Target ${format(target[0], selectedMetric)}–${format(target[1], selectedMetric)} ${selectedMetric.unit}` :tx("Target not configured")}</span></article>
      <article data-tone={delta === null ? 'neutral' : 'info'}><small>{tx("Period change")}</small><strong>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta, selectedMetric)}`} <em>{delta === null ? '' : selectedMetric.unit}</em></strong><span>{rangeConfig[range].label}</span></article>
      <article><small>{tx("Observed range")}</small><strong>{format(minimum, selectedMetric)}–{format(maximum, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>{tx("Minimum to maximum")}</span></article>
      <article data-tone={targetPct !== null && targetPct >= 80 ? 'good' : targetPct !== null && targetPct >= 50 ? 'watch' : 'critical'}><small>{tx("Time in target")}</small><strong>{targetPct === null ? '—' : `${targetPct}%`}</strong><span>{coveragePct === null ?tx("No coverage result") : `${coveragePct}% sensor coverage`}</span></article>
    </section>

    <section className="nc-trends-main">
      <article className="nc-trends-chart-card">
        <header><div><p>{scope === 'nodes' ?tx("Node comparison") : compare ?tx("Section comparison") : activeMetricKeys.length > 1 ?tx("Combined measured history") :tx("Measured history")}</p><h2>{scope === 'nodes' || compare || activeMetricKeys.length === 1 ? selectedMetric.label : activeMetricKeys.map((key) => metrics.find((metric) => metric.key === key)?.short).filter(Boolean).join(' · ')}</h2><span>{selectedSection?.areaName} · {scope === 'nodes' ? `${selectedSection?.name} · ${selectedAggregationLabel === 'section peak' ? 'Section peak' : 'Section median'} + ${selectedNodeIds.length} Nodes` : compare ? `${comparisonIds.length} Sections · one parameter` : selectedSection?.name}</span></div><span className="nc-trends-updated">{status === 'loading' || nodeHistoryLoading ?tx("Loading…") : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` :tx("Not updated")}</span></header>
        {showMeasuredConclusion ? <div className="nc-trends-chart-conclusion" data-tone={summary.tone}>
          <span>{tx("Measured conclusion")}</span>
          <strong>{summary.title}</strong>
          <p>{summary.body}</p>
        </div> : null}
        {selectedSection && (status === 'ready' || comparison.length > 1)
          ? scope === 'nodes'
            ? <TrendChartErrorBoundary key={`${selectedSection.id}-${metricSelectionKey}-${range}-${refreshToken}-nodes`}><TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} dayNightSchedule={dayNightSchedule} /></TrendChartErrorBoundary>
            : compare
            ? <TrendChartErrorBoundary key={`${selectedSection.id}-${metricSelectionKey}-${range}-${refreshToken}-compare`}><TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} dayNightSchedule={dayNightSchedule} /></TrendChartErrorBoundary>
            : activeMetricKeys.length > 1
              ? <TrendChartErrorBoundary key={`${selectedSection.id}-${metricSelectionKey}-${range}-${refreshToken}`}><MultiMetricChart items={metricChartItems} range={range} dayNightSchedule={dayNightSchedule} /></TrendChartErrorBoundary>
              : <TrendChartErrorBoundary key={`${selectedSection.id}-${metricSelectionKey}-${range}-${refreshToken}-single`}><TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} dayNightSchedule={dayNightSchedule} /></TrendChartErrorBoundary>
          : <div className="nc-trends-empty" data-state={status}><i className={`fa-solid ${status === 'loading' ? 'fa-spinner fa-spin' : status === 'error' ? 'fa-triangle-exclamation' : 'fa-chart-line'}`} /><strong>{!selectedSection ?tx("Select an Area and Section") : status === 'loading' ?tx("Loading measured history") : status === 'error' ?tx("History could not be loaded") :tx("Not enough measurements yet")}</strong><span>{!selectedSection ?tx("Trend data is shown only for an explicitly selected Section.") : error ||tx("At least two measured points are required to draw a trend.")}</span></div>}
      </article>
    </section>

    <section className="nc-trends-lower">
      <article className="nc-trends-target-card">
        <header><div><p>{tx("Condition distribution")}</p><h2>{tx("Where the selected period went")}</h2></div><span>{rangeConfig[range].label}</span></header>
        <div className="nc-trends-distribution">
          {(['optimal', 'warning', 'critical', 'unavailable'] as const).map((key) => {
            const minutes = number(timeInTarget[key]) || 0
            const percentage = expectedMinutes ? Math.round(minutes / expectedMinutes * 100) : 0
            return <div data-state={key} key={key}><span><i />{key === 'optimal' ?tx("In target") : key === 'unavailable' ?tx("No data") : key[0].toUpperCase() + key.slice(1)}</span><strong>{percentage}%</strong><small>{Math.round(minutes / 60)} h</small><em style={{ width: `${percentage}%` }} /></div>
          })}
        </div>
      </article>
      <article className="nc-trends-events">
        <header><div><p>{tx("Sensor timeline")}</p><h2>{tx("Events in this period")}</h2></div><span>{events.length} {tx("detected")}</span></header>
        <div>{events.length ? events.map((event: JsonRecord, index: number) => <div key={`${event.occurredAt}-${index}`}><i className={`fa-solid ${event.type === 'delivery_gap' ? 'fa-signal' : event.type === 'transmission_failed' ? 'fa-triangle-exclamation' : 'fa-microchip'}`} /><span><strong>{String(event.type || 'sensor_event').replaceAll('_', ' ')}</strong><small>{event.occurredAt ? new Date(event.occurredAt).toLocaleString() :tx("Time unavailable")}{event.durationMinutes ? ` · ${event.durationMinutes} min` : ''}</small></span></div>) : <div className="nc-trends-no-events"><i className="fa-solid fa-circle-check" /><span><strong>{tx("No device events detected")}</strong><small>{tx("The selected history window contains no reported delivery gaps or transport faults.")}</small></span></div>}</div>
      </article>
    </section>
    {exportOpen && selectedSection ? <ModalPortal><div className="nc-trends-export-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exportBusy) setExportOpen(false) }}><div className="nc-trends-export-modal" role="dialog" aria-modal="true" aria-labelledby="nc-trends-export-title">
      <header><div><p>{tx("Data export")}</p><h2 id="nc-trends-export-title">{tx("Export measurements")}</h2><span>{tx("Choose what the CSV file should contain.")}</span></div><button type="button" onClick={() => setExportOpen(false)} disabled={exportBusy} aria-label={tx("Close")}><i className="fa-solid fa-xmark" /></button></header>
      <section><h3>{tx("Scope")}</h3><div className="nc-trends-export-choice-list nc-trends-export-scope"><label><input type="radio" name="export-scope" checked={exportScope === 'section'} onChange={() => { setExportScope('section'); setExportMetricKeys(metrics.map((metric) => metric.key).filter((key) => selectedSection.measured.has(key))) }} /><span><strong>{tx("Current Section")}</strong><small>{selectedSection.name}</small></span></label><label><input type="radio" name="export-scope" checked={exportScope === 'area'} onChange={() => { const areaSections = sections.filter((section) => section.areaId === selectedSection.areaId); setExportScope('area'); setExportMetricKeys(metrics.map((metric) => metric.key).filter((key) => areaSections.some((section) => section.measured.has(key)))) }} /><span><strong>{tx("Entire Area")}</strong><small>{selectedSection.areaName} · {sections.filter((section) => section.areaId === selectedSection.areaId).length} {tx("Sections")}</small></span></label></div></section>
      <section><h3>{tx("Period")}</h3><div className="nc-trends-export-choice-list nc-trends-export-range">{(Object.keys(rangeConfig) as RangeKey[]).map((key) => <label key={key}><input type="radio" name="export-range" checked={exportRange === key} onChange={() => setExportRange(key)} /><span><strong>{key}</strong><small>{tx(rangeConfig[key].label)}</small></span></label>)}</div></section>
      <section><div className="nc-trends-export-section-head"><h3>{tx("Metrics")}</h3><span><button type="button" onClick={() => setExportMetricKeys(exportAvailableMetricKeys)}>{tx("Select all")}</button><button type="button" onClick={() => setExportMetricKeys([])}>{tx("Clear")}</button></span></div><div className="nc-trends-export-metrics">{metrics.map((metric) => { const metricAvailable = exportAvailableMetricKeySet.has(metric.key); return <label key={metric.key}><input type="checkbox" disabled={!metricAvailable} checked={metricAvailable && exportMetricKeys.includes(metric.key)} onChange={() => setExportMetricKeys((current) => current.includes(metric.key) ? current.filter((key) => key !== metric.key) : [...current, metric.key])} /><i className={`fa-solid ${metric.icon}`} /><span><strong>{metric.label}</strong><small>{metricAvailable ? metric.unit || tx("No unit") : tx("No measurements")}</small></span></label> })}</div></section>
      <footer><span>{exportError ? <em className="nc-trends-export-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{exportError}</em> : <>{exportMetricKeys.length} {tx("metrics selected")}</>}</span><div><button type="button" onClick={() => setExportOpen(false)} disabled={exportBusy}>{tx("Cancel")}</button><button type="button" className="primary" onClick={() => void exportCsv()} disabled={exportBusy || !exportMetricKeys.length}>{exportBusy ? tx("Preparing CSV…") : tx("Download CSV")}</button></div></footer>
    </div></div></ModalPortal> : null}
  </main>
}
