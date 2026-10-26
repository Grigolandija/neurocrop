import { describe, expect, it } from 'vitest'
import { applyAreaGeometry, areaGeometry, insideOutline, objectFootprint, objectInsideOutline, outlinePoints, validOutlineMount } from '../../../backend/area-map-outline.js'
import { createAreaMap, mergeAreaMapContext } from './services/areaMapRepository'
import { normalizeMapGeometry } from './useMapEditor'
import { placeObjectInside, snapObjectToMapWall } from './geometry'
import { validateMap } from './services/mapRepository'
import { createMeasurementGrid } from './heatmap/createMeasurementGrid'
import { createVolumeGrid } from '../living-greenhouse/volumeGrid'
import { sceneGeometry } from '../living-greenhouse/sceneGeometry'
import { measuredSensors } from '../living-greenhouse/livingData'
import { triangulateSitePolygon } from '../living-greenhouse/sitePlanEditing'
import type { GreenhouseObject } from './model'

const points=[{xM:10,yM:20},{xM:18,yM:20},{xM:18,yM:22},{xM:13,yM:22},{xM:13,yM:26},{xM:10,yM:26}]
const plan={version:2,areas:[{id:'room',name:'L room',kind:'room',height:3,polygon:points}]}
const geometry=areaGeometry(plan,7,'room')!
const map=()=>createAreaMap({id:'room',name:'L room'},[],[],geometry)
const object=(type:GreenhouseObject['type']='rack'):GreenhouseObject=>({id:'equipment',type,name:'Rack',xM:1,yM:1,widthM:1,lengthM:.3,rotationDeg:0,layerId:'cultivation',visible:true,locked:false,metadata:{}})

describe('one authoritative Area outline',()=>{
  it('uses the same L outline and height in local metres, with stable IDs and no default rectangular room',()=>{
    const result=map()
    expect(result.dimensions).toEqual({widthM:8,lengthM:6,heightM:3})
    expect(result.shape).toEqual({type:'polygon',points:points.map(p=>({xM:p.xM-10,yM:p.yM-20}))})
    expect(result.farmPlanGeometry).toEqual({areaId:'room',revision:7,kind:'room'})
    expect(geometry.origin).toEqual({xM:10,yM:20})
    expect(validateMap(result).ok).toBe(true)
  })
  it('preserves placed equipment and marks geometry that no longer fits instead of silently relocating it',()=>{
    const old=map();old.objects=[{...object(),xM:6,yM:4}]
    const merged=mergeAreaMapContext(old,{id:'room',name:'L room'},[],[],geometry)
    expect(merged.objects[0]).toEqual(old.objects[0])
    expect(normalizeMapGeometry(merged).objects[0]).toEqual(old.objects[0])
    expect(validateMap(merged).ok).toBe(false)
    expect(objectInsideOutline(merged.objects[0],merged)).toBe(false)
    const moved={...merged,objects:[{...merged.objects[0],xM:1,yM:3}]}
    expect(validateMap(moved).ok).toBe(true)
  })
  it('places new objects within the actual room and rejects equipment that bridges its cut-out',()=>{
    const m=map(),placed=placeObjectInside({...object(),xM:6,yM:4},m)
    expect(objectInsideOutline(placed,m)).toBe(true)
    const bridge={...object(),xM:1,yM:4,widthM:5.8,lengthM:.2,rotationDeg:-35}
    expect(objectFootprint(bridge).every(p=>insideOutline(p,outlinePoints(m)))).toBe(true)
    expect(objectInsideOutline(bridge,m)).toBe(false)
  })
  it('mounts doors on every actual L-shaped wall, including inner walls, in either winding direction',()=>{
    for(const reverse of [false,true]){
      const m=map();if(m.shape.type==='polygon' && reverse)m.shape.points.reverse()
      outlinePoints(m).forEach((_,edge)=>{
        const door=snapObjectToMapWall({...object('door'),layerId:'structure'},m,edge)
        expect(door.metadata.wallMount?.edgeIndex).toBe(edge)
        expect(validOutlineMount(door,m)).toBe(true)
        expect(objectInsideOutline(door,m)).toBe(true)
        expect(validateMap({...m,objects:[door]}).ok).toBe(true)
      })
    }
  })
  it('does not accept imported malformed outlines or walls detached from their edge',()=>{
    const m=map(),door=snapObjectToMapWall({...object('door'),layerId:'structure'},m,3)
    expect(validateMap({...m,objects:[{...door,xM:door.xM+.4}]}).ok).toBe(false)
    expect(validateMap({...m,shape:{type:'polygon',points:[points[0],points[2],points[1],points[3]]}}).ok).toBe(false)
  })
  it('still remounts legacy rectangular-map doors when they are dragged toward a different wall',()=>{
    const m={...map(),shape:{type:'rectangle' as const}}
    const door={...object('door'),xM:7,yM:3,metadata:{wallMount:{wall:'south' as const,offsetM:1}}}
    expect(snapObjectToMapWall(door,m).metadata.wallMount?.wall).toBe('east')
  })
  it('clips both raster and volume heatmaps to the Area, leaving the L-shaped cut-out empty',()=>{
    const m=map(),now=Date.now()
    m.objects=[[.5,.5],[1,4],[6,.5]].map(([xM,yM],i)=>({...object('sensor-node'),id:String(i),xM,yM,widthM:.2,lengthM:.2,metadata:{sensor:{sensors:['temperature'],status:'online',installationHeightM:1.5,measurements:{airTemperatureC:20+i,measuredAt:new Date(now).toISOString()}}}}))
    const sensors=measuredSensors(m,'air-temperature',now),raster=createMeasurementGrid(sensors.map(s=>({id:s.object.id,xM:s.object.xM+.1,yM:s.object.yM+.1,value:s.value!,observedAtMs:now,status:'online'})),m,'air-temperature',{min:18,max:24},now)
    expect(raster.dataMask.some(Boolean)).toBe(true)
    const volume=createVolumeGrid(m,sensors,3,0)
    expect(volume.mask.some(Boolean)).toBe(true)
    for(let z=0;z<volume.depth;z++)for(let x=0;x<volume.width;x++){
      const p={xM:(x+.5)*8/volume.width,yM:(z+.5)*6/volume.depth}
      if(!insideOutline(p,outlinePoints(m)))for(let h=0;h<volume.layers;h++)expect(volume.mask[(h*volume.depth+z)*volume.width+x]).toBe(0)
    }
  })
  it('builds the 3D floor from the same concave outline with no rectangular plinth',()=>{
    const m=map(),result=sceneGeometry(m,'air-temperature',Date.now())
    const count=triangulateSitePolygon(outlinePoints(m)).length
    expect(count).toBe(4)
    for(let i=0;i<count;i++){
      const floor=Array.from({length:3},(_,j)=>({xM:result.vertices[(i*3+j)*6]+4,yM:3-result.vertices[(i*3+j)*6+2]}))
      expect(insideOutline({xM:floor.reduce((s,p)=>s+p.xM,0)/3,yM:floor.reduce((s,p)=>s+p.yM,0)/3},outlinePoints(m))).toBe(true)
    }
    expect(result.height).toBe(3)
    expect(applyAreaGeometry(m,geometry).objects).toBe(m.objects)
  })
})
