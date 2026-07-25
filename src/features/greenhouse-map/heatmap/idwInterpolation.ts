import type { MeasurementPoint } from './heatmapTypes'

export function interpolateIdw(points: MeasurementPoint[], xM: number, yM: number, power = 2): number | null {
  if (!Number.isFinite(power) || power <= 0) throw new Error('IDW power must be a positive finite number.')
  if (!points.length) return null
  let weighted = 0
  let weights = 0
  for (const point of points) {
    const distanceSquared = (point.xM - xM) ** 2 + (point.yM - yM) ** 2
    if (distanceSquared < 1e-12) return point.value
    const weight = 1 / Math.pow(Math.sqrt(distanceSquared), power)
    weighted += point.value * weight
    weights += weight
  }
  return weights > 0 ? weighted / weights : null
}
