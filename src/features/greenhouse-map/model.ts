import { createHeatmapMetricDefinitions } from '../../domain/metricRegistry'

export type MapMode = 'layout' | 'coverage' | 'environment'
export type MetricKey =
  | 'air-temperature'
  | 'relative-humidity'
  | 'co2'
  | 'vpd'
  | 'root-temperature'
  | 'illuminance'
  | 'soil-moisture'
  | 'ec'
  | 'ph'
  | 'soil-ec'
  | 'leaf-temperature'
  | 'water-temperature'
export type NodeStatus = 'online' | 'warning' | 'offline' | 'unassigned' | 'low-battery' | 'stale'
export type ObjectType =
  | 'sensor-node' | 'section-zone' | 'growing-table' | 'hydroponic-channel' | 'growing-bed' | 'rack'
  | 'reservoir' | 'irrigation-unit' | 'fan' | 'heater' | 'cooling-unit' | 'lamp'
  | 'door' | 'window' | 'ventilation-opening' | 'electrical-cabinet' | 'technical-zone'
  | 'walkway' | 'partition' | 'text-label' | 'rectangle'

export type SensorMeasurements = {
  airTemperatureC?: number
  relativeHumidityPercent?: number
  co2Ppm?: number
  vpdKpa?: number
  rootTemperatureC?: number
  illuminanceLux?: number
  soilMoisturePercent?: number
  ecMsCm?: number
  ph?: number
  soilEcMsCm?: number
  soilEcByDepth?: Array<{ depthCm: number; value: number }>
  leafTemperatureC?: number
  waterTemperatureC?: number
  pressureHpa?: number
  measuredAt?: string
}

export type SensorNodeMetadata = {
  nodeId?: string
  devEui?: string
  displayName?: string
  areaId?: string
  sectionId?: string
  sectionName?: string
  installationHeightM?: number
  installationConfirmedAt?: string
  model?: string
  sensors: string[]
  status: NodeStatus
  batteryPercent?: number
  lastSeenAt?: string
  rssi?: number
  snr?: number
  coverageRadiusM?: number
  measurements?: SensorMeasurements
}

export type ObjectMetadata = {
  status?: string
  notes?: string
  color?: string
  wallMount?: {
    wall: 'south' | 'north' | 'west' | 'east'
    offsetM: number
  }
  sensor?: SensorNodeMetadata
  section?: {
    sectionId: string
    sectionName: string
    cropProfile?: string
    nodeCount?: number
  }
}

export type GreenhouseObject = {
  id: string
  type: ObjectType
  name: string
  xM: number
  yM: number
  widthM: number
  lengthM: number
  rotationDeg: number
  layerId: string
  locked: boolean
  visible: boolean
  metadata: ObjectMetadata
}

export type MapLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
}

export type HeatmapSettings = {
  rasterSettingsVersion?: 3 | 4 | 5
  enabled: boolean
  metric: MetricKey
  interpolationMethod: 'idw'
  idwPower: number
  cellSizeM: number
  nearestSensorCount: number
  minimumSensorCount: number
  maxInfluenceDistanceM: number
  maxReadingAgeMinutes: number
  opacity: number
  scaleMode: 'auto' | 'manual'
  manualMin?: number
  manualMax?: number
  showConfidence: boolean
}

export const GREENHOUSE_WALL_THICKNESS_M = 0.01

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  rasterSettingsVersion: 5,
  enabled: true,
  metric: 'air-temperature',
  interpolationMethod: 'idw',
  idwPower: 2,
  cellSizeM: 0.25,
  nearestSensorCount: 5,
  minimumSensorCount: 2,
  maxInfluenceDistanceM: 15,
  maxReadingAgeMinutes: 30,
  opacity: 0.88,
  scaleMode: 'auto',
  showConfidence: true,
}

export function normalizeHeatmapSettings(settings?: Partial<HeatmapSettings>): HeatmapSettings {
  const legacyCellSizeM = settings?.cellSizeM
  return {
    ...DEFAULT_HEATMAP_SETTINGS,
    ...settings,
    rasterSettingsVersion: 5,
    cellSizeM: (settings?.rasterSettingsVersion ?? 0) >= 3
      ? settings?.cellSizeM ?? DEFAULT_HEATMAP_SETTINGS.cellSizeM
      : Math.min(legacyCellSizeM ?? DEFAULT_HEATMAP_SETTINGS.cellSizeM, DEFAULT_HEATMAP_SETTINGS.cellSizeM),
    nearestSensorCount: (settings?.rasterSettingsVersion ?? 0) >= 3
      ? settings?.nearestSensorCount ?? DEFAULT_HEATMAP_SETTINGS.nearestSensorCount
      : DEFAULT_HEATMAP_SETTINGS.nearestSensorCount,
    minimumSensorCount: settings?.rasterSettingsVersion === 5
      ? Math.max(2, settings.minimumSensorCount ?? DEFAULT_HEATMAP_SETTINGS.minimumSensorCount)
      : DEFAULT_HEATMAP_SETTINGS.minimumSensorCount,
  }
}

