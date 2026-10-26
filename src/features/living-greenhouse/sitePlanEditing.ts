import { pointInPolygon, segmentsIntersect } from '../greenhouse-map/heatmap/rasterInterpolation'
import { createSitePlan, segmentInsideZone, SITE_SIZE, siteDimensions, zoneArea, zoneBounds, type SitePlan, type SitePoint, type SiteSensor, type SiteZone } from './siteDemoModel'

export type PlanLayer = 'buildings' | 'rooms' | 'zones'
export type PlanSelection = { layer: PlanLayer; id: string }
export const SITE_PLAN_KEY = 'neurocrop-site-plan-demo-v1'
const epsilon = 1e-7
const same = (a: SitePoint, b: SitePoint) => Math.hypot(a.xM-b.xM,a.yM-b.yM)<epsilon
const turn = (a: SitePoint,b: SitePoint,c: SitePoint) => (b.xM-a.xM)*(c.yM-a.yM)-(b.yM-a.yM)*(c.xM-a.xM)
const onEdge = (p:SitePoint,a:SitePoint,b:SitePoint) => Math.abs(turn(a,b,p))<epsilon && p.xM>=Math.min(a.xM,b.xM)-epsilon && p.xM<=Math.max(a.xM,b.xM)+epsilon && p.yM>=Math.min(a.yM,b.yM)-epsilon && p.yM<=Math.max(a.yM,b.yM)+epsilon

export function polygonError(polygon: SitePoint[],dimensions:{widthM:number;lengthM:number}=SITE_SIZE): string | null {
  if(polygon.length<3 || polygon.length>64)return 'Kontūrui reikia nuo 3 iki 64 taškų.'
  if(polygon.some(p=>!Number.isFinite(p.xM) || !Number.isFinite(p.yM) || p.xM<0 || p.xM>dimensions.widthM || p.yM<0 || p.yM>dimensions.lengthM))return `Kontūras turi tilpti į ${dimensions.widthM} × ${dimensions.lengthM} m planą.`
  for(let i=0;i<polygon.length;i++){
    if(same(polygon[i],polygon[(i+1)%polygon.length]))return 'Gretimi kontūro taškai negali sutapti.'
    for(let j=i+1;j<polygon.length;j++){
      if(j===i+1 || (i===0 && j===polygon.length-1))continue
      if(segmentsIntersect(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))return 'Kontūro kraštinės negali kirstis.'
    }
  }
  return zoneArea({polygon})<.25 ? 'Plotas turi būti bent 0,25 m².' : null
}

/** Ear clipping supports concave outlines and either drawing direction. */
export function triangulateSitePolygon(polygon: SitePoint[]): SitePoint[][] {
  const points=polygon.filter((p,i)=>Math.abs(turn(polygon[(i+polygon.length-1)%polygon.length],p,polygon[(i+1)%polygon.length]))>epsilon)
  const signed=points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.xM*q.yM-q.xM*p.yM},0)
  const remaining=points.map((_,i)=>i), triangles:SitePoint[][]=[]
  const direction=signed>0 ? 1 : -1
  for(let guard=0;remaining.length>3 && guard<4096;guard++){
    const ear=remaining.findIndex((index,i)=>{
      const a=points[remaining[(i+remaining.length-1)%remaining.length]],b=points[index],c=points[remaining[(i+1)%remaining.length]]
      if(turn(a,b,c)*direction<=epsilon)return false
      return !remaining.some(other=>other!==remaining[(i+remaining.length-1)%remaining.length] && other!==index && other!==remaining[(i+1)%remaining.length] && [turn(a,b,points[other]),turn(b,c,points[other]),turn(c,a,points[other])].every(t=>t*direction>=-epsilon))
    })
    if(ear<0)break
    triangles.push([points[remaining[(ear+remaining.length-1)%remaining.length]],points[remaining[ear]],points[remaining[(ear+1)%remaining.length]]])
    remaining.splice(ear,1)
  }
  if(remaining.length===3)triangles.push(remaining.map(i=>points[i]))
  return triangles
}

export function insideLabel(polygon: SitePoint[]): SitePoint {
  const triangles=triangulateSitePolygon(polygon).sort((a,b)=>zoneArea({polygon:b})-zoneArea({polygon:a}))
  const triangle=triangles[0]
  return triangle ? {xM:triangle.reduce((s,p)=>s+p.xM,0)/3,yM:triangle.reduce((s,p)=>s+p.yM,0)/3} : polygon[0]
}

