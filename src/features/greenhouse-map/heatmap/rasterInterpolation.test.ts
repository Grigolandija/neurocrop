import { describe, expect, it } from 'vitest'
import type { MeasurementPoint } from './heatmapTypes'
import { interpolateRasterCell, type RasterInterpolationOptions } from './rasterInterpolation'

const NOW = Date.parse('2026-07-28T12:00:00.000Z')

const point = (
  id: string,
  xM: number,
  yM: number,
  value: number,
  patch: Partial<MeasurementPoint> = {},
): MeasurementPoint => ({
  id,
  name: id,
  xM,
  yM,
  value,
  observedAtMs: NOW - 60_000,
  status: 'online',
  ...patch,
})

const options = (patch: Partial<RasterInterpolationOptions> = {}): RasterInterpolationOptions => ({
  widthM: 10,
  lengthM: 10,
  cellSizeM: 0.5,
  power: 2,
  nearestSensorCount: 4,
  minimumSensorCount: 3,
  maxInfluenceDistanceM: 10,
  maxReadingAgeMs: 30 * 60_000,
  nowMs: NOW,
  boundary: [
    { xM: 0, yM: 0 },
    { xM: 10, yM: 0 },
    { xM: 10, yM: 10 },
    { xM: 0, yM: 10 },
  ],
  zones: [],
  barriers: [],
  scale: { min: 0, max: 100 },
  ...patch,
})

