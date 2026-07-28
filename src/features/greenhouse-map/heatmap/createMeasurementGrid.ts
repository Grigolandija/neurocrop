import { METRICS, type GreenhouseMap, type GreenhouseObject, type MetricKey } from '../model'
import { buildRasterGrid, rasterDimensions, type RasterBarrier, type RasterPoint, type RasterZone } from './rasterInterpolation'
import type { HeatmapGrid, MeasurementPoint } from './heatmapTypes'

function objectPolygon(object: GreenhouseObject): RasterPoint[] {
  const angle = object.rotationDeg * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    [0, 0],
    [object.widthM, 0],
    [object.widthM, object.lengthM],
    [0, object.lengthM],
  ].map(([x, y]) => ({
    xM: object.xM + x * cosine - y * sine,
    yM: object.yM + x * sine + y * cosine,
  }))
}

function rasterZones(map: GreenhouseMap): RasterZone[] {
  return map.objects.flatMap((object) => object.type === 'section-zone' && object.visible
    ? [{
        id: object.metadata.section?.sectionId || object.id,
        polygon: objectPolygon(object),
      }]
    : [])
}

function rasterBarriers(map: GreenhouseMap): RasterBarrier[] {
  return map.objects.flatMap((object) => object.type === 'partition' && object.visible
    ? [{ id: object.id, polygon: objectPolygon(object) }]
    : [])
}

export function gridResolution(widthM: number, lengthM: number, cellSizeM = 0.5) {
  return rasterDimensions(widthM, lengthM, cellSizeM)
}

export function createMeasurementGrid(
  points: MeasurementPoint[],
  map: GreenhouseMap,
  metric: MetricKey,
  scale: { min: number; max: number },
  nowMs = Date.now(),
): HeatmapGrid {
  const settings = map.heatmapSettings
  return buildRasterGrid(points, {
    widthM: map.dimensions.widthM,
    lengthM: map.dimensions.lengthM,
    cellSizeM: settings.cellSizeM,
    power: settings.idwPower,
    nearestSensorCount: settings.nearestSensorCount,
    minimumSensorCount: settings.minimumSensorCount,
    maxInfluenceDistanceM: settings.maxInfluenceDistanceM,
    maxReadingAgeMs: settings.maxReadingAgeMinutes * 60_000,
    nowMs,
    boundary: [
      { xM: 0, yM: 0 },
      { xM: map.dimensions.widthM, yM: 0 },
      { xM: map.dimensions.widthM, yM: map.dimensions.lengthM },
      { xM: 0, yM: map.dimensions.lengthM },
    ],
    zones: rasterZones(map),
    barriers: rasterBarriers(map),
    valueBounds: METRICS[metric].bounds,
    scale,
  })
}
