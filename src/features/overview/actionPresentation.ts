export type ActionMetricFallback = {
  metricKey: string
  riskKind: string
  currentValue: number | null
  target: [number, number] | null
  unit: string
  observedAt?: string | null
}

export type ActionMetricPresentation = {
  metricKey: string
  riskKind: string
  currentValue: number | null
  target: [number, number] | null
  unit: string
  deviation: number | null
  direction: 'above' | 'below' | 'inside' | 'unknown'
  observedAt: string | null
}

function normalizeUnit(value: unknown) {
  const unit = String(value || '').trim()
  if (/^(degc|°c|celsius)$/i.test(unit)) return '°C'
  if (/^(degf|°f|fahrenheit)$/i.test(unit)) return '°F'
  return unit
}

function targetRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const minimum = Number(value[0])
  const maximum = Number(value[1])
  return Number.isFinite(minimum) && Number.isFinite(maximum) ? [minimum, maximum] : null
}

export function buildActionMetricPresentation(
  action: Record<string, unknown>,
  fallback?: ActionMetricFallback,
): ActionMetricPresentation {
  const metricKey = String(action.metricId || action.metricKey || '')
  const riskKind = String(action.riskKind || 'target-deviation')
  const fallbackMatches = Boolean(fallback && fallback.metricKey === metricKey && fallback.riskKind === riskKind)
  const numericValue = action.value === null || action.value === undefined ? Number.NaN : Number(action.value)
  const currentValue = Number.isFinite(numericValue)
    ? numericValue
    : fallbackMatches ? fallback?.currentValue ?? null : null
  const target = targetRange(action.target) || (fallbackMatches ? fallback?.target ?? null : null)
  const unit = normalizeUnit(action.unit || (fallbackMatches ? fallback?.unit : ''))
  let deviation: number | null = null
  let direction: ActionMetricPresentation['direction'] = 'unknown'

  if (currentValue !== null && target) {
    if (currentValue > target[1]) {
      deviation = currentValue - target[1]
      direction = 'above'
    } else if (currentValue < target[0]) {
      deviation = currentValue - target[0]
      direction = 'below'
    } else {
      deviation = 0
      direction = 'inside'
    }
  }

  return {
    metricKey,
    riskKind,
    currentValue,
    target,
    unit,
    deviation,
    direction,
    observedAt: String(action.observedAt || (fallbackMatches ? fallback?.observedAt : '') || '') || null,
  }
}
