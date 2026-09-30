import {metricContext, validRange, valueFor} from './engine.js';

// Hourly envelopes preserve raw extremes. They are not duration estimates.
export function buildDiagnosticTraces(rows, report, limit=60000) {
  const wanted=new Set(report.insights.filter(i=>i.kind!=='insufficient-data').map(i=>i.metric));
  const buckets=new Map();let truncated=false;
  for(const row of rows){
    const time=+new Date(row.time);
    if(time<+new Date(report.from)||time>=+new Date(report.to)||!row.context?.sectionId)continue;
    for(const metric of wanted){
      const value=valueFor(row,metric),context=metricContext(row,metric);
      if(value===null||!context.representative)continue;
      const at=Math.floor(time/3600000)*3600000,key=`${row.dev_eui}:${row.context.sectionId}:${metric}:${at}`;
      if(!buckets.has(key)){
        if(buckets.size>=limit){truncated=true;continue;}
        buckets.set(key,{nodeId:String(row.dev_eui),nodeName:row.context.nodeName||String(row.dev_eui),sectionId:row.context.sectionId,metric,at:new Date(at).toISOString(),min:value,max:value,sum:0,count:0,target:validRange(context.target)?context.target:null});
      }
      const b=buckets.get(key);b.min=Math.min(b.min,value);b.max=Math.max(b.max,value);b.sum+=value;b.count++;
      if(JSON.stringify(b.target)!==JSON.stringify(context.target||null))b.target=null;
    }
  }
  const grouped=new Map();
  for(const b of buckets.values()){
    const key=`${b.nodeId}:${b.sectionId}:${b.metric}`;
    if(!grouped.has(key))grouped.set(key,{nodeId:b.nodeId,nodeName:b.nodeName,sectionId:b.sectionId,metric:b.metric,points:[]});
    grouped.get(key).points.push({at:b.at,min:b.min,max:b.max,mean:b.sum/b.count,target:b.target,count:b.count});
  }
  return {traces:[...grouped.values()].map(t=>({...t,points:t.points.sort((a,b)=>a.at.localeCompare(b.at))})),tracesTruncated:truncated};
}
