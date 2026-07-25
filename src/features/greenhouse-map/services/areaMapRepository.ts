import { neurocropApi } from '../../../services/api/neurocropApi'
import { createDemoMap, DEFAULT_LAYERS } from '../demo'
import type { GreenhouseMap, GreenhouseObject, NodeStatus, SensorNodeMetadata } from '../model'

export type AreaSummary = { id: string; name: string; kind?: string; location?: string }
export type AreaMapNode = SensorNodeMetadata & { sectionId?: string; sectionName?: string }
export type AreaMapContext = {
  area: AreaSummary
  map: GreenhouseMap | null
  revision: number
  updatedAt: string | null
  nodes: AreaMapNode[]
  permissions: { canEdit: boolean }
}
export type AreaMapSaveResult = { map: GreenhouseMap; revision: number; updatedAt: string }

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

function normalizeStatus(value: unknown): NodeStatus {
  return ['online', 'warning', 'offline', 'unassigned', 'low-battery', 'stale'].includes(String(value))
    ? value as NodeStatus
    : 'warning'
}

function normalizeNode(value: AreaMapNode): AreaMapNode {
  const measurements = value.measurements ?? {}
  return {
    nodeId: text(value.nodeId),
    devEui: text(value.devEui)?.toLowerCase(),
    displayName: text(value.displayName),
    areaId: text(value.areaId),
    sectionId: text(value.sectionId),
    sectionName: text(value.sectionName),
    installationHeightM: finite(value.installationHeightM),
    model: text(value.model),
    sensors: Array.isArray(value.sensors) ? value.sensors.map(String) : [],
    status: normalizeStatus(value.status),
    batteryPercent: finite(value.batteryPercent),
    lastSeenAt: text(value.lastSeenAt),
    rssi: finite(value.rssi),
    snr: finite(value.snr),
    coverageRadiusM: finite(value.coverageRadiusM) ?? 3,
    measurements: {
      airTemperatureC: finite(measurements.airTemperatureC),
      relativeHumidityPercent: finite(measurements.relativeHumidityPercent),
      co2Ppm: finite(measurements.co2Ppm),
      vpdKpa: finite(measurements.vpdKpa),
      rootTemperatureC: finite(measurements.rootTemperatureC),
      pressureHpa: finite(measurements.pressureHpa),
      measuredAt: text(measurements.measuredAt),
    },
  }
}

function sensorObject(node: AreaMapNode, index: number, map: GreenhouseMap): GreenhouseObject {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, map.objects.length + 1) * map.dimensions.widthM / map.dimensions.lengthM)))
  const rows = Math.max(1, Math.ceil((index + 1) / columns))
  const column = index % columns
  const row = Math.floor(index / columns)
  const xM = Math.min(map.dimensions.widthM - .65, Math.max(0, (column + 1) * map.dimensions.widthM / (columns + 1) - .325))
  const yM = Math.min(map.dimensions.lengthM - .65, Math.max(0, (row + 1) * map.dimensions.lengthM / (rows + 1) - .325))
  return {
    id: `sensor-${node.devEui || crypto.randomUUID()}`,
    type: 'sensor-node',
    name: node.displayName || node.nodeId || node.devEui || `NeuroSense ${index + 1}`,
    xM, yM, widthM: .65, lengthM: .65, rotationDeg: 0, layerId: 'sensors',
    locked: false, visible: true, metadata: { sensor: normalizeNode(node) },
  }
}

export function createAreaMap(area: AreaSummary, nodes: AreaMapNode[]): GreenhouseMap {
  const timestamp = new Date().toISOString()
  const map: GreenhouseMap = {
    ...createDemoMap(),
    id: `area-map-${area.id}`,
    areaId: area.id,
    name: area.name,
    layers: DEFAULT_LAYERS.map((layer) => ({ ...layer })),
    objects: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  map.objects = nodes.map((node, index) => sensorObject(normalizeNode(node), index, map))
  return map
}

export function mergeAreaMapContext(map: GreenhouseMap, area: AreaSummary, nodes: AreaMapNode[]): GreenhouseMap {
  const normalizedNodes = nodes.map(normalizeNode)
  const byDevEui = new Map(normalizedNodes.filter((node) => node.devEui).map((node) => [node.devEui!.toLowerCase(), node]))
  const placed = new Set<string>()
  const objects = map.objects.flatMap((object) => {
    if (object.type !== 'sensor-node' || !object.metadata.sensor?.devEui) return [{ ...object }]
    const devEui = object.metadata.sensor.devEui.toLowerCase()
    const live = byDevEui.get(devEui)
    if (!live) return []
    placed.add(devEui)
    return [{
      ...object,
      name: live.displayName || object.name,
      metadata: {
        ...object.metadata,
        sensor: {
          ...object.metadata.sensor,
          ...live,
          coverageRadiusM: object.metadata.sensor.coverageRadiusM ?? live.coverageRadiusM ?? 3,
          installationHeightM: object.metadata.sensor.installationHeightM,
        },
      },
    }]
  })
  const next: GreenhouseMap = { ...map, areaId: area.id, objects }
  normalizedNodes.filter((node) => node.devEui && !placed.has(node.devEui.toLowerCase())).forEach((node, index) => {
    next.objects.push(sensorObject(node, index, next))
  })
  return next
}

export const areaMapRepository = {
  async listAreas(): Promise<AreaSummary[]> {
    const payload = await neurocropApi.getAreas() as { areas?: Array<Record<string, unknown>> }
    return (payload.areas ?? []).map((area) => ({
      id: String(area.id || ''),
      name: String(area.name || 'Unnamed Area'),
      kind: text(area.kind),
      location: text(area.location),
    })).filter((area) => area.id)
  },
  async load(areaId: string): Promise<AreaMapContext> {
    const payload = await neurocropApi.getGreenhouseMap(areaId) as AreaMapContext
    return { ...payload, nodes: Array.isArray(payload.nodes) ? payload.nodes : [] }
  },
  async save(areaId: string, map: GreenhouseMap, expectedRevision: number): Promise<AreaMapSaveResult> {
    return await neurocropApi.saveGreenhouseMap(areaId, { map: { ...map, areaId }, expectedRevision }) as AreaMapSaveResult
  },
}
