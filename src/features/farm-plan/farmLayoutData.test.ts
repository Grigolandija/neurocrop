import { describe,expect,it } from 'vitest'
import { areaGeometry,validOutlineMount } from '../../../backend/area-map-outline.js'
import { rectangle } from '../living-greenhouse/siteDemoModel'
import { planToScene } from '../living-greenhouse/sceneMath'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { snapObjectToMapWall } from '../greenhouse-map/geometry'
import { emptyFarmPlan,editFarmArea,moveFarmArea,type FarmPlanDocument } from './farmPlanData'
import { farmEditorMap,newFarmObject,reconcileFarmMaps,farmOpenings,layoutSignature,invalidFarmObjects,storedFarmMap } from './farmLayoutData'
import { farmWalls,wholeFarmGeometry } from './farmSceneGeometry'
import { snapFarmAreaPosition } from './farmAreaGeometry'
const plan=():FarmPlanDocument=>({...emptyFarmPlan(),areas:[{id:'a',name:'Left',kind:'room',height:3,polygon:rectangle(10,20,8,6)},{id:'b',name:'Right',kind:'room',height:3,polygon:rectangle(18,20,5,6)}]})
const mapWithTable=(p=plan())=>{const m=farmEditorMap(p,'a',{});return {...m,objects:[newFarmObject('growing-table',m,{xM:1,yM:1})]}}

describe('one farm coordinate system',()=>{
  it('refreshes the canonical map height immediately while preserving equipment footprints and measured Node heights',()=>{
    const p=plan(),map=mapWithTable(p),node=newFarmObject('sensor-node',map,undefined,{devEui:'0011223344556677',status:'online',sensors:[],installationHeightM:1.5})
    map.objects.push(newFarmObject('lamp',map),newFarmObject('fan',map),node)
    const changed=editFarmArea(p,'a',{height:5}).plan,next=reconcileFarmMaps(p,changed,{a:map})
    expect(next.a.dimensions.heightM).toBe(5)
    expect(next.a.objects).toEqual(map.objects)
    expect(next.a.objects.at(-1)?.metadata.sensor?.installationHeightM).toBe(1.5)
    expect(map.dimensions.heightM).toBe(3)
  })
  it('creates empty real Area layouts without demo equipment or fabricated Nodes',()=>{
    const p=plan(),m=farmEditorMap(p,'a',{})
    expect(m.objects).toEqual([]);expect(m.areaId).toBe('a');expect(m.shape).toEqual({type:'polygon',points:areaGeometry(p,0,'a')!.polygon})
    expect(newFarmObject('fan',m).layerId).toBe('climate')
  })
  it('keeps local equipment coordinates during whole-Area moves, and world coordinates during wall edits',()=>{
    const p=plan(),maps={a:mapWithTable(p)},moved=moveFarmArea(p,'a',1,2).plan
    const translated=reconcileFarmMaps(p,moved,maps)
    expect(translated.a.objects).toEqual(maps.a.objects)
    const resized=editFarmArea(p,'a',{polygon:rectangle(9,20,9,6)}).plan,next=reconcileFarmMaps(p,resized,maps)
    expect(next.a.objects[0].xM).toBe(2)
    expect(9+next.a.objects[0].xM).toBe(10+maps.a.objects[0].xM)
    expect(maps.a.objects[0].xM).toBe(1)
  })
  it('preserves objects outside an edited contour for explicit repair instead of deleting or moving them',()=>{
    const p=plan(),map=mapWithTable(p),smaller=editFarmArea(p,'a',{polygon:rectangle(10,20,1,6)}).plan
    const maps=reconcileFarmMaps(p,smaller,{a:map})
    expect(maps.a.objects).toHaveLength(1);expect(maps.a.objects[0].xM).toBe(1)
    expect(invalidFarmObjects(smaller,maps).map(o=>o.id)).toEqual([map.objects[0].id])
  })
  it('remounts openings after inserting a contour vertex without following a different numbered wall',()=>{
    const p=plan(),m=farmEditorMap(p,'a',{})
    const door=snapObjectToMapWall(newFarmObject('door',m,{xM:7,yM:2}),m,1)
    const polygon=structuredClone(p.areas[0].polygon);polygon.splice(1,0,{xM:14,yM:20})
    const changed=editFarmArea(p,'a',{polygon}).plan,next=reconcileFarmMaps(p,changed,{a:{...m,objects:[door]}}).a
    expect(next.objects[0].metadata.wallMount?.edgeIndex).toBe(2)
    expect(validOutlineMount(next.objects[0],next)).toBe(true)
  })
  it('ignores live readings, height refreshes and root geometry in dirty comparisons, but tracks placement',()=>{
    const p=plan(),m=farmEditorMap(p,'a',{}),node=newFarmObject('sensor-node',m,undefined,{devEui:'0011223344556677',nodeId:'NSN-1',status:'online',sensors:[],installationHeightM:1.5})
    const original={...m,objects:[node]},live=structuredClone(original)
    live.objects[0].metadata.sensor!.installationHeightM=2
    live.objects[0].metadata.sensor!.measurements={airTemperatureC:25};live.dimensions.heightM=4
    expect(layoutSignature(live)).toBe(layoutSignature(original))
    expect(storedFarmMap(live).objects[0].metadata.sensor!.measurements).toBeUndefined()
    live.objects[0].xM+=.25;expect(layoutSignature(live)).not.toBe(layoutSignature(original))
  })
})

