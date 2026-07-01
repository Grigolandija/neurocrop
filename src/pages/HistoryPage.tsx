import * as echarts from 'echarts'
import { useEffect, useRef, useState } from 'react'
import { metricDefinitions } from '../data/mock'
import type { Block, Location, MetricDefinition, MetricKey } from '../types'

type Range = '24h' | '7d' | '30d'
type SeriesPoint = [number, number]

const rangeConfig: Record<Range, { hours: number; minutes: number; label: string }> = {
  '24h': { hours: 24, minutes: 10, label: '10 min steps' },
  '7d': { hours: 168, minutes: 60, label: 'hourly' },
  '30d': { hours: 720, minutes: 240, label: '4h steps' },
}

const seriesColors = ['#2f7558', '#b77b22']
const dangerColor = '#b13d32'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hash(value: string) {
  return [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7)
}

function buildPoints(block: Block, metric: MetricDefinition, range: Range): SeriesPoint[] {
  const config = rangeConfig[range]
  const count = Math.round(config.hours * 60 / config.minutes) + 1
  const now = Date.now()
  const current = block.readings[metric.key] ?? (metric.target[0] + metric.target[1]) / 2
  const seed = hash(`${block.id}:${metric.key}:${range}`)
  const amplitude = (metric.domain[1] - metric.domain[0]) * (range === '24h' ? .035 : .055)

  return Array.from({ length: count }, (_, index) => {
    const progress = index / Math.max(count - 1, 1)
    const wave = Math.sin(progress * Math.PI * (2.5 + seed % 3) + seed * .013) * amplitude
    const secondary = Math.cos(progress * Math.PI * 4 + seed * .021) * amplitude * .32
    const value = index === count - 1
      ? current
      : clamp(current + (wave + secondary) * (1 - progress * .52), metric.domain[0], metric.domain[1])
    return [now - ((count - 1 - index) * config.minutes * 60_000), Number(value.toFixed(3))]
  })
}

function valueLabel(value: number, metric: MetricDefinition) {
  const decimals = metric.unit === 'ppm' || metric.unit === 'lx' ? 0 : metric.unit === '%' ? 1 : 2
  return `${value.toLocaleString('lt-LT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${metric.unit}`
}

