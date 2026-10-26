import { describe,expect,it,vi } from 'vitest'
import { emptyFarmPlan,farmPlanSignature,insertFarmArea,type FarmPlanSaved } from './farmPlanData'
import { farmEditorMap,layoutSignature,newFarmObject } from './farmLayoutData'
import { expectedLayoutRevision,persistFarmWorkspace,type LayoutBases } from './farmPlanPersistence'
const setup=()=>{
  const {plan,id}=insertFarmArea(emptyFarmPlan()),map=farmEditorMap(plan,id,{}),edited={...map,objects:[newFarmObject('rack',map)]}
  const bases:LayoutBases={[id]:{revision:3,signature:layoutSignature(map)}}
  const fresh:FarmPlanSaved={plan,revision:2,updatedAt:null,areas:[],layouts:[{areaId:id,map,revision:4}]}
  return {plan,id,map,edited,bases,fresh}
}

describe('unified farm saving',()=>{
  it('rejects equipment above the ceiling before any plan or equipment writes',async()=>{
    const {plan,id,edited,bases}=setup(),savePlan=vi.fn(),saveMap=vi.fn(),enableMap=vi.fn()
    edited.objects[0].metadata.equipmentPlacement={mount:'wall',heightM:1,offsetM:2.5}
    await expect(persistFarmWorkspace({plan,maps:{[id]:edited},bases,baseline:'old',revision:1,savePlan,saveMap,enableMap,onPlanSaved:()=>{},onMapSaved:()=>{}})).rejects.toThrow(/floor and ceiling/)
    expect(savePlan).not.toHaveBeenCalled();expect(saveMap).not.toHaveBeenCalled();expect(enableMap).not.toHaveBeenCalled()
  })
  it('adopts the new map revision after a geometry-only synchronization, never a competing equipment edit',()=>{
    const {id,map,edited,bases,fresh}=setup()
    expect(expectedLayoutRevision(id,bases,fresh)).toBe(4)
    const changed={...fresh,layouts:[{areaId:id,map:edited,revision:5}]}
    expect(()=>expectedLayoutRevision(id,bases,changed)).toThrow(/another session/)
    expect(layoutSignature(map)).toBe(bases[id].signature)
  })
  it('allows the first equipment save for a newly created Area without a stored map',()=>{
    const {id,bases,fresh}=setup();bases[id].revision=0
    expect(expectedLayoutRevision(id,bases,{...fresh,layouts:[]})).toBe(0)
    expect(()=>expectedLayoutRevision(id,bases,{...fresh,layouts:undefined})).toThrow(/server must be updated/)
  })
  it('saves a geometry change, then each dirty Area with the correct canonical geometry and CAS revision',async()=>{
    const {plan,id,map,edited,bases,fresh}=setup(),calls:string[]=[]
    const savePlan=vi.fn(async()=>{calls.push('farm');return fresh}),saveMap=vi.fn(async(_areaId,map,revision)=>{calls.push('map');return {map,revision:revision+1,updatedAt:'now'}})
    await persistFarmWorkspace({plan,maps:{[id]:edited},bases,baseline:'old-plan',revision:1,savePlan,saveMap,enableMap:async()=>{calls.push('enable')},onPlanSaved:()=>{calls.push('plan-confirmed')},onMapSaved:()=>{calls.push('map-confirmed')}})
    expect(calls).toEqual(['farm','plan-confirmed','enable','map','map-confirmed'])
    expect(saveMap.mock.calls[0][0]).toBe(id);expect(saveMap.mock.calls[0][2]).toBe(4)
    expect(saveMap.mock.calls[0][1].farmPlanGeometry?.revision).toBe(2)
    expect(saveMap.mock.calls[0][1].objects).toEqual(edited.objects)
    expect(fresh.layouts![0].map).toEqual(map)
  })
  it('saves a small equipment edit without rewriting the farm contour',async()=>{
    const {plan,id,edited,bases}=setup(),savePlan=vi.fn(),saveMap=vi.fn(async(_id,map,revision)=>({map,revision:revision+1,updatedAt:'now'}))
    await persistFarmWorkspace({plan,maps:{[id]:edited},bases,baseline:farmPlanSignature(plan),revision:1,savePlan,saveMap,enableMap:async()=>{},onPlanSaved:()=>{},onMapSaved:()=>{}})
    expect(savePlan).not.toHaveBeenCalled();expect(saveMap.mock.calls[0][2]).toBe(3)
    expect(saveMap.mock.calls[0][1].farmPlanGeometry?.revision).toBe(1)
  })
  it('does not start any equipment writes if another session edited one of the maps',async()=>{
    const {plan,id,edited,bases,fresh}=setup(),saveMap=vi.fn(),enableMap=vi.fn()
    fresh.layouts![0].map={...edited,objects:[{...edited.objects[0],xM:.25}]}
    await expect(persistFarmWorkspace({plan,maps:{[id]:edited},bases,baseline:'old',revision:1,savePlan:async()=>fresh,saveMap,enableMap,onPlanSaved:()=>{},onMapSaved:()=>{}})).rejects.toThrow(/another session/)
    expect(saveMap).not.toHaveBeenCalled();expect(enableMap).not.toHaveBeenCalled()
  })
  it('keeps already saved Areas confirmed when a later map write fails, and propagates the error',async()=>{
    const first=setup(),second=insertFarmArea(first.plan),id2=second.id,map2=farmEditorMap(second.plan,id2,{}),edited2={...map2,objects:[newFarmObject('rack',map2)]}
    const onSaved=vi.fn(),saveMap=vi.fn(async(id,map,revision)=>{if(id===id2)throw new Error('Network interrupted');return {map,revision:revision+1,updatedAt:'now'}})
    await expect(persistFarmWorkspace({plan:second.plan,maps:{[first.id]:first.edited,[id2]:edited2},bases:first.bases,baseline:farmPlanSignature(second.plan),revision:2,savePlan:vi.fn(),saveMap,enableMap:async()=>{},onPlanSaved:()=>{},onMapSaved:onSaved})).rejects.toThrow('Network interrupted')
    expect(onSaved).toHaveBeenCalledTimes(1);expect(onSaved.mock.calls[0][0]).toBe(first.id)
    expect(edited2.objects).toHaveLength(1)
  })
  it('rejects equipment outside a resized contour before any server mutations',async()=>{
    const {plan,id,edited,bases}=setup(),broken={...edited,objects:[{...edited.objects[0],xM:100}]},savePlan=vi.fn(),enableMap=vi.fn()
    await expect(persistFarmWorkspace({plan,maps:{[id]:broken},bases,baseline:'old',revision:1,savePlan,saveMap:vi.fn(),enableMap,onPlanSaved:()=>{},onMapSaved:()=>{}})).rejects.toThrow(/outside/)
    expect(savePlan).not.toHaveBeenCalled();expect(enableMap).not.toHaveBeenCalled()
  })
})
