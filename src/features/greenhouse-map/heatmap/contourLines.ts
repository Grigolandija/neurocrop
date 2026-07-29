import type { MetricKey } from '../model'
import type { HeatmapGrid } from './heatmapTypes'
import { metricDefinitions } from '../../../domain/metricRegistry'

export const MIN_CONTOUR_SENSOR_COUNT = 2
const MAX_CONTOUR_LEVELS = 6
const DETAILED_CONTOUR_LEVELS = 10

const HEATMAP_REGISTRY = Object.fromEntries(
  Object.values(metricDefinitions)
    .filter((definition) => definition.heatmap)
    .map((definition) => [definition.heatmap!.key, {
      ...definition.heatmap!,
      temperature: definition.heatmap!.palette === 'temperature',
    }]),
) as Record<MetricKey, NonNullable<(typeof metricDefinitions)[string]['heatmap']> & { temperature: boolean }>

export const METRIC_LEVELS = Object.fromEntries(
  Object.entries(HEATMAP_REGISTRY).map(([metric, definition]) => [metric, {
    colorInterval: definition.colorInterval,
    contourInterval: definition.contourInterval,
  }]),
) as Record<MetricKey, { colorInterval: number; contourInterval: number }>

const ADAPTIVE_CONTOUR_INTERVALS = Object.fromEntries(
  Object.entries(HEATMAP_REGISTRY).map(([metric, definition]) => [metric, {
    candidates: definition.contourCandidates,
    lowConfidenceMinimum: definition.lowConfidenceMinimum,
  }]),
) as Record<MetricKey, { candidates: number[]; lowConfidenceMinimum: number }>

export const COLOR_INTERVALS = Object.fromEntries(
  Object.entries(METRIC_LEVELS).map(([metric, levels]) => [metric, levels.colorInterval]),
) as Record<MetricKey, number>

export const CONTOUR_INTERVALS = Object.fromEntries(
  Object.entries(METRIC_LEVELS).map(([metric, levels]) => [metric, levels.contourInterval]),
) as Record<MetricKey, number>

export function isTemperatureMetric(metric: MetricKey): boolean {
  return HEATMAP_REGISTRY[metric].temperature
}

export function getAdaptiveContourInterval(metric: MetricKey, values: number[], sensorCount: number): number {
  if (isTemperatureMetric(metric)) return 1
  const config = ADAPTIVE_CONTOUR_INTERVALS[metric]
  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length < 2) return METRIC_LEVELS[metric].contourInterval
  const span = Math.max(...finiteValues) - Math.min(...finiteValues)
  if (!Number.isFinite(span) || span <= 0) return METRIC_LEVELS[metric].contourInterval
  const minimum = sensorCount < 4 ? config.lowConfidenceMinimum : config.candidates[0]
  const maximumLevels = metric === 'co2' || metric === 'vpd'
    ? DETAILED_CONTOUR_LEVELS
    : MAX_CONTOUR_LEVELS
  return config.candidates.find((interval) =>
    interval >= minimum && span / interval <= maximumLevels + 1e-9,
  ) ?? config.candidates.at(-1)!
}

export type ContourSegment = {
  level: number
  x1: number
  y1: number
  x2: number
  y2: number
  confidence: number
}

export type ContourPath = {
  level: number
  points: number[]
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

type ContourGrid = Pick<HeatmapGrid, 'width' | 'height' | 'values' | 'confidence'>
  & Partial<Pick<HeatmapGrid, 'min' | 'max' | 'sensorCount'>>

export function createContourSegments(grid: ContourGrid, interval: number): ContourSegment[] {
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
        if (![topLeft, topRight, bottomRight, bottomLeft].every(Number.isFinite)) continue
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

const pointKey = (x: number, y: number) => `${Math.round(x * 1000)}:${Math.round(y * 1000)}`

export function connectContourSegments(segments: ContourSegment[]): ContourPath[] {
  const paths: ContourPath[] = []
  const byLevel = new Map<number, ContourSegment[]>()
  segments.forEach((segment) => byLevel.set(segment.level, [...(byLevel.get(segment.level) ?? []), segment]))

  for (const [level, levelSegments] of byLevel) {
    const edges = levelSegments.map((segment) => ({
      a: pointKey(segment.x1, segment.y1),
      b: pointKey(segment.x2, segment.y2),
      segment,
    }))
    const points = new Map<string, Point>()
    const adjacency = new Map<string, number[]>()
    edges.forEach((edge, index) => {
      points.set(edge.a, { x: edge.segment.x1, y: edge.segment.y1 })
      points.set(edge.b, { x: edge.segment.x2, y: edge.segment.y2 })
      adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), index])
      adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), index])
    })
    const unused = new Set(edges.map((_, index) => index))

    const walk = (firstEdge: number, start: string) => {
      const pathPoints: number[] = []
      let confidenceTotal = 0
      let edgeCount = 0
      let edgeIndex: number | undefined = firstEdge
      let current = start
      const startPoint = points.get(start)!
      pathPoints.push(startPoint.x, startPoint.y)
      while (edgeIndex != null && unused.has(edgeIndex)) {
        unused.delete(edgeIndex)
        const edge = edges[edgeIndex]
        current = edge.a === current ? edge.b : edge.a
        const nextPoint = points.get(current)!
        pathPoints.push(nextPoint.x, nextPoint.y)
        confidenceTotal += edge.segment.confidence
        edgeCount += 1
        edgeIndex = adjacency.get(current)?.find((candidate) => unused.has(candidate))
      }
      if (pathPoints.length >= 4) paths.push({ level, points: pathPoints, confidence: confidenceTotal / Math.max(1, edgeCount) })
    }

    for (const [key, connectedEdges] of adjacency) {
      if (connectedEdges.length === 2) continue
      connectedEdges.forEach((edgeIndex) => {
        if (unused.has(edgeIndex)) walk(edgeIndex, key)
      })
    }
    while (unused.size) {
      const edgeIndex = unused.values().next().value as number
      walk(edgeIndex, edges[edgeIndex].a)
    }
  }
  return paths
}

export function createContourPaths(grid: ContourGrid, interval: number): ContourPath[] {
  return connectContourSegments(createContourSegments(grid, interval))
}
