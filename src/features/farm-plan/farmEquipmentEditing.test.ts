import { describe,expect,it } from 'vitest'
import { objectFootprint,objectInsideOutline,validOutlineMount } from '../../../backend/area-map-outline.js'
import { snapObjectToMapWall } from '../greenhouse-map/geometry'
import { emptyFarmPlan } from './farmPlanData'
import { farmEditorMap,newFarmObject } from './farmLayoutData'
import { pasteFarmEquipment,resizeFarmEquipment,rotateFarmEquipment } from './farmEquipmentEditing'

function fixture(){
  const plan={...emptyFarmPlan(),areas:[{id:'a',name:'Room',kind:'room' as const,height:3,polygon:[{xM:0,yM:0},{xM:12,yM:0},{xM:12,yM:10},{xM:0,yM:10}]}]}
  const map=farmEditorMap(plan,'a',{})
  const object={...newFarmObject('growing-table',map),xM:4,yM:4,widthM:2,lengthM:1}
  map.objects=[object]
  return {map,object}
}

describe('equipment editing in the farm drawing',()=>{
  it('rotates around the centre through repeated quarter turns and normalizes angles',()=>{
    const {map,object}=fixture(),center=(o:typeof object)=>{const [a,,b]=objectFootprint(o);return [(a.xM+b.xM)/2,(a.yM+b.yM)/2]}
    let next=object
    for(const angle of [90,180,270,360,-35,725]){
      next=rotateFarmEquipment(next,angle,map)!
      expect(next).not.toBeNull()
      expect(center(next)[0]).toBeCloseTo(center(object)[0]);expect(center(next)[1]).toBeCloseTo(center(object)[1])
      expect(next.widthM).toBe(object.widthM);expect(next.lengthM).toBe(object.lengthM)
      expect(next.rotationDeg).toBeGreaterThanOrEqual(0);expect(next.rotationDeg).toBeLessThan(360)
    }
  })
  it('rejects rotation through the outline or of locked equipment, Nodes and wall-mounted openings',()=>{
    const {map,object}=fixture()
    expect(rotateFarmEquipment({...object,xM:0,yM:0,widthM:4,lengthM:1},90,map)).toBeNull()
    expect(rotateFarmEquipment({...object,locked:true},90,map)).toBeNull()
    expect(rotateFarmEquipment({...object,type:'sensor-node'},90,map)).toBeNull()
    expect(rotateFarmEquipment(newFarmObject('door',map),90,map)).toBeNull()
    expect(rotateFarmEquipment(object,NaN,map)).toBeNull()
    map.layers=map.layers.map(l=>l.id===object.layerId ? {...l,locked:true} : l)
    expect(rotateFarmEquipment(object,90,map)).toBeNull()
  })
  it('keeps the opposite corner fixed when resizing rotated equipment',()=>{
    const {map,object}=fixture()
    for(const rotationDeg of [0,35,90,180,275]){
      const original={...object,rotationDeg},angle=rotationDeg*Math.PI/180,delta={xM:-.6*Math.cos(angle)+.4*Math.sin(angle),yM:-.6*Math.sin(angle)-.4*Math.cos(angle)}
      const resized=resizeFarmEquipment(original,'sw',delta,map,false)!
      expect(resized.widthM).toBeCloseTo(2.6);expect(resized.lengthM).toBeCloseTo(1.4)
      const opposite=objectFootprint(original)[2],after=objectFootprint(resized)[2]
      expect(after.xM).toBeCloseTo(opposite.xM);expect(after.yM).toBeCloseTo(opposite.yM)
    }
  })
  it('snaps the moving edge without changing the other dimension or flipping the object',()=>{
    const {map,object}=fixture(),resized=resizeFarmEquipment(object,'e',{xM:.38,yM:2},map,true)!
    expect(resized).toMatchObject({xM:4,yM:4,widthM:2.5,lengthM:1})
    expect(resizeFarmEquipment(object,'w',{xM:10,yM:0},map,false)?.widthM).toBeCloseTo(.05)
    expect(resizeFarmEquipment(object,'e',{xM:20,yM:0},map,false)).toBeNull()
  })
  it('respects an L-shaped outline, object locks and layer locks',()=>{
    const {map,object}=fixture()
    map.shape={type:'polygon',points:[{xM:0,yM:0},{xM:8,yM:0},{xM:8,yM:2},{xM:2,yM:2},{xM:2,yM:8},{xM:0,yM:8}]}
    const narrow={...object,xM:.5,yM:3,widthM:1,lengthM:1}
    expect(resizeFarmEquipment(narrow,'e',{xM:1,yM:0},map,false)).toBeNull()
    expect(resizeFarmEquipment({...narrow,locked:true},'n',{xM:0,yM:.25},map,false)).toBeNull()
    map.layers=map.layers.map(l=>l.id===object.layerId ? {...l,locked:true} : l)
    expect(resizeFarmEquipment(narrow,'n',{xM:0,yM:.25},map,false)).toBeNull()
  })
  it('resizes a wall opening along its wall while preserving its opposite endpoint and door configuration',()=>{
    const {map}=fixture()
    for(const edgeIndex of [0,1,2,3]){
      const door=snapObjectToMapWall({...newFarmObject('door',map),xM:5,yM:4,widthM:1.5,lengthM:.2},map,edgeIndex)
      const angle=door.rotationDeg*Math.PI/180,resized=resizeFarmEquipment(door,'w',{xM:-.25*Math.cos(angle),yM:-.25*Math.sin(angle)},map,false)!
      expect(validOutlineMount(resized,map)).toBe(true);expect(objectInsideOutline(resized,map)).toBe(true)
      expect(resized.metadata.door).toEqual(door.metadata.door)
      expect(resized.widthM).toBeCloseTo(door.widthM+.25)
      expect(objectFootprint(resized)[1].xM).toBeCloseTo(objectFootprint(door)[1].xM)
      expect(objectFootprint(resized)[1].yM).toBeCloseTo(objectFootprint(door)[1].yM)
    }
  })
  it('pastes independent equipment copies with unique names, preserving settings and relative placement',()=>{
    const {map,object}=fixture()
    object.metadata={notes:'Keep settings',door:{type:'double',heightM:2.1}}
    const other={...object,id:'other',name:'Second rack',xM:7}
    const copies=pasteFarmEquipment([object,other],map)
    expect(copies).toHaveLength(2)
    expect(copies[0].id).not.toBe(object.id);expect(copies[1].xM-copies[0].xM).toBeCloseTo(3)
    expect(copies[0].metadata).toEqual(object.metadata)
    copies[0].metadata.door!.heightM=1
    expect(object.metadata.door!.heightM).toBe(2.1)
    map.objects.push(...copies)
    expect(pasteFarmEquipment([object],map)[0].name).toBe(`${object.name} copy 2`)
  })
  it('never clones Nodes, rejects equipment too large for the target, and remounts doors on target walls',()=>{
    const {map,object}=fixture()
    expect(pasteFarmEquipment([{...object,type:'sensor-node'}],map)).toEqual([])
    expect(pasteFarmEquipment([{...object,widthM:20}],map)).toEqual([])
    const door=newFarmObject('door',map),copies=pasteFarmEquipment([door],map)
    expect(copies).toHaveLength(1);expect(validOutlineMount(copies[0],map)).toBe(true)
    map.layers=map.layers.map(l=>l.id===object.layerId ? {...l,locked:true} : l)
    expect(pasteFarmEquipment([object],map)).toEqual([])
  })
})
