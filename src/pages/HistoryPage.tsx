import { useState, type MouseEvent } from 'react'
import { metricDefinitions } from '../data/mock'
import type { Block, Location, MetricKey } from '../types'

function seriesFor(value: number, count: number, min: number, max: number) {
  return Array.from({ length: count }, (_, index) => index === count - 1 ? value : Math.max(min, Math.min(max, value + Math.sin(index * 0.72) * (max - min) * 0.055 - (count - index) * 0.03)))
}

export function HistoryPage({ locations, blocks }: { locations: Location[]; blocks: Block[] }) {
  const [historyEnd] = useState(() => Date.now())
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const locationBlocks = blocks.filter((block) => block.locationId === locationId)
  const [blockId, setBlockId] = useState(locationBlocks[0]?.id || blocks[0]?.id || '')
  const block = blocks.find((item) => item.id === blockId) || locationBlocks[0] || blocks[0]
  const available = metricDefinitions.filter((metric) => block?.installedMetrics.includes(metric.key))
  const unavailable = metricDefinitions.filter((metric) => !block?.installedMetrics.includes(metric.key))
  const [metricKey, setMetricKey] = useState<MetricKey>(available[0]?.key || 'airTemp')
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [hover, setHover] = useState<{ x: number; y: number; value: number; time: Date } | null>(null)
  const metric = metricDefinitions.find((item) => item.key === metricKey) || available[0]
  const current = block?.readings[metric.key] ?? metric.target[0]
  const count = range === '24h' ? 24 : range === '7d' ? 28 : 30
  const hours = range === '24h' ? 24 : range === '7d' ? 168 : 720
  const values = seriesFor(current, count, metric.domain[0], metric.domain[1])
  const width = 920, height = 360, left = 72, right = 24, top = 24, bottom = 64
  const plotW = width - left - right, plotH = height - top - bottom
  const x = (index: number) => left + index / (values.length - 1) * plotW
  const y = (value: number) => top + (metric.domain[1] - value) / (metric.domain[1] - metric.domain[0]) * plotH
  const path = values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ')
  function move(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width * width
    const index = Math.max(0, Math.min(values.length - 1, Math.round((px - left) / plotW * (values.length - 1))))
    const time = new Date(historyEnd - (hours - index / (values.length - 1) * hours) * 3600000)
    setHover({ x: x(index), y: y(values[index]), value: values[index], time })
  }
  function changeLocation(next: string) { setLocationId(next); const nextBlock = blocks.find((item) => item.locationId === next); if (nextBlock) { setBlockId(nextBlock.id); const nextMetric = metricDefinitions.find((item) => nextBlock.installedMetrics.includes(item.key)); if (nextMetric) setMetricKey(nextMetric.key) } }
  return <><header className="page-head"><div><p className="eyebrow">Sensor history</p><h1>Historical trends</h1><p>Compare readings against their target bands before changing the setup.</p></div></header><section className="history-panel"><div className="context-grid two"><label>Location<select value={locationId} onChange={(e) => changeLocation(e.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Block<select value={block.id} onChange={(e) => { setBlockId(e.target.value); const next = blocks.find((item) => item.id === e.target.value); const first = metricDefinitions.find((item) => next?.installedMetrics.includes(item.key)); if (first) setMetricKey(first.key) }}>{locationBlocks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="metric-picker">{[...available, ...unavailable].map((item) => <button key={item.key} disabled={!block.installedMetrics.includes(item.key)} data-active={item.key === metric.key} onClick={() => setMetricKey(item.key)}>{item.label}{!block.installedMetrics.includes(item.key) && ' · Not installed'}</button>)}</div><div className="chart-head"><div><h2>{metric.label}</h2><p>Target {metric.target[0]}–{metric.target[1]} {metric.unit}</p></div><div className="range-picker">{(['24h', '7d', '30d'] as const).map((item) => <button data-active={range === item} onClick={() => setRange(item)} key={item}>{item}</button>)}</div></div><div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} onMouseMove={move} onMouseLeave={() => setHover(null)}>{[0, .25, .5, .75, 1].map((step) => <g key={step}><line x1={left} x2={width - right} y1={top + step * plotH} y2={top + step * plotH} className="grid-line" /><text x={left - 12} y={top + step * plotH + 4} textAnchor="end">{(metric.domain[1] - step * (metric.domain[1] - metric.domain[0])).toFixed(1)}</text></g>)}<rect x={left} y={y(metric.target[1])} width={plotW} height={y(metric.target[0]) - y(metric.target[1])} className="target-band" /><path d={path} className="trend-line" />{values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3" className="trend-point" />)}<text x={width / 2} y={height - 14} textAnchor="middle">Time ({range})</text><text transform={`rotate(-90 18 ${height / 2})`} x="18" y={height / 2} textAnchor="middle">{metric.label} ({metric.unit})</text>{hover && <g><line x1={hover.x} x2={hover.x} y1={top} y2={height - bottom} className="hover-line" /><circle cx={hover.x} cy={hover.y} r="7" className="hover-point" /><rect x={Math.min(hover.x + 12, width - 190)} y={Math.max(hover.y - 58, 8)} width="176" height="48" rx="12" className="tooltip-box" /><text x={Math.min(hover.x + 24, width - 178)} y={Math.max(hover.y - 36, 30)} className="tooltip-value">{hover.value.toFixed(1)} {metric.unit}</text><text x={Math.min(hover.x + 24, width - 178)} y={Math.max(hover.y - 20, 46)} className="tooltip-time">{hover.time.toLocaleString('lt-LT')}</text></g>}</svg></div></section></>
}
