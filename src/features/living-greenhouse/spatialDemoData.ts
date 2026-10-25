import { createDemoMap } from '../greenhouse-map/demo'
import { METRICS, type GreenhouseMap, type GreenhouseObject, type MetricKey, type SensorMeasurements } from '../greenhouse-map/model'

export const demoMetrics = ['air-temperature', 'relative-humidity', 'co2'] as const satisfies readonly MetricKey[]
export const demoMetricNames = { 'air-temperature': 'Oro temperatūra', 'relative-humidity': 'Santykinė drėgmė', co2: 'CO₂' }
export const demoScales = { 'air-temperature': { min: 17, max: 24 }, 'relative-humidity': { min: 50, max: 80 }, co2: { min: 450, max: 750 } }
export type DemoMetric = typeof demoMetrics[number]
export type SpatialDemo = ReturnType<typeof createSpatialDemo>

// Deliberately independent of live repositories: all readings and objects are examples.
export function createSpatialDemo(now = Date.now()) {
  const map = createDemoMap()
  map.name = 'Šiltnamis 1'; map.areaId = 'spatial-workspace-demo'
  map.dimensions = { widthM: 8, lengthM: 5, heightM: 3.2 }
  map.heatmapSettings = { ...map.heatmapSettings, nearestSensorCount: 6 }
  const object = (id: string, type: GreenhouseObject['type'], name: string, xM: number, yM: number, widthM: number, lengthM: number): GreenhouseObject =>
    ({ id, type, name, xM, yM, widthM, lengthM, rotationDeg: 0, layerId: type === 'sensor-node' ? 'sensors' : type === 'door' ? 'structure' : 'cultivation', visible: true, locked: true, metadata: {} })
  const positions = [
    ['NSN-000003', .35, .35, .6, 19, 65, 571, 57],
    ['NSN-000006', .35, 4.65, 1.1, 20, 68, 608, 73],
    ['NSN-000009', 3.55, 4.65, 1.7, 21.2, 62, 540, 91],
    ['NSN-000004', 6.55, 4.65, 2.7, 23, 55, 504, 95],
    ['NSN-000005', 3.45, 3.05, 2.2, 22.2, 59, 525, 88],
    ['NSN-000002', 7.65, .35, 1.3, 21, 63, 585, 76],
  ] as const
  const nodes = positions.map(([name, x, y, height, , , , battery], i) => {
    const node = object(`spatial-node-${i}`, 'sensor-node', name, x - .08, y - .08, .16, .16)
    node.metadata.sensor = { devEui: `70b3d57ed006b10${i}`, displayName: name, sensors: ['temperature', 'humidity', 'co2'], status: 'online', batteryPercent: battery,
      installationHeightM: height, measurementHeightsM: Object.fromEntries(demoMetrics.map(metric => [metric, height])) }
    return node
  })
  map.objects = [object('bench-1', 'growing-table', 'Stelažas 1', .7, 2.95, 5.6, 1.25), object('bench-2', 'growing-table', 'Stelažas 2', .7, .8, 5.6, 1.25),
    object('door-1', 'door', 'Durys 1', 7.87, 2.3, .1, 1.4), object('door-2', 'door', 'Durys 2', 6.35, 4.88, 1.2, .1), ...nodes]
  const end = Math.floor(now / 900_000) * 900_000
  const frames = Array.from({ length: 97 }, (_, i) => {
    const phase = i / 96 * Math.PI * 2
    const wave = Math.sin(phase) * 1.2 + (Math.cos(phase) - 1) * .5
    const measuredAt = new Date(end - (96 - i) * 900_000).toISOString()
    return { measuredAt, readings: positions.map((p, j): SensorMeasurements => ({ measuredAt,
      airTemperatureC: p[4] + wave + Math.sin(phase * 2) * j * .06,
      relativeHumidityPercent: p[5] - wave * 3,
      co2Ppm: p[6] - wave * 35,
    })) }
  })
  return { map, nodes, frames }
}

export function spatialDemoMap(demo: SpatialDemo, index: number): GreenhouseMap {
  const frame = demo.frames[index]
  return { ...demo.map, objects: demo.map.objects.map(object => {
    const i = demo.nodes.findIndex(node => node.id === object.id)
    return i < 0 ? object : { ...object, metadata: { ...object.metadata, sensor: { ...object.metadata.sensor!, lastSeenAt: frame.measuredAt, measurements: frame.readings[i] } } }
  }) }
}

export function demoValue(reading: SensorMeasurements, metric: DemoMetric): number {
  return reading[METRICS[metric].field] as number
}
