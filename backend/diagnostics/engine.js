import { calcVPD } from '../calculations.js';
import { METRIC_DEFINITIONS } from '../metric-registry.js';
import { normalizeTelemetryNumber, sensorHasNewMeasurement, sensorMeasurementIntervalSec } from '../telemetry-values.js';

export const METHOD_VERSION = 'diagnostics-1.0';
export const METRICS = ['airTemp', 'humidity', 'vpd', 'co2', 'lux', 'soilTemp', 'soilMoisture', 'ec', 'ph', 'soilEc', 'leafTemp', 'waterTemp', 'ppfd'];
export const SPREAD_LIMITS = { airTemp: 2, humidity: 8, vpd: 0.4, co2: 200, lux: 5000 };
export const RATE_LIMITS = { airTemp: 0.2, humidity: 0.8, co2: 30 };
const num = normalizeTelemetryNumber;
export const median = values => {
  const a = values.filter(Number.isFinite).sort((x, y) => x-y);
  return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)]) / 2 : null;
};
const round = n => Number.isFinite(n) ? Number(n.toFixed(3)) : null;
export function validRange(range) {
  return Array.isArray(range) && range.length === 2 && range.every(Number.isFinite) && range[0] <= range[1];
}
export function valueFor(row, metric) {
  const definition = METRIC_DEFINITIONS[metric];
  const sensor = row.raw_object?.sensors?.[definition?.sensorKey || (metric === 'vpd' ? 'sht45' : metric)];
  if (!sensorHasNewMeasurement(sensor)) return null;
  const value = metric === 'vpd'
    ? num(row.temperature) === null || num(row.humidity) === null ? null : calcVPD(row.temperature, row.humidity)
    : num(row[definition?.column]);
  const bounds = definition?.physicalRange;
  if (value === null || (bounds && (value < bounds[0] || value > bounds[1]))) return null;
  return value;
}
export function metricContext(row, metric) {
  const ctx = row.context || {};
  const port = METRIC_DEFINITIONS[metric]?.sensorKey || 'sht45';
  const sensor = ctx.sensors?.find(s => s.port === port || (port === 'scd41' && s.port === 'scd4x'));
  const air = ['airTemp','humidity','vpd','co2','lux','ppfd'].includes(metric);
  const representative = sensor ? sensor.is_enabled !== false && sensor.spatial_scope === 'representative' : air;
  return { representative, target: ctx.metrics?.[metric]?.optimal, unit: METRIC_DEFINITIONS[metric]?.unit || '',
    contextId: row.diagnostic_context_id || 'legacy-estimated', estimated: !row.diagnostic_context_id };
}
export function maxHoldMs(row, metric) {
  const reported = num(row.raw_object?.expected_uplink_interval_s);
  const interval = reported ?? (row.profile === 'intensive' ? 60 : row.profile === 'power_save' ? 900 : 300);
  const sensorInterval = sensorMeasurementIntervalSec(metric, row.profile, interval);
  return Math.min(2*3600000, sensorInterval*2000);
}
const clockFormatters = new Map();
const clockCache = new Map();
function clockParts(time, timeZone) {
  const cacheKey = `${timeZone}:${Math.floor(time/60000)}`;
  if (clockCache.has(cacheKey)) return clockCache.get(cacheKey);
  if(clockCache.size>60000)clockCache.clear();
  if (!clockFormatters.has(timeZone)) {
    if (clockFormatters.size > 64) clockFormatters.clear();
    clockFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit' }));
  }
  const parts = Object.fromEntries(clockFormatters.get(timeZone).formatToParts(new Date(time)).map(p=>[p.type,p.value]));
  const result={ day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.hour)*60+Number(parts.minute) };
  clockCache.set(cacheKey,result);return result;
}
function phaseAt(time, context, timeZone) {
  const schedule = context.metrics?.lux?.lightingSchedule;
  if (!schedule?.enabled || !/^\d{2}:\d{2}$/.test(schedule.start || '') || !/^\d{2}:\d{2}$/.test(schedule.end || '')) return 'unknown';
  const clock = s => Number(s.slice(0,2))*60+Number(s.slice(3));
  const start = clock(schedule.start), end = clock(schedule.end), minute = clockParts(time, schedule.timeZone || timeZone).minute;
  return (start===end || (start<end ? minute>=start && minute<end : minute>=start || minute<end)) ? 'day' : 'night';
}
function summaryBase(sectionId, name, metric) {
  return { sectionId, name, metric, unit: METRIC_DEFINITIONS[metric]?.unit || '', observedMinutes:0, expectedMinutes:0,
    belowMinutes:0, aboveMinutes:0, inTargetMinutes:0, unconfiguredMinutes:0, sum:0,min:Infinity,max:-Infinity,
    estimatedMinutes:0, daySum:0,dayMinutes:0,nightSum:0,nightMinutes:0, luxHours:0,
    peerSum:0,peerMinutes:0,peerOutsideMinutes:0,peerDays:new Set(),spreads:[], hourly:Array.from({length:24},(_,hour)=>({hour,observedMinutes:0,outsideMinutes:0,days:new Set()})) };
}