function makeChartOption(block: Block, keys: MetricKey[], range: Range): echarts.EChartsOption {
  const metrics = keys.map((key) => metricDefinitions.find((metric) => metric.key === key)!).filter(Boolean)
  const allPoints = metrics.map((metric) => buildPoints(block, metric, range))
  const domains = metrics.map((metric, index) => {
    const values = allPoints[index].map((point) => point[1])
    const reference = [...values, ...metric.target]
    const min = Math.min(...reference)
    const max = Math.max(...reference)
    const padding = Math.max((max - min) * .18, (metric.domain[1] - metric.domain[0]) * .05)
    return [Math.max(metric.domain[0], min - padding), Math.min(metric.domain[1], max + padding)] as [number, number]
  })
  const bandLayers = metrics.map((metric, index) => ({
    index,
    span: (metric.target[1] - metric.target[0]) / Math.max(domains[index][1] - domains[index][0], .001),
  })).sort((a, b) => b.span - a.span)
  const layerByIndex = new Map(bandLayers.map((item, layer) => [item.index, layer]))

  return {
    animation: false,
    textStyle: { fontFamily: 'Manrope, sans-serif', color: '#18211d' },
    color: seriesColors,
    grid: { top: 42, right: metrics.length > 1 ? 90 : 36, bottom: 70, left: 88 },
    legend: {
      show: metrics.length > 1,
      bottom: 10,
      left: 88,
      textStyle: { color: 'rgba(24,33,29,.65)', fontWeight: 700 },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(24,33,29,.96)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      axisPointer: { type: 'cross', lineStyle: { color: 'rgba(24,33,29,.3)' } },
      formatter: (raw) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ seriesIndex: number; value: SeriesPoint; marker: string }>
        const first = params[0]
        if (!first || !Array.isArray(first.value)) return ''
        const date = new Date(first.value[0]).toLocaleString('lt-LT')
        return `<strong>${date}</strong>${params.map((item) => {
          const metric = metrics[item.seriesIndex]
          return `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:7px">${item.marker}${metric.label}<b>${valueLabel(item.value[1], metric)}</b></div>`
        }).join('')}`
      },
    },
    xAxis: {
      type: 'time',
      name: `Time (${range})`,
      nameLocation: 'middle',
      nameGap: 38,
      axisLabel: { hideOverlap: true, color: 'rgba(24,33,29,.58)' },
      axisLine: { lineStyle: { color: 'rgba(24,33,29,.25)' } },
      splitLine: { show: false },
    },
    yAxis: metrics.map((metric, index) => ({
      type: 'value',
      position: index === 0 ? 'left' : 'right',
      min: domains[index][0],
      max: domains[index][1],
      name: `${metric.label} (${metric.unit})`,
      nameLocation: 'middle',
      nameGap: 58,
      nameRotate: index === 0 ? 90 : -90,
      axisLine: { show: true, lineStyle: { color: seriesColors[index] } },
      axisLabel: { color: seriesColors[index], fontWeight: 700 },
      nameTextStyle: { color: seriesColors[index], fontWeight: 800 },
      splitLine: { show: index === 0, lineStyle: { color: 'rgba(24,33,29,.09)' } },
    })),
    visualMap: metrics.map((metric, index) => ({
      show: false,
      type: 'piecewise',
      seriesIndex: index,
      dimension: 1,
      pieces: [
        { lt: metric.target[0], color: dangerColor },
        { gte: metric.target[0], lte: metric.target[1], color: seriesColors[index] },
        { gt: metric.target[1], color: dangerColor },
      ],
    })),
    series: metrics.map((metric, index) => {
      const points = allPoints[index]
      const values = points.map((point) => point[1])
      const min = Math.min(...values)
      const max = Math.max(...values)
      const minPoint = points[values.indexOf(min)]
      const maxPoint = points[values.indexOf(max)]
      const color = seriesColors[index]
      const layer = layerByIndex.get(index) || 0
      return {
        name: metric.label,
        type: 'line',
        yAxisIndex: index,
        data: points,
        showSymbol: false,
        smooth: .32,
        smoothMonotone: 'x',
        lineStyle: { width: 2, cap: 'round', join: 'round' },
        emphasis: { disabled: true },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { color, width: 1.2, type: 'dashed', opacity: .72 },
          label: { color, fontWeight: 800, backgroundColor: 'rgba(255,255,255,.9)', borderRadius: 7, padding: [3, 6] },
          data: [
            { yAxis: metric.target[0], label: { formatter: `${metric.label} min ${valueLabel(metric.target[0], metric)}`, position: index ? 'insideEndBottom' : 'insideStartBottom' } },
            { yAxis: metric.target[1], label: { formatter: `${metric.label} max ${valueLabel(metric.target[1], metric)}`, position: index ? 'insideEndTop' : 'insideStartTop' } },
          ],
        },
        markArea: {
          silent: true,
          z: layer,
          itemStyle: { color: index === 0 ? 'rgba(47,117,88,.075)' : 'rgba(183,123,34,.09)' },
          data: [[{ yAxis: metric.target[0] }, { yAxis: metric.target[1] }]],
        },
        markPoint: {
          silent: true,
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: '#fff', borderColor: color, borderWidth: 2 },
          label: { color, fontWeight: 800, backgroundColor: 'rgba(255,255,255,.94)', borderRadius: 7, padding: [3, 6] },
          data: [
            { coord: minPoint, value: min, label: { formatter: `MIN ${valueLabel(min, metric)}`, position: 'bottom' } },
            { coord: maxPoint, value: max, label: { formatter: `MAX ${valueLabel(max, metric)}`, position: 'top' } },
          ],
        },
      }
    }),
  }
}

export function HistoryPage({ locations, blocks }: { locations: Location[]; blocks: Block[] }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const locationBlocks = blocks.filter((block) => block.locationId === locationId)
  const [blockId, setBlockId] = useState(locationBlocks[0]?.id || blocks[0]?.id || '')
  const block = blocks.find((item) => item.id === blockId) || locationBlocks[0] || blocks[0]
  const available = metricDefinitions.filter((metric) => block?.installedMetrics.includes(metric.key))
  const unavailable = metricDefinitions.filter((metric) => !block?.installedMetrics.includes(metric.key))
  const [metricKeys, setMetricKeys] = useState<MetricKey[]>(available.slice(0, 2).map((metric) => metric.key))
  const [range, setRange] = useState<Range>('24h')

  useEffect(() => {
    if (!chartRef.current || !block || metricKeys.length === 0) return
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'svg' })
    chart.setOption(makeChartOption(block, metricKeys, range), { notMerge: true })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); chart.dispose() }
  }, [block, metricKeys, range])

  function chooseLocation(nextId: string) {
    setLocationId(nextId)
    const nextBlock = blocks.find((item) => item.locationId === nextId)
    if (!nextBlock) return
    setBlockId(nextBlock.id)
    setMetricKeys(metricDefinitions.filter((metric) => nextBlock.installedMetrics.includes(metric.key)).slice(0, 2).map((metric) => metric.key))
  }

  function chooseBlock(nextId: string) {
    setBlockId(nextId)
    const nextBlock = blocks.find((item) => item.id === nextId)
    if (nextBlock) setMetricKeys(metricDefinitions.filter((metric) => nextBlock.installedMetrics.includes(metric.key)).slice(0, 2).map((metric) => metric.key))
  }

  function toggleMetric(key: MetricKey) {
    setMetricKeys((current) => current.includes(key)
      ? current.length === 1 ? current : current.filter((item) => item !== key)
      : [...current.slice(-1), key])
  }

  return <>
    <header className="page-head"><div><p className="eyebrow">Trends</p><h1>Sensor history</h1><p>Compare up to two measurements and their optimal ranges.</p></div><span className="count-chip">{range} · {rangeConfig[range].label}</span></header>
    <section className="trend-context">
      <div><span>Area</span><select value={locationId} onChange={(event) => chooseLocation(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><span>Section</span><select value={block?.id || ''} onChange={(event) => chooseBlock(event.target.value)}>{locationBlocks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div><span>Crop profile</span><strong>{block?.cropProfile}</strong></div>
    </section>
    <section className="trend-panel">
      <div className="trend-toolbar">
        <div>{[...available, ...unavailable].map((metric) => <button key={metric.key} disabled={!block?.installedMetrics.includes(metric.key)} data-active={metricKeys.includes(metric.key)} onClick={() => toggleMetric(metric.key)}>{metric.label}{!block?.installedMetrics.includes(metric.key) ? ' · Not installed' : ''}</button>)}</div>
        <div>{(['24h', '7d', '30d'] as Range[]).map((item) => <button key={item} data-active={range === item} onClick={() => setRange(item)}>{item}</button>)}</div>
      </div>
      <div className="trend-summary"><strong>{metricKeys.length} {metricKeys.length === 1 ? 'metric' : 'metrics'} selected</strong><span>{metricKeys.length > 1 ? 'Left and right Y axes use real units.' : 'The Y axis uses the selected metric unit.'}</span></div>
      <div ref={chartRef} className="echarts-trend" />
      <div className="trend-explanation"><span>Why this matters</span><p>Use the curve, target range and exact tooltip values to decide whether the condition is stable, drifting or returning to normal.</p></div>
    </section>
  </>
}
