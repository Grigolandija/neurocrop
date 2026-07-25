import type { MetricKey } from '../model'

export type MeasurementPoint = { xM: number; yM: number; value: number }
export type HeatmapGrid = {
  width: number
  height: number
  values: Float32Array
  confidence: Float32Array
  min: number
  max: number
  sensorCount: number
}
export type MetricScale = { metric: MetricKey; min: number; max: number }