// Zero-order hold is bounded by the sensor cadence. Gaps remain unknown.
// All percentages describe node-observation time, not an averaged climate curve.
export function analyzeObservations(rows, { from, to, timeZone='Europe/Vilnius', inventory=[] } = {}) {
  const start = +new Date(from), end = +new Date(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start || end-start>31*86400000) throw new Error('Invalid diagnostic window');
  clockParts(start,timeZone); // Validate timezone before processing any rows.
  const byNode = new Map();
  for (const row of rows) {
    if (!row.context?.sectionId) continue;
    const key = String(row.dev_eui);
    if (!byNode.has(key)) byNode.set(key,[]);
    byNode.get(key).push(row);
  }
  const summaries = new Map(), nodeSummaries = new Map(), buckets = new Map(), daily = new Map(), dayWindows = new Map();
  for(let cursor=start;cursor<end;){const next=Math.min(end,(Math.floor(cursor/300000)+1)*300000),day=clockParts(cursor,timeZone).day;dayWindows.set(day,(dayWindows.get(day)||0)+(next-cursor)/60000);cursor=next;}
  const partialDays=new Set();
  if(clockParts(start,timeZone).minute!==0 || start%60000!==0)partialDays.add(clockParts(start,timeZone).day);
  if(clockParts(end,timeZone).minute!==0 || end%60000!==0)partialDays.add(clockParts(end-1,timeZone).day);
  const getSummary = (ctx,metric) => {
    const key = `${ctx.sectionId}:${metric}`;
    if (!summaries.has(key)) summaries.set(key,summaryBase(ctx.sectionId,ctx.sectionName || ctx.sectionId,metric));
    return summaries.get(key);
  };
  for (const node of inventory) {
    for (const metric of METRICS) {
      if (validRange(node.context?.metrics?.[metric]?.optimal)) getSummary(node.context,metric);
    }
  }
  for (const [nodeId, series] of byNode) {
    series.sort((a,b)=>+new Date(a.time)-+new Date(b.time));
    const contextEnds = new Map();
    let boundary = end;
    for (let i=series.length-1;i>=0;i--) {
      if (series[i+1] && (series[i+1].diagnostic_context_id !== series[i].diagnostic_context_id || series[i+1].context.sectionId !== series[i].context.sectionId)) boundary=+new Date(series[i+1].time);
      contextEnds.set(series[i],boundary);
    }
    for (const metric of METRICS) {
      const metricSeries = series.filter(row => valueFor(row,metric)!==null);
      const assignments = new Set();
      for (let i=0;i<metricSeries.length;i++) {
        const row=metricSeries[i],ctx=row.context, time=+new Date(row.time), value=valueFor(row,metric), mc=metricContext(row,metric);
        if (!mc.representative) continue;
        const key=`${nodeId}:${ctx.sectionId}:${metric}`;
        assignments.add(ctx.sectionId);
        const summary=getSummary(ctx,metric);
        if (!nodeSummaries.has(key)) nodeSummaries.set(key,{...summaryBase(ctx.sectionId,ctx.sectionName,metric),nodeId,nodeName:ctx.nodeName || nodeId});
        const ns=nodeSummaries.get(key);
        const lo=Math.max(start,time), hi=Math.min(end,metricSeries[i+1] ? +new Date(metricSeries[i+1].time) : end,time+maxHoldMs(row,metric),contextEnds.get(row));
        if (value===null || hi<=lo) continue;
        const duration=(hi-lo)/60000;
        const state=!validRange(mc.target) ? 'unconfigured' : value<mc.target[0] ? 'below' : value>mc.target[1] ? 'above' : 'inTarget';
        for (const stat of [summary,ns]) {
          stat.observedMinutes+=duration;stat[`${state}Minutes`]+=duration;stat.sum+=value*duration;
          stat.min=Math.min(stat.min,value);stat.max=Math.max(stat.max,value);
          if(mc.estimated)stat.estimatedMinutes+=duration;
        }
        // Split on 5-minute UTC boundaries; local phase and local hour are evaluated per slice.
        for(let cursor=lo;cursor<hi;) {
          const next=Math.min(hi,(Math.floor(cursor/300000)+1)*300000), minutes=(next-cursor)/60000;
          const local=clockParts(cursor,timeZone),phase=phaseAt(cursor,ctx,timeZone);
          const dkey=`${nodeId}:${ctx.sectionId}:${metric}:${local.day}`;
          if(!daily.has(dkey))daily.set(dkey,{nodeId,nodeName:ctx.nodeName||nodeId,sectionId:ctx.sectionId,metric,day:local.day,minimum:value,maximum:value,sum:0,observedMinutes:0});
          const dayStat=daily.get(dkey);dayStat.minimum=Math.min(dayStat.minimum,value);dayStat.maximum=Math.max(dayStat.maximum,value);dayStat.sum+=value*minutes;dayStat.observedMinutes+=minutes;
          const hour=summary.hourly[local.hour];hour.observedMinutes+=minutes;
          if(state==='below'||state==='above'){hour.outsideMinutes+=minutes;hour.days.add(local.day);}
          if(phase!=='unknown'){summary[`${phase}Sum`]+=value*minutes;summary[`${phase}Minutes`]+=minutes;}
          if(metric==='lux')summary.luxHours+=value*minutes/60;
          if(Object.hasOwn(SPREAD_LIMITS,metric)) {
            const bkey=`${metric}:${Math.floor(cursor/300000)}`;
            if(!buckets.has(bkey))buckets.set(bkey,new Map());
            const bucket=buckets.get(bkey), entry=bucket.get(nodeId)||{nodeId,sectionId:ctx.sectionId,areaId:ctx.areaId,sum:0,minutes:0,day:local.day,lo:cursor,hi:next};
            entry.sum+=value*minutes;entry.minutes+=minutes;entry.lo=Math.min(entry.lo,cursor);entry.hi=Math.max(entry.hi,next);bucket.set(nodeId,entry);
          }
          cursor=next;
        }
      }
      // Conservative denominator: each observed assignment counts the whole window.
      // This prevents a newly reporting node from appearing as 100% coverage.
      for(const sectionId of assignments){const ns=nodeSummaries.get(`${nodeId}:${sectionId}:${metric}`);if(ns)ns.expectedMinutes=(end-start)/60000;}
    }
  }
  for(const [key,bucket] of buckets) {
    const metric=key.split(':')[0];
    const samples=[...bucket.values()].filter(x=>x.minutes>=4.5); // never compare isolated non-overlapping fragments
    const groups=new Map();
    for(const sample of samples){const g=sample.areaId||'unassigned';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(sample);}
    for(const peers of groups.values()) {
      if(peers.length<2)continue;
      const low=Math.max(...peers.map(p=>p.lo)),high=Math.min(...peers.map(p=>p.hi));if(high<=low)continue;
      const sections=new Map();
      for(const p of peers){if(!sections.has(p.sectionId))sections.set(p.sectionId,[]);sections.get(p.sectionId).push(p.sum/p.minutes);}
      const centers=[...sections].map(([sectionId,values])=>({sectionId,value:median(values)}));
      const spread=Math.max(...peers.map(p=>p.sum/p.minutes))-Math.min(...peers.map(p=>p.sum/p.minutes));
      for(const c of centers) {
        const stat=summaries.get(`${c.sectionId}:${metric}`);if(!stat)continue;stat.spreads.push(spread);
        const others=centers.filter(p=>p.sectionId!==c.sectionId);if(!others.length)continue;
        const delta=c.value-median(others.map(p=>p.value)),minutes=(high-low)/60000;
        stat.peerSum+=delta*minutes;stat.peerMinutes+=minutes;
        if(Math.abs(delta)>=SPREAD_LIMITS[metric]){stat.peerOutsideMinutes+=minutes;stat.peerDays.add(peers[0].day);}
      }
    }
  }
  for(const stat of summaries.values()) {
    const matching=[...nodeSummaries.values()].filter(n=>n.sectionId===stat.sectionId&&n.metric===stat.metric);
    const currentCount=inventory.filter(n=>n.context?.sectionId===stat.sectionId && metricContext(n,stat.metric).representative && validRange(n.context?.metrics?.[stat.metric]?.optimal)).length;
    stat.expectedMinutes=Math.max(matching.length,currentCount,1)*(end-start)/60000;
  }
  const finish = stat => ({sectionId:stat.sectionId,name:stat.name,metric:stat.metric,unit:stat.unit,
    ...(stat.nodeId?{nodeId:stat.nodeId,nodeName:stat.nodeName}:{}),
    minimum:round(stat.min),maximum:round(stat.max),mean:round(stat.observedMinutes?stat.sum/stat.observedMinutes:null),
    observedMinutes:round(stat.observedMinutes),expectedMinutes:round(stat.expectedMinutes),
    belowMinutes:round(stat.belowMinutes),aboveMinutes:round(stat.aboveMinutes),inTargetMinutes:round(stat.inTargetMinutes),
    unknownMinutes:round(Math.max(0,stat.expectedMinutes-stat.observedMinutes)),unconfiguredMinutes:round(stat.unconfiguredMinutes),
    coveragePct:round(stat.expectedMinutes?Math.min(100,stat.observedMinutes/stat.expectedMinutes*100):0),
    outsideObservedPct:round(stat.observedMinutes?100*(stat.belowMinutes+stat.aboveMinutes)/stat.observedMinutes:null),
    estimatedContextPct:round(stat.observedMinutes?100*stat.estimatedMinutes/stat.observedMinutes:0),
    dayMean:round(stat.dayMinutes?stat.daySum/stat.dayMinutes:null),nightMean:round(stat.nightMinutes?stat.nightSum/stat.nightMinutes:null),
    daylightExposurePpmHours:stat.metric==='co2'?round(stat.daySum/60):null,
    lightAccumulationLuxHours:stat.metric==='lux'?round(stat.luxHours):null,
    peerDelta:round(stat.peerMinutes?stat.peerSum/stat.peerMinutes:null),peerMinutes:round(stat.peerMinutes),
    peerOutsidePct:round(stat.peerMinutes?100*stat.peerOutsideMinutes/stat.peerMinutes:null),recurringDays:stat.peerDays.size,
    medianSpread:median(stat.spreads),maxSpread:stat.spreads.length?Math.max(...stat.spreads):null,
    hourly:stat.hourly.map(h=>({hour:h.hour,observedMinutes:round(h.observedMinutes),outsideMinutes:round(h.outsideMinutes),recurringDays:h.days.size}))});
  const metrics=[...summaries.values()].map(finish),nodes=[...nodeSummaries.values()].map(finish);
  const ranking=metrics.filter(m=>m.coveragePct>=50&&m.outsideObservedPct>0).sort((a,b)=>b.outsideObservedPct-a.outsideObservedPct||b.recurringDays-a.recurringDays);
  const insights=metrics.flatMap(m=>{
    const output=[];
    if(m.peerMinutes>=60 && m.peerOutsidePct>=50 && m.recurringDays>=2)output.push({kind:'systematic-peer',severity:'high',...m});
    if(m.coveragePct>=50 && m.outsideObservedPct>=10)output.push({kind:'outside-target',severity:m.outsideObservedPct>=30?'high':'medium',...m});
    if(m.coveragePct<50)output.push({kind:'insufficient-data',severity:'unknown',...m});
    return output.map(insight=>({...insight,recommendation:insight.kind==='insufficient-data'
      ? {lt:'Patikrinkite paskutinį ryšį, sensoriaus klaidas, bateriją ir matavimų periodiškumą.',en:'Check last contact, sensor errors, battery and sampling cadence.'}
      : insight.kind==='systematic-peer'
      ? {lt:'Patikrinkite sensorių aukštį, kalibravimą, oro judėjimą ir artimiausią klimato įrangą. Galimos priežastys yra hipotezės; palyginkite prieš ir po patikros.',en:'Check sensor height, calibration, airflow and nearby climate equipment. Possible causes are hypotheses; compare before and after inspection.'}
      : {lt:'Patikrinkite kultūros ir stadijos tikslines ribas, tuomet palyginkite nuokrypių laiką su įrangos įvykiais. Užregistruokite veiksmą ir patikrinkite rezultatą.',en:'Verify crop and stage targets, then compare excursion timing with equipment events. Record the intervention and verify its outcome.'}}));
  });
  return {methodVersion:METHOD_VERSION,from:new Date(start).toISOString(),to:new Date(end).toISOString(),timeZone,
    generatedAt:new Date().toISOString(),metrics,nodes,ranking,insights,
    daily:[...daily.values()].map(d=>({...d,mean:round(d.sum/d.observedMinutes),sum:undefined,completeCalendarDay:!partialDays.has(d.day),coveragePct:round(100*d.observedMinutes/dayWindows.get(d.day)),dliObserved:d.metric==='ppfd'?round(d.sum*60/1e6):null})),
    methodology:{duration:'bounded-zero-order-hold',denominator:'node-observation-minutes',peerBucketMinutes:5,
      rankingMinimumCoveragePct:50,legacyContext:'estimated-current-assignment',causality:'hypotheses-only'},
    missingInputs:[...(!metrics.some(m=>m.metric==='ppfd'&&m.observedMinutes>0)?['PAR-PPFD-for-measured-DLI']:[]),'energy-and-yield-for-cost-impact','validated-crop-model']};
}
