import { objectFootprint } from '../../../backend/area-map-outline.js'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { equipmentVerticalBounds,supportsEquipmentPlacement } from './equipmentPlacement'
import { equipmentMountingSpace } from './equipmentPlacementModel'
import type { GreenhouseMap,GreenhouseObject } from './model'

export type EquipmentCollision={left:GreenhouseObject;right:GreenhouseObject;bottomM:number;topM:number}
type Volume={polygon:SitePoint[];bottom:number;top:number;minX:number;maxX:number;minY:number;maxY:number}
// Treat touching faces and sub-millimetre rounding differences as contact, not penetration.
const contactToleranceM=.001
const cache=new WeakMap<GreenhouseObject,{key:string;volume:Volume|null}>()

function volume(object:GreenhouseObject,map:GreenhouseMap):Volume|null{
  if(!supportsEquipmentPlacement(object))return null
  // Include physical dimensions and mounting in the key, including old layouts
  // without recorded heights. Visibility never removes an object from the room.
  const key=JSON.stringify([map.dimensions,map.shape.type,map.farmPlanGeometry?.kind,object.type,object.xM,object.yM,object.widthM,object.lengthM,object.rotationDeg,object.metadata.equipmentPlacement])
  const stored=cache.get(object)
  if(stored?.key===key)return stored.volume
  let result:Volume|null=null
  if([object.xM,object.yM,object.widthM,object.lengthM,object.rotationDeg].every(Number.isFinite) && object.widthM>0 && object.lengthM>0){
    const {roomHeight,ceiling}=equipmentMountingSpace(object,map)
    const bounds=equipmentVerticalBounds(objectGeometry(object.visible ? object : {...object,visible:true},map.dimensions,roomHeight,ceiling,{bodyOnly:true}))
    if(Number.isFinite(bounds.bottom+bounds.top) && bounds.top>bounds.bottom){
      const polygon=objectFootprint(object)
      result={polygon,...bounds,minX:Math.min(...polygon.map(p=>p.xM)),maxX:Math.max(...polygon.map(p=>p.xM)),minY:Math.min(...polygon.map(p=>p.yM)),maxY:Math.max(...polygon.map(p=>p.yM))}
    }
  }
  cache.set(object,{key,volume:result})
  return result
}

/** Separating-axis test uses the rotated footprints, rather than their bounding boxes. */
function footprintsOverlap(a:SitePoint[],b:SitePoint[]){
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q.xM-p.xM,q.yM-p.yM)
    if(length<1e-9)return false
    const nx=-(q.yM-p.yM)/length,ny=(q.xM-p.xM)/length
    const left=a.map(v=>v.xM*nx+v.yM*ny),right=b.map(v=>v.xM*nx+v.yM*ny)
    if(Math.min(Math.max(...left),Math.max(...right))-Math.max(Math.min(...left),Math.min(...right))<=contactToleranceM)return false
  }
  return true
}

/** Advisory occupied-envelope intersections, not a mesh/clearance simulation.
 * A lamp's XY footprint may cover a rack without either body's height overlapping.
 * Hidden/locked hardware still occupies space; Nodes and annotations do not. */
export function equipmentCollisions(map:GreenhouseMap):EquipmentCollision[]{
  const bodies=map.objects.flatMap(object=>{const body=volume(object,map);return body ? [{object,...body}] : []}).sort((a,b)=>a.minX-b.minX)
  const collisions:EquipmentCollision[]=[]
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j]
    if(b.minX>=a.maxX-contactToleranceM)break
    if(b.minY>=a.maxY-contactToleranceM || b.maxY<=a.minY+contactToleranceM)continue
    const bottomM=Math.max(a.bottom,b.bottom),topM=Math.min(a.top,b.top)
    if(topM-bottomM<=contactToleranceM || !footprintsOverlap(a.polygon,b.polygon))continue
    collisions.push({left:a.object,right:b.object,bottomM,topM})
  }
  return collisions
}
