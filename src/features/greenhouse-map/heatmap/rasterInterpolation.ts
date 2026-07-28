import type { HeatmapGrid, MeasurementPoint } from './heatmapTypes'

export type RasterPoint = { xM: number; yM: number }
export type RasterPolygon = RasterPoint[]
export type RasterZone = { id: string; polygon: RasterPolygon }
export type RasterBarrier = { id: string; polygon: RasterPolygon }

export type RasterInterpolationOptions = {
  widthM: number
  lengthM: number
  cellSizeM: number
  power: number
  nearestSensorCount: number
  minimumSensorCount: number
  maxInfluenceDistanceM: number
  maxReadingAgeMs: number
  nowMs: number
  boundary: RasterPolygon
  zones: RasterZone[]
  barriers: RasterBarrier[]
  exactMatchDistanceM?: number
  valueBounds?: [number, number]
  scale: { min: number; max: number }
}

export type RasterCellResult = {
  value: number | null
  confidence: number
  usedSensorCount: number
  nearestSensorIndex: number
  nearestDistanceM: number
}

const MAX_RASTER_CELLS = 60_000
const EPSILON = 1e-9

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function supportRadiusFor(
  selected: Array<{ distanceM: number }>,
  options: RasterInterpolationOptions,
): number {
  if (selected.length >= options.nearestSensorCount) {
    return Math.min(options.maxInfluenceDistanceM, selected.at(-1)!.distanceM * 1.000001)
  }
  return options.maxInfluenceDistanceM
}

function distanceTaper(distanceM: number, supportRadiusM: number): number {
  const remaining = clamp01(1 - distanceM / Math.max(supportRadiusM, EPSILON))
  return remaining * remaining * (3 - 2 * remaining)
}

export function pointInPolygon(point: RasterPoint, polygon: RasterPolygon): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    const cross = (b.xM - a.xM) * (point.yM - a.yM) - (b.yM - a.yM) * (point.xM - a.xM)
    const onBoundary = Math.abs(cross) <= EPSILON
      && point.xM >= Math.min(a.xM, b.xM) - EPSILON
      && point.xM <= Math.max(a.xM, b.xM) + EPSILON
      && point.yM >= Math.min(a.yM, b.yM) - EPSILON
      && point.yM <= Math.max(a.yM, b.yM) + EPSILON
    if (onBoundary) return true
    const crosses = (a.yM > point.yM) !== (b.yM > point.yM)
      && point.xM < (b.xM - a.xM) * (point.yM - a.yM) / (b.yM - a.yM || EPSILON) + a.xM
    if (crosses) inside = !inside
  }
  return inside
}

const orientation = (a: RasterPoint, b: RasterPoint, c: RasterPoint) =>
  (b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM)

const onSegment = (a: RasterPoint, b: RasterPoint, point: RasterPoint) =>
  point.xM >= Math.min(a.xM, b.xM) - EPSILON
  && point.xM <= Math.max(a.xM, b.xM) + EPSILON
  && point.yM >= Math.min(a.yM, b.yM) - EPSILON
  && point.yM <= Math.max(a.yM, b.yM) + EPSILON

export function segmentsIntersect(a: RasterPoint, b: RasterPoint, c: RasterPoint, d: RasterPoint): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true
  if (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) return true
  if (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) return true
  if (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) return true
  return Math.abs(cdB) <= EPSILON && onSegment(c, d, b)
}

export function segmentCrossesPolygon(start: RasterPoint, end: RasterPoint, polygon: RasterPolygon): boolean {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return true
  for (let index = 0; index < polygon.length; index += 1) {
    if (segmentsIntersect(start, end, polygon[index], polygon[(index + 1) % polygon.length])) return true
  }
  return false
}

function zoneAt(point: RasterPoint, zones: RasterZone[]): string | undefined {
  return zones.find((zone) => pointInPolygon(point, zone.polygon))?.id
}

function isFresh(point: MeasurementPoint, options: RasterInterpolationOptions): boolean {
  if (point.status === 'offline' || point.status === 'stale' || point.status === 'unassigned') return false
  if (point.observedAtMs === undefined) return true
  return Number.isFinite(point.observedAtMs)
    && options.nowMs - point.observedAtMs >= -60_000
    && options.nowMs - point.observedAtMs <= options.maxReadingAgeMs
}

