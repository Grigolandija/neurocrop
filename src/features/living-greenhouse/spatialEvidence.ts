import type { MetricKey, GreenhouseMap } from '../greenhouse-map/model'
import type { AreaMapContext } from '../greenhouse-map/services/areaMapRepository'
import type { measuredSensors } from './livingData'
import { segmentCrossesPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'

export type SensorReading = ReturnType<typeof measuredSensors>[number]
export type LivingView = 'points' | 'volume'
export function footprintHull(readings: SensorReading[]) {
  const points=readings.map(s=>({x:s.object.xM+s.object.widthM/2,z:s.object.yM+s.object.lengthM/2})).sort((a,b)=>a.x-b.x || a.z-b.z)
  const unique=points.filter((p,i)=>!i || Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>.02)
  const cross=(a:typeof points[number],b:typeof points[number],c:typeof points[number])=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)
  const half=(items:typeof points)=>{const result:typeof points=[];for(const p of items){while(result.length>=2 && cross(result.at(-2)!,result.at(-1)!,p)<=.001)result.pop();result.push(p)}return result}
  if(unique.length<3)return []
  const lower=half(unique),upper=half([...unique].reverse());lower.pop();upper.pop()
  const hull=[...lower,...upper]
  return hull.length>=3 ? hull : []
}
export function insideHull(x:number,z:number,hull:ReturnType<typeof footprintHull>) {
  if(hull.length<3)return false
  return hull.every((p,i)=>{const q=hull[(i+1)%hull.length];return (q.x-p.x)*(z-p.z)-(q.z-p.z)*(x-p.x)>=-1e-6})
}
export function verticalComparisons(readings:SensorReading[],map:GreenhouseMap) {
  const valid=readings.filter(s=>s.value!==null && s.heightM!==null)
  const pairs=[]
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++) {
    const a=valid[i],b=valid[j]
    if(Math.abs(a.heightM!-b.heightM!)<.5)continue
    if(a.object.metadata.sensor?.sectionId!==b.object.metadata.sensor?.sectionId)continue
    const distance=Math.hypot(a.object.xM+a.object.widthM/2-b.object.xM-b.object.widthM/2,a.object.yM+a.object.lengthM/2-b.object.yM-b.object.lengthM/2)
    if(distance>.5 || Math.abs(Date.parse(a.timestamp!)-Date.parse(b.timestamp!))>300000)continue
    // A partition separating nearby markers also prevents a vertical comparison.
    const barriers=map.objects.filter(o=>o.type==='partition')
    if(barriers.some(o=>{const angle=o.rotationDeg*Math.PI/180;const polygon=[[0,0],[o.widthM,0],[o.widthM,o.lengthM],[0,o.lengthM]].map(([x,y])=>({xM:o.xM+x*Math.cos(angle)-y*Math.sin(angle),yM:o.yM+x*Math.sin(angle)+y*Math.cos(angle)}));return segmentCrossesPolygon({xM:a.object.xM+a.object.widthM/2,yM:a.object.yM+a.object.lengthM/2},{xM:b.object.xM+b.object.widthM/2,yM:b.object.yM+b.object.lengthM/2},polygon)}))continue
    const upper=a.heightM!>b.heightM! ? a : b,lower=upper===a ? b : a
    pairs.push({upper,lower,delta:upper.value!-lower.value!,distance})
  }
  return pairs.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))
}
export function liveTarget(context:AreaMapContext,reading:SensorReading,metric:MetricKey) {
  const ids:Partial<Record<MetricKey,string>>={'air-temperature':'airTemp','relative-humidity':'humidity',vpd:'vpd',co2:'co2'}
  const section=context.sections.find(s=>s.id===reading.object.metadata.sensor?.sectionId)
  const target=context.profiles.find(p=>p.id===section?.cropProfile)?.metrics?.[ids[metric] || '']?.optimal
  return target?.length===2 && target.every(Number.isFinite) && target[0]<=target[1] ? target : null
}
