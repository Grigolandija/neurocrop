export type MapMode = 'layout' | 'coverage' | 'environment' | 'signal'
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
  enabled: boolean
  metric: MetricKey
  interpolationMethod: 'idw'
  idwPower: number
  opacity: number
  scaleMode: 'auto' | 'manual'
  manualMin?: number
  manualMax?: number
  showConfidence: boolean
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
  field: Exclude<keyof SensorMeasurements, 'measuredAt' | 'pressureHpa'>
  bounds: [number, number]
  colors: [string, string, string]
}

export const METRICS: Record<MetricKey, HeatmapMetricDefinition> = {
  'air-temperature': { label: 'Air temperature', labelLt: 'Oro temperatūra', unit: '°C', decimals: 1, field: 'airTemperatureC', bounds: [5, 45], colors: ['#256b73', '#e1c56b', '#b74c3f'] },
  'relative-humidity': { label: 'Relative humidity', labelLt: 'Santykinė drėgmė', unit: '%', decimals: 1, field: 'relativeHumidityPercent', bounds: [15, 100], colors: ['#f2b84b', '#66c7b4', '#2f80c3'] },
  co2: { label: 'CO₂', labelLt: 'CO₂', unit: 'ppm', decimals: 0, field: 'co2Ppm', bounds: [250, 2500], colors: ['#527b65', '#c3a95d', '#8c4a3f'] },
  vpd: { label: 'VPD', labelLt: 'VPD', unit: 'kPa', decimals: 2, field: 'vpdKpa', bounds: [0, 3], colors: ['#3e7183', '#c7bd73', '#a55542'] },
  'root-temperature': { label: 'Soil / root temperature', labelLt: 'Dirvos / šaknų temperatūra', unit: '°C', decimals: 1, field: 'rootTemperatureC', bounds: [5, 40], colors: ['#356d86', '#d0c171', '#a55341'] },
  illuminance: { label: 'Illuminance', labelLt: 'Apšviestumas', unit: 'lx', decimals: 0, field: 'illuminanceLux', bounds: [0, 200000], colors: ['#263d64', '#d1bd62', '#fff0a0'] },
  'soil-moisture': { label: 'Soil moisture', labelLt: 'Dirvos drėgmė', unit: '%', decimals: 1, field: 'soilMoisturePercent', bounds: [0, 100], colors: ['#a65b3d', '#68aa78', '#3278a8'] },
  ec: { label: 'Nutrient EC', labelLt: 'Maistinio tirpalo EC', unit: 'mS/cm', decimals: 2, field: 'ecMsCm', bounds: [0, 10], colors: ['#426e8a', '#74a96f', '#9a5a43'] },
  ph: { label: 'Nutrient pH', labelLt: 'Maistinio tirpalo pH', unit: 'pH', decimals: 2, field: 'ph', bounds: [0, 14], colors: ['#b15b49', '#73a96f', '#80609b'] },
  'soil-ec': { label: 'Soil EC', labelLt: 'Dirvos EC', unit: 'mS/cm', decimals: 2, field: 'soilEcMsCm', bounds: [0, 10], colors: ['#426e8a', '#74a96f', '#9a5a43'] },
  'leaf-temperature': { label: 'Leaf temperature', labelLt: 'Lapų temperatūra', unit: '°C', decimals: 1, field: 'leafTemperatureC', bounds: [5, 45], colors: ['#256b73', '#7da96f', '#b74c3f'] },
  'water-temperature': { label: 'Water temperature', labelLt: 'Vandens temperatūra', unit: '°C', decimals: 1, field: 'waterTemperatureC', bounds: [0, 45], colors: ['#276a96', '#6ca9a0', '#b35b48'] },
}
