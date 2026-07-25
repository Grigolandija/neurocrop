import type { MetricKey } from '../model'
import type { HeatmapGrid } from './heatmapTypes'

export const CONTOUR_INTERVALS: Record<MetricKey, number> = {
  'air-temperature': 0.5,
  'relative-humidity': 5,
  co2: 100,
  vpd: 0.1,
  'root-temperature': 0.5,
}

export type ContourSegment = {
  level: number
  x1: number
  y1: number
  x2: number
  y2: number
  confidence: number
}

type Point = { x: number; y: number }

const interpolate = (level: number, valueA: number, valueB: number) => {
  if (Math.abs(valueB - valueA) < 1e-9) return 0.5
  return Math.max(0, Math.min(1, (level - valueA) / (valueB - valueA)))
}

export function getContourLevels(values: Float32Array, interval: number): number[] {
  if (!values.length || !Number.isFinite(interval) || interval <= 0) return []
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum - minimum < interval * 1e-6) return []

  const precision = Math.max(0, Math.ceil(-Math.log10(interval)) + 1)
  const levels: number[] = []
  const first = Math.ceil((minimum + interval * 1e-6) / interval) * interval
  for (let level = first; level < maximum - interval * 1e-6; level += interval) {
    levels.push(Number(level.toFixed(precision)))
  }
  return levels
}

export function createContourSegments(grid: HeatmapGrid, interval: number): ContourSegment[] {
  const segments: ContourSegment[] = []
  const levels = getContourLevels(grid.values, interval)
  const valueAt = (x: number, y: number) => grid.values[y * grid.width + x]
  const confidenceAt = (x: number, y: number) => grid.confidence[y * grid.width + x]

  for (const level of levels) {
    for (let y = 0; y < grid.height - 1; y += 1) {
      for (let x = 0; x < grid.width - 1; x += 1) {
        const topLeft = valueAt(x, y)
        const topRight = valueAt(x + 1, y)
        const bottomRight = valueAt(x + 1, y + 1)
        const bottomLeft = valueAt(x, y + 1)
        const cellCase =
          (topLeft >= level ? 8 : 0) |
          (topRight >= level ? 4 : 0) |
          (bottomRight >= level ? 2 : 0) |
          (bottomLeft >= level ? 1 : 0)
        if (cellCase === 0 || cellCase === 15) continue

        const edges: Record<'top' | 'right' | 'bottom' | 'left', Point> = {
          top: { x: x + interpolate(level, topLeft, topRight), y },
          right: { x: x + 1, y: y + interpolate(level, topRight, bottomRight) },
          bottom: { x: x + interpolate(level, bottomLeft, bottomRight), y: y + 1 },
          left: { x, y: y + interpolate(level, topLeft, bottomLeft) },
        }
        const pairs: Array<[Point, Point]> = []
        switch (cellCase) {
          case 1: case 14: pairs.push([edges.left, edges.bottom]); break
          case 2: case 13: pairs.push([edges.bottom, edges.right]); break
          case 3: case 12: pairs.push([edges.left, edges.right]); break
          case 4: case 11: pairs.push([edges.top, edges.right]); break
          case 5: pairs.push([edges.top, edges.left], [edges.bottom, edges.right]); break
          case 6: case 9: pairs.push([edges.top, edges.bottom]); break
          case 7: case 8: pairs.push([edges.top, edges.left]); break
          case 10: pairs.push([edges.top, edges.right], [edges.bottom, edges.left]); break
        }
        const confidence = (
          confidenceAt(x, y) +
          confidenceAt(x + 1, y) +
          confidenceAt(x + 1, y + 1) +
          confidenceAt(x, y + 1)
        ) / 4
        pairs.forEach(([start, end]) => segments.push({
          level,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          confidence,
        }))
      }
    }
  }
  return segments
}
