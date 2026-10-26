import type { SitePoint } from '../living-greenhouse/siteDemoModel'
import { editFarmArea, type FarmPlanArea, type FarmPlanDocument } from './farmPlanData'

export const GRID_METRES = .25
const clean = (n:number) => Math.round(n * 1e9) / 1e9
export const snapValue = (n:number, step=GRID_METRES) => clean(Math.round(n / step) * step)
export const wallLength = (a:SitePoint,b:SitePoint) => Math.hypot(b.xM-a.xM,b.yM-a.yM)
export const wallAngle = (a:SitePoint,b:SitePoint) => (Math.atan2(b.yM-a.yM,b.xM-a.xM)*180/Math.PI+360)%360

/** Corner movement is free-angle; only the optional Cartesian grid rounds coordinates. */
export function snapCorner(point:SitePoint,grid:boolean):SitePoint {
  return grid ? {xM:snapValue(point.xM),yM:snapValue(point.yM)} : point
}

/** Translate a wall perpendicular to itself, keeping its direction and both corners together. */
export function dragFarmWall(area:FarmPlanArea,index:number,start:SitePoint,point:SitePoint,grid:boolean):SitePoint[] {
  const a=area.polygon[index],b=area.polygon[(index+1)%area.polygon.length],length=wallLength(a,b)
  const nx=-(b.yM-a.yM)/length,ny=(b.xM-a.xM)/length
  const distance=(point.xM-start.xM)*nx+(point.yM-start.yM)*ny
  // Cardinal walls align with actual grid lines even when imported coordinates were off-grid.
  const offset=!grid ? distance : Math.abs(nx)>.999999 ? (snapValue(a.xM+nx*distance)-a.xM)/nx : Math.abs(ny)>.999999 ? (snapValue(a.yM+ny*distance)-a.yM)/ny : snapValue(distance)
  return area.polygon.map((p,i)=>i===index || i===(index+1)%area.polygon.length ? {xM:clean(p.xM+nx*offset),yM:clean(p.yM+ny*offset)} : p)
}

/** Anchor the wall start; move its end and intersect the next parallel wall with its neighbour. */
export function setFarmWallLength(plan:FarmPlanDocument,id:string,index:number,length:number) {
  const area=plan.areas.find(a=>a.id===id)
  if(!area || !Number.isInteger(index) || index<0 || index>=area.polygon.length)return {plan,error:'Erdvė nerasta.'}
  if(!Number.isFinite(length) || length<.1)return {plan,error:'Sienos ilgis turi būti bent 0,1 m.'}
  const polygon=area.polygon.map(p=>({...p})),n=polygon.length
  const a=polygon[index],b=polygon[(index+1)%n],c=polygon[(index+2)%n],d=polygon[(index+3)%n],oldLength=wallLength(a,b)
  const end={xM:clean(a.xM+(b.xM-a.xM)*length/oldLength),yM:clean(a.yM+(b.yM-a.yM)*length/oldLength)}
  if(n>3){
    const ux=c.xM-b.xM,uy=c.yM-b.yM,vx=d.xM-c.xM,vy=d.yM-c.yM,den=ux*vy-uy*vx
    if(Math.abs(den)>1e-8){
      const t=((c.xM-end.xM)*vy-(c.yM-end.yM)*vx)/den
      // Don't silently reverse an adjacent wall or swap the order of its corners.
      const intersection={xM:clean(end.xM+t*ux),yM:clean(end.yM+t*uy)}
      if(t<=1e-7 || (d.xM-intersection.xM)*vx+(d.yM-intersection.yM)*vy<=1e-7)return {plan,error:'Toks ilgis apverstų gretimą sieną. Pakeiskite kontūrą arba įveskite kitą ilgį.'}
      polygon[(index+2)%n]=intersection
    }
  }
  polygon[(index+1)%n]=end
  return editFarmArea(plan,id,{polygon})
}

export type DrawingView={x:number;y:number;width:number;height:number}
export function fitFarmDrawing(areas:FarmPlanArea[],aspect:number):DrawingView {
  const points=areas.flatMap(a=>a.polygon)
  const minX=points.length ? Math.min(...points.map(p=>p.xM)) : 0,minY=points.length ? Math.min(...points.map(p=>p.yM)) : 0
  const maxX=points.length ? Math.max(...points.map(p=>p.xM)) : 10,maxY=points.length ? Math.max(...points.map(p=>p.yM)) : 7
  const margin=Math.max(1,Math.max(maxX-minX,maxY-minY)*.16)
  const width=Math.max(maxX-minX+margin*2,(maxY-minY+margin*2)*aspect,4),height=width/aspect
  return {x:(minX+maxX-width)/2,y:(minY+maxY-height)/2,width,height}
}

/** Magnetic contact takes priority over the drafting grid, including imported off-grid walls. */
export function snapFarmAreaPosition(plan:FarmPlanDocument,id:string,x:number,y:number,tolerance:number){
  const area=plan.areas.find(a=>a.id===id)
  if(!area)return {xM:x,yM:y,snapped:false}
  const minX=Math.min(...area.polygon.map(p=>p.xM)),minY=Math.min(...area.polygon.map(p=>p.yM))
  const moved=area.polygon.map(p=>({xM:p.xM+x-minX,yM:p.yM+y-minY}))
  const candidates:Array<{dx:number;dy:number;distance:number}>=[]
  const add=(dx:number,dy:number)=>{const distance=Math.hypot(dx,dy);if(distance<=tolerance)candidates.push({dx,dy,distance})}
  for(const other of plan.areas.filter(a=>a.id!==id && a.kind!=='zone')){
    for(const p of moved)for(let j=0;j<other.polygon.length;j++){
      const a=other.polygon[j],b=other.polygon[(j+1)%other.polygon.length],dx=b.xM-a.xM,dy=b.yM-a.yM,len2=dx*dx+dy*dy
      add(a.xM-p.xM,a.yM-p.yM)
      const t=((p.xM-a.xM)*dx+(p.yM-a.yM)*dy)/len2
      if(t>=0 && t<=1)add(a.xM+t*dx-p.xM,a.yM+t*dy-p.yM)
    }
    for(const p of other.polygon)for(let j=0;j<moved.length;j++){
      const a=moved[j],b=moved[(j+1)%moved.length],dx=b.xM-a.xM,dy=b.yM-a.yM,t=((p.xM-a.xM)*dx+(p.yM-a.yM)*dy)/(dx*dx+dy*dy)
      if(t>=0 && t<=1)add(p.xM-a.xM-t*dx,p.yM-a.yM-t*dy)
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance)
  for(const c of candidates){const xM=clean(x+c.dx),yM=clean(y+c.dy);if(!editFarmArea(plan,id,{polygon:area.polygon.map(p=>({xM:p.xM+xM-minX,yM:p.yM+yM-minY}))}).error)return {xM,yM,snapped:true}}
  return {xM:x,yM:y,snapped:false}
}
