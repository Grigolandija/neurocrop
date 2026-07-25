import { useEffect, useMemo, useRef, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// API records remain open because telemetry payloads can gain metrics independently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type RangeKey = '24h' | '7d' | '30d'
type Point = { observedAt: string; value: number }
type Section = { id: string; name: string; areaId: string; areaName: string; profileId: string; available: Set<string> }
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
  for (const root of [payload, payload?.data, payload?.dashboard, payload?.workspace]) {
    if (!root || typeof root !== 'object') continue
    for (const key of keys) if (Array.isArray(root[key])) return root[key] as JsonRecord[]
  }
  return []
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

function sectionList(dashboard: JsonRecord): Section[] {
  return arrays(dashboard, ['sites', 'areas']).flatMap((area) => {
    const areaId = String(area.id || area.areaId || '')
    const areaName = String(area.name || area.areaName || areaId)
    return arrays(area, ['zones', 'sections']).map((section) => {
      const available = new Set<string>([
        ...((Array.isArray(section.availableMetrics) ? section.availableMetrics : []) as string[]),
        ...((Array.isArray(section.configuredMetrics) ? section.configuredMetrics : []) as string[]),
      ])
      if (available.has('airTemp') && available.has('humidity')) available.add('vpd')
      return {
        id: String(section.id || section.sectionId || ''),
        name: String(section.name || section.sectionName || section.id),
        areaId,
        areaName,
        profileId: String(section.profile || section.cropProfile || section.crop_profile || 'default'),
        available,
      }
    }).filter((section) => section.id)
  })
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

function TrendChart({ series, metric, target, range }: { series: ChartInput[]; metric: Metric; target: [number, number] | null; range: RangeKey }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sharedRenderer = (window as typeof window & {
      NeuroCropTrendCharts?: {
        render: (
          element: HTMLElement,
          input: {
            points: Point[]
            metricKey: string
            label: string
            unit: string
            decimals: number
            target: [number, number] | null
            rangeKey: RangeKey
          },
        ) => { resize: () => void; dispose: () => void } | null
      }
    }).NeuroCropTrendCharts
    if (ref.current && series.length === 1 && sharedRenderer?.render) {
      const chart = sharedRenderer.render(ref.current, {
        points: series[0].points,
        metricKey: metric.key,
        label: metric.label,
        unit: metric.unit,
        decimals: metric.decimals,
        target,
        rangeKey: range,
      })
      if (!chart) return
      const observer = new ResizeObserver(() => chart.resize())
      observer.observe(ref.current)
      return () => {
        observer.disconnect()
        chart.dispose()
      }
    }

    const echarts = window.echarts as {
      init?: (element: HTMLElement) => { setOption: (option: JsonRecord) => void; resize: () => void; dispose: () => void }
    } | undefined
    if (!ref.current || !echarts?.init || !series.some((item) => item.points.length > 1)) return
    const chart = echarts.init(ref.current)
    chart.setOption({
      animationDuration: 450,
      color: series.map((item) => item.color),
      grid: { left: 58, right: 24, top: series.length > 1 ? 58 : 28, bottom: 48 },
      legend: series.length > 1 ? { top: 8, type: 'scroll' } : undefined,
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => `${format(Number(value), metric)} ${metric.unit}`,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#d9dfd8' } },
        axisLabel: { color: '#74817b', hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: `${metric.short} (${metric.unit})`,
        nameTextStyle: { color: '#74817b', padding: [0, 0, 8, 0] },
        axisLabel: { color: '#74817b', formatter: (value: number) => format(value, metric) },
        splitLine: { lineStyle: { color: '#edf0eb' } },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8, borderColor: 'transparent', backgroundColor: '#f1f3ef' }],
      series: series.map((item, index) => ({
        name: item.name,
        type: 'line',
        showSymbol: false,
        smooth: range === '24h' ? .22 : false,
        lineStyle: { width: index === 0 ? 3 : 2 },
        areaStyle: series.length === 1 ? { opacity: .08 } : undefined,
        data: item.points.map((point) => [new Date(point.observedAt).getTime(), point.value]),
        markArea: index === 0 && target ? {
          silent: true,
          itemStyle: { color: 'rgba(58, 143, 98, .10)' },
          data: [[{ yAxis: target[0], name: 'Target' }, { yAxis: target[1] }]],
        } : undefined,
      })),
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [metric, range, series, target])
  return <div className="nc-trends-chart" ref={ref} role="img" aria-label={`${metric.label}, ${range} trend`} />
}

export default function TrendsWorkspace() {
  const [stored] = useState(() => loadStoredSelection())
  const [sections, setSections] = useState<Section[]>([])
  const [profiles, setProfiles] = useState<JsonRecord[]>([])
  const [areaId, setAreaId] = useState(String(stored.areaId || ''))
  const [sectionId, setSectionId] = useState(String(stored.sectionId || ''))
  const [metricKey, setMetricKey] = useState(String(stored.metricKey || 'airTemp'))
  const [range, setRange] = useState<RangeKey>(['24h', '7d', '30d'].includes(stored.range) ? stored.range : '24h')
  const [compare, setCompare] = useState(false)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [comparison, setComparison] = useState<ChartInput[]>([])
  const [analytics, setAnalytics] = useState<JsonRecord | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const selectedSection = sections.find((section) => section.id === sectionId) || sections[0]
  const selectedMetric = metrics.find((metric) => metric.key === metricKey) || metrics[0]
  const areas = useMemo(() => [...new Map(sections.map((section) => [section.areaId, section.areaName])).entries()], [sections])
  const areaSections = sections.filter((section) => !areaId || section.areaId === areaId)
  const availableMetrics = metrics.filter((metric) => selectedSection?.available.has(metric.key))
  const target = profileRange(profiles, selectedSection?.profileId || '', selectedMetric.key)

  useEffect(() => {
    let active = true
    Promise.all([neurocropApi.getDashboard(), neurocropApi.getCropProfiles()]).then(([dashboardPayload, profilePayload]) => {
      if (!active) return
      const nextSections = sectionList(dashboardPayload as JsonRecord)
      const nextProfiles = arrays(profilePayload as JsonRecord, ['profiles', 'items'])
      setSections(nextSections)
      setProfiles(nextProfiles)
      const requestedSection = nextSections.find((section) => section.id === sectionId)
      const initialSection = requestedSection || nextSections.find((section) => section.areaId === areaId) || nextSections[0]
      if (initialSection) {
        setAreaId(initialSection.areaId)
        setSectionId(initialSection.id)
        if (!initialSection.available.has(metricKey)) {
          setMetricKey(metrics.find((metric) => initialSection.available.has(metric.key))?.key || 'airTemp')
        }
      }
    }).catch((reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Workspace context could not be loaded.')
      setStatus('error')
    })
    return () => { active = false }
    // Initial workspace hydration intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!selectedSection) return
    localStorage.setItem(storageKey, JSON.stringify({ areaId: selectedSection.areaId, sectionId: selectedSection.id, metricKey, range }))
    const config = rangeConfig[range]
    const to = new Date()
    const from = new Date(to.getTime() - config.hours * 60 * 60 * 1000)
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setStatus('loading')
      setError('')
      setComparison([])
    })
    Promise.all([
      neurocropApi.getHistory({ sectionId: selectedSection.id, metric: metricKey, from: from.toISOString(), to: to.toISOString(), stepMinutes: config.stepMinutes }),
      neurocropApi.getSectionAnalytics({ sectionId: selectedSection.id, metric: metricKey, from: from.toISOString(), to: to.toISOString(), stepMinutes: config.stepMinutes })
        .catch(() => null),
    ]).then(([historyPayload, analyticsPayload]) => {
      if (!active) return
      const nextPoints = historyPoints(historyPayload as JsonRecord)
      setPoints(nextPoints)
      setAnalytics(analyticsPayload as JsonRecord)
      setStatus(nextPoints.length > 1 ? 'ready' : 'empty')
      setUpdatedAt(new Date())
    }).catch((reason) => {
      if (!active) return
      setPoints([])
      setAnalytics(null)
      setError(reason instanceof Error ? reason.message : 'Trend data could not be loaded.')
      setStatus('error')
    })
    return () => { active = false }
  }, [metricKey, range, refreshToken, selectedSection])

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
  const targetPct = expectedMinutes ? Math.round(optimalMinutes / expectedMinutes * 100) : null
  const coveragePct = expectedMinutes ? Math.min(100, Math.round(coveredMinutes / expectedMinutes * 100)) : null
  const showMeasuredConclusion = !compare && Boolean(target) && points.length >= 6 && coveragePct !== null && coveragePct >= 50
  const events = Array.isArray(analytics?.events) ? analytics.events.slice(-6).reverse() : []
  const chartSeries = compare && comparison.length > 1
    ? comparison
    : [{ name: selectedSection?.name || 'Selected section', points, color: chartColors[0] }]

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
    if (!section.available.has(metricKey)) setMetricKey(metrics.find((metric) => section.available.has(metric.key))?.key || metricKey)
  }

  function toggleComparison(id: string) {
    setComparisonIds((current) => current.includes(id)
      ? current.length > 1 ? current.filter((item) => item !== id) : current
      : [...current, id].slice(0, 6))
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
      <label><span>Area</span><select value={areaId} onChange={(event) => changeArea(event.target.value)}>{areas.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label><span>Section</span><select value={selectedSection?.id || ''} onChange={(event) => changeSection(event.target.value)}>{areaSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
      <div className="nc-trends-range" role="group" aria-label="Trend period">{(Object.keys(rangeConfig) as RangeKey[]).map((key) => <button type="button" className={range === key ? 'active' : ''} onClick={() => setRange(key)} key={key}>{key}</button>)}</div>
      <button type="button" className={`nc-trends-compare-toggle ${compare ? 'active' : ''}`} onClick={() => setCompare((value) => !value)}><i className="fa-solid fa-code-compare" />Compare Sections</button>
    </section>

    <nav className="nc-trends-metrics" aria-label="Metric">{(availableMetrics.length ? availableMetrics : metrics.slice(0, 4)).map((metric) => <button type="button" data-active={metric.key === metricKey} onClick={() => setMetricKey(metric.key)} key={metric.key}><i className={`fa-solid ${metric.icon}`} /><span>{metric.short}</span></button>)}</nav>

    {compare ? <section className="nc-trends-comparison-picker"><div><strong>Compare Sections</strong><span>Select 2–6 Sections in {selectedSection?.areaName}.</span></div><div>{sections.filter((section) => section.areaId === selectedSection?.areaId && section.available.has(metricKey)).map((section) => <label key={section.id}><input type="checkbox" checked={comparisonIds.includes(section.id)} onChange={() => toggleComparison(section.id)} /><span>{section.name}</span></label>)}</div></section> : null}

    <section className="nc-trends-kpis">
      <article><small>Current</small><strong>{format(current, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>{target ? `Target ${format(target[0], selectedMetric)}–${format(target[1], selectedMetric)} ${selectedMetric.unit}` : 'Target not configured'}</span></article>
      <article data-tone={delta === null ? 'neutral' : 'info'}><small>Period change</small><strong>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${format(delta, selectedMetric)}`} <em>{delta === null ? '' : selectedMetric.unit}</em></strong><span>{rangeConfig[range].label}</span></article>
      <article><small>Observed range</small><strong>{format(minimum, selectedMetric)}–{format(maximum, selectedMetric)} <em>{selectedMetric.unit}</em></strong><span>Minimum to maximum</span></article>
      <article data-tone={targetPct !== null && targetPct >= 80 ? 'good' : targetPct !== null && targetPct >= 50 ? 'watch' : 'critical'}><small>Time in target</small><strong>{targetPct === null ? '—' : `${targetPct}%`}</strong><span>{coveragePct === null ? 'No coverage result' : `${coveragePct}% sensor coverage`}</span></article>
    </section>

    <section className="nc-trends-main">
      <article className="nc-trends-chart-card">
        <header><div><p>{compare ? 'Section comparison' : 'Measured history'}</p><h2>{selectedMetric.label}</h2><span>{selectedSection?.areaName} · {compare ? `${comparisonIds.length} Sections` : selectedSection?.name}</span></div><span className="nc-trends-updated">{status === 'loading' ? 'Loading…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not updated'}</span></header>
        {showMeasuredConclusion ? <div className="nc-trends-chart-conclusion" data-tone={summary.tone}>
          <span>Measured conclusion</span>
          <strong>{summary.title}</strong>
          <p>{summary.body}</p>
        </div> : null}
        {status === 'ready' || comparison.length > 1 ? <TrendChart series={chartSeries} metric={selectedMetric} target={target} range={range} /> : <div className="nc-trends-empty" data-state={status}><i className={`fa-solid ${status === 'loading' ? 'fa-spinner fa-spin' : status === 'error' ? 'fa-triangle-exclamation' : 'fa-chart-line'}`} /><strong>{status === 'loading' ? 'Loading measured history' : status === 'error' ? 'History could not be loaded' : 'Not enough measurements yet'}</strong><span>{error || 'At least two measured points are required to draw a trend.'}</span></div>}
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
