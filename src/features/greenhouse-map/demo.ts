import type { GreenhouseMap, GreenhouseObject, MapLayer, NodeStatus } from './model'

export const DEFAULT_LAYERS: MapLayer[] = [
  ['structure', 'Greenhouse structure'], ['cultivation', 'Cultivation infrastructure'], ['irrigation', 'Irrigation'],
  ['climate', 'Climate equipment'], ['lighting', 'Lighting'], ['sensors', 'Sensor nodes'], ['labels', 'Labels'],
  ['coverage', 'Sensor coverage'], ['environment', 'Estimated environment map'], ['signal', 'LoRa signal'],
  ['confidence', 'Uncertainty / confidence'],
].map(([id, name]) => ({ id, name, visible: true, locked: false, opacity: 1 }))

const now = new Date()
const base = (id: string, type: GreenhouseObject['type'], name: string, xM: number, yM: number, widthM: number, lengthM: number, layerId: string): GreenhouseObject => ({
  id, type, name, xM, yM, widthM, lengthM, rotationDeg: 0, layerId, locked: false, visible: true, metadata: {},
})

function node(id: string, name: string, xM: number, yM: number, values: [number, number, number, number, number], radio: [number, number, number], status: NodeStatus = 'online'): GreenhouseObject {
  const item = base(id, 'sensor-node', name, xM, yM, 0.65, 0.65, 'sensors')
  item.metadata.sensor = {
    nodeId: `NC-${id.slice(-3).toUpperCase()}`, devEui: `70B3D57ED006${id.slice(-4).toUpperCase()}`,
    displayName: name, areaId: 'area-demo-greenhouse', installationHeightM: 1.6, model: 'NeuroSense S4',
    sensors: ['Air temperature', 'Relative humidity', 'CO₂', 'VPD', 'Root temperature', 'Pressure'],
    status, batteryPercent: radio[0], rssi: radio[1], snr: radio[2], coverageRadiusM: 3.2,
    lastSeenAt: now.toISOString(),
    measurements: {
      airTemperatureC: values[0], relativeHumidityPercent: values[1], co2Ppm: values[2],
      vpdKpa: values[3], rootTemperatureC: values[4], pressureHpa: 1013,
      measuredAt: now.toISOString(),
    },
  }
  return item
}

export function createDemoMap(): GreenhouseMap {
  const timestamp = new Date().toISOString()
  return {
    schemaVersion: 1, id: 'greenhouse-map-demo', name: 'North Trial Greenhouse',
    shape: { type: 'rectangle' }, dimensions: { widthM: 20, lengthM: 8, heightM: 4.2 },
    gridSizeM: 0.5, orientationDeg: 90, wallThicknessM: 0.15,
    createdAt: timestamp, updatedAt: timestamp, layers: DEFAULT_LAYERS.map((layer) => ({ ...layer })),
    heatmapSettings: { enabled: true, metric: 'air-temperature', interpolationMethod: 'idw', idwPower: 2, opacity: 0.88, scaleMode: 'auto', showConfidence: true },
    objects: [
      base('table-west', 'growing-table', 'West table block', 1.3, 1.1, 7.2, 2.1, 'cultivation'),
      base('table-east', 'growing-table', 'East table block', 11.5, 4.8, 7.2, 2.1, 'cultivation'),
      base('walkway-main', 'walkway', 'Central walkway', 0.6, 3.55, 18.8, 0.9, 'structure'),
      base('reservoir-main', 'reservoir', 'Nutrient reservoir', 0.8, 6.2, 1.2, 1.2, 'irrigation'),
      base('irrigation-main', 'irrigation-unit', 'Irrigation control', 2.4, 6.3, 1.1, 0.9, 'irrigation'),
      base('fan-west', 'fan', 'West circulation fan', 0.6, 3.6, 0.7, 0.7, 'climate'),
      base('fan-east', 'fan', 'East circulation fan', 18.7, 3.6, 0.7, 0.7, 'climate'),
      base('door-south', 'door', 'South access door', 9.4, 0, 1.2, 0.25, 'structure'),
      node('node-a101', 'NS North-West', 4, 6.1, [24.1, 70, 780, 0.92, 21.9], [92, -74, 9.2]),
      node('node-a102', 'NS North-East', 15.8, 6.0, [26.4, 63, 910, 1.22, 23.4], [78, -86, 6.8], 'warning'),
      node('node-a103', 'NS South-West', 4.6, 1.7, [23.2, 74, 720, 0.78, 21.4], [45, -92, 4.1], 'low-battery'),
      node('node-a104', 'NS South-East', 15.3, 1.8, [25.5, 66, 860, 1.08, 22.8], [84, -80, 7.4]),
    ],
  }
}