export type GreenhouseMap = {
  schemaVersion: 1
  id: string
  areaId?: string
  name: string
  shape: { type: 'rectangle' }
  dimensions: { widthM: number; lengthM: number; heightM?: number }
  gridSizeM: number
  orientationDeg: number
  wallThicknessM: number
  objects: GreenhouseObject[]
  layers: MapLayer[]
  heatmapSettings: HeatmapSettings
  createdAt: string
  updatedAt: string
}

export const OBJECT_LIBRARY: Array<{ type: ObjectType; label: string; icon: string; layerId: string; size: [number, number] }> = [
  { type: 'sensor-node', label: 'Sensor node', icon: 'fa-microchip', layerId: 'sensors', size: [0.6, 0.6] },
  { type: 'growing-table', label: 'Growing table', icon: 'fa-seedling', layerId: 'cultivation', size: [4, 1.4] },
  { type: 'hydroponic-channel', label: 'Hydroponic channel', icon: 'fa-water', layerId: 'cultivation', size: [4, 0.45] },
  { type: 'growing-bed', label: 'Growing bed', icon: 'fa-leaf', layerId: 'cultivation', size: [3, 1.2] },
  { type: 'rack', label: 'Shelf / rack', icon: 'fa-layer-group', layerId: 'cultivation', size: [2, 0.8] },
  { type: 'reservoir', label: 'Reservoir', icon: 'fa-droplet', layerId: 'irrigation', size: [1.2, 1.2] },
  { type: 'irrigation-unit', label: 'Irrigation unit', icon: 'fa-faucet-drip', layerId: 'irrigation', size: [1, 0.8] },
  { type: 'fan', label: 'Fan', icon: 'fa-fan', layerId: 'climate', size: [0.8, 0.8] },
  { type: 'heater', label: 'Heater', icon: 'fa-temperature-arrow-up', layerId: 'climate', size: [1, 0.6] },
  { type: 'cooling-unit', label: 'Cooling unit', icon: 'fa-snowflake', layerId: 'climate', size: [1.2, 0.7] },
  { type: 'lamp', label: 'Lamp', icon: 'fa-lightbulb', layerId: 'lighting', size: [1.5, 0.4] },
  { type: 'door', label: 'Door', icon: 'fa-door-open', layerId: 'structure', size: [1.2, 0.2] },
  { type: 'window', label: 'Window', icon: 'fa-table-cells-large', layerId: 'structure', size: [1.5, 0.15] },
  { type: 'ventilation-opening', label: 'Ventilation opening', icon: 'fa-wind', layerId: 'structure', size: [1.5, 0.2] },
  { type: 'electrical-cabinet', label: 'Electrical cabinet', icon: 'fa-bolt', layerId: 'climate', size: [0.8, 0.5] },
  { type: 'technical-zone', label: 'Technical zone', icon: 'fa-screwdriver-wrench', layerId: 'structure', size: [2.5, 2] },
  { type: 'walkway', label: 'Walkway', icon: 'fa-road', layerId: 'structure', size: [6, 1] },
  { type: 'partition', label: 'Partition', icon: 'fa-grip-lines-vertical', layerId: 'structure', size: [3, 0.12] },
  { type: 'text-label', label: 'Text label', icon: 'fa-font', layerId: 'labels', size: [2, 0.5] },
  { type: 'rectangle', label: 'Generic rectangle', icon: 'fa-vector-square', layerId: 'structure', size: [2, 1] },
]

export type HeatmapMetricDefinition = {
  label: string
  labelLt: string
  unit: string
  decimals: number
  scaleStep: number
  minimumSpan: number
  fullContrastSpan: number
  field: Exclude<keyof SensorMeasurements, 'measuredAt' | 'pressureHpa' | 'soilEcByDepth'>
  bounds: [number, number]
  colors: readonly string[]
  colorStops?: ReadonlyArray<{ value: number; color: string }>
  colorInterval: number
}

export const METRICS = createHeatmapMetricDefinitions() as unknown as Record<MetricKey, HeatmapMetricDefinition>
