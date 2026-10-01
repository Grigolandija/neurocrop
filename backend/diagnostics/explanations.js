import {METRICS, SPREAD_LIMITS, maxHoldMs, median, metricContext, validRange, valueFor} from './engine.js';

// Explanations use bounded intervals from raw readings, never sums across nodes.
export function explainDiagnostics(rows, report) {
  const from=+new Date(report.from),to=+new Date(report.to),middle=(from+to)/2;
  const wanted=new Set(report.insights.filter(i=>i.kind!=='insufficient-data').map(i=>`${i.sectionId}:${i.metric}`));
  const byNode=new Map();
  for(const row of rows)if(row.context?.sectionId){if(!byNode.has(row.dev_eui))byNode.set(row.dev_eui,[]);byNode.get(row.dev_eui).push(row);}
  for(const list of byNode.values())list.sort((a,b)=>+new Date(a.time)-+new Date(b.time));
  const clock=new Intl.DateTimeFormat('en-CA',{timeZone:report.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const clocks=new Map();
  const local=time=>{const key=Math.floor(time/60000);if(!clocks.has(key)){const p=Object.fromEntries(clock.formatToParts(new Date(time)).map(p=>[p.type,p.value]));clocks.set(key,{day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)});}return clocks.get(key);};
  const output=[];
  for(const [nodeId,list] of byNode){
    const contextEnd=new Map();let boundary=to;
    for(let i=list.length-1;i>=0;i--){if(list[i+1]&&(list[i+1].diagnostic_context_id!==list[i].diagnostic_context_id||list[i+1].context.sectionId!==list[i].context.sectionId))boundary=+new Date(list[i+1].time);contextEnd.set(list[i],boundary);}
    for(const metric of METRICS){
      if(!list.some(r=>wanted.has(`${r.context.sectionId}:${metric}`)))continue;
      const valid=list.filter(r=>valueFor(r,metric)!==null),sections=new Map();
      for(let i=0;i<valid.length;i++){
        const row=valid[i],ctx=metricContext(row,metric),sectionId=row.context.sectionId,value=valueFor(row,metric);
        if(!wanted.has(`${sectionId}:${metric}`)||!ctx.representative||!validRange(ctx.target))continue;
        const lo=Math.max(from,+new Date(row.time)),hi=Math.min(to,+new Date(row.time)+maxHoldMs(row,metric),contextEnd.get(row),valid[i+1]?+new Date(valid[i+1].time):to);
        if(hi<=lo)continue;
        if(!sections.has(sectionId))sections.set(sectionId,{nodeId,nodeName:row.context.nodeName||nodeId,sectionId,metric,observedMinutes:0,estimatedMinutes:0,targets:new Set(),halves:[{observed:0,outside:0},{observed:0,outside:0}],directions:{below:{events:[],hours:Array(24).fill(0),days:new Set(),minutes:0,peak:null},above:{events:[],hours:Array(24).fill(0),days:new Set(),minutes:0,peak:null}},related:{}});
        const s=sections.get(sectionId),duration=(hi-lo)/60000,direction=value<ctx.target[0]?'below':value>ctx.target[1]?'above':null;
        s.targets.add(JSON.stringify(ctx.target));s.observedMinutes+=duration;if(ctx.estimated)s.estimatedMinutes+=duration;
        [[from,middle],[middle,to]].forEach(([a,b],idx)=>{const minutes=Math.max(0,Math.min(hi,b)-Math.max(lo,a))/60000;s.halves[idx].observed+=minutes;if(direction)s.halves[idx].outside+=minutes;});
        for(const relatedMetric of ['airTemp','humidity','vpd','co2']){
          if(relatedMetric===metric)continue;const relatedValue=valueFor(row,relatedMetric);if(relatedValue===null||!metricContext(row,relatedMetric).representative)continue;
          s.related[relatedMetric]||={duringSum:0,duringMinutes:0,otherwiseSum:0,otherwiseMinutes:0};const r=s.related[relatedMetric],phase=direction?'during':'otherwise';const overlap=Math.max(0,Math.min(hi,+new Date(row.time)+maxHoldMs(row,relatedMetric))-lo)/60000;r[phase+'Sum']+=relatedValue*overlap;r[phase+'Minutes']+=overlap;
        }
        if(!direction)continue;
        const d=s.directions[direction],limit=ctx.target[direction==='below'?0:1],departure=Math.abs(value-limit);d.minutes+=duration;
        if(!d.peak||departure>d.peak.departure)d.peak={at:new Date(lo).toISOString(),value,limit,departure,areaId:row.context.areaId};
        const previous=d.events.at(-1),key=JSON.stringify([row.diagnostic_context_id,ctx.target]);
        if(previous&&previous.end===lo&&previous.key===key)previous.end=hi;else d.events.push({start:lo,end:hi,key});
        for(let cursor=lo;cursor<hi;){const c=local(cursor),end=Math.min(hi,cursor+(60-c.minute)*60000-cursor%60000);d.hours[c.hour]+=(end-cursor)/60000;d.days.add(c.day);cursor=end;}
      }
      for(const s of sections.values()){
        const directions={};
        for(const [direction,d] of Object.entries(s.directions)){
          if(!d.peak)continue;
          const at=+new Date(d.peak.at),peers=[];
          for(const [otherId,otherRows] of byNode){
            if(otherId===nodeId)continue;
            let left=0,right=otherRows.length;while(left<right){const mid=Math.floor((left+right)/2);if(+new Date(otherRows[mid].time)<=at)left=mid+1;else right=mid;}
            const latestContext=otherRows[left-1]?.diagnostic_context_id;
            for(let j=left-1;j>=0;j--){const r=otherRows[j];if(r.diagnostic_context_id!==latestContext||at-+new Date(r.time)>7200000)break;
              const v=valueFor(r,metric),mc=metricContext(r,metric);if(v===null)continue;
              if(r.context.areaId===d.peak.areaId&&mc.representative&&at-+new Date(r.time)<=maxHoldMs(r,metric))peers.push({nodeId:otherId,value:v,outside:validRange(mc.target)?(direction==='below'?v<mc.target[0]:v>mc.target[1]):null});break;
            }
          }
          const configured=peers.filter(p=>p.outside!==null),same=configured.filter(p=>p.outside).length,center=median(peers.map(p=>p.value));
          const scope=configured.length<2?'insufficient-peers':same/configured.length>=.7?'widespread':same===0&&center!==null&&Math.abs(d.peak.value-center)>=(SPREAD_LIMITS[metric]??Infinity)?'local':'mixed';
          const events=d.events.map(e=>({from:new Date(e.start).toISOString(),to:new Date(e.end).toISOString(),minutes:(e.end-e.start)/60000})).sort((a,b)=>b.minutes-a.minutes);
          directions[direction]={minutes:d.minutes,eventCount:events.length,longestMinutes:events[0]?.minutes||0,days:d.days.size,peak:d.peak,peakHours:d.hours.map((minutes,hour)=>({hour,minutes})).sort((a,b)=>b.minutes-a.minutes).filter(h=>h.minutes>0).slice(0,3),longestEvents:events.slice(0,3),scope,peersAtPeak:{count:peers.length,configuredCount:configured.length,sameDirectionCount:same,median:center}};
        }
        const halfDuration=(to-from)/120000,halves=s.halves.map(h=>({coveragePct:100*h.observed/halfDuration,outsidePct:h.observed?100*h.outside/h.observed:null}));
        output.push({nodeId:s.nodeId,nodeName:s.nodeName,sectionId:s.sectionId,metric:s.metric,observedMinutes:s.observedMinutes,estimatedPct:100*s.estimatedMinutes/s.observedMinutes,directions,halves,trend:halves.every(h=>h.coveragePct>=50)&&s.estimatedMinutes===0&&s.targets.size===1?'comparable':'insufficient-evidence',related:Object.entries(s.related).filter(([,r])=>r.duringMinutes>=60&&r.otherwiseMinutes>=60).map(([metric,r])=>({metric,during:r.duringSum/r.duringMinutes,otherwise:r.otherwiseSum/r.otherwiseMinutes,duringMinutes:r.duringMinutes,otherwiseMinutes:r.otherwiseMinutes}))});
      }
    }
  }
  return output;
}
