import { neurocropApi } from '../../services/api/neurocropApi'
import { insideLabel, validateSitePlan } from '../living-greenhouse/sitePlanEditing'
import { siteDimensions, type SiteBuilding, type SitePlan, type SiteRoom, type SiteZone } from '../living-greenhouse/siteDemoModel'

export type FarmArea={id:string;name:string;kind?:string;mapEnabled:boolean;mapConfigured:boolean;mapDimensions?:{widthM:number;lengthM:number}}
export type FarmPlanDocument={version:1;dimensions:{widthM:number;lengthM:number};buildings:SiteBuilding[];rooms:SiteRoom[];zones:Array<Pick<SiteZone,'id'|'name'|'buildingId'|'roomId'|'areaId'|'height'|'polygon'>>}
export type FarmPlanContext={draftScope:string;plan:FarmPlanDocument;revision:number;updatedAt:string|null;areas:FarmArea[];permissions:{canEdit:boolean}}
export type FarmPlanSaved=Pick<FarmPlanContext,'plan'|'revision'|'updatedAt'>

/** Production plans store geometry and real Area IDs, never readings or demo sensors. */
export function farmPlanDocument(plan:SitePlan):FarmPlanDocument{
  const d=siteDimensions(plan),points=(polygon:SiteBuilding['polygon'])=>polygon.map(({xM,yM})=>({xM,yM}))
  return {version:1,dimensions:{widthM:d.widthM,lengthM:d.lengthM},buildings:plan.buildings.map(({id,name,height,greenhouse,polygon})=>({id,name:name.trim(),height,greenhouse,polygon:points(polygon)})),rooms:plan.rooms.map(({id,name,height,buildingId,polygon})=>({id,name:name.trim(),height,buildingId,polygon:points(polygon)})),zones:plan.zones.map(({id,name,height,buildingId,roomId,areaId,polygon})=>({id,name:name.trim(),height,buildingId,roomId,areaId:areaId || undefined,polygon:points(polygon)}))}
}
/** Normalize key order after PostgreSQL JSONB serialization before comparing revisions. */
export const farmPlanSignature=(document:FarmPlanDocument)=>JSON.stringify(farmPlanDocument(editableFarmPlan(document)))

export function editableFarmPlan(document:FarmPlanDocument):SitePlan{
  const plan:SitePlan={...structuredClone(document),zones:document.zones.map(zone=>({...structuredClone(zone),kind:document.buildings.find(b=>b.id===zone.buildingId)?.greenhouse ? 'greenhouse' : 'room',label:insideLabel(zone.polygon),sensors:[]}))}
  const error=validateSitePlan(plan)
  if(error)throw new Error(error)
  return plan
}
export function farmBindingError(plan:SitePlan,areas:FarmArea[]):string|null{
  const linked=new Set<string>()
  for(const zone of plan.zones){
    if(!zone.areaId)continue
    if(!areas.some(a=>a.id===zone.areaId))return 'Susieta zona nebeegzistuoja šioje organizacijoje.'
    if(linked.has(zone.areaId))return 'Vieną Area galima susieti su vienu kontūru.'
    linked.add(zone.areaId)
  }
  return null
}
export const farmPlanRepository={
  load:async()=>await neurocropApi.getFarmPlan() as FarmPlanContext,
  save:async(plan:SitePlan,expectedRevision:number)=>await neurocropApi.saveFarmPlan({plan:farmPlanDocument(plan),expectedRevision}) as FarmPlanSaved,
}
