import { objectFootprint,objectInsideOutline,outlinePoints,validOutlineMount } from '../../../backend/area-map-outline.js'
import { isWallMountedType,snapObjectToMapWall } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject } from '../greenhouse-map/model'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'
import { equipmentUnlocked } from './farmEquipmentEditing'

export type EquipmentGuide={from:SitePoint;to:SitePoint}
type Candidate={delta:SitePoint;guides:EquipmentGuide[]}
const extent=(points:SitePoint[])=>({minX:Math.min(...points.map(p=>p.xM)),maxX:Math.max(...points.map(p=>p.xM)),minY:Math.min(...points.map(p=>p.yM)),maxY:Math.max(...points.map(p=>p.yM))})
const magnetic=(o:GreenhouseObject)=>!['sensor-node','section-zone','technical-zone','text-label','rectangle','walkway'].includes(o.type) && !isWallMountedType(o.type)

/** Translate a selection as a group. Magnetic alignment takes precedence over the grid;
 * every candidate is checked against the actual (possibly concave) room outline. */
export function moveFarmEquipment(objects:GreenhouseObject[],anchor:GreenhouseObject,delta:SitePoint,map:GreenhouseMap,options:{grid:boolean;magnet:boolean;toleranceM:number}):{objects:GreenhouseObject[];guides:EquipmentGuide[]}|null{
  if(!objects.length || !Number.isFinite(delta.xM+delta.yM) || objects.some(o=>!equipmentUnlocked(o,map)))return null
  const translate=(d:SitePoint)=>objects.map(o=>{
    const next={...o,xM:o.xM+d.xM,yM:o.yM+d.yM}
    return isWallMountedType(o.type) ? snapObjectToMapWall(next,map) : next
  })
  const fits=(next:GreenhouseObject[])=>next.every(o=>objectInsideOutline(o,map) && (!isWallMountedType(o.type) || validOutlineMount(o,map)))
  const grid={xM:options.grid ? Math.round((anchor.xM+delta.xM)/.25)*.25-anchor.xM : delta.xM,yM:options.grid ? Math.round((anchor.yM+delta.yM)/.25)*.25-anchor.yM : delta.yM}
  const candidates:Candidate[]=[]
  if(options.magnet && objects.every(magnetic)){
    const tolerance=Math.max(0,Math.min(.2,options.toleranceM)),moving=objects.flatMap(o=>objectFootprint({...o,xM:o.xM+delta.xM,yM:o.yM+delta.yM})),box=extent(moving)
    const ids=new Set(objects.map(o=>o.id)),visible=new Set(map.layers.filter(l=>l.visible).map(l=>l.id))
    const axes:{offset:number;guide:EquipmentGuide}[][]=[[],[]]
    for(const target of map.objects.filter(o=>!ids.has(o.id) && magnetic(o) && o.visible && visible.has(o.layerId))){
      const b=extent(objectFootprint(target))
      for(const [axis,source,values] of [
        [0,[box.minX,(box.minX+box.maxX)/2,box.maxX],[b.minX,(b.minX+b.maxX)/2,b.maxX]],
        [1,[box.minY,(box.minY+box.maxY)/2,box.maxY],[b.minY,(b.minY+b.maxY)/2,b.maxY]],
      ] as const){
        for(const s of source)for(const v of values){
          const offset=v-s
          if(Math.abs(offset)>tolerance)continue
          axes[axis].push({offset,guide:axis===0 ? {from:{xM:v,yM:Math.min(box.minY,b.minY)},to:{xM:v,yM:Math.max(box.maxY,b.maxY)}} : {from:{xM:Math.min(box.minX,b.minX),yM:v},to:{xM:Math.max(box.maxX,b.maxX),yM:v}}})
        }
      }
    }
    // Walls contribute their complete segments, including angled walls. Move the
    // supporting footprint edge/vertex onto the wall without changing rotation.
    const polygon=outlinePoints(map)
    for(let i=0;i<polygon.length;i++){
      const from=polygon[i],to=polygon[(i+1)%polygon.length],dx=to.xM-from.xM,dy=to.yM-from.yM,length=Math.hypot(dx,dy)
      if(length<1e-8)continue
      const tx=dx/length,ty=dy/length,nx=-ty,ny=tx
      const along=moving.map(p=>(p.xM-from.xM)*tx+(p.yM-from.yM)*ty)
      if(Math.min(...along)<-tolerance || Math.max(...along)>length+tolerance)continue
      const distances=moving.map(p=>(p.xM-from.xM)*nx+(p.yM-from.yM)*ny)
      for(const distance of [Math.min(...distances),Math.max(...distances)]){
        if(Math.abs(distance)>tolerance)continue
        const guide={from,to},offsetX=-distance*nx,offsetY=-distance*ny
        if(Math.abs(tx)<1e-8)axes[0].push({offset:offsetX,guide})
        else if(Math.abs(ty)<1e-8)axes[1].push({offset:offsetY,guide})
        else candidates.push({delta:{xM:delta.xM+offsetX,yM:delta.yM+offsetY},guides:[guide]})
      }
    }
    const choices=axes.map((values,axis)=>[
      ...values.sort((a,b)=>Math.abs(a.offset)-Math.abs(b.offset)).filter((v,i,all)=>all.findIndex(other=>Math.abs(other.offset-v.offset)<1e-8)===i).slice(0,6).map(v=>({offset:v.offset,guide:v.guide as EquipmentGuide|undefined})),
      {offset:(axis===0 ? grid.xM-delta.xM : grid.yM-delta.yM),guide:undefined},
    ])
    for(const x of choices[0])for(const y of choices[1])if(x.guide || y.guide)candidates.push({delta:{xM:delta.xM+x.offset,yM:delta.yM+y.offset},guides:[x.guide,y.guide].filter((g):g is EquipmentGuide=>!!g)})
    candidates.sort((a,b)=>b.guides.length-a.guides.length || Math.hypot(a.delta.xM-delta.xM,a.delta.yM-delta.yM)-Math.hypot(b.delta.xM-delta.xM,b.delta.yM-delta.yM))
  }
  candidates.push({delta:grid,guides:[]})
  // Near an outline the grid can round outside even though the pointer is inside.
  candidates.push({delta,guides:[]})
  for(const candidate of candidates){const next=translate(candidate.delta);if(fits(next))return {objects:next,guides:candidate.guides}}
  return null
}
