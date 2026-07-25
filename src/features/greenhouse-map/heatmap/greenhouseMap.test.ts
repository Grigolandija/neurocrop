import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoMap } from '../demo'
import { screenToWorld, snapValue, worldToScreen } from '../geometry'
import { mapRepository, validateMap } from '../services/mapRepository'
import { calculateConfidence } from './calculateConfidenceGrid'
import { createMeasurementGrid, gridResolution } from './createMeasurementGrid'
import { getStableScale, getValidMeasurementPoints } from './heatmapMetrics'
import { interpolateIdw } from './idwInterpolation'
import { colorAt } from './heatmapColorScale'
import { METRICS } from '../model'

const point = (xM: number, yM: number, value: number) => ({ xM, yM, value })
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
})

describe('IDW interpolation', () => {
  it('returns a single sensor value across the map', () => expect(interpolateIdw([point(1, 1, 24)], 8, 4, 2)).toBe(24))
  it('weights two different sensor values', () => expect(interpolateIdw([point(0, 0, 20), point(10, 0, 30)], 5, 0, 2)).toBeCloseTo(25))
  it('interpolates four sensors', () => expect(interpolateIdw([point(0, 0, 20), point(10, 0, 24), point(0, 10, 28), point(10, 10, 32)], 5, 5, 2)).toBeCloseTo(26))
  it('uses the exact value at a sensor position', () => expect(interpolateIdw([point(2, 3, 21.75), point(8, 7, 30)], 2, 3, 2)).toBe(21.75))
  it('returns a constant when all values match', () => expect(interpolateIdw([point(0, 0, 10), point(5, 5, 10), point(9, 1, 10)], 3, 2, 2)).toBeCloseTo(10))
  it('returns null with no valid sensors', () => expect(interpolateIdw([], 0, 0, 2)).toBeNull())
  it('rejects invalid power', () => {
    expect(() => interpolateIdw([point(0, 0, 1)], 1, 1, 0)).toThrow()
    expect(() => interpolateIdw([point(0, 0, 1)], 1, 1, Number.NaN)).toThrow()
  })
})

describe('measurement filtering and grid sizing', () => {
  beforeEach(() => localStorage.clear())
  it('ignores offline, stale, missing and out-of-bounds nodes', () => {
    const map = createDemoMap()
    map.objects[8].metadata.sensor!.status = 'offline'
    map.objects[9].metadata.sensor!.status = 'stale'
    delete map.objects[10].metadata.sensor!.measurements!.airTemperatureC
    map.objects[11].xM = 50
    expect(getValidMeasurementPoints(map, 'air-temperature')).toHaveLength(0)
  })
  it('keeps adaptive grids useful for very small greenhouses', () => {
    const resolution = gridResolution(.2, .1)
    expect(resolution.width).toBeGreaterThanOrEqual(100)
    expect(resolution.width * resolution.height).toBeLessThanOrEqual(28000)
  })
  it('caps very large greenhouse grids', () => {
    const resolution = gridResolution(10000, 8000)
    expect(resolution.width * resolution.height).toBeLessThanOrEqual(28000)
  })
  it('creates a bounded four-sensor grid', () => {
    const points = [point(0, 0, -50), point(20, 0, 20), point(0, 8, 25), point(20, 8, 90)]
    const grid = createMeasurementGrid(points, 20, 8, 'air-temperature', 2, { min: 15, max: 35 })
    expect(grid?.sensorCount).toBe(4)
    expect(Math.min(...(grid?.values ?? []))).toBeGreaterThanOrEqual(5)
    expect(Math.max(...(grid?.values ?? []))).toBeLessThanOrEqual(45)
  })
  it('honours valid manual scale limits', () => expect(getStableScale([20, 30], 'air-temperature', { min: 18, max: 32 })).toEqual({ min: 18, max: 32 }))
  it('reduces confidence with distance', () => {
    const points = [point(0, 0, 20), point(1, 0, 21)]
    expect(calculateConfidence(points, .2, .1, 20)).toBeGreaterThan(calculateConfidence(points, 15, 0, 20))
  })
})

describe('environment colour scale', () => {
  it('uses distinct dry, balanced and humid colours for relative humidity', () => {
    const colors = METRICS['relative-humidity'].colors
    expect(colorAt(40, 40, 80, colors)).toEqual([242, 184, 75])
    expect(colorAt(60, 40, 80, colors)).toEqual([102, 199, 180])
    expect(colorAt(80, 40, 80, colors)).toEqual([47, 128, 195])
  })
})

describe('coordinates, snap and persistence validation', () => {
  const transform = { scale: 40, offsetX: 100, offsetY: 50 }
  it('round-trips real metres through canvas pixels after zoom and pan', () => {
    const screen = worldToScreen(4.25, 2.5, 8, transform)
    expect(screenToWorld(screen.x, screen.y, 8, transform)).toEqual({ xM: 4.25, yM: 2.5 })
  })
  it('snaps to the configured grid', () => expect(snapValue(2.37, .25, true)).toBe(2.25))
  it('does not snap when disabled', () => expect(snapValue(2.37, .25, false)).toBe(2.37))
  it('rejects invalid imported dimensions and coordinates without mutation', () => {
    const map = createDemoMap()
    const invalidDimensions = structuredClone(map)
    invalidDimensions.dimensions.widthM = Number.POSITIVE_INFINITY
    expect(validateMap(invalidDimensions).ok).toBe(false)
    const invalidObject = structuredClone(map)
    invalidObject.objects[0].xM = -1
    expect(validateMap(invalidObject).ok).toBe(false)
    expect(map.objects[0].xM).toBe(1.3)
  })
  it('restores a valid map from localStorage', () => {
    const map = createDemoMap()
    map.name = 'Restored plan'
    mapRepository.save(map)
    expect(mapRepository.load().name).toBe('Restored plan')
  })
})
