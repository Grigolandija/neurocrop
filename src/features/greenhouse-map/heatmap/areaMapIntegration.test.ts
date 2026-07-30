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
    map.layers = [{ id: 'sections', name: 'Growing Sections', visible: true, locked: false, opacity: 1 }, ...map.layers]
    map.objects = [
      {
        id: 'legacy-section-north', type: 'section-zone', name: 'North tomatoes', xM: 0, yM: 0,
        widthM: 10, lengthM: 8, rotationDeg: 0, layerId: 'sections', locked: false, visible: true,
        metadata: { section: { sectionId: 'section-north', sectionName: 'North tomatoes', nodeCount: 1 } },
      },
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
    expect(merged.objects.some((object) => object.type === 'section-zone')).toBe(false)
    expect(merged.layers.some((layer) => layer.id === 'sections')).toBe(false)
    expect(merged.objects.find((object) => object.id === 'moved-away')).toBeUndefined()
    const placed = merged.objects.find((object) => object.id === 'placed-real')
    expect(placed?.xM).toBe(3)
    expect(placed?.metadata.sensor?.displayName).toBe('North node')
    expect(placed?.metadata.sensor?.measurements?.airTemperatureC).toBe(24.5)
    expect(placed?.metadata.sensor?.coverageRadiusM).toBe(4.5)
    expect(merged.objects.some((object) => object.metadata.sensor?.devEui === '70b3d57ed0060002')).toBe(true)
  })

  it('keeps Sections as logical node assignments without inventing spatial boundaries', async () => {
    const { createAreaMap } = await import('../services/areaMapRepository')
    const map = createAreaMap({ id: 'area-1', name: 'Production greenhouse' }, nodes, sections)
    const zones = map.objects.filter((object) => object.type === 'section-zone')
    expect(zones).toHaveLength(0)
    expect(map.layers.some((layer) => layer.id === 'sections')).toBe(false)
    expect(map.objects.map((object) => object.metadata.sensor?.sectionId)).toEqual(['section-north', 'section-south'])
  })

  it('scales node markers up with greenhouse dimensions', async () => {
    const { sensorMarkerSizeM } = await import('../services/areaMapRepository')
    const small = sensorMarkerSizeM({ widthM: 4, lengthM: 2 })
    const medium = sensorMarkerSizeM({ widthM: 20, lengthM: 8 })
    const large = sensorMarkerSizeM({ widthM: 100, lengthM: 40 })
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })

  it('keeps saved interpolation settings in the read-only climate map', async () => {
    const { prepareReadOnlyClimateMap } = await import('../../readings/prepareReadOnlyClimateMap')
    const map = createDemoMap()
    map.areaId = 'area-1'
    map.heatmapSettings = {
      ...map.heatmapSettings,
      metric: 'air-temperature',
      idwPower: 5.9,
      opacity: 0.72,
      showConfidence: false,
      scaleMode: 'manual',
      manualMin: 18,
      manualMax: 24,
    }
    const context = {
      area: { id: 'area-1', name: 'Production greenhouse' },
      mapEnabled: true,
      map,
      revision: 3,
      updatedAt: '2026-07-25T12:00:00Z',
      nodes,
      sections,
      profiles: [],
      actions: [],
      permissions: { canEdit: true },
    }

    const savedMetric = prepareReadOnlyClimateMap(context, 'air-temperature')
    expect(savedMetric.heatmapSettings).toMatchObject({
      idwPower: 5.9,
      opacity: 0.95,
      showConfidence: false,
      scaleMode: 'manual',
      manualMin: 18,
      manualMax: 24,
    })

    const otherMetric = prepareReadOnlyClimateMap(context, 'relative-humidity')
    expect(otherMetric.heatmapSettings).toMatchObject({
      idwPower: 5.9,
      opacity: 0.95,
      showConfidence: false,
      scaleMode: 'auto',
    })
    expect(otherMetric.heatmapSettings.manualMin).toBeUndefined()
    expect(otherMetric.heatmapSettings.manualMax).toBeUndefined()
  })

  it('hides offline node markers from the read-only heatmap', async () => {
    const { createAreaMap } = await import('../services/areaMapRepository')
    const { prepareReadOnlyClimateMap } = await import('../../readings/prepareReadOnlyClimateMap')
    const liveNodes = nodes.map((node, index) => index === 1 ? { ...node, status: 'offline' as const } : node)
    const map = createAreaMap({ id: 'area-1', name: 'Production greenhouse' }, liveNodes, sections)
    const context = {
      area: { id: 'area-1', name: 'Production greenhouse' },
      mapEnabled: true,
      map,
      revision: 1,
      updatedAt: '2026-07-25T12:00:00Z',
      nodes: liveNodes,
      sections,
      profiles: [],
      actions: [],
      permissions: { canEdit: true },
    }

    const readOnlyMap = prepareReadOnlyClimateMap(context, 'air-temperature')
    const visibleNodeIds = readOnlyMap.objects
      .filter((object) => object.type === 'sensor-node')
      .map((object) => object.metadata.sensor?.devEui)

    expect(visibleNodeIds).toEqual(['70b3d57ed0060001'])
    expect(readOnlyMap.objects.some((object) => object.metadata.sensor?.status === 'offline')).toBe(false)
  })
})
