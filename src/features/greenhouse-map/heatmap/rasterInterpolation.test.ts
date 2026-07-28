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
    const result = interpolateRasterCell([point('one', 2, 2, 24)], 6, 6, options())
    expect(result.value).toBeNull()
    expect(result.usedSensorCount).toBe(1)
  })

  it('allows two-sensor edge coverage but caps its confidence as low', () => {
    const result = interpolateRasterCell([
      point('a', 2, 2, 20),
      point('b', 8, 2, 24),
    ], 5, 5, options({ minimumSensorCount: 2 }))
    expect(result.value).not.toBeNull()
    expect(result.usedSensorCount).toBe(2)
    expect(result.confidence).toBeLessThanOrEqual(0.38)
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

  it('does not interpolate through a closed partition', () => {
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
    expect(result.value).toBeNull()
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
