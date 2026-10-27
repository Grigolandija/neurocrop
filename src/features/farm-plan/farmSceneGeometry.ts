import { objectInsideOutline } from '../../../backend/area-map-outline.js'
import { equipmentMountCeiling,perimeterWallGeometry,wallSurfaceGeometry } from '../living-greenhouse/wallSurfaces'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { planToScene,type Vec3 } from '../living-greenhouse/sceneMath'
import { triangulateSitePolygon } from '../living-greenhouse/sitePlanEditing'
import { zoneBounds,type SitePoint } from '../living-greenhouse/siteDemoModel'
import { farmEditorMap,farmOpenings,type FarmMaps } from './farmLayoutData'
import type { FarmPlanDocument } from './farmPlanData'

type Wall={a:SitePoint;b:SitePoint;height:number;areaIds:string[]}
const distance=(a:SitePoint,b:SitePoint)=>Math.hypot(a.xM-b.xM,a.yM-b.yM)
const along=(a:SitePoint,b:SitePoint,p:SitePoint)=>((p.xM-a.xM)*(b.xM-a.xM)+(p.yM-a.yM)*(b.yM-a.yM))/distance(a,b)**2
const collinear=(a:SitePoint,b:SitePoint,p:SitePoint)=>Math.abs((b.xM-a.xM)*(p.yM-a.yM)-(b.yM-a.yM)*(p.xM-a.xM))/distance(a,b)<1e-6
const at=(a:SitePoint,b:SitePoint,t:number)=>({xM:a.xM+(b.xM-a.xM)*t,yM:a.yM+(b.yM-a.yM)*t})
const pointKey=(p:SitePoint)=>`${Math.round(p.xM*1e6)},${Math.round(p.yM*1e6)}`

/** Split partial contacts into common wall pieces, then render each physical piece once. */
export function farmWalls(plan:FarmPlanDocument,maps:FarmMaps={}):Wall[]{
  const raw=plan.areas.filter(a=>a.kind!=='zone').flatMap(area=>area.polygon.map((p,i)=>({a:p,b:area.polygon[(i+1)%area.polygon.length],height:area.height*(area.kind==='greenhouse' ? .68 : 1),areaIds:[area.id]})))
  const points=[...raw.flatMap(w=>[w.a,w.b]),...farmOpenings(plan,maps).flatMap(o=>[o.a,o.b])],unique=new Map<string,Wall>()
  for(const wall of raw){
    const cuts=[0,1,...points.filter(p=>collinear(wall.a,wall.b,p)).map(p=>along(wall.a,wall.b,p)).filter(t=>t>1e-7 && t<1-1e-7)].sort((a,b)=>a-b)
    for(let i=1;i<cuts.length;i++){
      if(cuts[i]-cuts[i-1]<1e-7)continue
      const a=at(wall.a,wall.b,cuts[i-1]),b=at(wall.a,wall.b,cuts[i]),key=[pointKey(a),pointKey(b)].sort().join(':')
      const old=unique.get(key)
      if(old){old.height=Math.max(old.height,wall.height);old.areaIds=[...new Set([...old.areaIds,...wall.areaIds])]}else unique.set(key,{a,b,height:wall.height,areaIds:[...wall.areaIds]})
    }
  }
  return [...unique.values()]
}

export type FarmSceneMesh={vertices:Float32Array;ranges:Array<{start:number;end:number;areaIds:string[];subdued?:boolean}>}

