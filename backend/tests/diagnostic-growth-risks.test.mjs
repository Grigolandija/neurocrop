import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeGrowthRisks,GROWTH_RULES} from '../diagnostics/growth-risks.js';
const start=Date.parse('2026-09-01T12:00:00Z');
const context={sectionId:'s',source:'physical',profileId:'crop',metrics:{airTemp:{optimal:[20,25]},soilTemp:{optimal:[18,24]},waterTemp:{optimal:[18,24]},soilMoisture:{optimal:[30,60]},soilEc:{optimal:[1,3]},ec:{optimal:[1,3]},ph:{optimal:[5.5,6.5]},co2:{optimal:[500,1000]},vpd:{optimal:[.5,1.5]},ppfd:{optimal:[200,600]},lux:{optimal:[1000,30000],lightingSchedule:{enabled:true,start:'06:00',end:'22:00',timeZone:'UTC',darkThresholdLux:100}}}};
const base={temperature:22,humidity:60,soil_temperature:21,water_temperature:21,soil_moisture:45,soil_ec:2,ec:2,ph:6,co2:700,ppfd:400};
const make=(extra={},ctx=context,offset=0)=>Array.from({length:12},(_,i)=>({...base,...extra,time:new Date(start+offset+i*300000),dev_eui:'n',diagnostic_context_id:'c',context:ctx}));
const analyze=(rows,offset=0)=>analyzeGrowthRisks(rows,{from:new Date(start+offset),to:new Date(start+offset+3600000),timeZone:'UTC'});
const cases={
 'heat-load':{temperature:30},'cold-growth':{temperature:10},'root-cold':{soil_temperature:10},'root-hot':{soil_temperature:30},'water-cold':{water_temperature:10},'water-hot':{water_temperature:30},
 'dry-root':{soil_moisture:20},'wet-root':{soil_moisture:80},'substrate-salinity':{soil_ec:4},'substrate-low-ec':{soil_ec:.5},'solution-high-ec':{ec:4},'solution-low-ec':{ec:.5},'ph-high':{ph:7},'ph-low':{ph:4},
 'co2-low-lit':{co2:300},'co2-high-lit':{co2:1200},'co2-high-dark':{co2:1200,ppfd:0},'light-low':{ppfd:100},'light-high':{ppfd:800},'light-at-night':{ppfd:400},
 'dry-saline-root':{soil_ec:4,soil_moisture:20},'wet-cold-root':{soil_temperature:10,soil_moisture:80},'ph-ec-imbalance':{ph:7,ec:.5},'heat-light-mismatch':{temperature:30,ppfd:100},'co2-water-limitation':{co2:300,temperature:30,humidity:30},
};
for(const [kind,values] of Object.entries(cases))test(`agronomic rule: ${kind}`,()=>{
 const offset=kind==='light-at-night'?12*3600000:0;
 const risk=analyze(make(values,context,offset),offset).find(r=>r.kind===kind);
 assert.ok(risk);assert.equal(risk.minutes,60);assert.equal(risk.longestMinutes,60);assert.ok(risk.support.every(s=>Number.isFinite(s.minimum)));
});
test('all rules have a covered scenario',()=>assert.deepEqual(GROWTH_RULES.map(r=>r[0]).sort(),Object.keys(cases).sort()));
test('balanced readings produce no warning and darkness is not a CO2 shortage',()=>{
 assert.deepEqual(analyze(make()),[]);
 assert.equal(analyze(make({ppfd:0,co2:100})).some(r=>r.kind==='co2-low-lit'),false);
});
test('root chemistry still works without any climate sensor',()=>{
 const risks=analyze(make({temperature:null,humidity:null,ec:4,ph:7}));
 assert.ok(risks.some(r=>r.kind==='solution-high-ec'));assert.ok(risks.some(r=>r.kind==='ph-high'));
});
test('darkness outside the schedule is not reported as insufficient light',()=>{
 const offset=12*3600000;
 assert.equal(analyze(make({ppfd:0},context,offset),offset).some(r=>r.kind==='light-low'),false);
});
test('measurements from different packets or nodes never create a simultaneous interaction',()=>{
 const rows=make().map((r,i)=>({...r,soil_moisture:i%2?45:20,soil_ec:i%2?4:2}));
 assert.equal(analyze(rows).some(r=>r.kind==='dry-saline-root'),false);
 const others=make({soil_ec:4,soil_moisture:45}).map(r=>({...r,dev_eui:'other'}));
 assert.equal(analyze([...make({soil_moisture:20}),...others]).some(r=>r.kind==='dry-saline-root'),false);
});
test('cached or disabled probes and missing historical targets cannot generate risks',()=>{
 const rows=make({soil_ec:4,raw_object:{sensors:{soil_ec_probe:{present:true,state:'cached_read_failed'}}}});
 assert.equal(analyze(rows).some(r=>r.kind==='substrate-salinity'),false);
 assert.deepEqual(analyze(make({ph:7},{...context,metrics:{}})),[]);
 assert.equal(analyze(make({ph:7},{...context,sensors:[{port:'ph_probe',is_enabled:false}]})).some(r=>r.kind==='ph-high'),false);
});
test('profile changes and missing observations stop episode continuity',()=>{
 const rows=[...make({ph:7}).slice(0,6),...make({ph:7}).slice(6).map(r=>({...r,diagnostic_context_id:'changed'}))];
 const risks=analyze(rows).filter(r=>r.kind==='ph-high');assert.equal(risks.length,2);assert.ok(risks.every(r=>r.longestMinutes===30));
 assert.deepEqual(analyze(make({ph:7}).slice(0,1)),[]);
});
test('a packet spanning lights-on counts only the daytime portion as low light',()=>{
 const offset=-6*3600000-5*60000;
 const rows=make({ppfd:100},context,offset).filter((_,i)=>i%2===0);
 const r=analyze(rows,offset).find(r=>r.kind==='light-low');assert.equal(r.minutes,55);
});
