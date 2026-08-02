import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

function metricTime(recordedAt: number) {
  return new Date(recordedAt).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function metricsAsText(metrics: ReturnType<typeof getPerformanceMetricsSnapshot>) {
  return metrics.map((metric) => [
    metricTime(metric.recordedAt),
    metricLabel(metric.kind),
    metric.name,
    `${metric.durationMs.toFixed(1)} ms`,
  ].join('\n')).join('\n\n')
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export default function PerformanceDiagnosticsPanel() {
  const metrics = useSyncExternalStore(subscribePerformanceMetrics, getPerformanceMetricsSnapshot)
  const listRef = useRef<HTMLDivElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [metrics])

  if (!performanceDiagnosticsEnabled()) return null

  const chronologicalMetrics = [...metrics].reverse()
  const copyAll = async () => {
    if (!chronologicalMetrics.length) return
    try {
      await copyText(metricsAsText(chronologicalMetrics))
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2200)
    }
  }

  return <aside className="performance-diagnostics" aria-label="Page performance diagnostics">
    <header>
      <strong>Performance <small>{metrics.length}/100</small></strong>
      <div>
        <button type="button" disabled={!metrics.length} onClick={() => void copyAll()}>
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy all'}
        </button>
        <button type="button" onClick={clearPerformanceMetrics}>Clear</button>
      </div>
    </header>
    <div ref={listRef}>
      {chronologicalMetrics.length ? chronologicalMetrics.map((metric) => <p key={metric.id} data-kind={metric.kind}>
        <time dateTime={new Date(metric.recordedAt).toISOString()}>{metricTime(metric.recordedAt)}</time>
        <b>{metricLabel(metric.kind)}</b><span title={metric.name}>{metric.name}</span><strong>{metric.durationMs.toFixed(1)} ms</strong>
      </p>) : <small>Navigate between pages to collect measurements.</small>}
    </div>
  </aside>
}
