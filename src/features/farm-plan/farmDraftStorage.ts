import { editableFarmPlan,farmPlanDocument,type FarmPlanDocument } from './farmPlanData'
import { storedFarmMap,type FarmMaps } from './farmLayoutData'
import type { LayoutBases } from './farmPlanPersistence'

export type FarmDraft={revision:number;plan:FarmPlanDocument;layouts:FarmMaps;layoutBases:LayoutBases;selectedAreaId:string|null}
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>
const key=(scope:string)=>`neurocrop-farm-draft:${scope}`

export function readFarmDraft(storage:Storage,scope:string):FarmDraft|null{
  const draft=JSON.parse(storage.getItem(key(scope)) || 'null')
  if(!draft)return null
  if(!Number.isInteger(draft.revision) || draft.revision<0 || !draft.plan)throw new Error('Invalid farm draft')
  const plan=editableFarmPlan(draft.plan),ids=new Set(plan.areas.map(a=>a.id))
  const layouts:FarmMaps={},layoutBases:LayoutBases={}
  for(const [id,map] of Object.entries(draft.layouts || {}) as [string,FarmMaps[string]][]){
    if(!ids.has(id))continue
    if(!map || map.schemaVersion!==1 || !map.dimensions || !map.shape || !Array.isArray(map.objects) || !Array.isArray(map.layers))throw new Error('Invalid farm layout draft')
    layouts[id]=map
  }
  for(const [id,base] of Object.entries(draft.layoutBases || {}) as [string,LayoutBases[string]][]){
    if(!ids.has(id))continue
    if(!base || !Number.isInteger(base.revision) || base.revision<0 || typeof base.signature!=='string')throw new Error('Invalid farm layout base')
    layoutBases[id]=base
  }
  return {revision:draft.revision,plan,layouts,layoutBases,selectedAreaId:ids.has(draft.selectedAreaId) ? draft.selectedAreaId : null}
}

/** A failed local write must never erase the last recoverable draft. */
export function writeFarmDraft(storage:Storage,scope:string,draft:FarmDraft|null){
  if(!draft){storage.removeItem(key(scope));return}
  storage.setItem(key(scope),JSON.stringify({...draft,plan:farmPlanDocument(draft.plan),layouts:Object.fromEntries(Object.entries(draft.layouts).map(([id,map])=>[id,storedFarmMap(map)]))}))
}