/** Retain ownership once, so hovering never rebuilds detailed equipment meshes. */
export function wholeFarmSceneMesh(plan:FarmPlanDocument,maps:FarmMaps={},areaColors:Record<string,Vec3>={}):FarmSceneMesh{
  const data:number[]=[],d=plan.dimensions,openings=farmOpenings(plan,maps)
  const ranges:FarmSceneMesh['ranges']=[],walls=farmWalls(plan,maps)
  const own=(areaIds:string[],subdued=false)=>{const previous=ranges.at(-1);if(previous)previous.end=data.length;ranges.push({start:data.length,end:data.length,areaIds,subdued})}
  const p=(a:SitePoint,h:number)=>planToScene(a.xM,a.yM,h,d)
  const tri=(a:Vec3,b:Vec3,c:Vec3,color:Vec3)=>{for(const point of [a,b,c])data.push(...point,...color)}
  const quad=(a:Vec3,b:Vec3,c:Vec3,e:Vec3,color:Vec3)=>{tri(a,b,c,color);tri(a,c,e,color)}
  const beam=(a:Vec3,b:Vec3,r:number,color:Vec3)=>{
    const delta=b.map((v,i)=>v-a[i]),len=Math.hypot(...delta);if(len<1e-8)return
    const u:Vec3=Math.abs(delta[1])/len>.95 ? [r,0,0] : [-delta[2]/Math.hypot(delta[0],delta[2])*r,0,delta[0]/Math.hypot(delta[0],delta[2])*r]
    const v:Vec3=[(delta[1]*u[2]-delta[2]*u[1])/len,(delta[2]*u[0]-delta[0]*u[2])/len,(delta[0]*u[1]-delta[1]*u[0])/len]
    const at=(center:Vec3,x:number,y:number)=>center.map((n,i)=>n+u[i]*x+v[i]*y) as Vec3
    for(const [x,y,nx,ny] of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]])quad(at(a,x,y),at(a,nx,ny),at(b,nx,ny),at(b,x,y),color)
  }
  for(const area of plan.areas){own([area.id]);for(const [a,b,c] of triangulateSitePolygon(area.polygon))tri(p(a,.01),p(b,.01),p(c,.01),areaColors[area.id] || (area.kind==='greenhouse' ? [.91,.935,.88] : [.95,.945,.91]))}
  for(const wall of walls){own(wall.areaIds);for(const value of perimeterWallGeometry([wall],openings,d))data.push(value)}
  const outlineCorners=new Set(plan.areas.filter(area=>area.kind!=='zone').flatMap(area=>area.polygon.map(pointKey)))
  const corners=new Map<string,{point:SitePoint;height:number;areaIds:string[]}>()
  for(const wall of walls){
    own(wall.areaIds)
    beam(p(wall.a,wall.height),p(wall.b,wall.height),.014,[.56,.64,.59])
    for(const a of [wall.a,wall.b]){
      if(!outlineCorners.has(pointKey(a)))continue
      const insideDoor=openings.some(o=>o.sill===0 && collinear(o.a,o.b,a) && along(o.a,o.b,a)>1e-6 && along(o.a,o.b,a)<1-1e-6)
      if(insideDoor)continue
      const key=pointKey(a),old=corners.get(key);corners.set(key,{point:a,height:Math.max(old?.height || 0,wall.height),areaIds:[...new Set([...(old?.areaIds || []),...wall.areaIds])]})
    }
  }
  for(const corner of corners.values()){own(corner.areaIds);beam(p(corner.point,0),p(corner.point,corner.height),.012,[.56,.64,.59])}
  for(const area of plan.areas){
    own([area.id])
    if(area.kind==='greenhouse'){
      const b=zoneBounds(area),count=Math.min(128,Math.max(2,Math.ceil((b.maxX-b.minX)/4))),h=area.height
      const roof=(y:number)=>h*(1-.32*Math.abs(y-(b.minY+b.maxY)/2)/((b.maxY-b.minY)/2))
      for(let i=0;i<=count;i++){
        const x=b.minX+(b.maxX-b.minX)*(i+.001)/(count+.002),cuts:number[]=[]
        area.polygon.forEach((a,j)=>{const q=area.polygon[(j+1)%area.polygon.length];if((a.xM<=x && q.xM>x)||(q.xM<=x && a.xM>x))cuts.push(a.yM+(x-a.xM)/(q.xM-a.xM)*(q.yM-a.yM))})
        cuts.sort((a,b)=>a-b)
        for(let j=0;j+1<cuts.length;j+=2){const low=cuts[j],high=cuts[j+1],ridge=Math.max(low,Math.min(high,(b.minY+b.maxY)/2));beam(p({xM:x,yM:low},roof(low)),p({xM:x,yM:ridge},roof(ridge)),.012,[.56,.64,.59]);beam(p({xM:x,yM:ridge},roof(ridge)),p({xM:x,yM:high},roof(high)),.012,[.56,.64,.59])}
      }
    }
    const map=farmEditorMap(plan,area.id,maps),origin=zoneBounds(area),visible=new Set(map.layers.filter(l=>l.visible).map(l=>l.id))
    for(const object of map.objects){
      if(!object.visible || !visible.has(object.layerId) || !objectInsideOutline(object,map))continue
      const opening=openings.find(o=>o.areaId===area.id && o.object.id===object.id)
      if(['door','window','ventilation-opening'].includes(object.type) && !opening)continue
      const shared=opening ? walls.filter(w=>collinear(opening.a,opening.b,w.a) && collinear(opening.a,opening.b,w.b) && along(opening.a,opening.b,at(w.a,w.b,.5))>=-1e-6 && along(opening.a,opening.b,at(w.a,w.b,.5))<=1+1e-6).flatMap(w=>w.areaIds) : []
      own(shared.length ? [...new Set(shared)] : [area.id],object.type==='lamp')
      const global={...object,xM:object.xM+origin.minX,yM:object.yM+origin.minY}
      if(object.type==='sensor-node'){
        const height=object.metadata.sensor?.installationHeightM,point={xM:global.xM+object.widthM/2,yM:global.yM+object.lengthM/2},center=p(point,typeof height==='number' ? height : .06),r=Math.max(.045,Math.min(.12,Math.max(d.widthM,d.lengthM)*.002))
        const top:Vec3=[center[0],center[1]+r,center[2]],bottom:Vec3=[center[0],center[1]-r,center[2]],ring:Vec3[]=[[center[0]-r,center[1],center[2]],[center[0],center[1],center[2]-r],[center[0]+r,center[1],center[2]],[center[0],center[1],center[2]+r]]
        const color:Vec3=typeof height==='number' ? [.12,.52,.37] : [.52,.57,.53]
        for(let i=0;i<4;i++){tri(top,ring[i],ring[(i+1)%4],color);tri(bottom,ring[(i+1)%4],ring[i],color)}continue
      }
      for(const value of objectGeometry(global,d,area.height,equipmentMountCeiling(object,map.dimensions,area.height,area.kind==='greenhouse' ? .32 : 0)))data.push(value)
    }
  }
  const last=ranges.at(-1);if(last)last.end=data.length
  return {vertices:new Float32Array(data),ranges:ranges.filter(r=>r.end>r.start)}
}

