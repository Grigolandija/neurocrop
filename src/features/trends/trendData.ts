export type NormalizedTrendPoint = { observedAt: string; value: number }

export function numericTrendValue(value: unknown) {
  if (value === null || value === undefined || typeof value === 'boolean'
    || (typeof value === 'string' && !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeTrendPoints(items: Array<Record<string, unknown>>): NormalizedTrendPoint[] {
  return items.flatMap((point) => {
    const observedAt = String(point.observedAt || point.receivedAt || point.time || '')
    const timestamp = new Date(observedAt).getTime()
    const value = numericTrendValue(point.value)
    return observedAt && Number.isFinite(timestamp) && value !== null ? [{ observedAt, value }] : []
  }).sort((left, right) => new Date(left.observedAt).getTime() - new Date(right.observedAt).getTime())
}
