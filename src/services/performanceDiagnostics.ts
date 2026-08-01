export type PerformanceMetricKind = 'route' | 'module' | 'api' | 'server'

export type PerformanceMetric = {
  id: number
  kind: PerformanceMetricKind
  name: string
  durationMs: number
  recordedAt: number
}

const diagnosticsSessionKey = 'neurocrop-performance-diagnostics'
const routeStarts = new Map<string, number>()
const listeners = new Set<() => void>()
let metrics: PerformanceMetric[] = []
let nextMetricId = 1

export function performanceDiagnosticsEnabled() {
  const setting = new URLSearchParams(window.location.search).get('perf')
  try {
    if (setting === '1') sessionStorage.setItem(diagnosticsSessionKey, '1')
    if (setting === '0') sessionStorage.removeItem(diagnosticsSessionKey)
    return setting === '1' || (setting !== '0' && sessionStorage.getItem(diagnosticsSessionKey) === '1')
  } catch {
    return setting === '1'
  }
}

function publishMetric(kind: PerformanceMetricKind, name: string, durationMs: number) {
  if (!performanceDiagnosticsEnabled()) return
  const metric: PerformanceMetric = {
    id: nextMetricId++,
    kind,
    name,
    durationMs: Math.max(0, Math.round(durationMs * 10) / 10),
    recordedAt: Date.now(),
  }
  metrics = [metric, ...metrics].slice(0, 100)
  listeners.forEach((listener) => listener())
  console.info(`[performance] ${kind} ${name}: ${metric.durationMs} ms`)
}

export async function measurePerformance<T>(kind: 'module' | 'api', name: string, operation: () => Promise<T>) {
  if (!performanceDiagnosticsEnabled()) return await operation()
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    publishMetric(kind, name, performance.now() - startedAt)
  }
}

export function recordServerTiming(requestName: string, header: string | null) {
  if (!header || !performanceDiagnosticsEnabled()) return
  for (const entry of header.split(',')) {
    const [rawName, ...parameters] = entry.trim().split(';')
    const duration = Number(parameters.find((parameter) => parameter.trim().startsWith('dur='))?.trim().slice(4))
    if (rawName && Number.isFinite(duration)) publishMetric('server', `${requestName} · ${rawName}`, duration)
  }
}

export function beginRoutePerformance(route: string) {
  if (!performanceDiagnosticsEnabled()) return
  routeStarts.set(route, performance.now())
}

export function completeRoutePerformance(route: string) {
  const startedAt = routeStarts.get(route)
  if (startedAt === undefined) return
  routeStarts.delete(route)
  publishMetric('route', route, performance.now() - startedAt)
}

export function subscribePerformanceMetrics(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPerformanceMetricsSnapshot() {
  return metrics
}

export function clearPerformanceMetrics() {
  metrics = []
  listeners.forEach((listener) => listener())
}
