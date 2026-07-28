import type { MetricKey } from '../model'

export type MeasurementPoint = {
  id?: string
  name?: string
  xM: number
  yM: number
  value: number
  observedAtMs?: number
  status?: string
  zoneId?: string
}
export type HeatmapGrid = {
  width: number
  height: number
  requestedCellSizeM: number
  cellWidthM: number
  cellHeightM: number
  values: Float32Array
  confidence: Float32Array
  dataMask: Uint8Array
  usedSensorCounts: Uint8Array
  nearestSensorIndices: Int16Array
  nearestDistancesM: Float32Array
  points: MeasurementPoint[]
  min: number
  max: number
  sensorCount: number
  dataCellCount: number
}
export type MetricScale = { metric: MetricKey; min: number; max: number }
