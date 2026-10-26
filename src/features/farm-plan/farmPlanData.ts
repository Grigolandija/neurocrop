import { neurocropApi } from '../../services/api/neurocropApi'
import { insideLabel, polygonError, polygonsOverlap } from '../living-greenhouse/sitePlanEditing'
import { rectangle, zoneBounds, type SitePlan, type SitePoint } from '../living-greenhouse/siteDemoModel'

export type FarmAreaKind='greenhouse'|'room'|'zone'
export type FarmPlanArea={id:string;name:string;kind:FarmAreaKind;height:number;polygon:SitePoint[]}
export type FarmPlanDocument={version:2;name:string;dimensions:{widthM:number;lengthM:number};areas:FarmPlanArea[]}
export type FarmArea={id:string;name:string;kind?:string;mapEnabled:boolean;mapConfigured:boolean;sectionCount?:number;nodeCount?:number}
export type FarmPlanContext={draftScope:string;plan:FarmPlanDocument;revision:number;updatedAt:string|null;areas:FarmArea[];permissions:{canEdit:boolean};capabilities?:{areaAuthoring:boolean}}
export type FarmPlanSaved=Pick<FarmPlanContext,'plan'|'revision'|'updatedAt'|'areas'>

export const emptyFarmPlan=():FarmPlanDocument=>({version:2,name:'',dimensions:{widthM:50,lengthM:34},areas:[]})

/** Only the Area itself is persisted: no separate building or zone to link. */
export function farmPlanDocument(plan:FarmPlanDocument):FarmPlanDocument{
  return {version:2,name:plan.name.trim(),dimensions:{widthM:plan.dimensions.widthM,lengthM:plan.dimensions.lengthM},areas:plan.areas.map(({id,name,kind,height,polygon})=>({id,name:name.trim(),kind,height,polygon:polygon.map(({xM,yM})=>({xM,yM}))}))}
}
export const farmPlanSignature=(plan:FarmPlanDocument)=>JSON.stringify(farmPlanDocument(plan))

export function validateFarmAreaPlan(plan:FarmPlanDocument):string|null{
  if(plan.version!==2 || ![plan.dimensions.widthM,plan.dimensions.lengthM].every(n=>Number.isFinite(n) && n>=1 && n<=10000))return 'Plano matmenys turi būti nuo 1 iki 10 000 m.'
  if(typeof plan.name!=='string' || plan.name.length>120)return 'Ūkio pavadinimas gali būti iki 120 simbolių.'
  if(plan.areas.length>80)return 'Plane gali būti iki 80 erdvių.'
  const ids=new Set<string>()
  for(const area of plan.areas){
    if(!area.id || ids.has(area.id))return 'Erdvių ID negali kartotis.'
    ids.add(area.id)
    if(!area.name.trim() || area.name.length>120)return 'Erdvei reikia pavadinimo iki 120 simbolių.'
    if(!['greenhouse','room','zone'].includes(area.kind))return 'Pasirinkite erdvės tipą.'
    if(!Number.isFinite(area.height) || area.height<.5 || area.height>12)return 'Aukštis turi būti nuo 0,5 iki 12 m.'
    const error=polygonError(area.polygon,plan.dimensions)
    if(error)return error
  }
  for(let i=0;i<plan.areas.length;i++)for(let j=i+1;j<plan.areas.length;j++){
    const a=plan.areas[i],b=plan.areas[j]
    if(a.kind!=='zone' && b.kind!=='zone' && polygonsOverlap(a.polygon,b.polygon))return 'Patalpos ir šiltnamiai negali persidengti.'
  }
  return null
}

export function editableFarmPlan(input:unknown):FarmPlanDocument{
  const value=input as FarmPlanDocument
  let plan:FarmPlanDocument
  if(value?.version===2)plan=farmPlanDocument(value)
  else {
    // Reading an older saved plan preserves linked Area identities; new work uses v2.
    const old=input as SitePlan
    if(old?.version!==1 || !Array.isArray(old.zones))throw new Error('Unsupported farm plan')
    plan={...emptyFarmPlan(),dimensions:old.dimensions || {widthM:50,lengthM:34},areas:old.zones.filter(z=>z.areaId).map(z=>({id:z.areaId!,name:z.name,kind:z.kind,height:z.height,polygon:z.polygon}))}
  }
  const error=validateFarmAreaPlan(plan)
  if(error)throw new Error(error)
  return plan
}