function confidenceFor(
  selected: Array<{ point: MeasurementPoint; distanceM: number }>,
  options: RasterInterpolationOptions,
): number {
  if (!selected.length) return 0
  const supportRadiusM = supportRadiusFor(selected, options)
  const supported = selected.map((item) => ({
    ...item,
    support: distanceTaper(item.distanceM, supportRadiusM),
  }))
  const nearestProximity = distanceTaper(supported[0].distanceM, options.maxInfluenceDistanceM)
  const coverage = clamp01(selected.reduce((sum, item) =>
    sum + distanceTaper(item.distanceM, options.maxInfluenceDistanceM), 0) / options.nearestSensorCount)
  const idwSupported = supported.map((item) => ({
    ...item,
    confidenceWeight: item.support / Math.pow(Math.max(item.distanceM, options.exactMatchDistanceM ?? 0.05), options.power),
  }))
  const totalConfidenceWeight = Math.max(EPSILON, idwSupported.reduce((sum, item) => sum + item.confidenceWeight, 0))
  const freshness = supported.reduce((sum, item) => {
    const fresh = item.point.observedAtMs === undefined
      ? 1
      : clamp01(1 - (options.nowMs - item.point.observedAtMs) / options.maxReadingAgeMs)
    const confidenceWeight = idwSupported.find((weighted) => weighted.point === item.point)!.confidenceWeight
    return sum + fresh * confidenceWeight
  }, 0) / totalConfidenceWeight
  const mean = idwSupported.reduce((sum, item) => sum + item.point.value * item.confidenceWeight, 0) / totalConfidenceWeight
  const variance = idwSupported.reduce((sum, item) =>
    sum + (item.point.value - mean) ** 2 * item.confidenceWeight, 0) / totalConfidenceWeight
  const relativeDeviation = Math.sqrt(variance) / Math.max(Math.abs(mean), 0.1)
  const agreement = clamp01(1 - relativeDeviation / 0.35)
  return clamp01(nearestProximity * 0.45 + coverage * 0.2 + freshness * 0.2 + agreement * 0.15)
}

export function interpolateRasterCell(
  points: MeasurementPoint[],
  xM: number,
  yM: number,
  options: RasterInterpolationOptions,
): RasterCellResult {
  const cell = { xM, yM }
  if (!pointInPolygon(cell, options.boundary)) {
    return { value: null, confidence: 0, usedSensorCount: 0, nearestSensorIndex: -1, nearestDistanceM: Number.POSITIVE_INFINITY }
  }
  const cellZoneId = zoneAt(cell, options.zones)
  const candidates = points.flatMap((point, pointIndex) => {
    if (!Number.isFinite(point.value) || !isFresh(point, options)) return []
    if (!pointInPolygon(point, options.boundary)) return []
    const pointZoneId = point.zoneId ?? zoneAt(point, options.zones)
    if (options.zones.length && pointZoneId !== cellZoneId) return []
    const distanceM = Math.hypot(point.xM - xM, point.yM - yM)
    if (distanceM > options.maxInfluenceDistanceM) return []
    if (options.barriers.some((barrier) => segmentCrossesPolygon(cell, point, barrier.polygon))) return []
    return [{ point, pointIndex, distanceM }]
  }).sort((left, right) => left.distanceM - right.distanceM)

  const nearest = candidates[0]
  const exactDistanceM = options.exactMatchDistanceM ?? Math.min(0.1, options.cellSizeM * 0.35)
  if (nearest && nearest.distanceM <= exactDistanceM) {
    return {
      value: nearest.point.value,
      confidence: 1,
      usedSensorCount: 1,
      nearestSensorIndex: nearest.pointIndex,
      nearestDistanceM: nearest.distanceM,
    }
  }
  if (candidates.length < options.minimumSensorCount) {
    const singleSensorEvidenceRadiusM = Math.min(1, options.maxInfluenceDistanceM)
    if (nearest && candidates.length === 1 && nearest.distanceM < singleSensorEvidenceRadiusM) {
      const rawValue = nearest.point.value
      const value = !options.valueBounds
        ? rawValue
        : Math.max(options.valueBounds[0], Math.min(options.valueBounds[1], rawValue))
      const freshness = nearest.point.observedAtMs === undefined
        ? 1
        : clamp01(1 - (options.nowMs - nearest.point.observedAtMs) / options.maxReadingAgeMs)
      return {
        value,
        confidence: distanceTaper(nearest.distanceM, singleSensorEvidenceRadiusM) * (0.45 + freshness * 0.3),
        usedSensorCount: 1,
        nearestSensorIndex: nearest.pointIndex,
        nearestDistanceM: nearest.distanceM,
      }
    }
    return {
      value: null,
      confidence: 0,
      usedSensorCount: candidates.length,
      nearestSensorIndex: nearest?.pointIndex ?? -1,
      nearestDistanceM: nearest?.distanceM ?? Number.POSITIVE_INFINITY,
    }
  }

  const selected = candidates.slice(0, options.nearestSensorCount)
  const supportRadiusM = supportRadiusFor(selected, options)
  let weightedValue = 0
  let totalWeight = 0
  for (const item of selected) {
    const weight = distanceTaper(item.distanceM, supportRadiusM)
      / Math.pow(Math.max(item.distanceM, EPSILON), options.power)
    weightedValue += item.point.value * weight
    totalWeight += weight
  }
  const rawValue = totalWeight > 0 ? weightedValue / totalWeight : null
  const value = rawValue === null || !options.valueBounds
    ? rawValue
    : Math.max(options.valueBounds[0], Math.min(options.valueBounds[1], rawValue))
  return {
    value,
    confidence: confidenceFor(selected, options),
    usedSensorCount: selected.length,
    nearestSensorIndex: nearest?.pointIndex ?? -1,
    nearestDistanceM: nearest?.distanceM ?? Number.POSITIVE_INFINITY,
  }
}

