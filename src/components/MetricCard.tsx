import type { MetricDefinition } from '../types'

export function MetricCard({ metric, value, installed = true }: { metric: MetricDefinition; value?: number; installed?: boolean }) {
  const inside = value !== undefined && value >= metric.target[0] && value <= metric.target[1]
  const state = !installed ? 'disabled' : inside ? 'optimal' : 'warning'
  return <article className="metric-card" data-state={state}>
    <div className="card-row"><span className="metric-name">{metric.label}</span><span className="state-dot" /></div>
    {installed ? <><strong>{value?.toLocaleString()} <small>{metric.unit}</small></strong><p>Target {metric.target[0]}–{metric.target[1]} {metric.unit}</p></> : <><strong>Not installed</strong><p>No sensor data for this block.</p></>}
  </article>
}
