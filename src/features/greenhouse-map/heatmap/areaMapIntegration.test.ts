import { describe, expect, it } from 'vitest'
import { createDemoMap } from '../demo'
import type { AreaMapNode, AreaMapSection } from '../services/areaMapRepository'

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    addEventListener: () => undefined,
    dispatchEvent: () => true,
    NEUROCROP_CONFIG: { apiBaseUrl: 'http://api.test', greenhouseMapBeta: true },
  },
})

const nodes: AreaMapNode[] = [
  {
    nodeId: 'NS-1', devEui: '70B3D57ED0060001', displayName: 'North node', areaId: 'area-1', sectionId: 'section-north', sectionName: 'North tomatoes',
    sensors: ['sht45'], status: 'online', batteryPercent: 88, rssi: -78, snr: 8,
    measurements: { airTemperatureC: 24.5, relativeHumidityPercent: 70, measuredAt: '2026-07-25T12:00:00Z' },
  },
  {
    nodeId: 'NS-2', devEui: '70B3D57ED0060002', displayName: 'South node', areaId: 'area-1', sectionId: 'section-south', sectionName: 'South seedlings',
    sensors: ['sht45'], status: 'stale', batteryPercent: 61,
    measurements: { airTemperatureC: 25.2, relativeHumidityPercent: 67, measuredAt: '2026-07-25T11:00:00Z' },
  },
]
const sections: AreaMapSection[] = [
  { id: 'section-north', name: 'North tomatoes', areaId: 'area-1', cropProfile: 'Tomato production', nodes: 1 },
  { id: 'section-south', name: 'South seedlings', areaId: 'area-1', cropProfile: 'Seedlings', nodes: 1 },
]

describe('Area Map API context integration', () => {
  it('creates a clean Area map containing assigned real nodes without demo infrastructure', async () => {
    const { createAreaMap } = await import('../services/areaMapRepository')
    const map = createAreaMap({ id: 'area-1', name: 'Production greenhouse' }, nodes)
    expect(map.areaId).toBe('area-1')
    expect(map.name).toBe('Production greenhouse')
    expect(map.objects).toHaveLength(2)
    expect(map.objects.every((object) => object.type === 'sensor-node')).toBe(true)
    expect(map.objects[0].metadata.sensor?.devEui).toBe('70b3d57ed0060001')
  })

  it('overlays live values, removes nodes moved out of the Area and adds newly assigned nodes', async () => {
    const { mergeAreaMapContext } = await import('../services/areaMapRepository')
    const map = createDemoMap()
    map.areaId = 'area-1'
    map.objects = [
      {
        id: 'placed-real', type: 'sensor-node', name: 'Old name', xM: 3, yM: 2,
        widthM: .65, lengthM: .65, rotationDeg: 0, layerId: 'sensors', locked: false, visible: true,
        metadata: { sensor: { devEui: '70b3d57ed0060001', sensors: [], status: 'warning', coverageRadiusM: 4.5 } },
      },
      {
        id: 'moved-away', type: 'sensor-node', name: 'Moved', xM: 5, yM: 2,
        widthM: .65, lengthM: .65, rotationDeg: 0, layerId: 'sensors', locked: false, visible: true,
        metadata: { sensor: { devEui: '70b3d57ed0069999', sensors: [], status: 'offline' } },
      },
    ]
    const merged = mergeAreaMapContext(map, { id: 'area-1', name: 'Production greenhouse' }, nodes)
    expect(merged.objects).toHaveLength(2)
    expect(merged.objects.find((object) => object.id === 'moved-away')).toBeUndefined()
    const placed = merged.objects.find((object) => object.id === 'placed-real')
    expect(placed?.xM).toBe(3)
    expect(placed?.metadata.sensor?.displayName).toBe('North node')
    expect(placed?.metadata.sensor?.measurements?.airTemperatureC).toBe(24.5)
    expect(placed?.metadata.sensor?.coverageRadiusM).toBe(4.5)
    expect(merged.objects.some((object) => object.metadata.sensor?.devEui === '70b3d57ed0060002')).toBe(true)
  })

  it('creates one editable map boundary for every existing Section', async () => {
    const { createAreaMap } = await import('../services/areaMapRepository')
    const map = createAreaMap({ id: 'area-1', name: 'Production greenhouse' }, nodes, sections)
    const zones = map.objects.filter((object) => object.type === 'section-zone')
    expect(zones).toHaveLength(2)
    expect(zones.map((zone) => zone.metadata.section?.sectionId)).toEqual(['section-north', 'section-south'])
    expect(map.layers[0].id).toBe('sections')
    const northZone = zones[0]
    const northNode = map.objects.find((object) => object.metadata.sensor?.sectionId === 'section-north')!
    expect(northNode.xM).toBeGreaterThanOrEqual(northZone.xM)
    expect(northNode.xM + northNode.widthM).toBeLessThanOrEqual(northZone.xM + northZone.widthM)
    expect(northNode.yM).toBeGreaterThanOrEqual(northZone.yM)
    expect(northNode.yM + northNode.lengthM).toBeLessThanOrEqual(northZone.yM + northZone.lengthM)
  })

  it('scales node markers up with greenhouse dimensions', async () => {
    const { sensorMarkerSizeM } = await import('../services/areaMapRepository')
    const small = sensorMarkerSizeM({ widthM: 4, lengthM: 2 })
    const medium = sensorMarkerSizeM({ widthM: 20, lengthM: 8 })
    const large = sensorMarkerSizeM({ widthM: 100, lengthM: 40 })
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })
})
