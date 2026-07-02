import type { DashboardData, MetricDefinition, MetricKey } from '../types'

export const metricDefinitions: MetricDefinition[] = [
  { key: 'airTemp', label: 'Air temperature', unit: '°C', target: [20, 25], domain: [12, 34] },
  { key: 'humidity', label: 'Relative humidity', unit: '%', target: [65, 75], domain: [35, 95] },
  { key: 'co2', label: 'CO₂', unit: 'ppm', target: [700, 1100], domain: [350, 1600] },
  { key: 'lux', label: 'Light', unit: 'lx', target: [18000, 32000], domain: [0, 50000] },
  { key: 'vpd', label: 'VPD', unit: 'kPa', target: [0.8, 1.2], domain: [0.2, 2.2] },
  { key: 'soilMoisture', label: 'Soil moisture', unit: '%', target: [42, 58], domain: [15, 80] },
]

const allMetrics = metricDefinitions.map((metric) => metric.key) as MetricKey[]

export const mockDashboardData: DashboardData = {
  areas: [
    { id: 'greenhouse-1', name: 'Greenhouse No. 1' },
    { id: 'greenhouse-2', name: 'Greenhouse No. 2' },
  ],
  sections: [
    {
      id: 'tomato-rear', locationId: 'greenhouse-1', name: 'Tomato Block A, Rear', cropProfile: 'Tomatoes, vegetative',
      nodes: [
        { id: 'NS-000001', devEui: '0011223344556677', battery: 63, active: true },
        { id: 'NS-000002', battery: 58, active: true },
        { id: 'NS-000003', battery: 52, active: true },
        { id: 'NS-000004', battery: 49, active: true },
      ],
      installedMetrics: allMetrics,
      readings: { airTemp: 24, humidity: 58, co2: 1000, lux: 24400, vpd: 1.08, soilMoisture: 49 },
    },
    {
      id: 'lettuce-rack', locationId: 'greenhouse-1', name: 'Lettuce Rack, Under Shelf', cropProfile: 'Lettuce, leaf growth',
      nodes: [{ id: 'NS-000008', battery: 84, active: true }, { id: 'NS-000009', battery: 79, active: true }],
      installedMetrics: ['airTemp', 'humidity', 'co2', 'lux', 'vpd'],
      readings: { airTemp: 20.8, humidity: 71, co2: 740, lux: 19800, vpd: 0.86 },
    },
    {
      id: 'strawberry-west', locationId: 'greenhouse-2', name: 'Strawberry Block, West Side', cropProfile: 'Strawberries, fruiting',
      nodes: [
        { id: 'NS-000013', battery: 58, active: true },
        { id: 'NS-000014', battery: 41, active: true },
        { id: 'NS-000015', battery: 33, active: true },
        { id: 'NS-000016', battery: 29, active: true },
      ],
      installedMetrics: ['airTemp', 'humidity', 'co2', 'lux', 'soilMoisture'],
      readings: { airTemp: 25.8, humidity: 62, co2: 810, lux: 29800, soilMoisture: 39 },
    },
  ],
}
