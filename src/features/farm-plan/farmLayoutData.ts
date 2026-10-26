import { applyAreaGeometry,areaGeometry,objectFootprint,objectInsideOutline,validOutlineMount } from '../../../backend/area-map-outline.js'
import { createAreaMap,type AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import { OBJECT_LIBRARY,type GreenhouseMap,type GreenhouseObject,type ObjectType } from '../greenhouse-map/model'
import { isWallMountedType,placeObjectInside,sensorMarkerSizeM,snapObjectToMapWall } from '../greenhouse-map/geometry'
import { equipmentPlacementModel,withDefaultEquipmentPlacement } from '../greenhouse-map/equipmentPlacementModel'
import { defaultDoorHeight } from '../greenhouse-map/doorConfiguration'
import type { FarmPlanDocument } from './farmPlanData'
import { zoneBounds } from '../living-greenhouse/siteDemoModel'
export type FarmMaps=Record<string,GreenhouseMap>
const ignored=new Set(['measurements','lastMeasurements','measurementHeightsM','batteryPercent','lastSeenAt','rssi','snr','status','installationHeightM','installationConfirmedAt'])
const canonical=(value:unknown):unknown=>Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).filter(([k])=>!ignored.has(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value
/** Compare equipment, not transient telemetry or geometry controlled by the farm plan. */
export const layoutSignature=(map?:GreenhouseMap|null)=>map ? JSON.stringify(canonical({objects:map.objects,layers:map.layers,gridSizeM:map.gridSizeM,heatmapSettings:map.heatmapSettings})) : ''
export function farmEditorMap(plan:FarmPlanDocument,id:string,maps:FarmMaps,revision=0){
  const geometry=areaGeometry(plan,revision,id)!
  const map=applyAreaGeometry(maps[id] ?? createAreaMap({id,name:geometry.name},[],[],geometry),geometry)
  // Older rectangular maps encoded east/west openings as swapped dimensions.
  // Convert that placement to a real contour edge for drawing and the next explicit save.
  if(!map.objects.some(o=>isWallMountedType(o.type) && o.metadata.wallMount?.wall))return map
  return {...map,objects:map.objects.map(o=>isWallMountedType(o.type) && o.metadata.wallMount?.wall ? snapObjectToMapWall(o,map) : o)}
}
export function reconcileFarmMaps(before:FarmPlanDocument,after:FarmPlanDocument,maps:FarmMaps):FarmMaps{
  const next={...maps}
  for(const area of after.areas){
    const old=before.areas.find(a=>a.id===area.id),map=maps[area.id]
    if(!old || !map)continue
    if(JSON.stringify(old.polygon)===JSON.stringify(area.polygon)){
      if(old.height!==area.height || old.kind!==area.kind || old.name!==area.name)next[area.id]=farmEditorMap(after,area.id,maps)
      continue
    }
    const b=zoneBounds(old),a=zoneBounds(area),dx=b.minX-a.minX,dy=b.minY-a.minY
    const rigid=old.polygon.length===area.polygon.length && old.polygon.every((p,i)=>Math.abs(p.xM-area.polygon[i].xM-dx)<1e-7 && Math.abs(p.yM-area.polygon[i].yM-dy)<1e-7)
    if(rigid)continue
    const canonical=farmEditorMap(after,area.id,maps)
    next[area.id]={...canonical,objects:map.objects.map(o=>{
      const moved={...o,xM:o.xM+dx,yM:o.yM+dy}
      return isWallMountedType(o.type) ? snapObjectToMapWall(moved,canonical,old.polygon.length===area.polygon.length ? o.metadata.wallMount?.edgeIndex : undefined) : moved
    })}
  }
  return next
}
export function newFarmObject(type:ObjectType,map:GreenhouseMap,position?:{xM:number;yM:number},node?:AreaMapNode):GreenhouseObject{
  if(type==='sensor-node' && !node?.devEui)throw new Error('Choose a registered Node from this Area.')
  const entry=OBJECT_LIBRARY.find(e=>e.type===type)!,marker=sensorMarkerSizeM(map.dimensions)
  const [widthM,lengthM]=type==='sensor-node' ? [marker,marker] : entry.size.map(n=>Math.min(n,Math.min(map.dimensions.widthM,map.dimensions.lengthM)))
  const object:GreenhouseObject={id:crypto.randomUUID(),type,name:node?.displayName || node?.nodeId || `${entry.label} ${map.objects.filter(o=>o.type===type).length+1}`,xM:position?.xM ?? (map.dimensions.widthM-widthM)/2,yM:position?.yM ?? (map.dimensions.lengthM-lengthM)/2,widthM,lengthM,rotationDeg:0,layerId:entry.layerId,visible:true,locked:false,metadata:node ? {sensor:{...node}} : type==='door' ? {door:{type:'single',heightM:defaultDoorHeight(map.dimensions.heightM)}} : {}}
  const placed=isWallMountedType(type) ? snapObjectToMapWall(object,map) : placeObjectInside(object,map)
  return withDefaultEquipmentPlacement(placed,map)
}
export type FarmOpening={key:string;areaId:string;object:GreenhouseObject;a:{xM:number;yM:number};b:{xM:number;yM:number};sill:number;height:number}
export function farmOpenings(plan:FarmPlanDocument,maps:FarmMaps):FarmOpening[]{
  const seen=new Set<string>(),openings:FarmOpening[]=[]
  for(const area of [...plan.areas].sort((a,b)=>a.id.localeCompare(b.id))){
    const map=farmEditorMap(plan,area.id,maps),origin=zoneBounds(area)
    const visible=new Set(map.layers.filter(l=>l.visible).map(l=>l.id))
    for(const o of map.objects){
      if(!isWallMountedType(o.type) || !o.visible || !visible.has(o.layerId) || !objectInsideOutline(o,map) || !validOutlineMount(o,map))continue
      const [p,q]=objectFootprint(o),a={xM:p.xM+origin.minX,yM:p.yM+origin.minY},b={xM:q.xM+origin.minX,yM:q.yM+origin.minY}
      const key=[a,b].map(p=>`${Math.round(p.xM*10000)},${Math.round(p.yM*10000)}`).sort().join(':')+':'+o.type
      if(seen.has(key))continue
      seen.add(key);openings.push({key,areaId:area.id,object:o,a,b,sill:o.type==='door' ? 0 : Math.min(1.15,area.height*.4),height:o.type==='door' ? Math.min(area.height,o.metadata.door?.heightM || defaultDoorHeight(area.height)) : Math.min(o.type==='window' ? .95 : .58,area.height*.32)})
    }
  }
  return openings
}

/** Telemetry is refreshed separately; local drafts and map saves contain only placement data. */
export function storedFarmMap(map:GreenhouseMap):GreenhouseMap{
  return {...map,objects:map.objects.map(o=>{
    const sensor=o.metadata.sensor
    if(!sensor)return o
    const {measurements,lastMeasurements,measurementHeightsM,batteryPercent,lastSeenAt,rssi,snr,status,...placement}=sensor
    void measurements;void lastMeasurements;void measurementHeightsM;void batteryPercent;void lastSeenAt;void rssi;void snr
    return {...o,metadata:{...o.metadata,sensor:{...placement,status:status || 'unassigned'}}}
  })}
}
export function invalidFarmObjects(plan:FarmPlanDocument,maps:FarmMaps){
  return plan.areas.flatMap(area=>{
    const map=farmEditorMap(plan,area.id,maps)
    return map.objects.filter(o=>!objectInsideOutline(o,map) || (isWallMountedType(o.type) && !validOutlineMount(o,map))).map(o=>({areaId:area.id,id:o.id,name:o.name}))
  })
}

export function invalidFarmEquipmentHeights(plan:FarmPlanDocument,maps:FarmMaps){
  return plan.areas.flatMap(area=>{
    const map=farmEditorMap(plan,area.id,maps)
    return map.objects.filter(o=>o.metadata.equipmentPlacement && equipmentPlacementModel(o,map)?.fits===false).map(o=>({areaId:area.id,id:o.id,name:o.name}))
  })
}
