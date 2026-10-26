import { describe,expect,it } from 'vitest'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { equipmentMountCeiling } from '../living-greenhouse/wallSurfaces'
import { emptyFarmPlan } from '../farm-plan/farmPlanData'
import { farmEditorMap,newFarmObject,storedFarmMap } from '../farm-plan/farmLayoutData'
import { pasteFarmEquipment } from '../farm-plan/farmEquipmentEditing'
import { equipmentPlacementModel } from './equipmentPlacementModel'
import { equipmentVerticalBounds } from './equipmentPlacement'
import type { EquipmentPlacement,GreenhouseObject } from './model'

function fixture(){
  const plan={...emptyFarmPlan(),areas:[{id:'a',name:'Room',kind:'room' as const,height:4,polygon:[{xM:0,yM:0},{xM:10,yM:0},{xM:10,yM:8},{xM:0,yM:8}]}]}
  const map=farmEditorMap(plan,'a',{}),object=newFarmObject('fan',map,{xM:3,yM:3})
  const mount=(placement:EquipmentPlacement):GreenhouseObject=>({...object,metadata:{equipmentPlacement:placement}})
  const body=(o:GreenhouseObject,height:number)=>objectGeometry(o,map.dimensions,height,height,{bodyOnly:true})
  return {map,object,mount,body}
}
describe('saved equipment mounting and physical height',()=>{
  it('keeps floor and wall placement fixed when room height changes',()=>{
    const {mount,body}=fixture()
    for(const [mode,offset] of [['floor',0],['wall',1.5]] as const){
      const o=mount({mount:mode,heightM:.6,offsetM:offset}),before=body(o,3),after=body(o,5)
      const bounds=equipmentVerticalBounds(before)
      expect(bounds.bottom).toBeCloseTo(offset,5);expect(bounds.top).toBeCloseTo(offset+.6,5)
      expect(equipmentVerticalBounds(after)).toEqual(bounds)
      for(let i=0;i<before.length;i++)expect(after[i]).toBeCloseTo(before[i],5)
    }
  })
  it('keeps ceiling clearance and body height constant as the room height changes',()=>{
    const {mount,body}=fixture(),o=mount({mount:'ceiling',heightM:.6,offsetM:.25})
    const before=body(o,3),after=body(o,5),a=equipmentVerticalBounds(before),b=equipmentVerticalBounds(after)
    expect(a.bottom).toBeCloseTo(2.15,5);expect(a.top).toBeCloseTo(2.75,5)
    expect(b.bottom).toBeCloseTo(4.15,5);expect(b.top).toBeCloseTo(4.75,5)
    for(let i=0;i<before.length;i+=6){expect(after[i]).toBeCloseTo(before[i],5);expect(after[i+2]).toBeCloseTo(before[i+2],5)}
  })
  it('does not shrink a saved physical model when a floor-mounted object still fits a low ceiling',()=>{
    const {map,mount}=fixture(),o=mount({mount:'floor',heightM:.4,offsetM:0})
    const low=objectGeometry(o,map.dimensions,.5,.5,{bodyOnly:true}),high=objectGeometry(o,map.dimensions,5,5,{bodyOnly:true})
    expect(low).toEqual(high)
    expect(equipmentVerticalBounds(low).top).toBeCloseTo(.4,6)
  })
  it('excludes lamp cables from fixture height and draws them only for a ceiling mount',()=>{
    const {map}=fixture(),lamp=newFarmObject('lamp',map,{xM:2,yM:3})
    lamp.metadata.equipmentPlacement={mount:'ceiling',heightM:.10,offsetM:.4}
    const body=objectGeometry(lamp,map.dimensions,4,4,{bodyOnly:true}),full=objectGeometry(lamp,map.dimensions,4,4)
    expect(equipmentVerticalBounds(body).top).toBeCloseTo(3.6,5)
    expect(equipmentVerticalBounds(body).bottom).toBeCloseTo(3.5,5)
    expect(equipmentVerticalBounds(full).top).toBeCloseTo(3.96,5)
    expect(full.length).toBeGreaterThan(body.length)
    lamp.metadata.equipmentPlacement.mount='wall';lamp.metadata.equipmentPlacement.offsetM=1.2
    expect(objectGeometry(lamp,map.dimensions,4,4)).toEqual(objectGeometry(lamp,map.dimensions,4,4,{bodyOnly:true}))
  })
  it('uses the pitched roof over the rotated footprint and reports equipment that no longer fits',()=>{
    const {map,mount}=fixture(),o=mount({mount:'ceiling',heightM:.8,offsetM:.2})
    map.farmPlanGeometry!.kind='greenhouse';o.rotationDeg=35
    const ceiling=equipmentMountCeiling(o,map.dimensions,4,.32),model=equipmentPlacementModel(o,map)!
    expect(model.top).toBeCloseTo(ceiling-.2,6);expect(model.fits).toBe(true)
    map.dimensions.heightM=.7
    expect(equipmentPlacementModel(o,map)?.fits).toBe(false)
    expect(o.metadata.equipmentPlacement).toEqual({mount:'ceiling',heightM:.8,offsetM:.2})
  })
  it('persists mounting through serialization and independent copies, leaving Node heights separate',()=>{
    const {map,mount}=fixture(),o=mount({mount:'wall',heightM:.6,offsetM:1.5})
    map.objects=[o]
    const stored=JSON.parse(JSON.stringify(storedFarmMap(map)))
    expect(stored.objects[0].metadata.equipmentPlacement).toEqual(o.metadata.equipmentPlacement)
    const copy=pasteFarmEquipment([o],map)[0]
    expect(copy.metadata.equipmentPlacement).toEqual(o.metadata.equipmentPlacement)
    copy.metadata.equipmentPlacement!.offsetM=2
    expect(o.metadata.equipmentPlacement!.offsetM).toBe(1.5)
    const node=newFarmObject('sensor-node',map,undefined,{devEui:'0011223344556677',status:'online',sensors:[],installationHeightM:1.8})
    expect(node.metadata.equipmentPlacement).toBeUndefined()
    expect(node.metadata.sensor?.installationHeightM).toBe(1.8)
    expect(equipmentPlacementModel(node,map)).toBeNull()
  })
})