describe('magnetic Area contacts',()=>{
  it('snaps off-grid walls exactly together, taking priority over the 25 cm grid',()=>{
    const p=plan();p.areas[0].polygon=rectangle(1.13,1.13,8,6);p.areas[1].polygon=rectangle(20,1.13,5,6)
    const contact=snapFarmAreaPosition(p,'b',9.25,1.13,.2)
    expect(contact.snapped).toBe(true);expect(contact.xM).toBeCloseTo(9.13,8)
    expect(moveFarmArea(p,'b',contact.xM,contact.yM).error).toBeNull()
  })
  it('does not snap across large gaps or accept overlapping rooms',()=>{
    const p=plan(),noSnap=snapFarmAreaPosition(p,'b',30,20,.2)
    expect(noSnap.snapped).toBe(false)
    const overlap=snapFarmAreaPosition(p,'b',14,22,.2)
    expect(moveFarmArea(p,'b',overlap.xM,overlap.yM).error).not.toBeNull()
  })
})

describe('saved equipment in Whole farm',()=>{
  it('splits partial shared walls and renders each physical segment once',()=>{
    const p=plan();p.areas[1].polygon=rectangle(18,22,5,2)
    const walls=farmWalls(p),common=walls.filter(w=>w.areaIds.length===2)
    expect(common).toHaveLength(1)
    expect(common[0].a.xM).toBe(18);expect(common[0].b.xM).toBe(18)
    expect(Math.abs(common[0].b.yM-common[0].a.yM)).toBe(2)
    const keys=walls.map(w=>[w.a,w.b].map(p=>`${p.xM},${p.yM}`).sort().join(':'))
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('opens a shared wall from a door on either side, and deduplicates coincident door models',()=>{
    const p=plan(),a=farmEditorMap(p,'a',{}),b=farmEditorMap(p,'b',{})
    const left=snapObjectToMapWall(newFarmObject('door',a,{xM:7,yM:2}),a,1)
    const maps={a:{...a,objects:[left]}}
    const opening=farmOpenings(p,maps)[0]
    expect(opening.a.xM).toBe(18);expect(opening.b.xM).toBe(18)
    const shared=farmWalls(p,maps).filter(w=>w.areaIds.length===2)
    expect(shared).toHaveLength(3)
    const midpoint=(opening.a.yM+opening.b.yM)/2
    const right=snapObjectToMapWall(newFarmObject('door',b,{xM:0,yM:midpoint-20-.1}),b,3)
    // Place its centre at the exact same opening; orientation is reversed on this wall.
    const mounted=snapObjectToMapWall({...right,yM:midpoint-20+right.widthM/2},b,3)
    const both={...maps,b:{...b,objects:[mounted]}}
    expect(farmOpenings(p,both)).toHaveLength(1)
    expect(wholeFarmGeometry(p,both)).toEqual(wholeFarmGeometry(p,maps))
  })
  it('uses real object meshes at the Area world offset and respects hidden layers',()=>{
    const p=plan(),m=mapWithTable(p),empty=wholeFarmGeometry(p),withGear=wholeFarmGeometry(p,{a:m})
    const table=m.objects[0],mesh=objectGeometry({...table,xM:table.xM+10,yM:table.yM+20},p.dimensions,3)
    expect(withGear.length-empty.length).toBe(mesh.length)
    const tail=withGear.slice(-mesh.length)
    expect(tail).toEqual(mesh)
    expect(wholeFarmGeometry(p,{a:{...m,layers:m.layers.map(l=>({...l,visible:false}))}})).toEqual(empty)
  })
  it('places a Node at its recorded height as a single point without a support pole',()=>{
    const p=plan(),m=farmEditorMap(p,'a',{}),node=newFarmObject('sensor-node',m,{xM:2,yM:3},{devEui:'0011223344556677',status:'online',sensors:[],installationHeightM:2.5})
    const empty=wholeFarmGeometry(p),withNode=wholeFarmGeometry(p,{a:{...m,objects:[node]}})
    expect(withNode.length-empty.length).toBe(8*3*6)
    const point=planToScene(12+node.widthM/2,23+node.lengthM/2,2.5,p.dimensions)
    const ys=Array.from(withNode.slice(-8*3*6)).filter((_,i)=>i%6===1)
    expect(Math.min(...ys)).toBeGreaterThan(point[1]-.2);expect(Math.max(...ys)).toBeLessThan(point[1]+.2)
  })
  it('never adds a global ground plane or equipment to an empty farm',()=>expect(wholeFarmGeometry(emptyFarmPlan())).toHaveLength(0))
})