describe('raster IDW interpolation', () => {
  it('uses the real reading when a cell is on the only sensor', () => {
    const result = interpolateRasterCell([point('one', 5, 5, 24.6)], 5, 5, options())
    expect(result.value).toBe(24.6)
    expect(result.confidence).toBe(1)
    expect(result.usedSensorCount).toBe(1)
  })

  it('returns no data away from a single sensor when the minimum is not met', () => {
    const result = interpolateRasterCell([point('one', 2, 2, 24)], 9.5, 9.5, options())
    expect(result.value).toBeNull()
    expect(result.usedSensorCount).toBe(0)
  })

  it('shows conservative coverage inside a single fresh sensor influence radius', () => {
    const result = interpolateRasterCell([point('one', 5, 5, 24)], 7, 5, options())
    expect(result.value).toBe(24)
    expect(result.usedSensorCount).toBe(1)
    expect(result.nearestDistanceM).toBe(2)
    expect(result.confidence).toBeGreaterThan(0.4)
    expect(result.confidence).toBeLessThan(0.7)
  })

  it('fades single-sensor confidence across the configured influence radius', () => {
    const near = interpolateRasterCell([point('one', 1, 5, 24)], 3, 5, options())
    const far = interpolateRasterCell([point('one', 1, 5, 24)], 8, 5, options())
    expect(near.value).toBe(24)
    expect(far.value).toBe(24)
    expect(near.confidence).toBeGreaterThan(far.confidence)
    expect(far.confidence).toBeGreaterThan(0)
  })

  it('reports lower confidence with two sensors than with dense coverage', () => {
    const sparsePoints = [
      point('a', 2, 2, 20),
      point('b', 8, 2, 24),
    ]
    const densePoints = [
      ...sparsePoints,
      point('c', 2, 8, 22),
      point('d', 8, 8, 22),
      point('e', 5, 7, 22),
    ]
    const interpolation = options({ minimumSensorCount: 2, nearestSensorCount: 5 })
    const sparse = interpolateRasterCell(sparsePoints, 5, 5, interpolation)
    const dense = interpolateRasterCell(densePoints, 5, 5, interpolation)
    expect(sparse.value).not.toBeNull()
    expect(sparse.usedSensorCount).toBe(2)
    expect(dense.confidence).toBeGreaterThan(sparse.confidence)
  })

  it('keeps confidence high close to a fresh online sensor', () => {
    const points = [
      point('near', 5, 5, 24),
      point('far-a', 1, 1, 18),
      point('far-b', 9, 1, 28),
      point('far-c', 1, 9, 20),
      point('far-d', 9, 9, 30),
    ]
    const result = interpolateRasterCell(points, 5.46, 5, options({ nearestSensorCount: 5 }))
    expect(result.value).not.toBeNull()
    expect(result.nearestDistanceM).toBeCloseTo(0.46, 4)
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('keeps confidence high two metres from a sensor with dense fresh coverage', () => {
    const points = [
      point('nearest', 5, 5, 22),
      point('b', 1, 1, 20),
      point('c', 9, 1, 24),
      point('d', 1, 9, 21),
      point('e', 9, 9, 23),
    ]
    const result = interpolateRasterCell(points, 7.12, 5, options({
      nearestSensorCount: 5,
      maxInfluenceDistanceM: 15,
    }))
    expect(result.nearestDistanceM).toBeCloseTo(2.12, 4)
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('keeps the same value for several equal sensors', () => {
    const points = [
      point('a', 2, 2, 50),
      point('b', 8, 2, 50),
      point('c', 5, 8, 50),
    ]
    expect(interpolateRasterCell(points, 5, 5, options()).value).toBeCloseTo(50, 8)
  })

  it('weights very different values by inverse squared distance', () => {
    const points = [
      point('near', 4, 5, 10),
      point('far-a', 9, 5, 90),
      point('far-b', 5, 9, 90),
    ]
    const result = interpolateRasterCell(points, 5, 5, options())
    expect(result.value).not.toBeNull()
    expect(result.value!).toBeLessThan(30)
  })

  it('ignores a sensor outside the greenhouse boundary', () => {
    const points = [
      point('inside-a', 2, 2, 20),
      point('inside-b', 2, 8, 20),
      point('outside', 10.5, 5, 100),
    ]
    const result = interpolateRasterCell(points, 5, 5, options())
    expect(result.value).toBeNull()
    expect(result.usedSensorCount).toBe(2)
  })

  it('marks a cell no data when readings are stale', () => {
    const stale = { observedAtMs: NOW - 31 * 60_000 }
    const points = [
      point('a', 2, 2, 20, stale),
      point('b', 8, 2, 21, stale),
      point('c', 5, 8, 22, stale),
    ]
    expect(interpolateRasterCell(points, 5, 5, options()).value).toBeNull()
  })

  it('uses only the configured nearest sensors', () => {
    const points = [
      point('a', 4, 5, 10),
      point('b', 5, 4, 10),
      point('c', 6, 5, 10),
      point('d', 5, 6, 100),
      point('e', 9, 9, 100),
    ]
    const result = interpolateRasterCell(points, 5, 5, options({ nearestSensorCount: 3 }))
    expect(result.usedSensorCount).toBe(3)
    expect(result.value).toBeCloseTo(10, 8)
  })

  it('does not create a seam when the farthest selected sensor changes', () => {
    const points = [
      point('core-a', 4, 4, 40),
      point('core-b', 4, 6, 40),
      point('core-c', 6, 4, 40),
      point('core-d', 6, 6, 40),
      point('left', 0.1, 5, 0),
      point('right', 9.9, 5, 100),
    ]
    const interpolation = options({ nearestSensorCount: 5, minimumSensorCount: 3 })
    const left = interpolateRasterCell(points, 4.999, 5, interpolation)
    const right = interpolateRasterCell(points, 5.001, 5, interpolation)
    expect(left.value).not.toBeNull()
    expect(right.value).not.toBeNull()
    expect(Math.abs(left.value! - right.value!)).toBeLessThan(0.01)
    expect(Math.abs(left.confidence - right.confidence)).toBeLessThan(0.01)
  })

  it('fades confidence continuously when a sensor leaves the influence radius', () => {
    const points = [
      point('core-a', 4, 4, 40),
      point('core-b', 4, 6, 40),
      point('edge', 10, 5, 80),
    ]
    const interpolation = options({
      nearestSensorCount: 5,
      minimumSensorCount: 2,
      maxInfluenceDistanceM: 5,
    })
    const inside = interpolateRasterCell(points, 5.001, 5, interpolation)
    const outside = interpolateRasterCell(points, 4.999, 5, interpolation)
    expect(inside.value).not.toBeNull()
    expect(outside.value).not.toBeNull()
    expect(Math.abs(inside.value! - outside.value!)).toBeLessThan(0.01)
    expect(Math.abs(inside.confidence - outside.confidence)).toBeLessThan(0.01)
  })

  it('does not let sensors across a closed partition affect local single-sensor coverage', () => {
    const points = [
      point('left', 2, 5, 20),
      point('right-a', 7, 3, 80),
      point('right-b', 7, 5, 80),
      point('right-c', 7, 7, 80),
    ]
    const barrier = {
      id: 'partition',
      polygon: [
        { xM: 4.9, yM: 0 },
        { xM: 5.1, yM: 0 },
        { xM: 5.1, yM: 10 },
        { xM: 4.9, yM: 10 },
      ],
    }
    const result = interpolateRasterCell(points, 3, 5, options({ barriers: [barrier] }))
    expect(result.value).toBe(20)
    expect(result.usedSensorCount).toBe(1)
  })

  it('uses sensors only from the same zone', () => {
    const zones = [
      { id: 'left', polygon: [{ xM: 0, yM: 0 }, { xM: 5, yM: 0 }, { xM: 5, yM: 10 }, { xM: 0, yM: 10 }] },
      { id: 'right', polygon: [{ xM: 5, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 10 }, { xM: 5, yM: 10 }] },
    ]
    const points = [
      point('left-a', 1, 2, 20, { zoneId: 'left' }),
      point('left-b', 2, 5, 20, { zoneId: 'left' }),
      point('left-c', 1, 8, 20, { zoneId: 'left' }),
      point('right', 6, 5, 100, { zoneId: 'right' }),
    ]
    expect(interpolateRasterCell(points, 3, 5, options({ zones })).value).toBeCloseTo(20, 8)
  })
})
