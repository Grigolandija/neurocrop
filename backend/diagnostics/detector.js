import { METHOD_VERSION, METRICS, RATE_LIMITS, SPREAD_LIMITS, maxHoldMs, median, metricContext, validRange, valueFor } from './engine.js';

export function advanceDetector(state, row) {
  const now=+new Date(row.time),ctx=row.context||{}, transitions=[];
  if(!ctx.sectionId || !Number.isFinite(now))return transitions;
  state.nodes ||= {};state.signals ||= {};
  const nodeKey=String(row.dev_eui), previous=state.nodes[nodeKey];
  // Late arrivals are available in historical reports, but never rewind live episodes.
  if(previous && now<=previous.at)return transitions;
  const sameContext=previous?.contextId===row.diagnostic_context_id;
  if(previous && !sameContext){
    const prefix=`${nodeKey}:${previous.contextId}:`;
    for(const [key,signal] of Object.entries(state.signals))if(key.startsWith(prefix)){
      transitions.push({type:'close',key,at:Math.min(now,signal.at+signal.hold),reason:now>signal.at+signal.hold?'data_gap':'context_changed'});
      delete state.signals[key];
    }
  }
  const next={at:now,contextId:row.diagnostic_context_id,ctx,values:sameContext?{...previous.values}:{},holds:sameContext?{...previous.holds}:{},metricTimes:sameContext?{...previous.metricTimes}:{}};
  const signal=(metric,kind,active,evidence,severity='warning')=>{
    const key=`${nodeKey}:${row.diagnostic_context_id}:${metric}:${kind}`,old=state.signals[key];
    const maxGap=maxHoldMs(row,metric);
    if(old && now-old.at>maxGap){transitions.push({type:'close',key,at:old.at+maxGap,reason:'data_gap'});delete state.signals[key];}
    if(active){
      transitions.push({type:state.signals[key]?'observe':'open',key,at:now,ctx,metric,kind,severity,evidence:{...evidence,observedAt:new Date(now).toISOString(),contextId:row.diagnostic_context_id,methodVersion:METHOD_VERSION},nodeId:nodeKey});
      state.signals[key]={at:now,hold:maxGap};
    } else if(state.signals[key]){transitions.push({type:'close',key,at:now,reason:'condition_cleared'});delete state.signals[key];}
  };
  for(const metric of METRICS){
    const value=valueFor(row,metric),mc=metricContext(row,metric);
    if(value===null || !mc.representative)continue;
    next.values[metric]=value;next.holds[metric]=maxHoldMs(row,metric);next.metricTimes[metric]=now;
    const target=mc.target, outside=validRange(target)&&(value<target[0]||value>target[1]);
    const critical=ctx.metrics?.[metric]?.critical;
    const severity=validRange(critical)&&(value<critical[0]||value>critical[1])?'critical':'warning';
    signal(metric,'threshold',outside,{value,target:target||null,direction:outside?(value<target[0]?'below':'above'):'inside'},severity);
    const prior=previous?.values?.[metric],dt=previous?.metricTimes?.[metric]!==undefined?(now-previous.metricTimes[metric])/60000:0;
    if(Object.hasOwn(RATE_LIMITS,metric)){
      const comparable=previous?.contextId===row.diagnostic_context_id && Number.isFinite(prior)&&dt>=1&&dt<=20;
      const rate=comparable?(value-prior)/dt:null;
      signal(metric,'rate',rate!==null&&Math.abs(rate)>=RATE_LIMITS[metric],{value,previous:prior??null,minutes:dt,rate,threshold:RATE_LIMITS[metric]});
    }
    if(Object.hasOwn(SPREAD_LIMITS,metric)){
      const peers=Object.entries(state.nodes).filter(([id,p])=>id!==nodeKey&&p.ctx.areaId===ctx.areaId&&p.ctx.source===ctx.source&&now>=p.metricTimes?.[metric]&&now-p.metricTimes[metric]<=Math.min(next.holds[metric],p.holds?.[metric]||0)&&Number.isFinite(p.values?.[metric]));
      const center=median(peers.map(([,p])=>p.values[metric]));
      signal(metric,'peer',center!==null&&Math.abs(value-center)>=SPREAD_LIMITS[metric],{value,peerMedian:center,delta:center===null?null:value-center,peerCount:peers.length,threshold:SPREAD_LIMITS[metric],peers:peers.map(([id,p])=>({nodeId:id,value:p.values[metric],observedAt:new Date(p.metricTimes[metric]).toISOString()}))});
    }
  }
  state.nodes[nodeKey]=next;
  return transitions;
}
export function expireDetector(state, now) {
  const transitions=[];
  for(const [key,item] of Object.entries(state.signals||{}))if(now>item.at+item.hold){transitions.push({type:'close',key,at:item.at+item.hold,reason:'data_gap'});delete state.signals[key];}
  for(const [key,item] of Object.entries(state.nodes||{}))if(now-item.at>7200000)delete state.nodes[key];
  return transitions;
}
