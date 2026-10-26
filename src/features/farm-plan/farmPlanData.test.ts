import { describe, expect, it } from 'vitest'
import { cameraMatrix, project } from '../living-greenhouse/sceneMath'
import { createSitePlan, siteDimensions, type SitePlan } from '../living-greenhouse/siteDemoModel'
import { addSiteEntity, validateSitePlan } from '../living-greenhouse/sitePlanEditing'
import { editableFarmPlan, farmBindingError, farmPlanDocument, farmPlanSignature, type FarmArea } from './farmPlanData'

describe('production farm plan adapter',()=>{
  const areas:FarmArea[]=[{id:'area-real',name:'Existing greenhouse',mapEnabled:true,mapConfigured:true}]
  it('stores only geometry and links, never demo sensor measurements',()=>{
    const example=createSitePlan();example.zones[0].areaId='area-real'
    const saved=farmPlanDocument(example),restored=editableFarmPlan(saved)
    expect(JSON.stringify(saved)).not.toMatch(/temperature|humidity|co2|sensors|DEMO/)
    expect(restored.zones.every(z=>z.sensors.length===0)).toBe(true)
    expect(restored.zones[0].areaId).toBe('area-real')
    expect(restored.zones[0].polygon).toEqual(example.zones[0].polygon)
    expect(example.zones.some(z=>z.sensors.length>0)).toBe(true)
  })
  it('starts empty and creates user zones without synthetic sensors',()=>{
    const empty:SitePlan={version:1,dimensions:{widthM:80,lengthM:40},buildings:[],rooms:[],zones:[]}
    const polygon=[{xM:50,yM:5},{xM:70,yM:5},{xM:70,yM:15},{xM:50,yM:15}]
    const building=addSiteEntity(empty,'buildings',polygon,true,false)
    expect(building.error).toBeNull()
    const zone=addSiteEntity(building.plan,'zones',polygon,false,false)
    expect(zone.error).toBeNull();expect(zone.plan.zones[0].sensors).toEqual([])
    expect(siteDimensions(editableFarmPlan(farmPlanDocument(zone.plan)))).toEqual(empty.dimensions)
    expect(validateSitePlan({...zone.plan,dimensions:{widthM:30,lengthM:40}})).not.toBeNull()
  })
  it('compares server JSONB key order canonically without marking a saved plan dirty',()=>{
    const saved=farmPlanDocument(createSitePlan())
    const reverse=(v:unknown):unknown=>Array.isArray(v) ? v.map(reverse) : v && typeof v==='object' ? Object.fromEntries(Object.entries(v).reverse().map(([k,value])=>[k,reverse(value)])) : v
    const server=JSON.parse(JSON.stringify(reverse(saved)))
    expect(farmPlanSignature(server)).toBe(farmPlanSignature(saved))
    expect(JSON.stringify(farmPlanDocument(editableFarmPlan(server)))).toBe(farmPlanSignature(saved))
    server.buildings[0].name='Changed'
    expect(farmPlanSignature(server)).not.toBe(farmPlanSignature(saved))
  })
  it('keeps a large accepted farm within the camera clipping range',()=>{
    const matrix=cameraMatrix([10000,15000,10000],[0,0,0],1.5)
    expect(project([0,0,0],matrix,1200,800).visible).toBe(true)
  })
  it('rejects duplicate, deleted or foreign Area references and permits unlinked zones',()=>{
    const plan=editableFarmPlan(farmPlanDocument(createSitePlan()))
    expect(farmBindingError(plan,areas)).toBeNull()
    plan.zones[0].areaId='area-real';expect(farmBindingError(plan,areas)).toBeNull()
    plan.zones[1].areaId='area-real';expect(farmBindingError(plan,areas)).not.toBeNull()
    plan.zones[1].areaId='foreign';expect(farmBindingError(plan,areas)).not.toBeNull()
  })
})
