import { objectFootprint,objectInsideOutline,outlinePoints,validOutlineMount } from '../../../backend/area-map-outline.js'
import { isWallMountedType,snapObjectToMapWall } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject } from '../greenhouse-map/model'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'

export type EquipmentHandle='w'|'e'|'s'|'n'|'sw'|'se'|'ne'|'nw'
export const equipmentUnlocked=(object:GreenhouseObject,map:GreenhouseMap)=>!object.locked && !map.layers.some(l=>l.id===object.layerId && l.locked)
export const equipmentDuplicable=(object:GreenhouseObject)=>object.type!=='sensor-node' && object.type!=='section-zone'
export const equipmentRotatable=(object:GreenhouseObject)=>object.type!=='sensor-node' && !isWallMountedType(object.type)
const fits=(object:GreenhouseObject,map:GreenhouseMap)=>objectInsideOutline(object,map) && (!isWallMountedType(object.type) || validOutlineMount(object,map))

/** Rotate about the visible centre, not the saved lower-left placement origin. */
export function rotateFarmEquipment(object:GreenhouseObject,rotationDeg:number,map:GreenhouseMap):GreenhouseObject|null{
  if(!equipmentUnlocked(object,map) || !equipmentRotatable(object) || !Number.isFinite(rotationDeg))return null
  const before=object.rotationDeg*Math.PI/180,normalized=((rotationDeg%360)+360)%360,after=normalized*Math.PI/180
  const cx=object.xM+(object.widthM*Math.cos(before)-object.lengthM*Math.sin(before))/2
  const cy=object.yM+(object.widthM*Math.sin(before)+object.lengthM*Math.cos(before))/2
  const rotated={...object,rotationDeg:normalized,xM:cx-(object.widthM*Math.cos(after)-object.lengthM*Math.sin(after))/2,yM:cy-(object.widthM*Math.sin(after)+object.lengthM*Math.cos(after))/2}
  return fits(rotated,map) ? rotated : null
}

/** Resize in the object's own axes, keeping the opposite edge fixed, including on angled walls. */
export function resizeFarmEquipment(object:GreenhouseObject,handle:EquipmentHandle,delta:SitePoint,map:GreenhouseMap,snap:boolean):GreenhouseObject|null{
  if(!equipmentUnlocked(object,map) || object.type==='sensor-node' || !Number.isFinite(delta.xM+delta.yM))return null
  const angle=object.rotationDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
  const step=(n:number)=>snap ? Math.round(n/.25)*.25 : n
  const dx=delta.xM*c+delta.yM*s,dy=-delta.xM*s+delta.yM*c,mounted=isWallMountedType(object.type),minimum=mounted ? .1 : .05
  let left=handle.includes('w') ? Math.min(step(dx),object.widthM-minimum) : 0
  let right=handle.includes('e') ? Math.max(step(object.widthM+dx),minimum) : object.widthM
  const bottom=!mounted && handle.includes('s') ? Math.min(step(dy),object.lengthM-minimum) : 0
  const top=!mounted && handle.includes('n') ? Math.max(step(object.lengthM+dy),minimum) : object.lengthM
  let metadata=object.metadata
  if(mounted){
    if(handle!=='w' && handle!=='e')return null
    const points=outlinePoints(map),mount=object.metadata.wallMount,index=mount?.edgeIndex
    if(index===undefined || !points[index])return null
    const a=points[index],b=points[(index+1)%points.length],length=Math.hypot(b.xM-a.xM,b.yM-a.yM),offset=mount?.offsetM || 0
    left=Math.max(-offset,left);right=Math.min(length-offset,right)
    if(right-left<minimum-1e-8)return null
    metadata={...metadata,wallMount:{...mount,offsetM:offset+left}}
  }
  const resized={...object,xM:object.xM+left*c-bottom*s,yM:object.yM+left*s+bottom*c,widthM:Math.round((right-left)*1e9)/1e9,lengthM:Math.round((top-bottom)*1e9)/1e9,metadata}
  return fits(resized,map) ? resized : null
}

/** Duplicate equipment only. Real hardware identities and Section zones cannot be cloned. */
export function pasteFarmEquipment(source:GreenhouseObject[],map:GreenhouseMap):GreenhouseObject[]{
  const objects=source.filter(o=>equipmentDuplicable(o) && !map.layers.some(l=>l.id===o.layerId && l.locked))
  if(!objects.length)return []
  const footprint=objects.flatMap(objectFootprint),minX=Math.min(...footprint.map(p=>p.xM)),maxX=Math.max(...footprint.map(p=>p.xM)),minY=Math.min(...footprint.map(p=>p.yM)),maxY=Math.max(...footprint.map(p=>p.yM))
  const offset=Math.max(.25,map.gridSizeM),candidates=[{xM:offset,yM:offset},{xM:-offset,yM:-offset},{xM:offset,yM:-offset},{xM:-offset,yM:offset}]
  for(let y=0;y<=12;y++)for(let x=0;x<=12;x++)candidates.push({xM:(map.dimensions.widthM-(maxX-minX))*x/12-minX,yM:(map.dimensions.lengthM-(maxY-minY))*y/12-minY})
  let positioned:GreenhouseObject[]|undefined
  for(const delta of candidates){
    const next=objects.map(o=>{
      const candidate={...o,xM:o.xM+delta.xM,yM:o.yM+delta.yM}
      return isWallMountedType(o.type) ? snapObjectToMapWall(candidate,map) : candidate
    })
    if(next.every(o=>fits(o,map))){positioned=next;break}
  }
  if(!positioned)return []
  const names=new Set(map.objects.map(o=>o.name.toLocaleLowerCase()))
  return positioned.map(object=>{
    const base=object.name.replace(/ copy(?: \d+)?$/i,''),nameBase=`${base} copy`
    let name=nameBase,index=2
    while(names.has(name.toLocaleLowerCase()))name=`${nameBase} ${index++}`
    names.add(name.toLocaleLowerCase())
    return {...structuredClone(object),id:`${object.type}-${crypto.randomUUID()}`,name,locked:false,visible:true}
  })
}
