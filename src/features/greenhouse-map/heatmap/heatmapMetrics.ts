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
  const definition = METRICS[metric]
  const bounds = definition.bounds
  if (typeof manual?.min === 'number' && typeof manual.max === 'number' && manual.min < manual.max) {
    return { min: Math.max(bounds[0], manual.min), max: Math.min(bounds[1], manual.max) }
  }
  if (!values.length) return { min: bounds[0], max: bounds[1] }
  const observedMin = Math.min(...values)
  const observedMax = Math.max(...values)
  const span = Math.max(observedMax - observedMin, definition.minimumSpan)
  const center = (observedMin + observedMax) / 2
  const padding = span * 0.06
  const step = definition.scaleStep
  const precision = Math.max(0, Math.ceil(-Math.log10(step)) + 1)
  return {
    min: Number(Math.max(bounds[0], Math.floor((center - span / 2 - padding) / step) * step).toFixed(precision)),
    max: Number(Math.min(bounds[1], Math.ceil((center + span / 2 + padding) / step) * step).toFixed(precision)),
  }
}
