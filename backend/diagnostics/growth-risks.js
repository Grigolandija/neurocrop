import {METRIC_DEFINITIONS} from '../metric-registry.js';
import {maxHoldMs, metricContext, validRange, valueFor} from './engine.js';

// All limits come from the observation's crop profile. No universal crop thresholds.
// These are screening rules; 30 observed minutes is a display filter, not an injury dose.
export const GROWTH_RULES = [
 ['heat-load','airTemp',['airTemp'],c=>c.high('airTemp')],
 ['cold-growth','airTemp',['airTemp'],c=>c.low('airTemp')],
 ['root-cold','soilTemp',['soilTemp'],c=>c.low('soilTemp')],
 ['root-hot','soilTemp',['soilTemp'],c=>c.high('soilTemp')],
 ['water-cold','waterTemp',['waterTemp'],c=>c.low('waterTemp')],
 ['water-hot','waterTemp',['waterTemp'],c=>c.high('waterTemp')],
 ['dry-root','soilMoisture',['soilMoisture'],c=>c.low('soilMoisture')],
 ['wet-root','soilMoisture',['soilMoisture'],c=>c.high('soilMoisture')],
 ['substrate-salinity','soilEc',['soilEc'],c=>c.high('soilEc')],
 ['substrate-low-ec','soilEc',['soilEc'],c=>c.low('soilEc')],
 ['solution-high-ec','ec',['ec'],c=>c.high('ec')],
 ['solution-low-ec','ec',['ec'],c=>c.low('ec')],
 ['ph-high','ph',['ph'],c=>c.high('ph')],
 ['ph-low','ph',['ph'],c=>c.low('ph')],
 ['co2-low-lit','co2',['co2','$light'],c=>c.lit&&c.low('co2')],
 ['co2-high-lit','co2',['co2','$light'],c=>c.lit&&c.high('co2')],
 ['co2-high-dark','co2',['co2','$light'],c=>c.dark&&c.high('co2')],
 ['light-low','$light',['$light'],c=>c.day===true&&c.low(c.lightMetric)],
 ['light-high','$light',['$light'],c=>c.high(c.lightMetric)],
 ['light-at-night','$light',['$light'],c=>c.day===false&&c.lit],
 ['dry-saline-root','soilEc',['soilMoisture','soilEc'],c=>c.low('soilMoisture')&&c.high('soilEc')],
 ['wet-cold-root','soilMoisture',['soilMoisture','soilTemp'],c=>c.high('soilMoisture')&&c.low('soilTemp')],
 ['ph-ec-imbalance','ph',['ph','ec'],c=>(c.low('ph')||c.high('ph'))&&c.low('ec')],
 ['heat-light-mismatch','airTemp',['airTemp','$light'],c=>c.day===true&&c.high('airTemp')&&c.low(c.lightMetric)],
 ['co2-water-limitation','co2',['co2','vpd'],c=>c.lit&&c.low('co2')&&c.high('vpd')],
];
const air=new Set(['airTemp','co2','vpd','lux','ppfd']);
export function analyzeGrowthRisks(rows,{from,to,timeZone='Europe/Vilnius'}){
 const start=+new Date(from),end=+new Date(to),nodes=new Map(),risks=new Map(),formatters=new Map(),clockCache=new Map();
 const phase=(at,schedule)=>{
  if(!schedule?.enabled||!/^\d{2}:\d{2}$/.test(schedule.start||'')||!/^\d{2}:\d{2}$/.test(schedule.end||''))return null;
  const zone=schedule.timeZone||timeZone;
  try{
   if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
   const key=`${zone}:${Math.floor(at/60000)}`;
   if(!clockCache.has(key)){const p=Object.fromEntries(formatters.get(zone).formatToParts(at).map(p=>[p.type,p.value]));clockCache.set(key,Number(p.hour)*60+Number(p.minute));}
   const clock=s=>Number(s.slice(0,2))*60+Number(s.slice(3));const a=clock(schedule.start),b=clock(schedule.end),m=clockCache.get(key);
   return a===b||(a<b?m>=a&&m<b:m>=a||m<b);
  }catch{return null;}
 };
 for(const row of rows)if(row.context?.sectionId&&row.context.source!=='simulated'){
  if(!nodes.has(row.dev_eui))nodes.set(row.dev_eui,[]);nodes.get(row.dev_eui).push(row);
 }
 for(const [nodeId,series] of nodes){
  series.sort((a,b)=>+new Date(a.time)-+new Date(b.time));
  for(let i=0;i<series.length;i++){
   const row=series[i],ctx=row.context,at=+new Date(row.time),lo=Math.max(start,at),hi=Math.min(end,i+1<series.length?+new Date(series[i+1].time):end);
   if(hi<=lo)continue;
   const values={},targets={};
   for(const metric of ['airTemp','soilTemp','waterTemp','soilMoisture','soilEc','ec','ph','co2','vpd','lux','ppfd']){
    const port=METRIC_DEFINITIONS[metric].sensorKey;
    const sensor=ctx.sensors?.find(s=>s.port===port||(port==='scd41'&&s.port==='scd4x'));
    if(sensor?.is_enabled===false||(air.has(metric)&&!metricContext(row,metric).representative))continue;
    const value=valueFor(row,metric);if(value===null)continue;
    values[metric]=value;const target=metricContext(row,metric).target;if(validRange(target))targets[metric]=target;
   }
   const lightMetric=Object.hasOwn(values,'ppfd')?'ppfd':Object.hasOwn(values,'lux')?'lux':null;
   const schedule=ctx.metrics?.lux?.lightingSchedule;
   const darkThreshold=lightMetric==='lux'?Math.max(0,Number(schedule?.darkThresholdLux)||0):0;
   // Split at minute boundaries when a schedule is used, so a packet spanning
   // lights-on does not attribute dark time to a daytime deficiency.
   for(let cursor=lo;cursor<hi;){
    const sliceEnd=schedule?.enabled?Math.min(hi,(Math.floor(cursor/60000)+1)*60000):hi;
    const lightFresh=lightMetric&&cursor<at+maxHoldMs(row,lightMetric);
    const c={lightMetric,day:phase(cursor,schedule),lit:!!lightFresh&&values[lightMetric]>darkThreshold,dark:!!lightFresh&&values[lightMetric]<=darkThreshold,
     high:m=>Object.hasOwn(values,m)&&targets[m]&&values[m]>targets[m][1],low:m=>Object.hasOwn(values,m)&&targets[m]&&values[m]<targets[m][0]};
    for(const [kind,primary,required,match] of GROWTH_RULES){
     const metrics=required.map(m=>m==='$light'?lightMetric:m);
     if(kind==='co2-water-limitation')metrics.push(lightMetric);
     if(metrics.some(m=>!m||!Object.hasOwn(values,m))||!match(c))continue;
     const until=Math.min(sliceEnd,...metrics.map(m=>at+maxHoldMs(row,m)));
     if(until<=cursor)continue;
     const primaryMetric=primary==='$light'?lightMetric:primary;
     const key=JSON.stringify([nodeId,ctx.sectionId,kind,row.diagnostic_context_id||'estimated',ctx.profileId,ctx.stage,metrics.map(m=>targets[m])]);
     if(!risks.has(key))risks.set(key,{kind,primaryMetric,nodeId,nodeName:ctx.nodeName||nodeId,sectionId:ctx.sectionId,sectionName:ctx.sectionName||ctx.sectionId,profileId:ctx.profileId||null,stage:ctx.stage||null,crops:[...new Set((ctx.cycles||[]).map(c=>c.crop).filter(Boolean))],estimated:!row.diagnostic_context_id,minutes:0,longestMinutes:0,firstAt:new Date(cursor).toISOString(),lastAt:null,support:metrics.map(metric=>({metric,minimum:Infinity,maximum:-Infinity,target:targets[metric]||null,unit:METRIC_DEFINITIONS[metric].unit})),tailEnd:null,tailMinutes:0});
     const r=risks.get(key),minutes=(until-cursor)/60000;
     r.minutes+=minutes;r.tailMinutes=r.tailEnd===cursor?r.tailMinutes+minutes:minutes;r.tailEnd=until;r.longestMinutes=Math.max(r.longestMinutes,r.tailMinutes);r.lastAt=new Date(until).toISOString();
     for(const s of r.support){s.minimum=Math.min(s.minimum,values[s.metric]);s.maximum=Math.max(s.maximum,values[s.metric]);}
    }
    cursor=sliceEnd;
   }
  }
 }
 return [...risks.values()].filter(r=>r.minutes>=30).map(({tailEnd,tailMinutes,...r})=>r);
}
