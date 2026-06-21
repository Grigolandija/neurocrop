import { metricDefinitions } from '../data/mock'
import type { Block, Location } from '../types'

export function AlertsPage({ blocks, locations }: { blocks: Block[]; locations: Location[] }) {
  const alerts = blocks.flatMap((block) => metricDefinitions.filter((metric) => block.installedMetrics.includes(metric.key) && block.readings[metric.key] !== undefined && (block.readings[metric.key]! < metric.target[0] || block.readings[metric.key]! > metric.target[1])).map((metric) => ({ block, metric, value: block.readings[metric.key]! })))
  return <><header className="page-head"><div><p className="eyebrow">Operations</p><h1>Alerts</h1><p>Active deviations that need review.</p></div></header><section className="list-shell"><div className="list-head"><h2>Active alerts</h2><span>{alerts.length} issues</span></div>{alerts.length ? alerts.map(({ block, metric, value }) => <article className="list-row" data-tone="critical" key={`${block.id}-${metric.key}`}><div><strong>{metric.label} outside target</strong><p>{locations.find((item) => item.id === block.locationId)?.name} · {block.name}</p></div><div className="row-actions"><span className="battery-chip">{value} {metric.unit}</span><span className="status-chip">Review</span></div></article>) : <div className="empty-state">No active alerts.</div>}</section></>
}
