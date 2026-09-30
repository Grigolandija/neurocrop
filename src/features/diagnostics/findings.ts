import type { DiagnosticReport } from './types'
export type Finding = DiagnosticReport['insights'][number]
export type FindingGroup = {id:string;name:string;sectionId:string;items:Finding[];score:number}
export function prioritizeFindings(report: DiagnosticReport): FindingGroup[] {
  const groups=new Map<string,FindingGroup>()
  const excursions=new Map<string,number>()
  for(const trace of report.traces||[])for(const point of trace.points){
    if(!point.target)continue
    const [lo,hi]=point.target,span=Math.max(hi-lo,0.01)
    const size=Math.max(0,lo-point.min,point.max-hi)/span
    const key=`${trace.sectionId}:${trace.metric}`
    excursions.set(key,Math.max(excursions.get(key)||0,Math.min(5,size)))
  }
  for(const finding of report.insights){
    if(finding.kind==='insufficient-data')continue
    const family=['humidity','vpd'].includes(finding.metric)?'air-moisture':finding.metric
    const id=`${finding.sectionId}:${family}`
    if(!groups.has(id))groups.set(id,{id,name:finding.name,sectionId:finding.sectionId,items:[],score:0})
    const group=groups.get(id)!
    if(!group.items.some(i=>i.metric===finding.metric&&i.kind===finding.kind))group.items.push(finding)
    const magnitude=finding.kind==='systematic-peer'?finding.peerOutsidePct||0:finding.outsideObservedPct||0
    // Transparent rule-based priority, not a predicted yield-loss score.
    const confidence=Math.min(1,Math.max(0,finding.coveragePct)/100)*(finding.estimatedContextPct>0?0.75:1)
    group.score=Math.max(group.score,((finding.severity==='high'?100:40)+10*(excursions.get(`${finding.sectionId}:${finding.metric}`)||0)+magnitude+Math.min(30,finding.recurringDays*3))*confidence)
  }
  return [...groups.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))
}
