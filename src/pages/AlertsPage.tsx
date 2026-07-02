import { useState } from 'react'
import { Link } from 'react-router-dom'
import { metricDefinitions } from '../data/mock'
import type { Block, Location } from '../types'

type AlertStatus = 'active' | 'acknowledged' | 'snoozed' | 'resolved'

export function AlertsPage({ blocks, locations }: { blocks: Block[]; locations: Location[] }) {
  const generated = blocks.flatMap((block) => metricDefinitions
    .filter((metric) => block.installedMetrics.includes(metric.key)
      && block.readings[metric.key] !== undefined
      && (block.readings[metric.key]! < metric.target[0] || block.readings[metric.key]! > metric.target[1]))
    .map((metric) => ({
      id: `${block.id}-${metric.key}`,
      block,
      metric,
      value: block.readings[metric.key]!,
    })))
  const [statuses, setStatuses] = useState<Record<string, AlertStatus>>({})
  const [filter, setFilter] = useState<'open' | 'resolved'>('open')
  const alerts = generated.filter((alert) => filter === 'resolved'
    ? statuses[alert.id] === 'resolved'
    : statuses[alert.id] !== 'resolved')

  function setStatus(id: string, status: AlertStatus) {
    setStatuses((current) => ({ ...current, [id]: status }))
  }

  return <>
    <header className="surface rounded-[30px] p-5 md:p-6 flex items-end justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Operations</p><h1 className="mt-1.5 font-display text-[1.65rem] font-bold text-ink">Alerts</h1><p className="mt-2 text-sm leading-6 text-ink/66">Review current deviations and record what was done.</p></div><div className="segmented-filter"><button data-active={filter === 'open'} onClick={() => setFilter('open')}>Open</button><button data-active={filter === 'resolved'} onClick={() => setFilter('resolved')}>Resolved</button></div></header>
    <section className="surface rounded-[34px] p-6 md:p-7"><div className="list-head"><h2>{filter === 'open' ? 'Needs attention' : 'Resolved alerts'}</h2><span>{alerts.length} alerts</span></div><article className="management-list-shell mt-5">{alerts.length ? alerts.map(({ id, block, metric, value }) => {
      const status = statuses[id] || 'active'
      return <article className="management-list-row" data-state={status === 'resolved' ? 'optimal' : 'warning'} key={id}><div className="management-list-main"><div className="management-list-title">{metric.label} outside target</div><div className="management-list-meta">{locations.find((item) => item.id === block.locationId)?.name || 'Unassigned'} · {block.name} · {value} {metric.unit}</div><div className="management-list-note">Target {metric.target[0]}–{metric.target[1]} {metric.unit} · {status === 'active' ? 'Not reviewed' : status}</div></div><div className="management-list-actions"><span className="management-chip" data-tone={status === 'resolved' ? 'optimal' : 'warning'}>{status === 'resolved' ? 'Resolved' : 'Warning'}</span><Link className="inline-action actionable" to="/history"><i className="fa-solid fa-chart-line" />Trends</Link>{status !== 'resolved' && <><button className="inline-action actionable" onClick={() => setStatus(id, 'acknowledged')}>Acknowledge</button><button className="inline-action actionable" onClick={() => setStatus(id, 'snoozed')}>Snooze</button><button className="inline-action actionable" data-tone="primary" onClick={() => setStatus(id, 'resolved')}>Resolve</button></>}</div></article>
    }) : <div className="empty-state">{filter === 'open' ? 'No active alerts.' : 'No alerts have been resolved in this session.'}</div>}</article></section>
  </>
}
