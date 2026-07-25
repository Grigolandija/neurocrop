import { METRICS, type MetricKey } from '../model'
import { calculateConfidence } from './calculateConfidenceGrid'
import { interpolateIdw } from './idwInterpolation'
import type { HeatmapGrid, MeasurementPoint } from './heatmapTypes'

export function gridResolution(widthM: number, lengthM: number) {
  const longest = Math.max(widthM, lengthM)
  const targetLong = longest < 2 ? 100 : longest > 500 ? 120 : 160
  let width = Math.max(2, Math.round(targetLong * widthM / longest))
  let height = Math.max(2, Math.round(targetLong * lengthM / longest))
  const maxPoints = 28000
  if (width * height > maxPoints) {
    const ratio = Math.sqrt(maxPoints / (width * height))
    width = Math.max(2, Math.floor(width * ratio))
    height = Math.max(2, Math.floor(height * ratio))
  }
  return { width, height }
}

export function createMeasurementGrid(points: MeasurementPoint[], widthM: number, lengthM: number, metric: MetricKey, power: number, scale: { min: number; max: number }): HeatmapGrid | null {
  if (!points.length) return null
  const resolution = gridResolution(widthM, lengthM)
  const values = new Float32Array(resolution.width * resolution.height)
  const confidence = new Float32Array(values.length)
  const diagonal = Math.hypot(widthM, lengthM)
  const bounds = METRICS[metric].bounds
  for (let y = 0; y < resolution.height; y += 1) {
    for (let x = 0; x < resolution.width; x += 1) {
      const index = y * resolution.width + x
      const xM = x / (resolution.width - 1) * widthM
      const yM = lengthM - y / (resolution.height - 1) * lengthM
      const value = interpolateIdw(points, xM, yM, power)
      values[index] = Math.max(bounds[0], Math.min(bounds[1], value ?? scale.min))
      confidence[index] = calculateConfidence(points, xM, yM, diagonal)
    }
  }
  return { ...resolution, values, confidence, min: scale.min, max: scale.max, sensorCount: points.length }
}
