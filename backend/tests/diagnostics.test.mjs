import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeObservations, valueFor } from '../diagnostics/engine.js';
import { advanceDetector, expireDetector } from '../diagnostics/detector.js';
const base=Date.parse('2026-09-01T00:00:00Z');
const row=(minute,value,node='n1',section='s1',extra={})=>({id:minute+1,time:new Date(base+minute*60000).toISOString(),dev_eui:node,temperature:value,humidity:60,diagnostic_context_id:'ctx-'+section,context:{nodeId:node,nodeName:node,sectionId:section,sectionName:section,areaId:'a',source:'physical',metrics:{airTemp:{optimal:[20,25],critical:[10,35]}}},...extra});
const analyze=(rows,minutes=60)=>analyzeObservations(rows,{from:new Date(base),to:new Date(base+minutes*60000),timeZone:'UTC'}).metrics.find(m=>m.metric==='airTemp');
test('short excursions are retained as duration instead of disappearing into a bucket mean',()=>{
 const m=analyze([row(0,22),row(5,32),row(10,22),row(15,22)],20);
 assert.equal(m.aboveMinutes,5);assert.equal(m.observedMinutes,20);assert.equal(m.outsideObservedPct,25);assert.equal(m.maximum,32);
});
test('missing samples produce unknown time rather than extending normal conditions',()=>{
 const m=analyze([row(0,22)]);assert.equal(m.observedMinutes,10);assert.equal(m.unknownMinutes,50);assert.ok(m.coveragePct<17);
});
test('null temperature cannot become synthetic VPD',()=>assert.equal(valueFor(row(0,null),'vpd'),null));
test('historical context follows each reading after reassignment',()=>{
 const r=analyzeObservations([row(0,30),row(5,30,'n1','s2',{context:{sectionId:'s2',sectionName:'new',areaId:'a',metrics:{airTemp:{optimal:[28,32]}}}})],{from:new Date(base),to:new Date(base+10*60000),timeZone:'UTC'});
 assert.equal(r.metrics.find(m=>m.sectionId==='s1'&&m.metric==='airTemp').aboveMinutes,5);
 assert.equal(r.metrics.find(m=>m.sectionId==='s2'&&m.metric==='airTemp').inTargetMinutes,5);
});
test('point probes are not treated as representative air measurements',()=>{
 const r=row(0,40);r.context.sensors=[{port:'sht45',spatial_scope:'point',is_enabled:true}];
 assert.equal(analyzeObservations([r],{from:new Date(base),to:new Date(base+60000),timeZone:'UTC'}).metrics.some(m=>m.metric==='airTemp'),false);
});
test('two zones with one node each have peer deltas',()=>{
 const r=analyzeObservations([row(0,22),row(0,26,'n2','s2')],{from:new Date(base),to:new Date(base+10*60000),timeZone:'UTC'});
 const m=r.metrics.find(m=>m.sectionId==='s2'&&m.metric==='airTemp');assert.equal(m.peerDelta,4);assert.equal(m.peerMinutes,10);
});
test('nonoverlapping readings are never compared as contemporaneous peers',()=>{
 const r=analyzeObservations([row(0,22),row(40,26,'n2','s2')],{from:new Date(base),to:new Date(base+60*60000),timeZone:'UTC'});
 assert.equal(r.metrics.find(m=>m.sectionId==='s2'&&m.metric==='airTemp').peerDelta,null);
});
test('episodes close and reopen separately after recovery',()=>{
 const state={};let changes=advanceDetector(state,row(0,30));assert.ok(changes.some(t=>t.kind==='threshold'&&t.type==='open'));
 changes=advanceDetector(state,row(5,22));assert.ok(changes.some(t=>t.type==='close'&&t.reason==='condition_cleared'));
 changes=advanceDetector(state,row(10,30));assert.ok(changes.some(t=>t.kind==='threshold'&&t.type==='open'));
});
test('data gaps end observation without claiming recovery; late packets cannot rewind state',()=>{
 const state={};advanceDetector(state,row(0,30));assert.ok(expireDetector(state,base+3600000).some(t=>t.reason==='data_gap'));
 advanceDetector(state,row(60,30));assert.deepEqual(advanceDetector(state,row(30,20)),[]);
});
test('rates carry actual elapsed minutes and peer values remain explicit',()=>{
 const state={};advanceDetector(state,row(0,22));advanceDetector(state,row(0,22,'n2','s2'));
 const transitions=advanceDetector(state,row(10,26));const rate=transitions.find(t=>t.kind==='rate');assert.equal(rate.evidence.rate,.4);assert.equal(rate.evidence.minutes,10);
 const peer=transitions.find(t=>t.kind==='peer');assert.equal(peer.evidence.peerCount,1);assert.equal(peer.evidence.delta,4);
});
test('report rejects invalid windows and timezones',()=>{
 assert.throws(()=>analyzeObservations([],{from:'bad',to:new Date()}));
 assert.throws(()=>analyzeObservations([],{from:new Date(base),to:new Date(base+60000),timeZone:'bad-zone'}));
});
test('measured PPFD integrates to DLI on a full calendar day without lux conversion',()=>{
 const rows=Array.from({length:288},(_,i)=>row(i*5,22,'n1','s1',{ppfd:200}));
 const report=analyzeObservations(rows,{from:new Date(base),to:new Date(base+86400000),timeZone:'UTC'});
 const d=report.daily.find(d=>d.metric==='ppfd');assert.equal(d.dliObserved,17.28);assert.equal(d.completeCalendarDay,true);assert.equal(d.coveragePct,100);
});
test('a context change ends the old sensor hold even when next packet has no climate value',()=>{
 const first=row(0,30),next=row(5,null,'n1','s2');
 const report=analyzeObservations([first,next],{from:new Date(base),to:new Date(base+20*60000),timeZone:'UTC'});
 assert.equal(report.metrics.find(m=>m.sectionId==='s1'&&m.metric==='airTemp').observedMinutes,5);
});
test('cached sensor values cannot count as fresh diagnostic observations',()=>{
 assert.equal(valueFor(row(0,24,'n','s',{raw_object:{sensors:{sht45:{present:true,state:'cached_read_failed'}}}}),'airTemp'),null);
});

test('equipment response requires observed windows and does not assert causality',async()=>{
 const {controllerResponses}=await import('../diagnostics/controller-response.js');
 const rows=Array.from({length:12},(_,i)=>row(i*5,i<6?22:26));
 const [response]=controllerResponses(rows,[{id:'event',occurred_at:new Date(base+30*60000),channel:'heating',source:'manual'}],{from:new Date(base),to:new Date(base+60*60000)});
 const temp=response.zones.find(z=>z.metric==='airTemp');assert.equal(temp.delta,4);assert.equal(temp.beforeCoveragePct,100);assert.equal(response.causality,'not-established');
 const [sparse]=controllerResponses([row(0,22),row(30,26)],[{id:'event',occurred_at:new Date(base+30*60000)}],{from:new Date(base),to:new Date(base+60*60000)});
 assert.equal(sparse.zones.find(z=>z.metric==='airTemp').delta,null);
});

test('moving a node closes the previous context episode immediately',()=>{
 const state={};advanceDetector(state,row(0,30));
 const changes=advanceDetector(state,row(5,30,'n1','s2'));
 assert.ok(changes.some(c=>c.type==='close'&&c.reason==='context_changed'&&c.at===base+5*60000));
 assert.ok(changes.some(c=>c.type==='open'&&c.ctx.sectionId==='s2'));
});
