import { useSyncExternalStore } from 'react'
import {
  clearPerformanceMetrics,
  getPerformanceMetricsSnapshot,
  performanceDiagnosticsEnabled,
  subscribePerformanceMetrics,
} from '../services/performanceDiagnostics'

function metricLabel(kind: string) {
  if (kind === 'route') return 'PAGE'
  if (kind === 'module') return 'CODE'
  return 'API'
}

export default function PerformanceDiagnosticsPanel() {
  const metrics = useSyncExternalStore(subscribePerformanceMetrics, getPerformanceMetricsSnapshot)
  if (!performanceDiagnosticsEnabled()) return null

  return <aside className="performance-diagnostics" aria-label="Page performance diagnostics">
    <header><strong>Performance</strong><button type="button" onClick={clearPerformanceMetrics}>Clear</button></header>
    <div>
      {metrics.length ? metrics.slice(0, 8).map((metric) => <p key={metric.id} data-kind={metric.kind}>
        <b>{metricLabel(metric.kind)}</b><span title={metric.name}>{metric.name}</span><strong>{metric.durationMs.toFixed(1)} ms</strong>
      </p>) : <small>Navigate between pages to collect measurements.</small>}
    </div>
  </aside>
}
