import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoMap } from '../demo'
import { screenToWorld, sectionGeometrySummary, snapRectangleBounds, snapRectanglePosition, snapSectionToWalls, snapValue, snapWallMountedObject, worldToScreen } from '../geometry'
import { mapRepository, validateMap } from '../services/mapRepository'
import { calculateConfidence } from './calculateConfidenceGrid'
import { COLOR_INTERVALS, CONTOUR_INTERVALS, METRIC_LEVELS, MIN_CONTOUR_SENSOR_COUNT, connectContourSegments, createContourPaths, createContourSegments, getAdaptiveContourInterval, getContourLevels } from './contourLines'
import { createMeasurementGrid, gridResolution } from './createMeasurementGrid'
import { getStableScale, getValidMeasurementPoints } from './heatmapMetrics'
import { interpolateIdw } from './idwInterpolation'
import { colorAt, colorAtStops, scaleGradient, semanticColorAt } from './heatmapColorScale'
import { DEFAULT_HEATMAP_SETTINGS, GREENHOUSE_WALL_THICKNESS_M, METRICS, normalizeHeatmapSettings } from '../model'

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
  it('creates a separate Soil EC slice for the selected depth', () => {
    const map = createDemoMap()
    map.objects.filter((object) => object.metadata.sensor).forEach((object, index) => {
      object.metadata.sensor!.measurements!.soilEcByDepth = [
        { depthCm: 10, value: 1 + index * 0.1 },
        { depthCm: 30, value: 2 + index * 0.1 },
      ]
    })
    expect(getValidMeasurementPoints(map, 'soil-ec', undefined, 10).map((point) => point.value))
      .not.toEqual(getValidMeasurementPoints(map, 'soil-ec', undefined, 30).map((point) => point.value))
  })
  it('keeps adaptive grids useful for very small greenhouses', () => {
    const resolution = gridResolution(.2, .1, .25)
    expect(resolution).toMatchObject({ width: 1, height: 1 })
  })
  it('caps very large greenhouse grids', () => {
    const resolution = gridResolution(10000, 8000)
    expect(resolution.width * resolution.height).toBeLessThanOrEqual(60000)
  })
  it('migrates legacy raster settings while preserving later explicit choices', () => {
    expect(normalizeHeatmapSettings({ ...DEFAULT_HEATMAP_SETTINGS, rasterSettingsVersion: undefined, cellSizeM: 0.5 }).cellSizeM).toBe(0.25)
    expect(normalizeHeatmapSettings({ ...DEFAULT_HEATMAP_SETTINGS, rasterSettingsVersion: 5, cellSizeM: 0.5 }).cellSizeM).toBe(0.5)
    expect(normalizeHeatmapSettings({ ...DEFAULT_HEATMAP_SETTINGS, rasterSettingsVersion: 4, minimumSensorCount: 3 }).minimumSensorCount).toBe(2)
    expect(normalizeHeatmapSettings({ ...DEFAULT_HEATMAP_SETTINGS, rasterSettingsVersion: 5, minimumSensorCount: 2 }).minimumSensorCount).toBe(2)
  })
  it('keeps the greenhouse outline fixed at one centimetre', () => {
    const map = createDemoMap()
    expect(map.wallThicknessM).toBe(GREENHOUSE_WALL_THICKNESS_M)
    map.wallThicknessM = 0.5
    mapRepository.save(map)
    expect(mapRepository.load().wallThicknessM).toBe(GREENHOUSE_WALL_THICKNESS_M)
  })
  it('creates a bounded four-sensor grid', () => {
    const points = [point(0, 0, -50), point(20, 0, 20), point(0, 8, 25), point(20, 8, 90)]
    const map = createDemoMap()
    map.heatmapSettings.minimumSensorCount = 1
    map.heatmapSettings.maxInfluenceDistanceM = 100
    const grid = createMeasurementGrid(points, map, 'air-temperature', { min: 15, max: 35 })
    expect(grid?.sensorCount).toBe(4)
    expect(Math.min(...[...(grid?.values ?? [])].filter(Number.isFinite))).toBeGreaterThanOrEqual(5)
    expect(Math.max(...[...(grid?.values ?? [])].filter(Number.isFinite))).toBeLessThanOrEqual(45)
  })
  it('keeps edge cells covered when a valid four-sensor map has two local neighbours', () => {
    const points = [
      point(1, 1, 24),
      point(19, 1, 24.2),
      point(1, 7, 24.1),
      point(19, 7, 24.3),
    ]
    const map = createDemoMap()
    map.heatmapSettings.minimumSensorCount = 2
    map.heatmapSettings.maxInfluenceDistanceM = 15
    const grid = createMeasurementGrid(points, map, 'air-temperature', { min: 22, max: 26 })
    expect(grid.dataCellCount / (grid.width * grid.height)).toBeGreaterThan(0.95)
  })
  it('evaluates historical readings against the selected frame time', () => {
    const selectedFrameMs = new Date('2026-07-27T08:00:00.000Z').getTime()
    const historicalPoints = [
      { ...point(1, 1, 22), observedAtMs: selectedFrameMs, status: 'online' as const },
      { ...point(19, 1, 24), observedAtMs: selectedFrameMs, status: 'online' as const },
      { ...point(10, 7, 23), observedAtMs: selectedFrameMs, status: 'online' as const },
    ]
    const map = createDemoMap()
    map.heatmapSettings.minimumSensorCount = 2
    map.heatmapSettings.maxInfluenceDistanceM = 100
    map.heatmapSettings.maxReadingAgeMinutes = 30
    const atSelectedFrame = createMeasurementGrid(historicalPoints, map, 'air-temperature', { min: 20, max: 26 }, selectedFrameMs + 10 * 60_000)
    const againstCurrentTime = createMeasurementGrid(historicalPoints, map, 'air-temperature', { min: 20, max: 26 }, selectedFrameMs + 12 * 60 * 60_000)
    expect(atSelectedFrame.dataCellCount).toBeGreaterThan(0)
    expect(againstCurrentTime.dataCellCount).toBe(0)
  })
  it('keeps physical north at the top and the origin at the bottom-left', () => {
    const map = createDemoMap()
    map.heatmapSettings.minimumSensorCount = 1
    map.heatmapSettings.maxInfluenceDistanceM = 100
    const grid = createMeasurementGrid([point(0, 0, 10), point(0, 8, 30)], map, 'air-temperature', { min: 10, max: 30 })!
    expect(grid.values[0]).toBeGreaterThan(grid.values[(grid.height - 1) * grid.width])
  })
  it('honours valid manual scale limits', () => expect(getStableScale([20, 30], 'air-temperature', { min: 18, max: 32 })).toEqual({ min: 18, max: 32 }))
  it('keeps sub-degree noise restrained while exposing agronomic temperature differences', () => {
    const scale = getStableScale([26.4, 26.6], 'air-temperature')
    expect(scale.max - scale.min).toBeGreaterThanOrEqual(2)
    expect((26.6 - 26.4) / (scale.max - scale.min)).toBeLessThanOrEqual(0.1)
    const agronomicScale = getStableScale([15.2, 15.9, 16.6], 'air-temperature')
    expect((16.6 - 15.2) / (agronomicScale.max - agronomicScale.min)).toBeGreaterThanOrEqual(0.45)
  })
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
    const stops = METRICS['relative-humidity'].colorStops!
    const low = colorAtStops(30, stops)
    const middle = colorAtStops(60, stops)
    const high = colorAtStops(90, stops)
    expect(new Set([low.join(','), middle.join(','), high.join(',')]).size).toBe(3)
    expect(low[0]).toBeGreaterThan(low[2])
    expect(high[1]).toBeGreaterThan(high[0])
  })
  it('uses stable semantic anchors instead of recolouring the observed minimum and maximum', () => {
    expect(colorAtStops(16, METRICS['air-temperature'].colorStops!)).toEqual([54, 142, 170])
    expect(colorAtStops(22, METRICS['air-temperature'].colorStops!)).toEqual([155, 208, 92])
    expect(colorAtStops(30, METRICS['air-temperature'].colorStops!)).toEqual([217, 54, 46])
    expect(colorAtStops(32, METRICS['air-temperature'].colorStops!)).toEqual([217, 54, 46])
    expect(colorAtStops(400, METRICS.co2.colorStops!)).toEqual([217, 231, 236])
    expect(colorAtStops(2000, METRICS.co2.colorStops!)).toEqual([127, 50, 111])
    expect(scaleGradient(19.5, 29.5, METRICS['air-temperature'], [20, 21]).match(/rgb\(/g)?.length).toBeGreaterThan(3)
  })
  it('shows ordinary greenhouse temperatures as green rather than cold blue', () => {
    const [red, green, blue] = colorAtStops(19, METRICS['air-temperature'].colorStops!)
    expect(green).toBeGreaterThan(red)
    expect(green).toBeGreaterThan(blue)
  })
  it('boosts local differences without assigning the full palette extremes', () => {
    const definition = METRICS['air-temperature']
    const low = semanticColorAt(15.2, definition, [14.5, 17.5])
    const high = semanticColorAt(16.6, definition, [14.5, 17.5])
    const distance = Math.hypot(...low.map((channel, index) => channel - high[index]))
    expect(distance).toBeGreaterThan(25)
    expect(distance).toBeLessThan(100)
    expect(low[2]).toBeGreaterThan(low[0])
    expect(high[1]).toBeGreaterThan(low[1])
  })
  it('makes a meaningful three-degree temperature spread visually distinct', () => {
    const definition = METRICS['air-temperature']
    const low = semanticColorAt(17, definition, [17, 20])
    const high = semanticColorAt(20, definition, [17, 20])
    const colorDistance = Math.hypot(...low.map((channel, index) => channel - high[index]))
    expect(colorDistance).toBeGreaterThan(50)
    expect(low[1]).toBeGreaterThan(low[0])
    expect(high[1]).toBeGreaterThan(high[0])
  })
  it('keeps a ten-point humidity spread moderate and agronomically anchored', () => {
    const definition = METRICS['relative-humidity']
    const low = semanticColorAt(56, definition, [55, 67])
    const high = semanticColorAt(66, definition, [55, 67])
    const fullLow = colorAt(0, 0, 1, definition.colors)
    const fullHigh = colorAt(1, 0, 1, definition.colors)
    const localDistance = Math.hypot(...low.map((channel, index) => channel - high[index]))
    const fullPaletteDistance = Math.hypot(...fullLow.map((channel, index) => channel - fullHigh[index]))
    expect(localDistance).toBeGreaterThan(40)
    expect(localDistance).toBeLessThan(fullPaletteDistance * 0.75)
    expect(low[1]).toBeGreaterThan(low[0])
    expect(high[1]).toBeGreaterThan(high[0])
  })
  it('uses registered stops as the absolute semantic base for every metric palette', () => {
    Object.values(METRICS).forEach((definition) => expect(definition.colorStops?.length).toBeGreaterThan(1))

    const soilEc = METRICS['soil-ec']
    expect(semanticColorAt(2, soilEc)).toEqual(colorAtStops(2, soilEc.colorStops!))
    const ph = METRICS.ph
    expect(semanticColorAt(6.1, ph)).toEqual(colorAtStops(6.1, ph.colorStops!))
  })
  it('does not reuse the air-humidity palette for substrate moisture', () => {
    expect(colorAtStops(30, METRICS['relative-humidity'].colorStops!)).toEqual([201, 130, 67])
    expect(colorAtStops(30, METRICS['soil-moisture'].colorStops!)).toEqual([209, 173, 114])
  })
  it('keeps contour intervals aligned with metric levels', () => {
    Object.values(METRIC_LEVELS).forEach(({ colorInterval, contourInterval }) => {
      expect(contourInterval / colorInterval).toBeCloseTo(Math.round(contourInterval / colorInterval))
    })
    expect(COLOR_INTERVALS['air-temperature']).toBe(1)
    expect(COLOR_INTERVALS['relative-humidity']).toBe(1)
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
  it('adapts contour spacing to both temperature and other metric ranges', () => {
    expect(getAdaptiveContourInterval('relative-humidity', [40, 48], 5)).toBe(2)
    expect(getAdaptiveContourInterval('relative-humidity', [40, 61], 5)).toBe(5)
    expect(getAdaptiveContourInterval('air-temperature', [26.2, 26.6], 5)).toBe(0.1)
    expect(getAdaptiveContourInterval('air-temperature', [19, 22], 5)).toBe(0.5)
    expect(getAdaptiveContourInterval('air-temperature', [16, 28], 5)).toBe(2)
    expect(getAdaptiveContourInterval('root-temperature', [8, 35], 2)).toBe(5)
    expect(getAdaptiveContourInterval('leaf-temperature', [12, 36], 8)).toBe(5)
    expect(getAdaptiveContourInterval('water-temperature', [4, 31], 3)).toBe(5)
    expect(getAdaptiveContourInterval('co2', [500, 750], 5)).toBe(50)
    expect(getAdaptiveContourInterval('co2', [400, 1600], 5)).toBe(200)
    expect(getAdaptiveContourInterval('vpd', [0.8, 1.1], 5)).toBe(0.05)
    expect(getAdaptiveContourInterval('vpd', [0.4, 2], 5)).toBe(0.2)
    const co2Interval = getAdaptiveContourInterval('co2', [525, 1550], 10)
    expect(co2Interval).toBe(200)
    expect(getContourLevels(new Float32Array([525, 1550]), co2Interval)).toEqual([600, 800, 1000, 1200, 1400])
    const vpdInterval = getAdaptiveContourInterval('vpd', [0.4, 2], 10)
    expect(getContourLevels(new Float32Array([0.4, 2]), vpdInterval).length).toBeGreaterThanOrEqual(5)
  })
  it('does not imply fine precision with fewer than four sensors', () => {
    expect(getAdaptiveContourInterval('relative-humidity', [40, 48], 3)).toBe(5)
    expect(getAdaptiveContourInterval('air-temperature', [26.2, 26.6], 2)).toBe(0.1)
    expect(getAdaptiveContourInterval('co2', [500, 750], 3)).toBe(100)
    expect(getAdaptiveContourInterval('vpd', [0.8, 1.1], 2)).toBe(0.1)
  })
  it('creates only levels inside the measured range', () => {
    expect(getContourLevels(new Float32Array([21.2, 22.8]), 0.5)).toEqual([21.5, 22, 22.5])
  })
  it('creates visible temperature isolines for a small measured spread', () => {
    const points = [
      point(2, 2, 26.2),
      point(8, 2, 26.3),
      point(2, 7, 26.4),
      point(8, 7, 26.5),
      point(5, 5, 26.6),
    ]
    const map = createDemoMap()
    map.heatmapSettings.maxInfluenceDistanceM = 100
    const scale = getStableScale(points.map(({ value }) => value), 'air-temperature')
    const grid = createMeasurementGrid(points, map, 'air-temperature', scale)!
    const interval = getAdaptiveContourInterval('air-temperature', points.map(({ value }) => value), points.length)
    const paths = createContourPaths(grid, interval)

    expect(interval).toBe(0.1)
    expect(paths.length).toBeGreaterThan(0)
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
    const map = createDemoMap()
    map.dimensions.lengthM = 10
    map.heatmapSettings.maxInfluenceDistanceM = 100
    const grid = createMeasurementGrid(points, map, 'air-temperature', scale)!
    const interval = getAdaptiveContourInterval('air-temperature', points.map(({ value }) => value), points.length)
    const paths = createContourPaths(grid, interval)
    expect(grid.width * grid.height).toBeLessThanOrEqual(60000)
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
  it('magnetically snaps the nearest rectangle anchor instead of always jumping its origin', () => {
    const position = snapRectanglePosition(
      { xM: 2.31, yM: 1.38 },
      { widthM: 1.4, lengthM: 0.45 },
      0.5,
      true,
    )
    expect(position.xM).toBeCloseTo(2.3)
    expect(position.yM).toBeCloseTo(1.275)
  })
  it('leaves a rectangle free when none of its anchors are close to the grid', () => {
    expect(snapRectanglePosition(
      { xM: 2.17, yM: 1.12 },
      { widthM: 1.1, lengthM: 0.6 },
      0.5,
      true,
      0.04,
    )).toEqual({ xM: 2.17, yM: 1.12 })
  })
  it('snaps resized rectangle edges without moving distant edges', () => {
    expect(snapRectangleBounds(
      { xM: 1.02, yM: 2.04, widthM: 2.44, lengthM: 1.43 },
      0.5,
      true,
      0.06,
    )).toEqual({ xM: 1, yM: 2, widthM: 2.5, lengthM: 1.5 })
  })
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
