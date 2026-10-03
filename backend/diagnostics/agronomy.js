import {analyzeGrowthRisks} from './growth-risks.js';
import {calcDewPoint} from '../calculations.js';
import {maxHoldMs, metricContext, validRange, valueFor} from './engine.js';
import {METRIC_DEFINITIONS} from '../metric-registry.js';

// Screening of measured conditions, not a disease diagnosis or crop-loss model.
// 30 minutes is a report inclusion filter, not a biological injury threshold.
export function analyzeAgronomy(rows,{from,to,timeZone}) {
  const start=+new Date(from),end=+new Date(to),nodes=new Map(),risks=new Map();
  for(const row of rows)if(row.context?.sectionId&&row.context.source!=='simulated'){
    if(!nodes.has(row.dev_eui))nodes.set(row.dev_eui,[]);nodes.get(row.dev_eui).push(row);
  }
  const enabled=(row,metric)=>{
    const key=METRIC_DEFINITIONS[metric]?.sensorKey;
    return !(row.context.sensors||[]).some(s=>s.port===key&&s.is_enabled===false);
  };
  for(const [nodeId,series] of nodes){
    series.sort((a,b)=>+new Date(a.time)-+new Date(b.time));
    for(let i=0;i<series.length;i++){
      const row=series[i],ctx=row.context,at=+new Date(row.time),temp=valueFor(row,'airTemp'),rh=valueFor(row,'humidity'),vpd=valueFor(row,'vpd');
      if(temp===null||rh===null||vpd===null||!metricContext(row,'airTemp').representative||!metricContext(row,'humidity').representative)continue;
      const lo=Math.max(start,at),hi=Math.min(end,i+1<series.length?+new Date(series[i+1].time):end,at+maxHoldMs(row,'airTemp'),at+maxHoldMs(row,'humidity'));
      if(hi<=lo)continue;
      const target=metricContext(row,'vpd').target,dewPoint=calcDewPoint(temp,rh),leaf=valueFor(row,'leafTemp'),soil=valueFor(row,'soilMoisture'),soilTarget=metricContext(row,'soilMoisture').target;
      const kinds=[];
      if(validRange(target)&&metricContext(row,'vpd').representative){
        if(vpd>target[1])kinds.push(['high-vpd',hi]);
        if(vpd<target[0])kinds.push(['low-vpd',hi]);
      }
      if(dewPoint!==null&&leaf!==null&&enabled(row,'leafTemp')&&leaf<=dewPoint)kinds.push(['leaf-condensation',Math.min(hi,at+maxHoldMs(row,'leafTemp'))]);
      for(const [kind,until] of kinds){
        if(until<=lo)continue;
        // Keep different profiles/crop stages separate, even for the same node.
        const key=JSON.stringify([nodeId,ctx.sectionId,kind,row.diagnostic_context_id||'estimated',ctx.profileId,ctx.stage,kind==='leaf-condensation'?null:target]);
        if(!risks.has(key))risks.set(key,{kind,nodeId,nodeName:ctx.nodeName||nodeId,sectionId:ctx.sectionId,sectionName:ctx.sectionName||ctx.sectionId,profileId:ctx.profileId||null,stage:ctx.stage||null,crops:[...new Set((ctx.cycles||[]).map(c=>c.crop).filter(Boolean))],estimated:!row.diagnostic_context_id,minutes:0,longestMinutes:0,rootDryMinutes:0,rootObservedMinutes:0,vpdMin:Infinity,vpdMax:-Infinity,target:validRange(target)?target:null,firstAt:new Date(lo).toISOString(),lastAt:null,dewPoint:null,leafTemperature:null,tailEnd:null,tailMinutes:0});
        const risk=risks.get(key),minutes=(until-lo)/60000;
        risk.minutes+=minutes;risk.vpdMin=Math.min(risk.vpdMin,vpd);risk.vpdMax=Math.max(risk.vpdMax,vpd);
        risk.tailMinutes=risk.tailEnd===lo?risk.tailMinutes+minutes:minutes;risk.tailEnd=until;risk.longestMinutes=Math.max(risk.longestMinutes,risk.tailMinutes);risk.lastAt=new Date(until).toISOString();
        if(kind==='leaf-condensation'&&(risk.dewPoint===null||dewPoint-leaf>risk.dewPoint-risk.leafTemperature)){risk.dewPoint=dewPoint;risk.leafTemperature=leaf;}
        if(kind==='high-vpd'&&soil!==null&&enabled(row,'soilMoisture')&&validRange(soilTarget)){
          const overlap=Math.max(0,Math.min(until,at+maxHoldMs(row,'soilMoisture'))-lo)/60000;
          risk.rootObservedMinutes+=overlap;if(soil<soilTarget[0])risk.rootDryMinutes+=overlap;
        }
      }
    }
  }
  return [...risks.values()].filter(r=>r.minutes>=30).map(({tailEnd,tailMinutes,...r})=>r).concat(analyzeGrowthRisks(rows,{from,to,timeZone}));
}
