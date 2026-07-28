import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoMap } from '../demo'
import { screenToWorld, sectionGeometrySummary, snapSectionToWalls, snapValue, snapWallMountedObject, worldToScreen } from '../geometry'
import { mapRepository, validateMap } from '../services/mapRepository'
import { calculateConfidence } from './calculateConfidenceGrid'
import { COLOR_INTERVALS, CONTOUR_INTERVALS, METRIC_LEVELS, MIN_CONTOUR_SENSOR_COUNT, connectContourSegments, createContourPaths, createContourSegments, getAdaptiveContourInterval, getContourLevels } from './contourLines'
import { createMeasurementGrid, gridResolution } from './createMeasurementGrid'
import { getStableScale, getValidMeasurementPoints } from './heatmapMetrics'
import { interpolateIdw } from './idwInterpolation'
import { bandedColorAt, bandedGradient, colorAt } from './heatmapColorScale'
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
  it('filters climate measurements to the selected Section', () => {
    const map = createDemoMap()
    map.objects.filter((object) => object.metadata.sensor).forEach((object, index) => {
      object.metadata.sensor!.sectionId = index < 2 ? 'section-a' : 'section-b'
    })
    expect(getValidMeasurementPoints(map, 'air-temperature', 'section-a')).toHaveLength(2)
    expect(getValidMeasurementPoints(map, 'air-temperature', 'section-b')).toHaveLength(2)
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
  it('keeps physical north at the top and the origin at the bottom-left', () => {
    const grid = createMeasurementGrid([point(0, 0, 10), point(0, 8, 30)], 20, 8, 'air-temperature', 2, { min: 10, max: 30 })!
    expect(grid.values[0]).toBeCloseTo(30)
    expect(grid.values[(grid.height - 1) * grid.width]).toBeCloseTo(10)
  })
  it('honours valid manual scale limits', () => expect(getStableScale([20, 30], 'air-temperature', { min: 18, max: 32 })).toEqual({ min: 18, max: 32 }))
  it('reduces confidence with distance', () => {
    const points = [point(0, 0, 20), point(1, 0, 21)]
    expect(calculateConfidence(points, .2, .1, 20)).toBeGreaterThan(calculateConfidence(points, 15, 0, 20))
  })
})

