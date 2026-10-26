import { describe,expect,it } from 'vitest'
import { emptyFarmPlan,insertFarmArea } from './farmPlanData'
import { farmEditorMap,layoutSignature,newFarmObject } from './farmLayoutData'
import { readFarmDraft,writeFarmDraft,type FarmDraft } from './farmDraftStorage'

function fixture(){
  const entries=new Map<string,string>(),storage={getItem:(key:string)=>entries.get(key) || null,setItem:(key:string,value:string)=>{entries.set(key,value)},removeItem:(key:string)=>{entries.delete(key)}}
  const {plan,id}=insertFarmArea(emptyFarmPlan()),map=farmEditorMap(plan,id,{})
  map.objects=[newFarmObject('lamp',map)]
  const draft:FarmDraft={revision:2,plan,layouts:{[id]:map},layoutBases:{[id]:{revision:3,signature:layoutSignature(map)}},selectedAreaId:id}
  return {storage,entries,draft,id}
}
describe('recoverable farm drafts',()=>{
  it('round-trips the selected Area, physical placement and original CAS bases',()=>{
    const {storage,draft,id}=fixture()
    writeFarmDraft(storage,'account-a',draft)
    const restored=readFarmDraft(storage,'account-a')!
    expect(restored.revision).toBe(2)
    expect(restored.selectedAreaId).toBe(id)
    expect(restored.layoutBases).toEqual(draft.layoutBases)
    expect(restored.layouts[id].objects[0].metadata.equipmentPlacement).toEqual(draft.layouts[id].objects[0].metadata.equipmentPlacement)
    expect(restored.plan).toEqual(draft.plan)
  })
  it('never mixes accounts or deletes another account draft when one is saved',()=>{
    const {storage,draft}=fixture()
    writeFarmDraft(storage,'a',draft);writeFarmDraft(storage,'b',{...draft,revision:9})
    writeFarmDraft(storage,'a',null)
    expect(readFarmDraft(storage,'a')).toBeNull()
    expect(readFarmDraft(storage,'b')?.revision).toBe(9)
  })
  it('retains the last recoverable draft if storage is full',()=>{
    const {storage,draft}=fixture()
    writeFarmDraft(storage,'a',draft)
    const full={...storage,setItem:()=>{throw new Error('Quota exceeded')}}
    expect(()=>writeFarmDraft(full,'a',{...draft,revision:7})).toThrow('Quota exceeded')
    expect(readFarmDraft(storage,'a')?.revision).toBe(2)
  })
  it('rejects a damaged map or base without partially restoring its plan',()=>{
    const {storage,draft,id}=fixture()
    for(const broken of [{...draft,layouts:{[id]:null}},{...draft,layoutBases:{[id]:{revision:-1,signature:''}}},{...draft,revision:-1}]){
      storage.setItem('neurocrop-farm-draft:a',JSON.stringify(broken))
      expect(()=>readFarmDraft(storage,'a')).toThrow(/Invalid/)
    }
    storage.setItem('neurocrop-farm-draft:a','broken JSON')
    expect(()=>readFarmDraft(storage,'a')).toThrow()
  })
  it('loads earlier drafts without selection and drops deleted Area layouts',()=>{
    const {storage,draft,id}=fixture()
    const old={revision:draft.revision,plan:draft.plan,layouts:{...draft.layouts,removed:draft.layouts[id]},layoutBases:draft.layoutBases}
    storage.setItem('neurocrop-farm-draft:a',JSON.stringify(old))
    expect(readFarmDraft(storage,'a')?.selectedAreaId).toBeNull()
    expect(Object.keys(readFarmDraft(storage,'a')!.layouts)).toEqual([id])
    writeFarmDraft(storage,'a',{...draft,selectedAreaId:'removed'})
    expect(readFarmDraft(storage,'a')?.selectedAreaId).toBeNull()
  })
})