export function containsPolygon(outer: SitePoint[],inner: SitePoint[]) {
  return inner.every((p,i)=>pointInPolygon(p,outer) && segmentInsideZone(p,inner[(i+1)%inner.length],outer))
}
export function polygonsOverlap(a: SitePoint[],b: SitePoint[]) {
  const strictInside=(p:SitePoint,polygon:SitePoint[])=>pointInPolygon(p,polygon) && !polygon.some((q,i)=>onEdge(p,q,polygon[(i+1)%polygon.length]))
  if(a.some(p=>strictInside(p,b)) || b.some(p=>strictInside(p,a)))return true
  for(const triangle of triangulateSitePolygon(a))if(strictInside(insideLabel(triangle),b))return true
  for(const triangle of triangulateSitePolygon(b))if(strictInside(insideLabel(triangle),a))return true
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(turn(a[i],a[(i+1)%a.length],b[j])*turn(a[i],a[(i+1)%a.length],b[(j+1)%b.length])<-epsilon && turn(b[j],b[(j+1)%b.length],a[i])*turn(b[j],b[(j+1)%b.length],a[(i+1)%a.length])<-epsilon)return true
  return false
}

export function validateSitePlan(plan:SitePlan):string | null {
  const dimensions=siteDimensions(plan)
  if(![dimensions.widthM,dimensions.lengthM].every(n=>Number.isFinite(n) && n>=1 && n<=10000))return 'Plano matmenys turi būti nuo 1 iki 10 000 m.'
  for(const [layer,entities] of Object.entries({buildings:plan.buildings,rooms:plan.rooms,zones:plan.zones})){
    if(entities.length>80)return 'Plane gali būti iki 80 kiekvieno tipo objektų.'
    const ids=new Set<string>()
    for(const item of entities){
      if(ids.has(item.id))return 'Objektų ID negali kartotis.'
      ids.add(item.id)
      if(!item.name.trim() || item.name.length>160)return 'Objektui reikia pavadinimo iki 160 simbolių.'
      const error=polygonError(item.polygon,dimensions)
      if(error)return error
      if(!Number.isFinite(item.height) || item.height<.5 || item.height>12)return 'Aukštis turi būti nuo 0,5 iki 12 m.'
      if(layer!=='buildings'){
        const entity=item as SitePlan['zones'][number]
        const building=plan.buildings.find(b=>b.id===entity.buildingId)
        if(!building || !containsPolygon(building.polygon,item.polygon))return 'Patalpa ir zona turi tilpti savo pastate.'
        if(layer==='rooms' && item.height>building.height)return 'Patalpos aukštis negali viršyti pastato.'
        if(entity.roomId){const room=plan.rooms.find(r=>r.id===entity.roomId && r.buildingId===entity.buildingId);if(!room || !containsPolygon(room.polygon,item.polygon))return 'Zona turi tilpti pasirinktoje patalpoje.'}
      }
    }
    if(layer!=='zones')for(let i=0;i<entities.length;i++)for(let j=i+1;j<entities.length;j++)if(polygonsOverlap(entities[i].polygon,entities[j].polygon))return layer==='rooms' ? 'Patalpos negali persidengti. Bendros sienos taškai juda kartu.' : 'Pastatai negali persidengti.'
  }
  return null
}

const matching = (a:SitePoint[],b:SitePoint[])=>a.length===b.length && a.every((p,i)=>same(p,b[i]))
const translate = (polygon:SitePoint[],dx:number,dy:number)=>polygon.map(p=>({xM:p.xM+dx,yM:p.yM+dy}))
function synchronizeZones(next:SitePlan,previous:SitePlan){
  for(const zone of next.zones){
    const before=previous.zones.find(z=>z.id===zone.id)
    if(!before)continue
    const parentBefore=before.roomId ? previous.rooms.find(r=>r.id===before.roomId) : previous.buildings.find(b=>b.id===before.buildingId)
    const parentAfter=zone.roomId ? next.rooms.find(r=>r.id===zone.roomId) : next.buildings.find(b=>b.id===zone.buildingId)
    if(parentBefore && parentAfter && matching(before.polygon,parentBefore.polygon))zone.polygon=structuredClone(parentAfter.polygon)
  }
}

