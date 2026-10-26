import { objectFootprint,objectInsideOutline,outlinePoints,validOutlineMount } from '../../../backend/area-map-outline.js'
import { doorConfiguration } from '../greenhouse-map/doorConfiguration'
import { isWallMountedType } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject } from '../greenhouse-map/model'
import { planToScene } from './sceneMath'
import type { SitePoint } from './siteDemoModel'

export type WallSurface={a:SitePoint;b:SitePoint;height:number;topA?:number;topB?:number}
export type WallOpening={a:SitePoint;b:SitePoint;sill:number;height:number}
export const WALL_OPACITY=.10

/** Back-to-front blending follows the camera without changing the saved geometry. */
export function sortWallSurfaces(mesh:Float32Array,matrix:Float32Array){
  const depth=(offset:number)=>{
    const x=(mesh[offset]+mesh[offset+6]+mesh[offset+12])/3,y=(mesh[offset+1]+mesh[offset+7]+mesh[offset+13])/3,z=(mesh[offset+2]+mesh[offset+8]+mesh[offset+14])/3
    return (matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])/(matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15] || 1)
  }
  const triangles=Array.from({length:mesh.length/18},(_,i)=>({offset:i*18,depth:depth(i*18)})).sort((a,b)=>b.depth-a.depth)
  const sorted=new Float32Array(mesh.length)
  triangles.forEach((triangle,i)=>sorted.set(mesh.subarray(triangle.offset,triangle.offset+18),i*18))
  return sorted
}

/** Openings cut the actual surface, rather than drawing glass across doors and windows. */
export function wallSurfaceGeometry(walls:WallSurface[],openings:WallOpening[],dimensions:GreenhouseMap['dimensions']){
  const data:number[]=[]
  for(const wall of walls){
    const dx=wall.b.xM-wall.a.xM,dy=wall.b.yM-wall.a.yM,length=Math.hypot(dx,dy)
    if(length<1e-6)continue
    const along=(p:SitePoint)=>((p.xM-wall.a.xM)*dx+(p.yM-wall.a.yM)*dy)/(length*length)
    const collinear=(p:SitePoint)=>Math.abs(dx*(p.yM-wall.a.yM)-dy*(p.xM-wall.a.xM))/length<1e-5
    const holes=openings.filter(o=>collinear(o.a) && collinear(o.b)).map(o=>({...o,from:Math.max(0,Math.min(along(o.a),along(o.b))),to:Math.min(1,Math.max(along(o.a),along(o.b)))})).filter(o=>o.to-o.from>1e-6)
    const cuts=[...new Set([0,1,...holes.flatMap(o=>[o.from,o.to])])].sort((a,b)=>a-b)
    const top=(t:number)=>(wall.topA ?? wall.height)*(1-t)+(wall.topB ?? wall.height)*t
    const point=(t:number,h:number)=>planToScene(wall.a.xM+dx*t,wall.a.yM+dy*t,h,dimensions)
    // A neutral material keeps climate colours authoritative.
    const color=[.61,.70,.65]
    const quad=(from:number,to:number,bottom:number,high:number)=>{
      const a=point(from,bottom),b=point(to,bottom),c=point(to,Math.min(high,top(to))),d=point(from,Math.min(high,top(from)))
      if(bottom>=Math.min(c[1],d[1])-1e-6)return
      for(const p of [a,b,c,a,c,d])data.push(...p,...color)
    }
    for(let i=1;i<cuts.length;i++){
      const from=cuts[i-1],to=cuts[i],mid=(from+to)/2,covered=holes.filter(o=>o.from<=mid && o.to>=mid).sort((a,b)=>a.sill-b.sill)
      let bottom=0
      for(const hole of covered){if(hole.sill>bottom)quad(from,to,bottom,hole.sill);bottom=Math.max(bottom,hole.sill+hole.height)}
      quad(from,to,bottom,Math.max(top(from),top(to)))
    }
  }
  return new Float32Array(data)
}

/** The lowest roof point over an equipment footprint is its usable mounting ceiling. */
export function equipmentMountCeiling(object:GreenhouseObject,dimensions:GreenhouseMap['dimensions'],height:number,roofSlope=0){
  return Math.min(...objectFootprint(object).map(p=>height*(1-roofSlope*Math.min(1,Math.abs(p.yM-dimensions.lengthM/2)/(dimensions.lengthM/2)))))
}

export function areaWallSurfaces(map:GreenhouseMap,height:number,roofSlope:number){
  if(map.farmPlanGeometry?.kind==='zone')return new Float32Array()
  const outline=outlinePoints(map),ridge=map.dimensions.lengthM/2,roof=(p:SitePoint)=>height*(1-roofSlope*Math.abs(p.yM-ridge)/ridge)
  const walls=outline.flatMap((a,i)=>{
    const b=outline[(i+1)%outline.length],t=(ridge-a.yM)/(b.yM-a.yM)
    const points=roofSlope && t>0 && t<1 ? [a,{xM:a.xM+(b.xM-a.xM)*t,yM:ridge},b] : [a,b]
    return points.slice(1).map((q,j)=>({a:points[j],b:q,height,topA:roof(points[j]),topB:roof(q)}))
  })
  const visible=new Set(map.layers.filter(l=>l.visible).map(l=>l.id))
  const openings=map.objects.filter(o=>o.visible && visible.has(o.layerId) && isWallMountedType(o.type) && objectInsideOutline(o,map) && validOutlineMount(o,map)).map(o=>{
    const [a,b]=objectFootprint(o)
    return {a,b,sill:o.type==='door' ? 0 : Math.min(1.15,height*.4),height:o.type==='door' ? doorConfiguration(o,height).heightM : Math.min(o.type==='window' ? .95 : .58,height*.32)}
  })
  return wallSurfaceGeometry(walls,openings,map.dimensions)
}
