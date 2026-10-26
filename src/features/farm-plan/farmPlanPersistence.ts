import type { GreenhouseMap } from '../greenhouse-map/model'
import type { AreaMapSaveResult } from '../greenhouse-map/services/areaMapRepository'
import { farmPlanSignature,type FarmPlanDocument,type FarmPlanSaved } from './farmPlanData'
import { farmEditorMap,invalidFarmObjects,invalidFarmEquipmentHeights,layoutSignature,storedFarmMap,type FarmMaps } from './farmLayoutData'
export type LayoutBase={revision:number;signature:string}
export type LayoutBases=Record<string,LayoutBase>
export const changedFarmLayouts=(plan:FarmPlanDocument,maps:FarmMaps,bases:LayoutBases)=>plan.areas.filter(a=>maps[a.id] && layoutSignature(maps[a.id])!==(bases[a.id]?.signature || '')).map(a=>a.id)
export function expectedLayoutRevision(id:string,bases:LayoutBases,fresh?:FarmPlanSaved){
  if(!fresh)return bases[id]?.revision || 0
  if(!fresh.layouts)throw new Error('The server must be updated to support unified farm layouts. Your draft is preserved.')
  const layout=fresh.layouts.find(l=>l.areaId===id)
  if(!layout && !bases[id]?.revision)return 0
  if((layoutSignature(layout?.map) || '')!==(bases[id]?.signature || ''))throw new Error('The equipment in this Area changed in another session. Your draft is preserved; reload the server version before saving.')
  return layout?.revision || 0
}
/** Per-Area CAS saves avoid sending the entire farm equipment in a single request. */
export async function persistFarmWorkspace(input:{plan:FarmPlanDocument;maps:FarmMaps;bases:LayoutBases;baseline:string;revision:number;savePlan:(plan:FarmPlanDocument,revision:number)=>Promise<FarmPlanSaved>;saveMap:(id:string,map:GreenhouseMap,revision:number)=>Promise<AreaMapSaveResult>;enableMap:(id:string)=>Promise<unknown>;onPlanSaved:(result:FarmPlanSaved,dirtyIds:string[])=>void;onMapSaved:(id:string,result:AreaMapSaveResult)=>void;onBaseConfirmed?:(id:string,revision:number)=>void}){
  const {plan,maps,bases}=input
  const invalid=invalidFarmObjects(plan,maps)
  if(invalid.length)throw new Error(`Objects outside the Area or not mounted on a wall: ${invalid.slice(0,5).map(o=>o.name).join(', ')}. Adjust them in Equipment & Nodes before saving.`)
  const invalidHeights=invalidFarmEquipmentHeights(plan,maps)
  if(invalidHeights.length)throw new Error(`Equipment does not fit between the floor and ceiling: ${invalidHeights.slice(0,5).map(o=>o.name).join(', ')}. Adjust its height or mounting offset in Properties before saving.`)
  const dirtyIds=changedFarmLayouts(plan,maps,bases)
  let fresh:FarmPlanSaved|undefined
  if(farmPlanSignature(plan)!==input.baseline){fresh=await input.savePlan(plan,input.revision);input.onPlanSaved(fresh,dirtyIds)}
  // Validate every dirty map against the returned snapshot before starting any map writes.
  const revisions=new Map<string,number>()
  for(const id of dirtyIds){const revision=expectedLayoutRevision(id,bases,fresh);revisions.set(id,revision);input.onBaseConfirmed?.(id,revision)}
  for(const id of dirtyIds){
    await input.enableMap(id)
    const map=storedFarmMap(farmEditorMap(fresh?.plan || plan,id,maps,fresh?.revision || input.revision))
    const result=await input.saveMap(id,map,revisions.get(id)!)
    input.onMapSaved(id,result)
  }
}
