import test from 'node:test';
import assert from 'node:assert/strict';
import {explainDiagnostics} from '../diagnostics/explanations.js';
const start=Date.parse('2026-09-01T00:00:00Z');
const row=(minute,value,id='n1',section='s1')=>({time:new Date(start+minute*60000),dev_eui:id,diagnostic_context_id:section,temperature:value,humidity:60,context:{nodeName:id,sectionId:section,areaId:'a',source:'physical',metrics:{airTemp:{optimal:[20,25]}}}});
const report={from:new Date(start).toISOString(),to:new Date(start+60*60000).toISOString(),timeZone:'UTC',insights:[{sectionId:'s1',metric:'airTemp',kind:'outside-target'}]};
test('explains separate bounded events, exact departure and local peer evidence',()=>{
 const readings=[row(0,30),row(5,32),row(10,22),row(20,30),row(25,22),row(0,22,'n2','s2'),row(0,23,'n3','s3')];
 const [e]=explainDiagnostics(readings,report),d=e.directions.above;
 assert.equal(d.eventCount,2);assert.equal(d.minutes,15);assert.equal(d.longestMinutes,10);assert.equal(d.peak.departure,7);assert.equal(d.peak.limit,25);assert.equal(d.scope,'local');assert.equal(d.peersAtPeak.configuredCount,2);assert.equal(e.trend,'insufficient-evidence');
});
test('data gaps end episodes and stale peers never support a local diagnosis',()=>{
 const [e]=explainDiagnostics([row(0,30),row(30,35),row(0,22,'n2','s2'),row(0,23,'n3','s3')],report);
 assert.equal(e.directions.above.minutes,20);assert.equal(e.directions.above.eventCount,2);assert.equal(e.directions.above.scope,'insufficient-peers');
});
test('widespread classification requires fresh configured peers at the strongest excursion',()=>{
 const [e]=explainDiagnostics([row(0,30),row(0,31,'n2','s2'),row(0,32,'n3','s3')],report);assert.equal(e.directions.above.scope,'widespread');
});
test('context changes stop an interval even when the new packet has no valid value',()=>{
 const next=row(5,null);next.diagnostic_context_id='other';next.context.sectionId='other';
 const [e]=explainDiagnostics([row(0,30),next],report);assert.equal(e.directions.above.minutes,5);
});
test('profiles changing between halves prevent an improvement claim',()=>{
 const readings=Array.from({length:12},(_,i)=>{const r=row(i*5,30);if(i>=6){r.diagnostic_context_id='changed';r.context.metrics.airTemp.optimal=[20,35];}return r;});
 const [e]=explainDiagnostics(readings,report);assert.equal(e.halves[0].outsidePct,100);assert.equal(e.halves[1].outsidePct,0);assert.equal(e.trend,'insufficient-evidence');
});
test('co-occurrence is reported only with sufficient fresh evidence in both groups',()=>{
 const readings=Array.from({length:24},(_,i)=>{const r=row(i*5,i<12?30:22);r.humidity=i<12?90:60;return r;});
 const [e]=explainDiagnostics(readings,{...report,to:new Date(start+120*60000).toISOString()});
 const rh=e.related.find(r=>r.metric==='humidity');assert.equal(rh.during,90);assert.equal(rh.otherwise,60);assert.equal(e.trend,'comparable');
});

test('related readings are matched by hour and direction instead of mixing hot and cold episodes',()=>{
 const readings=[];
 for(let day=0;day<6;day++)for(let minute=0;minute<60;minute+=5){const r=row(day*1440+minute,day<2?30:day<4?15:22);r.humidity=day<2?80:day<4?40:60;readings.push(r);}
 const [e]=explainDiagnostics(readings,{...report,to:new Date(start+6*86400000).toISOString()});
 const high=e.directions.above.matchedRelated.find(r=>r.metric==='humidity');
 const low=e.directions.below.matchedRelated.find(r=>r.metric==='humidity');
 assert.equal(high.during,80);assert.equal(high.baseline,60);assert.equal(low.during,40);assert.equal(low.baseline,60);
 assert.ok(high.matchedMinutes>=60);assert.equal(e.directions.above.meanDeparture,5);
});
test('different times of day cannot produce an hour-matched association',()=>{
 const readings=[];
 for(let day=0;day<4;day++)for(let minute=0;minute<60;minute+=5){const r=row(day*1440+(day<2?720:0)+minute,day<2?30:22);r.humidity=day<2?80:60;readings.push(r);}
 const [e]=explainDiagnostics(readings,{...report,to:new Date(start+4*86400000).toISOString()});
 assert.deepEqual(e.directions.above.matchedRelated,[]);
});
test('hour-matched comparisons do not cross historical configuration changes',()=>{
 const readings=[];
 for(let day=0;day<4;day++)for(let minute=0;minute<60;minute+=5){const r=row(day*1440+minute,day<2?30:22);if(day>=2)r.diagnostic_context_id='new-context';readings.push(r);}
 const [e]=explainDiagnostics(readings,{...report,to:new Date(start+4*86400000).toISOString()});
 assert.deepEqual(e.directions.above.matchedRelated,[]);
});
