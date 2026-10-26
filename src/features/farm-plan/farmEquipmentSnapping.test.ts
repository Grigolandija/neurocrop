import { describe,expect,it } from 'vitest'
import { objectFootprint,objectInsideOutline,validOutlineMount } from '../../../backend/area-map-outline.js'
import { snapObjectToMapWall } from '../greenhouse-map/geometry'
import { emptyFarmPlan } from './farmPlanData'
import { farmEditorMap,newFarmObject } from './farmLayoutData'
import { moveFarmEquipment } from './farmEquipmentSnapping'

function fixture(){
  const plan={...emptyFarmPlan(),areas:[{id:'a',name:'Room',kind:'room' as const,height:3,polygon:[{xM:0,yM:0},{xM:12,yM:0},{xM:12,yM:10},{xM:0,yM:10}]}]}
  const map=farmEditorMap(plan,'a',{})
  const object={...newFarmObject('growing-table',map),id:'moving',xM:1.4,yM:2.2,widthM:2,lengthM:1}
  map.objects=[object]
  return {map,object}
}
const options={grid:true,magnet:true,toleranceM:.1}
const zero={xM:0,yM:0}

describe('magnetic equipment placement',()=>{
  it('aligns an edge exactly to other equipment before applying the grid',()=>{
    const {map,object}=fixture()
    map.objects.push({...object,id:'target',xM:3.47,yM:5.2})
    const result=moveFarmEquipment([object],object,zero,map,options)!
    expect(result.objects[0].xM).toBeCloseTo(1.47)
    expect(result.objects[0].yM).toBe(2.25)
    expect(result.guides).toContainEqual({from:{xM:3.47,yM:2.2},to:{xM:3.47,yM:6.2}})
    expect(object.xM).toBe(1.4)
  })
  it('can align centres and both axes at once',()=>{
    const {map,object}=fixture()
    map.objects.push({...object,id:'centre',xM:2.17,yM:6,widthM:.6})
    map.objects.push({...object,id:'row',xM:7,yM:2.26})
    const result=moveFarmEquipment([object],object,zero,map,options)!
    expect(result.objects[0].xM+1).toBeCloseTo(2.47)
    expect(result.objects[0].yM).toBeCloseTo(2.26)
    expect(result.guides).toHaveLength(2)
  })
  it('snaps a rotated footprint to a wall, preserving rotation and dimensions',()=>{
    const {map,object}=fixture(),rotated={...object,xM:1.04,yM:3.27,rotationDeg:90}
    const result=moveFarmEquipment([rotated],rotated,zero,map,options)!
    expect(Math.min(...objectFootprint(result.objects[0]).map(p=>p.xM))).toBeCloseTo(0)
    expect(result.objects[0]).toMatchObject({rotationDeg:90,widthM:2,lengthM:1})
    expect(objectInsideOutline(result.objects[0],map)).toBe(true)
    expect(result.guides).toHaveLength(1)
  })
  it('supports angled walls without forcing equipment rotation',()=>{
    const {map,object}=fixture()
    map.shape={type:'polygon',points:[{xM:0,yM:0},{xM:10,yM:0},{xM:10,yM:10}]}
    const square={...object,xM:3,yM:1.95,widthM:1,lengthM:1}
    const result=moveFarmEquipment([square],square,zero,map,options)!
    expect(result.objects[0].xM).toBeCloseTo(2.975)
    expect(result.objects[0].yM).toBeCloseTo(1.975)
    expect(result.objects[0].rotationDeg).toBe(0)
    expect(objectInsideOutline(result.objects[0],map)).toBe(true)
    expect(result.guides).toHaveLength(1)
  })
  it('moves a multiple selection together and never targets its own members',()=>{
    const {map,object}=fixture(),first={...object,widthM:1},second={...first,id:'second',xM:4.4}
    map.objects=[first,second,{...first,id:'target',xM:5.47,yM:7}]
    const result=moveFarmEquipment([first,second],first,zero,map,options)!
    expect(result.objects[0].xM).toBeCloseTo(1.47)
    expect(result.objects[1].xM-result.objects[0].xM).toBeCloseTo(3)
    expect(result.objects[1].yM-result.objects[0].yM).toBe(0)
  })
  it('ignores hidden objects, hidden layers and sensor Nodes as alignment targets',()=>{
    const {map,object}=fixture()
    map.layers.push({id:'hidden',name:'Hidden',visible:false,locked:false,opacity:1})
    map.objects.push({...object,id:'hidden-object',visible:false,xM:3.47,yM:5},
      {...object,id:'hidden-layer',layerId:'hidden',xM:3.47,yM:6},
      {...object,id:'node',type:'sensor-node',xM:3.47,yM:7})
    const result=moveFarmEquipment([object],object,zero,map,options)!
    expect(result.objects[0]).toMatchObject({xM:1.5,yM:2.25})
    expect(result.guides).toEqual([])
  })
  it('keeps tolerance local, and allows fully free placement without changing mounting settings',()=>{
    const {map,object}=fixture()
    object.metadata.equipmentPlacement={mount:'wall',heightM:.6,offsetM:1.5}
    map.objects.push({...object,id:'target',xM:3.47,yM:5})
    const narrow=moveFarmEquipment([object],object,zero,map,{...options,toleranceM:.01})!
    expect(narrow.guides).toEqual([])
    const free=moveFarmEquipment([object],object,{xM:.013,yM:.017},map,{...options,grid:false,magnet:false})!
    expect(free.objects[0].xM).toBeCloseTo(1.413)
    expect(free.objects[0].yM).toBeCloseTo(2.217)
    expect(free.objects[0].metadata.equipmentPlacement).toEqual(object.metadata.equipmentPlacement)
    expect(free.guides).toEqual([])
  })
  it('honours concave outlines and snaps to an inner wall without crossing the cutout',()=>{
    const {map,object}=fixture()
    map.shape={type:'polygon',points:[{xM:0,yM:0},{xM:8,yM:0},{xM:8,yM:2},{xM:2,yM:2},{xM:2,yM:8},{xM:0,yM:8}]}
    const small={...object,xM:1.43,yM:4,widthM:.5,lengthM:.5}
    expect(moveFarmEquipment([small],small,zero,map,options)?.objects[0].xM).toBeCloseTo(1.5)
    expect(moveFarmEquipment([small],small,{xM:3,yM:0},map,options)).toBeNull()
  })
  it('rejects locked selections and invalid deltas',()=>{
    const {map,object}=fixture()
    expect(moveFarmEquipment([{...object,locked:true}],object,zero,map,options)).toBeNull()
    expect(moveFarmEquipment([object],object,{xM:NaN,yM:0},map,options)).toBeNull()
    map.layers=map.layers.map(l=>({...l,locked:true}))
    expect(moveFarmEquipment([object],object,zero,map,options)).toBeNull()
  })
  it('preserves the specialised wall attachment of doors and leaves Node heights unchanged',()=>{
    const {map}=fixture(),door=snapObjectToMapWall(newFarmObject('door',map),map,0)
    const moved=moveFarmEquipment([door],door,{xM:.4,yM:.02},map,options)!
    expect(validOutlineMount(moved.objects[0],map)).toBe(true)
    expect(moved.guides).toEqual([])
    const node={...newFarmObject('growing-table',map),type:'sensor-node' as const,xM:4,yM:4,metadata:{sensor:{installationHeightM:1.7,devEui:'test-node',sensors:[],status:'online' as const}}}
    const result=moveFarmEquipment([node],node,{xM:.3,yM:.2},map,options)!
    expect(result.objects[0].metadata).toEqual(node.metadata)
    expect(result.guides).toEqual([])
  })
})