export function wholeFarmGeometry(plan:FarmPlanDocument,maps:FarmMaps={}){
  return wholeFarmSceneMesh(plan,maps).vertices
}

/** Keep the selected room and shared openings, with no invisible neighbours left in the scene. */
export function isolateFarmArea(mesh:FarmSceneMesh,areaId:string):FarmSceneMesh{
  const owned=mesh.ranges.filter(range=>range.areaIds.includes(areaId))
  const vertices=new Float32Array(owned.reduce((length,range)=>length+range.end-range.start,0))
  const ranges:FarmSceneMesh['ranges']=[]
  let offset=0
  for(const range of owned){
    const data=mesh.vertices.subarray(range.start,range.end)
    vertices.set(data,offset)
    ranges.push({...range,start:offset,end:offset+data.length})
    offset+=data.length
  }
  return {vertices,ranges}
}

/** Hover previews an Area; leaving it restores the persistent selection without moving the camera. */
export function farmSceneEmphasis(hoveredAreaId:string|null,monitoring:boolean,selectedAreaId?:string|null){
  return {areaId:hoveredAreaId || (monitoring ? selectedAreaId || null : null),opacity:hoveredAreaId && monitoring ? .20 : monitoring && selectedAreaId ? .30 : monitoring ? .25 : .40}
}

/** Shared walls and openings remain solid when either adjoining Area is highlighted. */
export function highlightFarmArea(mesh:FarmSceneMesh,areaId:string|null,subdueLights=false){
  const focused=areaId && mesh.ranges.some(r=>r.areaIds.includes(areaId)) ? areaId : null
  if(!focused && (!subdueLights || !mesh.ranges.some(r=>r.subdued)))return {vertices:mesh.vertices,surfaces:new Float32Array()}
  const solidRange=(range:FarmSceneMesh['ranges'][number])=>focused ? range.areaIds.includes(focused) : !range.subdued
  const solidLength=mesh.ranges.filter(solidRange).reduce((sum,r)=>sum+r.end-r.start,0)
  const vertices=new Float32Array(solidLength),surfaces=new Float32Array(mesh.vertices.length-solidLength)
  let solid=0,faded=0
  for(const range of mesh.ranges){
    const data=mesh.vertices.subarray(range.start,range.end)
    if(solidRange(range)){vertices.set(data,solid);solid+=data.length}else{surfaces.set(data,faded);faded+=data.length}
  }
  return {vertices,surfaces}
}

/** Shared wall contacts are tinted once, with the same openings as the solid models. */
export function wholeFarmSurfaces(plan:FarmPlanDocument,maps:FarmMaps={}){
  return wallSurfaceGeometry(farmWalls(plan,maps),farmOpenings(plan,maps),plan.dimensions)
}