export function rasterDimensions(widthM: number, lengthM: number, requestedCellSizeM: number) {
  let cellSizeM = Math.max(0.1, requestedCellSizeM)
  let width = Math.max(1, Math.ceil(widthM / cellSizeM))
  let height = Math.max(1, Math.ceil(lengthM / cellSizeM))
  if (width * height > MAX_RASTER_CELLS) {
    cellSizeM *= Math.sqrt(width * height / MAX_RASTER_CELLS)
    width = Math.max(1, Math.ceil(widthM / cellSizeM))
    height = Math.max(1, Math.ceil(lengthM / cellSizeM))
    while (width * height > MAX_RASTER_CELLS) {
      cellSizeM *= 1.002
      width = Math.max(1, Math.ceil(widthM / cellSizeM))
      height = Math.max(1, Math.ceil(lengthM / cellSizeM))
    }
  }
  return { width, height, cellWidthM: widthM / width, cellHeightM: lengthM / height }
}

export function buildRasterGrid(points: MeasurementPoint[], options: RasterInterpolationOptions): HeatmapGrid {
  const dimensions = rasterDimensions(options.widthM, options.lengthM, options.cellSizeM)
  const size = dimensions.width * dimensions.height
  const values = new Float32Array(size)
  values.fill(Number.NaN)
  const confidence = new Float32Array(size)
  const dataMask = new Uint8Array(size)
  const usedSensorCounts = new Uint8Array(size)
  const nearestSensorIndices = new Int16Array(size)
  nearestSensorIndices.fill(-1)
  const nearestDistancesM = new Float32Array(size)
  nearestDistancesM.fill(Number.POSITIVE_INFINITY)
  let dataCellCount = 0

  for (let row = 0; row < dimensions.height; row += 1) {
    for (let column = 0; column < dimensions.width; column += 1) {
      const index = row * dimensions.width + column
      const xM = (column + 0.5) * dimensions.cellWidthM
      const yM = options.lengthM - (row + 0.5) * dimensions.cellHeightM
      const result = interpolateRasterCell(points, xM, yM, { ...options, cellSizeM: dimensions.cellWidthM })
      confidence[index] = result.confidence
      usedSensorCounts[index] = result.usedSensorCount
      nearestSensorIndices[index] = result.nearestSensorIndex
      nearestDistancesM[index] = result.nearestDistanceM
      if (result.value === null) continue
      values[index] = result.value
      dataMask[index] = 1
      dataCellCount += 1
    }
  }

  return {
    ...dimensions,
    requestedCellSizeM: options.cellSizeM,
    values,
    confidence,
    dataMask,
    usedSensorCounts,
    nearestSensorIndices,
    nearestDistancesM,
    points,
    min: options.scale.min,
    max: options.scale.max,
    sensorCount: points.length,
    dataCellCount,
  }
}
