import { neurocropApi } from '../../../services/api/neurocropApi'
import { createDemoMap, DEFAULT_LAYERS } from '../demo'
import { sensorMarkerSizeM } from '../geometry'
import type { GreenhouseMap, GreenhouseObject, NodeStatus, SensorNodeMetadata } from '../model'

export type AreaSummary = { id: string; name: string; kind?: string; location?: string }
export type AreaMapSection = {
  id: string
  name: string
  areaId: string
  cropProfile?: string
  nodes: number
}
export type AreaMapProfile = {
  id: string
  name: string
  stage?: string
  metrics: Record<string, { optimal?: [number, number]; warning?: [number, number]; critical?: [number, number] }>
}
export type AreaMapAction = {
  id: string
  areaId: string
  sectionId: string
  sectionName: string
  title: string
  reason: string
  priority: string
}
export type AreaMapNode = SensorNodeMetadata & { sectionId?: string; sectionName?: string }
export type AreaMapContext = {
  area: AreaSummary
  map: GreenhouseMap | null
  revision: number
  updatedAt: string | null
  nodes: AreaMapNode[]
  sections: AreaMapSection[]
  profiles: AreaMapProfile[]
  actions: AreaMapAction[]
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
    installationConfirmedAt: text(value.installationConfirmedAt),
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

export { sensorMarkerSizeM } from '../geometry'

function sensorObject(node: AreaMapNode, index: number, map: GreenhouseMap): GreenhouseObject {
  const markerSize = sensorMarkerSizeM(map.dimensions)
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, map.objects.length + 1) * map.dimensions.widthM / map.dimensions.lengthM)))
  const rows = Math.max(1, Math.ceil((index + 1) / columns))
  const column = index % columns
  const row = Math.floor(index / columns)
  const xM = Math.min(map.dimensions.widthM - markerSize, Math.max(0, (column + 1) * map.dimensions.widthM / (columns + 1) - markerSize / 2))
  const yM = Math.min(map.dimensions.lengthM - markerSize, Math.max(0, (row + 1) * map.dimensions.lengthM / (rows + 1) - markerSize / 2))
  return {
    id: `sensor-${node.devEui || crypto.randomUUID()}`,
    type: 'sensor-node',
    name: node.displayName || node.nodeId || node.devEui || `NeuroSense ${index + 1}`,
    xM, yM, widthM: markerSize, lengthM: markerSize, rotationDeg: 0, layerId: 'sensors',
    locked: false, visible: true, metadata: { sensor: normalizeNode(node) },
  }
}

export function createAreaMap(area: AreaSummary, nodes: AreaMapNode[], sections: AreaMapSection[] = []): GreenhouseMap {
  void sections
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
  const normalizedNodes = nodes.map(normalizeNode)
  map.objects = normalizedNodes.map((node, index) => sensorObject(node, index, map))
  return map
}

export function mergeAreaMapContext(map: GreenhouseMap, area: AreaSummary, nodes: AreaMapNode[], sections: AreaMapSection[] = []): GreenhouseMap {
  void sections
  const layers = map.layers.filter((layer) => layer.id !== 'sections')
  const normalizedNodes = nodes.map(normalizeNode)
  const byDevEui = new Map(normalizedNodes.filter((node) => node.devEui).map((node) => [node.devEui!.toLowerCase(), node]))
  const placed = new Set<string>()
  const objects = map.objects.flatMap<GreenhouseObject>((object) => {
    if (object.type === 'section-zone') return []
    if (object.type !== 'sensor-node' || !object.metadata.sensor?.devEui) return [{ ...object }]
    const devEui = object.metadata.sensor.devEui.toLowerCase()
    const live = byDevEui.get(devEui)
    if (!live) return []
    placed.add(devEui)
    const markerSize = sensorMarkerSizeM(map.dimensions)
    return [{
      ...object,
      xM: Math.min(object.xM, Math.max(0, map.dimensions.widthM - markerSize)),
      yM: Math.min(object.yM, Math.max(0, map.dimensions.lengthM - markerSize)),
      widthM: markerSize,
      lengthM: markerSize,
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
  const next: GreenhouseMap = { ...map, areaId: area.id, layers, objects }
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
    const [payload, sectionsPayload, profilesPayload, actionsPayload] = await Promise.all([
      neurocropApi.getGreenhouseMap(areaId) as Promise<AreaMapContext>,
      neurocropApi.getSections(areaId) as Promise<{ sections?: Array<Record<string, unknown>> }>,
      neurocropApi.getCropProfiles() as Promise<{ profiles?: Array<Record<string, unknown>> }>,
      neurocropApi.getTodayActions() as Promise<{ actions?: Array<Record<string, unknown>> }>,
    ])
    const sections = (sectionsPayload.sections ?? []).map((section) => ({
      id: String(section.id || ''),
      name: String(section.name || 'Unnamed Section'),
      areaId: String(section.area_id || areaId),
      cropProfile: text(section.crop_profile),
      nodes: Number(section.nodes) || 0,
    })).filter((section) => section.id)
    const profiles = (profilesPayload.profiles ?? []).map((profile) => ({
      id: String(profile.id || ''),
      name: String(profile.name || 'Unnamed profile'),
      stage: text(profile.stage),
      metrics: profile.metrics && typeof profile.metrics === 'object' && !Array.isArray(profile.metrics)
        ? profile.metrics as AreaMapProfile['metrics'] : {},
    })).filter((profile) => profile.id)
    const actions = (actionsPayload.actions ?? []).filter((action) => String(action.areaId || '') === areaId).map((action) => ({
      id: String(action.id || ''),
      areaId,
      sectionId: String(action.sectionId || ''),
      sectionName: String(action.sectionName || ''),
      title: String(action.title || 'Condition needs attention'),
      reason: String(action.reason || ''),
      priority: String(action.priority || 'today'),
    })).filter((action) => action.id)
    return { ...payload, nodes: Array.isArray(payload.nodes) ? payload.nodes : [], sections, profiles, actions }
  },
  async save(areaId: string, map: GreenhouseMap, expectedRevision: number): Promise<AreaMapSaveResult> {
    return await neurocropApi.saveGreenhouseMap(areaId, { map: { ...map, areaId }, expectedRevision }) as AreaMapSaveResult
  },
  async assignNodeToSection(areaId: string, devEui: string, sectionId: string) {
    return await neurocropApi.assignMapNodeSection(areaId, devEui, sectionId) as { node: { devEui: string; sectionId: string; areaId: string } }
  },
  async createSection(areaId: string, name: string, cropProfile: string) {
    const payload = await neurocropApi.createSection({ areaId, name, cropProfile }) as { section: Record<string, unknown> }
    return {
      id: String(payload.section.id),
      name: String(payload.section.name || name),
      areaId: String(payload.section.area_id || payload.section.areaId || areaId),
      cropProfile: text(payload.section.crop_profile || payload.section.cropProfile || cropProfile),
      nodes: 0,
    } satisfies AreaMapSection
  },
  async claimNode(devEui: string, sectionId: string) {
    return await neurocropApi.registerNode({ devEui, sectionId }) as { node: Record<string, unknown> }
  },
}
