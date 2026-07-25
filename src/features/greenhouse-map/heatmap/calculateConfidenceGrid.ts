import type { MeasurementPoint } from './heatmapTypes'

export function calculateConfidence(points: MeasurementPoint[], xM: number, yM: number, greenhouseDiagonalM: number) {
  if (!points.length) return 0
  const distances = points.map((point) => Math.hypot(point.xM - xM, point.yM - yM)).sort((a, b) => a - b)
  const proximity = Math.max(0, 1 - distances[0] / Math.max(greenhouseDiagonalM * 0.45, 0.01))
  const countFactor = Math.min(1, points.length / 4)
  const spread = points.length < 2 ? 0.45 : Math.min(1, (distances[Math.min(2, distances.length - 1)] - distances[0] + greenhouseDiagonalM * 0.12) / (greenhouseDiagonalM * 0.3))
  return Math.max(0.08, Math.min(1, proximity * 0.65 + countFactor * 0.2 + spread * 0.15))
}