/** Sensors are synthetic: keep values, and relocate only those left outside an edited outline. */
export function normalizeSitePlan(plan:SitePlan):SitePlan {
  const next=structuredClone(plan)
  next.rooms=next.rooms.map(room=>({...room,height:Math.min(room.height,next.buildings.find(b=>b.id===room.buildingId)?.height || room.height)}))
  next.zones=next.zones.map(zone=>{
    const room=next.rooms.find(r=>r.id===zone.roomId), building=next.buildings.find(b=>b.id===zone.buildingId)
    const height=room?.height || building?.height || zone.height
    const label=insideLabel(zone.polygon)
    const available=sampleSensorPoints(zone.polygon,Math.max(4,zone.sensors.length))
    return {...zone,height,kind:building?.greenhouse ? 'greenhouse' : 'room',label,sensors:zone.sensors.map((s,i)=>{
      const position=pointInPolygon(s,zone.polygon) ? s : available[i%available.length]
      const bounds=zoneBounds(building || zone)
      const localHeight=next.rooms.find(r=>r.buildingId===zone.buildingId && pointInPolygon(position,r.polygon))?.height || height
      const roof=building?.greenhouse ? building.height*(1-.32*Math.abs(position.yM-(bounds.minY+bounds.maxY)/2)/((bounds.maxY-bounds.minY)/2)) : localHeight
      return {...s,xM:position.xM,yM:position.yM,height:Math.max(.1,Math.min(s.height,localHeight-.1,roof-.1))}
    })}
  })
  return next
}

export function sampleSensorPoints(polygon:SitePoint[],count=4):SitePoint[]{
  const bounds=zoneBounds({polygon}), candidates:SitePoint[]=[]
  for(let y=0;y<12;y++)for(let x=0;x<12;x++){
    const p={xM:bounds.minX+(x+.5)/12*(bounds.maxX-bounds.minX),yM:bounds.minY+(y+.5)/12*(bounds.maxY-bounds.minY)}
    if(pointInPolygon(p,polygon))candidates.push(p)
  }
  if(!candidates.length)return [insideLabel(polygon)]
  const chosen=[candidates[Math.floor(candidates.length/2)]]
  while(chosen.length<Math.min(count,candidates.length)){
    const distance=(p:SitePoint)=>Math.min(...chosen.map(q=>(p.xM-q.xM)**2+(p.yM-q.yM)**2))
    chosen.push(candidates.reduce((best,p)=>distance(p)>distance(best) ? p : best,candidates[0]))
  }
  return chosen
}

export function editSitePolygon(plan:SitePlan,selection:PlanSelection,polygon:SitePoint[],vertexIndex?:number):{plan:SitePlan;error:string|null}{
  const next=structuredClone(plan), item=next[selection.layer].find(e=>e.id===selection.id), before=plan[selection.layer].find(e=>e.id===selection.id)
  if(!item || !before)return {plan,error:'Objektas nerastas.'}
  item.polygon=structuredClone(polygon)
  if(selection.layer==='rooms' && vertexIndex!==undefined && polygon.length===before.polygon.length){
    const old=before.polygon[vertexIndex], moved=polygon[vertexIndex], buildingId=(before as SitePlan['rooms'][number]).buildingId
    const junctions=plan.rooms.filter(r=>r.buildingId===buildingId).flatMap(r=>r.polygon)
    const shared=(points:SitePoint[])=>points.flatMap((p,i)=>{
      const q=points[(i+1)%points.length]
      const interior=junctions.filter(v=>onEdge(v,p,q) && !same(v,p) && !same(v,q)).filter((v,index,list)=>list.findIndex(other=>same(v,other))===index).sort((a,b)=>Math.hypot(a.xM-p.xM,a.yM-p.yM)-Math.hypot(b.xM-p.xM,b.yM-p.yM))
      return [p,...interior].map(v=>same(v,old) ? moved : v)
    })
    for(const room of next.rooms)if(room.buildingId===buildingId)room.polygon=shared(plan.rooms.find(r=>r.id===room.id)!.polygon)
    const building=next.buildings.find(b=>b.id===buildingId)
    if(building)building.polygon=shared(building.polygon)
  }
  synchronizeZones(next,plan)
  const error=validateSitePlan(next)
  return {plan:error ? plan : normalizeSitePlan(next),error}
}

