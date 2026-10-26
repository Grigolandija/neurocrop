import { describe, expect, it } from 'vitest'
import { cameraMatrix, project } from '../living-greenhouse/sceneMath'
import { rectangle, zoneArea } from '../living-greenhouse/siteDemoModel'
import { editFarmArea, editableFarmPlan, emptyFarmPlan, farmPlanDocument, farmPlanScene, farmPlanSignature, insertFarmArea, moveFarmArea, resizeFarmArea, validateFarmAreaPlan } from './farmPlanData'

describe('direct Area authoring',()=>{
  it('inserts independent rectangles in free positions with stable Area identities',()=>{
    const first=insertFarmArea(emptyFarmPlan()),second=insertFarmArea(first.plan)
    expect(second.plan.areas).toHaveLength(2)
    expect(first.id).not.toBe(second.id)
    expect(second.plan.areas[0]).toEqual(first.plan.areas[0])
    expect(second.plan.areas[1].polygon).not.toEqual(first.plan.areas[0].polygon)
    expect(validateFarmAreaPlan(second.plan)).toBeNull()
    expect(second.plan.areas.every(a=>a.polygon.length===4)).toBe(true)
    const third=insertFarmArea(second.plan).plan
    const afterRemoval=insertFarmArea({...third,areas:third.areas.filter(a=>a.id!==second.id)}).plan
    expect(new Set(afterRemoval.areas.map(a=>a.name)).size).toBe(afterRemoval.areas.length)
  })
  it('expands a full plan instead of placing new Areas on top of an existing one',()=>{
    const first=insertFarmArea({...emptyFarmPlan(),dimensions:{widthM:3,lengthM:3}})
    let next=first.plan
    for(let i=0;i<8;i++)next=insertFarmArea(next).plan
    expect(validateFarmAreaPlan(next)).toBeNull()
    expect(next.dimensions.widthM).toBeGreaterThan(3)
  })
  it('resizes an L-shaped Area exactly while preserving its shape and ID',()=>{
    const {plan,id}=insertFarmArea(emptyFarmPlan())
    const l=[{xM:1,yM:1},{xM:9,yM:1},{xM:9,yM:3},{xM:4,yM:3},{xM:4,yM:6},{xM:1,yM:6}]
    const shaped=editFarmArea(plan,id,{polygon:l}).plan
    const resized=resizeFarmArea(shaped,id,16,10)
    expect(resized.error).toBeNull();expect(resized.plan.areas[0].id).toBe(id)
    expect(resized.plan.areas[0].polygon).toHaveLength(6)
    expect(zoneArea(resized.plan.areas[0])).toBeCloseTo(zoneArea(shaped.areas[0])*4)
  })
  it('rejects crossing contours, physical overlap and moves outside the plan without changing the original',()=>{
    const first=insertFarmArea(emptyFarmPlan()),second=insertFarmArea(first.plan)
    const crossed=editFarmArea(second.plan,first.id,{polygon:[{xM:1,yM:1},{xM:5,yM:5},{xM:1,yM:5},{xM:5,yM:1}]})
    expect(crossed.error).not.toBeNull();expect(crossed.plan).toBe(second.plan)
    expect(moveFarmArea(second.plan,second.id,1,1).error).not.toBeNull()
    expect(moveFarmArea(second.plan,second.id,-1,1).error).not.toBeNull()
    expect(resizeFarmArea(second.plan,first.id,0,5).error).not.toBeNull()
  })
  it('allows a wall-free monitoring zone inside a physical Area',()=>{
    const first=insertFarmArea(emptyFarmPlan()),next=structuredClone(first.plan)
    next.areas.push({id:'zone',name:'Growing zone',kind:'zone',height:2,polygon:rectangle(2,2,2,2)})
    expect(validateFarmAreaPlan(next)).toBeNull()
    const scene=farmPlanScene(next)
    expect(scene.buildings.find(b=>b.id==='zone')?.open).toBe(true)
    expect(scene.zones.every(z=>z.sensors.length===0)).toBe(true)
  })
  it('persists one entity per Area and strips any client measurements',()=>{
    const {plan,id}=insertFarmArea(emptyFarmPlan())
    const augmented={...plan,sensors:[{temperature:30}],areas:plan.areas.map(a=>({...a,sensors:['DEMO']}))}
    const saved=farmPlanDocument(augmented)
    expect(saved.version).toBe(2);expect(saved.areas[0].id).toBe(id)
    expect(JSON.stringify(saved)).not.toMatch(/temperature|humidity|sensors|DEMO|buildings|zones/)
    expect(farmPlanScene(saved).zones[0].areaId).toBe(id)
  })
  it('compares PostgreSQL JSONB canonically and restores saved Areas without duplicating them',()=>{
    const {plan}=insertFarmArea(emptyFarmPlan())
    const reverse=(v:unknown):unknown=>Array.isArray(v) ? v.map(reverse) : v && typeof v==='object' ? Object.fromEntries(Object.entries(v).reverse().map(([k,value])=>[k,reverse(value)])) : v
    const server=JSON.parse(JSON.stringify(reverse(plan)))
    expect(farmPlanSignature(editableFarmPlan(server))).toBe(farmPlanSignature(plan))
    server.areas[0].name='Changed';expect(farmPlanSignature(server)).not.toBe(farmPlanSignature(plan))
  })
  it('keeps a large farm within the camera clipping range',()=>{
    expect(project([0,0,0],cameraMatrix([10000,15000,10000],[0,0,0],1.5),1200,800).visible).toBe(true)
  })
})
