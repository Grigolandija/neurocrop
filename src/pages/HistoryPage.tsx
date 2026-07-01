import { useEffect, useState, type MouseEvent } from 'react'
import { metricDefinitions } from '../data/mock'
import { api } from '../lib/api'
import type { Block, Location, MetricKey } from '../types'

type Range = '24h' | '7d' | '30d'
type Point = { timestamp: string; value: number }

const rangeConfig: Record<Range, { hours: number; points: number }> = {
  '24h': { hours: 24, points: 25 },
  '7d': { hours: 168, points: 29 },
  '30d': { hours: 720, points: 31 },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildMockPoints(value: number, range: Range, domain: [number, number]) {
  const { hours, points } = rangeConfig[range]
  const now = Date.now()
  const amplitude = (domain[1] - domain[0]) * 0.055
  return Array.from({ length: points }, (_, index) => {
    const drift = Math.sin(index * 0.74) * amplitude - Math.cos(index * 0.21) * amplitude * 0.38
    const reading = index === points - 1 ? value : clamp(value + drift, domain[0], domain[1])
    return { timestamp: new Date(now - (hours - index / (points - 1) * hours) * 3_600_000).toISOString(), value: reading }
  })
}

function formatValue(value: number, unit: string) {
  const decimals = unit === '°C' || unit === 'kPa' ? 1 : 0
  return `${value.toFixed(decimals)} ${unit}`
}

export function HistoryPage({ locations, blocks }: { locations: Location[]; blocks: Block[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const [blockId, setBlockId] = useState(blocks[0]?.id || '')
  const [metricKey, setMetricKey] = useState<MetricKey>('airTemp')
  const [range, setRange] = useState<Range>('24h')
  const [remotePoints, setRemotePoints] = useState<{ key: string; points: Point[] } | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const locationBlocks = blocks.filter((block) => block.locationId === locationId)
  const block = blocks.find((item) => item.id === blockId) || locationBlocks[0] || blocks[0]
  const available = metricDefinitions.filter((metric) => block?.installedMetrics.includes(metric.key))
  const unavailable = metricDefinitions.filter((metric) => !block?.installedMetrics.includes(metric.key))
  const metricKeyInUse = available.some((item) => item.key === metricKey) ? metricKey : available[0]?.key || metricKey
  const metric = metricDefinitions.find((item) => item.key === metricKeyInUse) || available[0] || metricDefinitions[0]
  const current = block?.readings[metric.key] ?? metric.target[0]
  const selectionKey = `${block?.id || 'none'}:${metric.key}:${range}`
  const fallbackPoints = buildMockPoints(current, range, metric.domain)

  useEffect(() => {
    if (!block) return
    if (!api.configured) {
      return
    }

    let active = true
    const now = new Date()
    const from = new Date(now.getTime() - rangeConfig[range].hours * 3_600_000)
    api.history(block.id, metric.key, from.toISOString(), now.toISOString())
      .then((response) => { if (active) setRemotePoints({ key: selectionKey, points: response.points.length ? response.points : fallbackPoints }) })
      .catch(() => { if (active) setRemotePoints({ key: selectionKey, points: fallbackPoints }) })
    return () => { active = false }
  }, [block, fallbackPoints, metric.key, range, selectionKey])

  const width = 1040
  const height = 410
  const left = 78
  const right = 34
  const top = 28
  const bottom = 72
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const safePoints = remotePoints?.key === selectionKey ? remotePoints.points : fallbackPoints
  const x = (index: number) => left + index / Math.max(safePoints.length - 1, 1) * plotWidth
  const y = (value: number) => top + (metric.domain[1] - value) / (metric.domain[1] - metric.domain[0]) * plotHeight
  const linePath = safePoints.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ')
  const min = Math.min(...safePoints.map((point) => point.value))
  const max = Math.max(...safePoints.map((point) => point.value))
  const average = safePoints.reduce((sum, point) => sum + point.value, 0) / safePoints.length
  const outside = safePoints.filter((point) => point.value < metric.target[0] || point.value > metric.target[1]).length
  const outsidePercent = Math.round(outside / safePoints.length * 100)
  const hovered = hoverIndex === null ? null : safePoints[hoverIndex]

  function changeLocation(nextLocationId: string) {
    setLocationId(nextLocationId)
    const nextBlock = blocks.find((item) => item.locationId === nextLocationId)
    if (!nextBlock) return
    setBlockId(nextBlock.id)
    const firstMetric = metricDefinitions.find((item) => nextBlock.installedMetrics.includes(item.key))
    if (firstMetric) setMetricKey(firstMetric.key)
  }

  function changeBlock(nextBlockId: string) {
    setBlockId(nextBlockId)
    const nextBlock = blocks.find((item) => item.id === nextBlockId)
    const firstMetric = metricDefinitions.find((item) => nextBlock?.installedMetrics.includes(item.key))
    if (firstMetric) setMetricKey(firstMetric.key)
  }

  function moveChart(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - rect.left) / rect.width * width
    const index = clamp(Math.round((position - left) / plotWidth * (safePoints.length - 1)), 0, safePoints.length - 1)
    setHoverIndex(index)
  }

  return <main className="history-react-page">
    <div className="history-react-shell">
      <header className="history-react-topbar">
        <div className="history-react-brand"><div className="history-react-brand-mark">N</div><div><p>NeuroCrop</p><strong>History</strong></div></div>
        <button className="history-react-back" onClick={() => { window.location.href = './index.html' }}>Back to dashboard</button>
      </header>

      <section className="history-react-surface">
        <div className="history-react-heading">
          <div><p className="history-react-eyebrow">Sensor history</p><h1>Understand the trend before changing the setup.</h1><p>Choose a block and metric to compare actual readings with its target band.</p></div>
          <span className="history-react-connection">{api.configured ? 'Live API connected' : 'Demo data until API is connected'}</span>
        </div>

        <div className="history-react-controls">
          <label className="history-react-label">Location<select value={locationId} onChange={(event) => changeLocation(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="history-react-label">Block<select value={block?.id || ''} onChange={(event) => changeBlock(event.target.value)}>{locationBlocks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="history-react-range" aria-label="History range">{(['24h', '7d', '30d'] as Range[]).map((item) => <button key={item} data-active={range === item} onClick={() => setRange(item)}>{item}</button>)}</div>
        </div>

        <div className="history-react-metrics">{[...available, ...unavailable].map((item) => <button key={item.key} disabled={!block?.installedMetrics.includes(item.key)} data-active={metric.key === item.key} onClick={() => setMetricKey(item.key)}>{item.label}{!block?.installedMetrics.includes(item.key) ? ' · Not installed' : ''}</button>)}</div>

        <div className="history-react-chart-head"><div><h2>{metric.label}</h2><p>Target band: {formatValue(metric.target[0], metric.unit)} to {formatValue(metric.target[1], metric.unit)}</p></div><span className="history-react-state">{`${safePoints.length} readings`}</span></div>

        <div className="history-react-chart">
          {hovered && <div className="history-tooltip" style={{ left: `${Math.min(hoverIndex! / Math.max(safePoints.length - 1, 1) * 84 + 8, 77)}%`, top: `${Math.max(y(hovered.value) / height * 100 - 14, 4)}%` }}><strong>{formatValue(hovered.value, metric.unit)}</strong><span>{new Date(hovered.timestamp).toLocaleString('lt-LT')}</span></div>}
          <svg viewBox={`0 0 ${width} ${height}`} onMouseMove={moveChart} onMouseLeave={() => setHoverIndex(null)}>
            {[0, .25, .5, .75, 1].map((step) => { const value = metric.domain[1] - step * (metric.domain[1] - metric.domain[0]); const yy = top + step * plotHeight; return <g key={step}><line className="history-grid" x1={left} x2={width - right} y1={yy} y2={yy} /><text x={left - 14} y={yy + 4} textAnchor="end">{value.toFixed(metric.unit === '°C' || metric.unit === 'kPa' ? 1 : 0)}</text></g> })}
            <rect className="history-target" x={left} y={y(metric.target[1])} width={plotWidth} height={y(metric.target[0]) - y(metric.target[1])} />
            <line className="history-warning" x1={left} x2={width - right} y1={y(metric.target[0])} y2={y(metric.target[0])} />
            <line className="history-warning" x1={left} x2={width - right} y1={y(metric.target[1])} y2={y(metric.target[1])} />
            <path className="history-trend" d={linePath} />
            {safePoints.map((point, index) => <circle key={point.timestamp} className="history-point" cx={x(index)} cy={y(point.value)} r="3.4" />)}
            {hovered && <g><line className="history-hover-line" x1={x(hoverIndex!)} x2={x(hoverIndex!)} y1={top} y2={height - bottom} /><circle className="history-hover-dot" cx={x(hoverIndex!)} cy={y(hovered.value)} r="7" /></g>}
            <text x={left} y={height - 24}>{new Date(safePoints[0].timestamp).toLocaleString('lt-LT', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
            <text x={width - right} y={height - 24} textAnchor="end">Now</text>
            <text x={width / 2} y={height - 8} textAnchor="middle">Time</text>
            <text transform={`rotate(-90 18 ${height / 2})`} x="18" y={height / 2} textAnchor="middle">{metric.label} ({metric.unit})</text>
          </svg>
        </div>

        <div className="history-react-stats"><div className="history-react-stat"><span>Current</span><strong>{formatValue(safePoints.at(-1)!.value, metric.unit)}</strong></div><div className="history-react-stat"><span>Average</span><strong>{formatValue(average, metric.unit)}</strong></div><div className="history-react-stat"><span>Minimum</span><strong>{formatValue(min, metric.unit)}</strong></div><div className="history-react-stat"><span>Maximum</span><strong>{formatValue(max, metric.unit)}</strong></div><div className="history-react-stat"><span>Outside target</span><strong>{outsidePercent}%</strong></div></div>
        <div className="history-react-insight"><strong>Trend insight:</strong> {outside === 0 ? `${metric.label} stayed inside the target band for this period.` : `${metric.label} was outside target for ${outsidePercent}% of the selected period. Open the block if you need to compare it with the other live readings.`}</div>
      </section>
    </div>
  </main>
}