export function moveSiteEntity(plan:SitePlan,selection:PlanSelection,dx:number,dy:number){
  const next=structuredClone(plan), entity=next[selection.layer].find(e=>e.id===selection.id)
  if(!entity)return {plan,error:'Objektas nerastas.'}
  entity.polygon=translate(entity.polygon,dx,dy)
  const movesZone=(zone:SiteZone)=>selection.layer==='zones' ? zone.id===selection.id : selection.layer==='rooms' ? zone.roomId===selection.id : zone.buildingId===selection.id
  if(selection.layer==='buildings')for(const room of next.rooms)if(room.buildingId===selection.id)room.polygon=translate(room.polygon,dx,dy)
  for(const zone of next.zones)if(movesZone(zone)){
    if(selection.layer!=='zones')zone.polygon=translate(zone.polygon,dx,dy)
    zone.sensors=zone.sensors.map(s=>({...s,xM:s.xM+dx,yM:s.yM+dy}))
  }
  const error=validateSitePlan(next)
  return {plan:error ? plan : normalizeSitePlan(next),error}
}

export function addSiteEntity(plan:SitePlan,layer:PlanLayer,polygon:SitePoint[],greenhouse=false,synthetic=true){
  const id=crypto.randomUUID(),next=structuredClone(plan)
  const error=polygonError(polygon,siteDimensions(plan))
  if(error)return {plan,error,id:null}
  if(layer==='buildings')next.buildings.push({id,name:`${greenhouse ? 'Šiltnamis' : 'Pastatas'} ${next.buildings.length+1}`,greenhouse,height:greenhouse ? 4.5 : 3.4,polygon})
  else {
    const building=next.buildings.find(b=>containsPolygon(b.polygon,polygon))
    if(!building)return {plan,error:'Pirmiausia nubrėžkite pastatą. Šį kontūrą braižykite jo viduje.',id:null}
    if(layer==='rooms')next.rooms.push({id,name:`Patalpa ${next.rooms.length+1}`,buildingId:building.id,height:building.height,polygon})
    else {
      const room=next.rooms.find(r=>r.buildingId===building.id && containsPolygon(r.polygon,polygon))
      const sensors:SiteSensor[]=synthetic ? sampleSensorPoints(polygon).map((p,i)=>({...p,id:`DEMO-${id.slice(0,4)}-${i+1}`,height:Math.min((room?.height || building.height)*.6,.8+i*.5),temperature:18+i*2.4,humidity:52+i*9,co2:480+i*160})) : []
      next.zones.push({id,name:`Zona ${next.zones.length+1}`,buildingId:building.id,roomId:room?.id,kind:building.greenhouse ? 'greenhouse' : 'room',height:room?.height || building.height,polygon,label:insideLabel(polygon),sensors})
    }
  }
  const invalid=validateSitePlan(next)
  return {plan:invalid ? plan : normalizeSitePlan(next),error:invalid,id:invalid ? null : id}
}

export function deleteSiteEntity(plan:SitePlan,selection:PlanSelection):SitePlan{
  const next=structuredClone(plan)
  if(selection.layer==='buildings'){next.buildings=next.buildings.filter(b=>b.id!==selection.id);next.rooms=next.rooms.filter(r=>r.buildingId!==selection.id);next.zones=next.zones.filter(z=>z.buildingId!==selection.id)}
  if(selection.layer==='rooms'){next.rooms=next.rooms.filter(r=>r.id!==selection.id);next.zones=next.zones.filter(z=>z.roomId!==selection.id)}
  if(selection.layer==='zones')next.zones=next.zones.filter(z=>z.id!==selection.id)
  return next
}

export function loadSitePlan():SitePlan {
  try {
    const raw=localStorage.getItem(SITE_PLAN_KEY)
    if(!raw)return createSitePlan()
    const value=JSON.parse(raw) as SitePlan
    if(value.version!==1 || !Array.isArray(value.buildings) || !Array.isArray(value.rooms) || !Array.isArray(value.zones))return createSitePlan()
    if([...value.buildings,...value.rooms,...value.zones].some(e=>typeof e.id!=='string' || typeof e.name!=='string' || !Array.isArray(e.polygon)))return createSitePlan()
    if(value.zones.some(z=>!Array.isArray(z.sensors) || z.sensors.length>50 || z.sensors.some(s=>typeof s.id!=='string' || ![s.xM,s.yM,s.height,s.temperature,s.humidity,s.co2].every(Number.isFinite))))return createSitePlan()
    return validateSitePlan(value) ? createSitePlan() : normalizeSitePlan(value)
  } catch { return createSitePlan() }
}
