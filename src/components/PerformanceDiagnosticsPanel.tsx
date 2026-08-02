import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  clearPerformanceMetrics,
  getPerformanceMetricsSnapshot,
  performanceDiagnosticsEnabled,
  subscribePerformanceMetrics,
} from '../services/performanceDiagnostics'

function metricLabel(kind: string) {
  if (kind === 'route') return 'PAGE'
  if (kind === 'module') return 'CODE'
  if (kind === 'server') return 'SERVER'
  return 'API'
}

export default function PerformanceDiagnosticsPanel() {
  const metrics = useSyncExternalStore(subscribePerformanceMetrics, getPerformanceMetricsSnapshot)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [metrics])

  if (!performanceDiagnosticsEnabled()) return null

  const chronologicalMetrics = [...metrics].reverse()

  return <aside className="performance-diagnostics" aria-label="Page performance diagnostics">
    <header><strong>Performance <small>{metrics.length}/100</small></strong><button type="button" onClick={clearPerformanceMetrics}>Clear</button></header>
    <div ref={listRef}>
      {chronologicalMetrics.length ? chronologicalMetrics.map((metric) => <p key={metric.id} data-kind={metric.kind}>
        <time dateTime={new Date(metric.recordedAt).toISOString()}>{new Date(metric.recordedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}</time>
        <b>{metricLabel(metric.kind)}</b><span title={metric.name}>{metric.name}</span><strong>{metric.durationMs.toFixed(1)} ms</strong>
      </p>) : <small>Navigate between pages to collect measurements.</small>}
    </div>
  </aside>
}
