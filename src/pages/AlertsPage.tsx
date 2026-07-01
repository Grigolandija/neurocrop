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
    <header className="page-head"><div><p className="eyebrow">Operations</p><h1>Alerts</h1><p>Review current deviations and record what was done.</p></div><div className="segmented-filter"><button data-active={filter === 'open'} onClick={() => setFilter('open')}>Open</button><button data-active={filter === 'resolved'} onClick={() => setFilter('resolved')}>Resolved</button></div></header>
    <section className="list-shell"><div className="list-head"><h2>{filter === 'open' ? 'Needs attention' : 'Resolved alerts'}</h2><span>{alerts.length} alerts</span></div>{alerts.length ? alerts.map(({ id, block, metric, value }) => {
      const status = statuses[id] || 'active'
      return <article className="alert-row" data-status={status} key={id}><div className="alert-main"><div><span className="alert-priority">Warning</span><strong>{metric.label} outside target</strong><p>{locations.find((item) => item.id === block.locationId)?.name || 'Unassigned'} · {block.name}</p></div><div className="alert-value"><strong>{value} {metric.unit}</strong><span>Target {metric.target[0]}–{metric.target[1]} {metric.unit}</span></div></div><div className="alert-actions"><span>{status === 'active' ? 'Not reviewed' : status}</span><Link to="/history">Open Trends</Link>{status !== 'resolved' && <><button onClick={() => setStatus(id, 'acknowledged')}>Acknowledge</button><button onClick={() => setStatus(id, 'snoozed')}>Snooze</button><button className="resolve-button" onClick={() => setStatus(id, 'resolved')}>Resolve</button></>}</div></article>
    }) : <div className="empty-state">{filter === 'open' ? 'No active alerts.' : 'No alerts have been resolved in this session.'}</div>}</section>
  </>
}
