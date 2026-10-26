import type { AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import type { FarmMaps } from './farmLayoutData'

// Only unassigned hardware is offered here; another Area's Nodes are never moved implicitly.
export function unassignedFarmNodes(payload: unknown): AreaMapNode[] {
  const rows = (payload as { nodes?: Array<Record<string, unknown>> } | null)?.nodes
  if (!Array.isArray(rows)) return []
  return rows.filter(n=>!n.areaId && typeof n.devEui==='string' && /^[a-f\d]{16}$/i.test(n.devEui)).map(n=>({
    devEui: String(n.devEui).toLowerCase(), nodeId: String(n.name || n.id || n.devEui),
    displayName: String(n.name || n.id || n.devEui), sectionId: typeof n.sectionId==='string' ? n.sectionId : undefined,
    sensors: Object.entries(n.sensorPresence || {}).filter(([,present])=>present===true).map(([name])=>name),
    status: 'unassigned', installationHeightM: typeof n.installationHeightCm==='number' ? n.installationHeightCm/100 : undefined,
    installationConfirmedAt: typeof n.installationHeightRecordedAt==='string' ? n.installationHeightRecordedAt : undefined,
  }))
}

export function nodeHeightCentimetres(heightM: number | null, ceilingM: number) {
  if (heightM===null) return null
  if (!Number.isFinite(heightM) || heightM<0 || heightM>Math.min(100,ceilingM)) throw new Error('Height must be between the floor and the Area ceiling.')
  return Math.round(heightM*100000)/1000
}

// Preserve unsaved placement and object properties when authoritative Node context is refreshed.
export function refreshFarmNodeMetadata(maps: FarmMaps, nodes: AreaMapNode[]): FarmMaps {
  const byId=new Map(nodes.filter(n=>n.devEui).map(n=>[n.devEui!.toLowerCase(),n]))
  return Object.fromEntries(Object.entries(maps).map(([id,map])=>[id,{...map,objects:map.objects.map(object=>{
    const sensor=object.metadata.sensor,node=sensor?.devEui ? byId.get(sensor.devEui.toLowerCase()) : undefined
    return !sensor || !node ? object : {...object,metadata:{...object.metadata,sensor:{...sensor,
      installationHeightM:node.installationHeightM,installationConfirmedAt:node.installationConfirmedAt,
      measurementHeightsM:node.measurementHeightsM,
    }}}
  })}]))
}
