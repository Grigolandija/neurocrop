import { METRICS, type GreenhouseMap, type MetricKey } from '../model'
import type { MeasurementPoint } from './heatmapTypes'

export function getValidMeasurementPoints(map: GreenhouseMap, metric: MetricKey, sectionId?: string): MeasurementPoint[] {
  const field = METRICS[metric].field
  return map.objects.flatMap((object) => {
    const sensor = object.metadata.sensor
    const value = sensor?.measurements?.[field]
    if (object.type !== 'sensor-node' || !sensor || sensor.status === 'offline' || sensor.status === 'stale') return []
    if (sectionId && sensor.sectionId !== sectionId) return []
    if (object.xM < 0 || object.yM < 0 || object.xM > map.dimensions.widthM || object.yM > map.dimensions.lengthM) return []
    return typeof value === 'number' && Number.isFinite(value) ? [{ xM: object.xM + object.widthM / 2, yM: object.yM + object.lengthM / 2, value }] : []
  })
}

export function getStableScale(values: number[], metric: MetricKey, manual?: { min?: number; max?: number }) {
  const bounds = METRICS[metric].bounds
  if (typeof manual?.min === 'number' && typeof manual.max === 'number' && manual.min < manual.max) {
    return { min: Math.max(bounds[0], manual.min), max: Math.min(bounds[1], manual.max) }
  }
  if (!values.length) return { min: bounds[0], max: bounds[1] }
  const observedMin = Math.min(...values)
  const observedMax = Math.max(...values)
  const span = Math.max(observedMax - observedMin, (bounds[1] - bounds[0]) * 0.08)
  const step = metric === 'co2' ? 50 : metric === 'relative-humidity' ? 2 : 0.5
  return {
    min: Math.max(bounds[0], Math.floor((observedMin - span * 0.2) / step) * step),
    max: Math.min(bounds[1], Math.ceil((observedMax + span * 0.2) / step) * step),
  }
}
