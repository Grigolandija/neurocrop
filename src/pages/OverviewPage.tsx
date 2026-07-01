import { metricDefinitions } from '../data/mock'
import type { Block, Location, ViewMode } from '../types'
import { MetricCard } from '../components/MetricCard'

export function OverviewPage({ locations, blocks, activeBlock, mode, onBlock }: { locations: Location[]; blocks: Block[]; activeBlock: Block; mode: ViewMode; onBlock: (id: string) => void }) {
  const location = locations.find((item) => item.id === activeBlock.locationId)
  const nonOptimal = metricDefinitions.filter((metric) => activeBlock.installedMetrics.includes(metric.key) && activeBlock.readings[metric.key] !== undefined && (activeBlock.readings[metric.key]! < metric.target[0] || activeBlock.readings[metric.key]! > metric.target[1]))
  const score = Math.max(0, 100 - nonOptimal.length * 11)
  const primary = nonOptimal[0]
  const scoreLabel = score >= 90 ? 'Optimal' : score >= 70 ? 'Watch' : 'Needs attention'
  return <>
    <section className="hero-panel">
      <div className="hero-head"><div><p className="eyebrow">Currently viewing</p><h1>{location?.name} · {activeBlock.name}</h1><p>{activeBlock.cropProfile}</p></div><div className="score" data-state={score < 80 ? 'warning' : 'optimal'}><small>Growing conditions score</small><strong>{score}</strong><span>{scoreLabel}</span></div></div>
      <div className="context-grid">
        <label>Location<select value={activeBlock.locationId} onChange={(e) => onBlock(blocks.find((block) => block.locationId === e.target.value)?.id || activeBlock.id)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Block<select value={activeBlock.id} onChange={(e) => onBlock(e.target.value)}>{blocks.filter((block) => block.locationId === activeBlock.locationId).map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label>
        <div className="context-box"><span>Crop profile</span><strong>{activeBlock.cropProfile}</strong></div>
      </div>
    </section>
    <section className="section-block"><div className="section-head"><div><p className="eyebrow">Key readings</p><h2>What is driving the score</h2></div><span className="count-chip">{activeBlock.installedMetrics.length} installed</span></div><div className="metric-grid">{metricDefinitions.slice(0, mode === 'simple' ? 4 : undefined).map((metric) => <MetricCard key={metric.key} metric={metric} value={activeBlock.readings[metric.key]} installed={activeBlock.installedMetrics.includes(metric.key)} />)}</div></section>
    <section className="next-step"><p className="eyebrow light">Today's priority</p><h2>{primary ? `Check ${primary.label.toLowerCase()}` : 'Keep the current setup'}</h2><p>{primary ? `${primary.label} is the strongest factor pulling down the growing conditions score in ${activeBlock.name}.` : 'All installed growth metrics are inside their configured target bands.'}</p></section>
    {mode === 'detailed' && <section className="section-block"><p className="eyebrow">Detailed analysis</p><h2>Operational context</h2><div className="stat-grid"><article><span>Nodes</span><strong>{activeBlock.nodes.length}</strong></article><article><span>Low battery</span><strong>{activeBlock.nodes.filter((node) => node.battery < 35).length}</strong></article><article><span>Coverage</span><strong>{Math.round(activeBlock.installedMetrics.length / metricDefinitions.length * 100)}%</strong></article></div></section>}
  </>
}