/** The rendering adapter contains no fabricated sensors or equipment. */
export function farmPlanScene(plan:FarmPlanDocument):SitePlan{
  return {version:1,dimensions:plan.dimensions,rooms:[],buildings:plan.areas.map(a=>({id:a.id,name:a.name,height:a.height,greenhouse:a.kind==='greenhouse',open:a.kind==='zone',polygon:a.polygon})),zones:plan.areas.map(a=>({id:a.id,areaId:a.id,name:a.name,buildingId:a.id,kind:a.kind==='greenhouse' ? 'greenhouse' : 'room',height:a.height,polygon:a.polygon,label:insideLabel(a.polygon),sensors:[]}))}
}

export function insertFarmArea(plan:FarmPlanDocument,inEnglish=false):{plan:FarmPlanDocument;id:string}{
  if(plan.areas.length>=80)throw new Error('Plane gali būti iki 80 erdvių.')
  const width=Math.max(.5,Math.min(8,plan.dimensions.widthM-2)),depth=Math.max(.5,Math.min(5,plan.dimensions.lengthM-2))
  const margin=Math.min(1,plan.dimensions.widthM/10,plan.dimensions.lengthM/10)
  const fits=(x:number,y:number)=>!plan.areas.some(a=>{const b=zoneBounds(a);return x+width+.5>b.minX && x-.5<b.maxX && y+depth+.5>b.minY && y-.5<b.maxY})
  let position:SitePoint|null=null
  for(let y=margin;y+depth<=plan.dimensions.lengthM-margin && !position;y+=depth+1)for(let x=margin;x+width<=plan.dimensions.widthM-margin;x+=width+1)if(fits(x,y)){position={xM:x,yM:y};break}
  const next=structuredClone(plan)
  if(!position){position={xM:Math.max(margin,...plan.areas.map(a=>zoneBounds(a).maxX+1)),yM:margin};next.dimensions.widthM=Math.max(next.dimensions.widthM,position.xM+width+margin);next.dimensions.lengthM=Math.max(next.dimensions.lengthM,depth+margin*2)}
  const id=crypto.randomUUID()
  let number=plan.areas.length+1
  while(plan.areas.some(area=>area.name===`Area ${number}`))number++
  next.areas.push({id,name:`Area ${number}`,kind:'room',height:3,polygon:rectangle(position.xM,position.yM,width,depth)})
  const error=validateFarmAreaPlan(next)
  if(error)throw new Error(inEnglish ? 'There is no room for another Area within the plan limits.' : error)
  return {plan:next,id}
}

export function editFarmArea(plan:FarmPlanDocument,id:string,change:Partial<Omit<FarmPlanArea,'id'>>):{plan:FarmPlanDocument;error:string|null}{
  const next=structuredClone(plan),area=next.areas.find(a=>a.id===id)
  if(!area)return {plan,error:'Erdvė nerasta.'}
  Object.assign(area,change)
  const error=validateFarmAreaPlan(next)
  return {plan:error ? plan : next,error}
}
export function resizeFarmArea(plan:FarmPlanDocument,id:string,width:number,length:number){
  const area=plan.areas.find(a=>a.id===id)
  if(!area)return {plan,error:'Erdvė nerasta.'}
  if(![width,length].every(n=>Number.isFinite(n) && n>0))return {plan,error:'Matmenys turi būti didesni už nulį.'}
  const b=zoneBounds(area),polygon=area.polygon.map(p=>({xM:b.minX+(p.xM-b.minX)*width/(b.maxX-b.minX),yM:b.minY+(p.yM-b.minY)*length/(b.maxY-b.minY)}))
  return editFarmArea(plan,id,{polygon})
}
export function moveFarmArea(plan:FarmPlanDocument,id:string,x:number,y:number){
  const area=plan.areas.find(a=>a.id===id)
  if(!area)return {plan,error:'Erdvė nerasta.'}
  const b=zoneBounds(area)
  return editFarmArea(plan,id,{polygon:area.polygon.map(p=>({xM:p.xM+x-b.minX,yM:p.yM+y-b.minY}))})
}
export const farmPlanRepository={
  load:async()=>{
    const context=await neurocropApi.getFarmPlan() as FarmPlanContext
    return {...context,plan:editableFarmPlan(context.plan)}
  },
  save:async(plan:FarmPlanDocument,expectedRevision:number)=>await neurocropApi.saveFarmPlan({plan:farmPlanDocument(plan),expectedRevision}) as FarmPlanSaved,
}