describe('environment colour scale', () => {
  it('uses a high-opacity heatmap without a second translucent layer', () => {
    const map = createDemoMap()
    expect(map.heatmapSettings.opacity).toBe(0.88)
    expect(map.layers.find((layer) => layer.id === 'environment')?.opacity).toBe(1)
  })
  it('uses distinct dry, balanced and humid colours for relative humidity', () => {
    const colors = METRICS['relative-humidity'].colors
    expect(colorAt(40, 40, 80, colors)).toEqual([242, 184, 75])
    expect(colorAt(60, 40, 80, colors)).toEqual([102, 199, 180])
    expect(colorAt(80, 40, 80, colors)).toEqual([47, 128, 195])
  })
  it('uses metric bands whose boundaries align with the major contour levels', () => {
    Object.values(METRIC_LEVELS).forEach(({ colorInterval, contourInterval }) => {
      expect(contourInterval / colorInterval).toBeCloseTo(Math.round(contourInterval / colorInterval))
    })
    const colors = METRICS['air-temperature'].colors
    expect(COLOR_INTERVALS['air-temperature']).toBe(0.25)
    expect(COLOR_INTERVALS['relative-humidity']).toBe(1)
    expect(bandedColorAt(22.99, 20, 30, colors, 0.25)).not.toEqual(bandedColorAt(23.01, 20, 30, colors, 0.25))
    expect(bandedGradient(20, 25, colors, 0.25).match(/rgb\(/g)).toHaveLength(40)
  })
})

describe('heatmap contour lines', () => {
  it('allows directional contours from two valid sensors', () => {
    expect(MIN_CONTOUR_SENSOR_COUNT).toBe(2)
  })

  it('keeps meaningful fallback intervals for every metric', () => {
    expect(CONTOUR_INTERVALS['air-temperature']).toBe(1)
    expect(CONTOUR_INTERVALS['relative-humidity']).toBe(5)
    expect(CONTOUR_INTERVALS.co2).toBe(100)
    expect(CONTOUR_INTERVALS.vpd).toBe(0.1)
    expect(CONTOUR_INTERVALS['root-temperature']).toBe(1)
  })
  it('keeps temperature contours fixed while adapting other metric ranges', () => {
    expect(getAdaptiveContourInterval('relative-humidity', [40, 48], 5)).toBe(2)
    expect(getAdaptiveContourInterval('relative-humidity', [40, 61], 5)).toBe(5)
    expect(getAdaptiveContourInterval('air-temperature', [19, 22], 5)).toBe(1)
    expect(getAdaptiveContourInterval('air-temperature', [16, 28], 5)).toBe(1)
    expect(getAdaptiveContourInterval('root-temperature', [8, 35], 2)).toBe(1)
    expect(getAdaptiveContourInterval('leaf-temperature', [12, 36], 8)).toBe(1)
    expect(getAdaptiveContourInterval('water-temperature', [4, 31], 3)).toBe(1)
    expect(getAdaptiveContourInterval('co2', [500, 750], 5)).toBe(50)
    expect(getAdaptiveContourInterval('co2', [400, 1600], 5)).toBe(250)
    expect(getAdaptiveContourInterval('vpd', [0.8, 1.1], 5)).toBe(0.05)
    expect(getAdaptiveContourInterval('vpd', [0.4, 2], 5)).toBe(0.5)
  })
  it('does not imply fine precision with fewer than four sensors', () => {
    expect(getAdaptiveContourInterval('relative-humidity', [40, 48], 3)).toBe(5)
    expect(getAdaptiveContourInterval('air-temperature', [19, 22], 2)).toBe(1)
    expect(getAdaptiveContourInterval('co2', [500, 750], 3)).toBe(100)
    expect(getAdaptiveContourInterval('vpd', [0.8, 1.1], 2)).toBe(0.1)
  })
  it('creates only levels inside the measured range', () => {
    expect(getContourLevels(new Float32Array([21.2, 22.8]), 0.5)).toEqual([21.5, 22, 22.5])
  })
  it('extracts a line where a grid crosses a contour level', () => {
    const segments = createContourSegments({
      width: 2,
      height: 2,
      values: new Float32Array([0, 1, 0, 1]),
      confidence: new Float32Array([1, 1, 1, 1]),
      min: 0,
      max: 1,
      sensorCount: 3,
    }, 0.5)
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ level: 0.5, x1: 0.5, x2: 0.5, confidence: 1 })
  })
  it('joins neighbouring segments into a crisp continuous path', () => {
    const paths = connectContourSegments([
      { level: 20, x1: 0, y1: 0, x2: 1, y2: 1, confidence: 0.8 },
      { level: 20, x1: 1, y1: 1, x2: 2, y2: 1.5, confidence: 1 },
    ])
    expect(paths).toHaveLength(1)
    expect(paths[0].points).toEqual([0, 0, 1, 1, 2, 1.5])
    expect(paths[0].confidence).toBeCloseTo(0.9)
  })
  it('keeps a new Area with three collinear sensors bounded', () => {
    const points = [
      point(16.8, 5.05, 18.5),
      point(10.05, 5.05, 25.14),
      point(3.3, 5.05, 24.03),
    ]
    const scale = getStableScale(points.map(({ value }) => value), 'air-temperature')
    const grid = createMeasurementGrid(points, 20, 10, 'air-temperature', 2, scale)!
    const interval = getAdaptiveContourInterval('air-temperature', points.map(({ value }) => value), points.length)
    const paths = createContourPaths(grid, interval)
    expect(grid.width * grid.height).toBeLessThanOrEqual(28000)
    expect(paths.length).toBeLessThan(100)
    expect(paths.reduce((total, path) => total + path.points.length, 0)).toBeLessThan(10000)
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
  it('reports overlapping and uncovered Section geometry', () => {
    const summary = sectionGeometrySummary([
      { id: 'a', xM: 0, yM: 0, widthM: 6, lengthM: 4 },
      { id: 'b', xM: 5, yM: 0, widthM: 5, lengthM: 4 },
    ], { widthM: 10, lengthM: 5 })
    expect(summary.overlaps).toHaveLength(1)
    expect(summary.overlaps[0].areaM2).toBe(4)
    expect(summary.uncoveredPercent).toBeGreaterThan(0)
  })
  it('snaps Section boundaries to nearby greenhouse walls', () => {
    const snapped = snapSectionToWalls({ id: 'a', xM: .2, yM: 2.8, widthM: 4, lengthM: 2 }, { widthM: 10, lengthM: 5 }, .25)
    expect(snapped.xM).toBe(0)
    expect(snapped.yM).toBe(3)
  })
  it('mounts doors to the nearest perimeter wall with rotation-safe dimensions', () => {
    const map = createDemoMap()
    const door = {
      ...map.objects.find((object) => object.type === 'door')!,
      xM: 19.4,
      yM: 2,
      widthM: 1.2,
      lengthM: .2,
      rotationDeg: 87,
    }
    const snapped = snapWallMountedObject(door, map.dimensions)
    expect(snapped.metadata.wallMount).toEqual({ wall: 'east', offsetM: 1.5 })
    expect(snapped.xM).toBe(19.8)
    expect(snapped.yM).toBe(1.5)
    expect(snapped.widthM).toBe(.2)
    expect(snapped.lengthM).toBe(1.2)
    expect(snapped.rotationDeg).toBe(0)
    expect(validateMap({ ...map, objects: map.objects.map((object) => object.id === door.id ? snapped : object) }).ok).toBe(true)
  })
  it('keeps a resized wall opening inside its mounted wall segment', () => {
    const map = createDemoMap()
    const opening = {
      ...map.objects.find((object) => object.type === 'door')!,
      xM: 19.8,
      yM: 7.7,
      widthM: .2,
      lengthM: 2,
      metadata: { wallMount: { wall: 'east' as const, offsetM: 7.7 } },
    }
    const snapped = snapWallMountedObject(opening, map.dimensions, 'east')
    expect(snapped.yM).toBe(6)
    expect(snapped.yM + snapped.lengthM).toBe(8)
    expect(snapped.metadata.wallMount).toEqual({ wall: 'east', offsetM: 6 })
  })
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
