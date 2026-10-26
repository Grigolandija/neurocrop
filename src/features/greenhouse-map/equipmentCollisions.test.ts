import { describe,expect,it } from 'vitest'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { emptyFarmPlan } from '../farm-plan/farmPlanData'
import { farmEditorMap,newFarmObject,storedFarmMap } from '../farm-plan/farmLayoutData'
import { equipmentCollisions } from './equipmentCollisions'
import { equipmentVerticalBounds } from './equipmentPlacement'
import type { EquipmentPlacement,GreenhouseObject,ObjectType } from './model'

function fixture(){
  const plan={...emptyFarmPlan(),areas:[{id:'a',name:'Room',kind:'room' as const,height:4,polygon:[{xM:0,yM:0},{xM:10,yM:0},{xM:10,yM:8},{xM:0,yM:8}]}]}
  const map=farmEditorMap(plan,'a',{})
  const add=(id:string,type:ObjectType,placement:EquipmentPlacement,patch:Partial<GreenhouseObject>={})=>{
    const object:GreenhouseObject={...newFarmObject(type,map),id,xM:2,yM:2,widthM:2,lengthM:1,...patch,metadata:{equipmentPlacement:placement}}
    map.objects.push(object)
    return object
  }
  const rack=add('rack','rack',{mount:'floor',heightM:1.8,offsetM:0})
  const lamp=add('lamp','lamp',{mount:'ceiling',heightM:.1,offsetM:.3})
  return {map,add,rack,lamp}
}

describe('equipment intersections by footprint and body height',()=>{
  it('permits a lamp above a rack with an identical XY footprint',()=>{
    const {map}=fixture()
    expect(equipmentCollisions(map)).toEqual([])
  })
  it('reports the actual shared height interval when a lamp is lowered into the rack',()=>{
    const {map,lamp}=fixture()
    lamp.metadata.equipmentPlacement={mount:'wall',heightM:.2,offsetM:1.7}
    const [collision]=equipmentCollisions(map)
    expect(collision.left.id).toBe('rack');expect(collision.right.id).toBe('lamp')
    expect(collision.bottomM).toBeCloseTo(1.7,5)
    expect(collision.topM).toBeCloseTo(1.8,5)
  })
  it('allows touching surfaces and ignores sub-millimetre height rounding',()=>{
    const {map,lamp}=fixture()
    for(const bottom of [1.8,1.7995]){
      lamp.metadata.equipmentPlacement={mount:'wall',heightM:.2,offsetM:bottom}
      expect(equipmentCollisions(map)).toEqual([])
    }
    lamp.metadata.equipmentPlacement!.offsetM=1.79
    expect(equipmentCollisions(map)).toHaveLength(1)
  })
  it('detects floor equipment overlaps while allowing edge contact',()=>{
    const {map,rack,lamp}=fixture()
    map.objects=[rack]
    const tank={...lamp,type:'ibc-tank' as const,xM:4,metadata:{equipmentPlacement:{mount:'floor' as const,heightM:1,offsetM:0}}}
    map.objects.push(tank)
    expect(equipmentCollisions(map)).toEqual([])
    tank.xM=3.9995
    expect(equipmentCollisions(map)).toEqual([])
    tank.xM=3.99
    expect(equipmentCollisions(map)).toHaveLength(1)
  })
  it('uses rotated footprints rather than reporting intersecting axis-aligned bounding boxes',()=>{
    const {map,rack}=fixture()
    const a={...rack,widthM:3,lengthM:.2,rotationDeg:45}
    const b={...a,id:'other',xM:1.6,yM:2.4}
    map.objects=[a,b]
    expect(equipmentCollisions(map)).toEqual([])
    b.xM=1.9;b.yM=2.1
    expect(equipmentCollisions(map)).toHaveLength(1)
  })
  it('recalculates after room height changes; floor hardware stays put and ceiling fixtures move',()=>{
    const {map}=fixture()
    expect(equipmentCollisions(map)).toEqual([])
    map.dimensions.heightM=2.1
    expect(equipmentCollisions(map)).toHaveLength(1)
    map.dimensions.heightM=4
    expect(equipmentCollisions(map)).toEqual([])
  })
  it('uses the local pitched roof when resolving ceiling-mounted equipment',()=>{
    const {map,rack,lamp}=fixture()
    rack.metadata.equipmentPlacement!.heightM=2.5
    rack.yM=0;lamp.yM=0
    expect(equipmentCollisions(map)).toEqual([])
    map.farmPlanGeometry!.kind='greenhouse'
    expect(equipmentCollisions(map)).toHaveLength(1)
    rack.yM=3;lamp.yM=3
    expect(equipmentCollisions(map)).toEqual([])
  })
  it('ignores lamp suspension cables when evaluating a lower wall-mounted fixture',()=>{
    const {map,rack,lamp}=fixture()
    map.objects=[lamp]
    lamp.metadata.equipmentPlacement={mount:'ceiling',heightM:.1,offsetM:2.5}
    // Lamp body 1.4–1.5 m, cables up to 3.96 m. Only the cables
    // cross the fan's 2–2.5 m height interval.
    map.objects.push({...rack,id:'fan',type:'fan',metadata:{equipmentPlacement:{mount:'wall',heightM:.5,offsetM:2}}})
    expect(equipmentCollisions(map)).toEqual([])
  })
  it('keeps hidden and locked hardware physical, even when a layer is hidden',()=>{
    const {map,lamp}=fixture()
    lamp.metadata.equipmentPlacement={mount:'floor',heightM:.2,offsetM:0}
    lamp.visible=false;lamp.locked=true
    map.layers=map.layers.map(l=>({...l,visible:false,locked:true}))
    expect(equipmentCollisions(map)).toHaveLength(1)
  })
  it('does not treat Nodes, annotations, growing zones or openings as equipment bodies',()=>{
    const {map,rack}=fixture()
    map.objects=[rack,...(['sensor-node','section-zone','technical-zone','text-label','rectangle','walkway','door','window','ventilation-opening'] as const).map(type=>({...rack,id:type,type}))]
    expect(equipmentCollisions(map)).toEqual([])
  })
  it('reads old layouts without saved mounting using the same body height as the 3D model',()=>{
    const {map,rack,lamp}=fixture()
    delete rack.metadata.equipmentPlacement
    delete lamp.metadata.equipmentPlacement
    expect(equipmentCollisions(map)).toEqual([])
    const lower={...lamp,id:'floor-fan',type:'fan' as const,metadata:{equipmentPlacement:{mount:'floor' as const,heightM:.4,offsetM:0}}}
    map.objects=[rack,lower]
    const bounds=equipmentVerticalBounds(objectGeometry(rack,map.dimensions,4,4,{bodyOnly:true}))
    const [collision]=equipmentCollisions(map)
    expect(collision.bottomM).toBeCloseTo(bounds.bottom,5)
    expect(collision.topM).toBeCloseTo(.4,5)
  })
  it('returns each pair once and preserves the result through saved-layout serialization',()=>{
    const {map,rack,add}=fixture()
    add('water','water-tank',{mount:'floor',heightM:1.2,offsetM:0})
    const before=JSON.stringify(map),collisions=equipmentCollisions(map)
    expect(collisions).toHaveLength(1)
    expect(new Set([collisions[0].left.id,collisions[0].right.id])).toEqual(new Set([rack.id,'water']))
    expect(JSON.stringify(map)).toBe(before)
    expect(equipmentCollisions(JSON.parse(JSON.stringify(storedFarmMap(map))))).toEqual(collisions)
  })
})
