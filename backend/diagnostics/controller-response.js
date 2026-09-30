import {valueFor,metricContext,maxHoldMs} from './engine.js';

// Descriptive before/after comparison, never a causal or efficiency claim.
export function controllerResponses(rows, events, {from,to}) {
  const series=new Map();
  for(const row of rows){if(!row.context?.sectionId)continue;const key=row.dev_eui;if(!series.has(key))series.set(key,[]);series.get(key).push(row);}
  for(const list of series.values())list.sort((a,b)=>+new Date(a.time)-+new Date(b.time));
  return events.slice(-100).map(event=>{
    const at=+new Date(event.occurred_at),window=30*60000,groups=new Map();
    for(const [node,list] of series)for(const metric of ['airTemp','humidity','vpd','co2']){
      for(let i=0;i<list.length;i++){
        const row=list[i],time=+new Date(row.time),value=valueFor(row,metric);
        if(time>at+window)break;
        if(time+maxHoldMs(row,metric)<at-window||value===null||!metricContext(row,metric).representative)continue;
        // A packet with missing values ends this interval conservatively.
        const end=Math.min(list[i+1]?+new Date(list[i+1].time):Infinity,time+maxHoldMs(row,metric),+new Date(to));
        const key=`${row.context.sectionId}:${metric}`;
        for(const [phase,lo,hi] of [['before',at-window,at],['after',at,at+window]]){
          const duration=Math.max(0,Math.min(end,hi)-Math.max(time,lo,+new Date(from)))/60000;
          if(!duration)continue;
          if(!groups.has(key))groups.set(key,{sectionId:row.context.sectionId,name:row.context.sectionName||row.context.sectionId,metric,beforeSum:0,afterSum:0,beforeMinutes:0,afterMinutes:0,nodes:new Set(),beforeNodes:new Set(),afterNodes:new Set()});
          const g=groups.get(key);g[phase+'Sum']+=value*duration;g[phase+'Minutes']+=duration;g.nodes.add(node);g[phase+'Nodes'].add(node);
        }
      }
    }
    return {eventId:event.id,occurredAt:event.occurred_at,source:event.source,channel:event.channel,windowMinutes:30,causality:'not-established',zones:[...groups.values()].map(g=>{
      const beforeCoveragePct=g.beforeMinutes/(30*g.nodes.size)*100,afterCoveragePct=g.afterMinutes/(30*g.nodes.size)*100;
      const before=g.beforeMinutes?g.beforeSum/g.beforeMinutes:null,after=g.afterMinutes?g.afterSum/g.afterMinutes:null;
      return {sectionId:g.sectionId,name:g.name,metric:g.metric,before,after,beforeCoveragePct,afterCoveragePct,delta:beforeCoveragePct>=50&&afterCoveragePct>=50&&g.beforeNodes.size===g.nodes.size&&g.afterNodes.size===g.nodes.size?after-before:null};
    })};
  });
}
