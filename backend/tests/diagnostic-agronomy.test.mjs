import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAgronomy} from '../diagnostics/agronomy.js';
const start=Date.parse('2026-09-01T00:00:00Z');
const context={sectionId:'s',sectionName:'Zone',source:'physical',profileId:'p',stage:'vegetative',cycles:[{crop:'tomato'}],metrics:{vpd:{optimal:[.5,1.2]},soilMoisture:{optimal:[30,60]}}};
const row=(minute,extra={})=>({time:new Date(start+minute*60000),dev_eui:'n',diagnostic_context_id:'ctx',context,temperature:30,humidity:30,soil_moisture:20,...extra});
const analyze=rows=>analyzeAgronomy(rows,{from:new Date(start),to:new Date(start+3600000)});
test('high VPD and dry roots must coincide; context and duration are retained',()=>{
 const [r]=analyze(Array.from({length:12},(_,i)=>row(i*5)));
 assert.equal(r.kind,'high-vpd');assert.equal(r.minutes,60);assert.equal(r.rootDryMinutes,60);assert.equal(r.longestMinutes,60);assert.deepEqual(r.crops,['tomato']);
});
test('nonconcurrent dry soil cannot be combined with a later high-VPD interval',()=>{
 const [r]=analyze(Array.from({length:12},(_,i)=>row(i*5,i<6?{temperature:20,humidity:60}:{soil_moisture:50})));
 assert.equal(r.rootDryMinutes,0);assert.equal(r.minutes,30);
});
test('missing data, disabled probes and cached sensor readings do not establish root deficit',()=>{
 assert.deepEqual(analyze([row(0)]),[]);
 const [r]=analyze(Array.from({length:12},(_,i)=>row(i*5,{context:{...context,sensors:[{port:'soil_moisture_probe',is_enabled:false}]}})));
 assert.equal(r.rootObservedMinutes,0);
 const [cached]=analyze(Array.from({length:12},(_,i)=>row(i*5,{raw_object:{sensors:{soil_moisture_probe:{present:true,state:'cached_read_failed'}}}})));
 assert.equal(cached.rootObservedMinutes,0);
});
test('high RH without leaf temperature does not establish leaf-condensation conditions',()=>{
 const risks=analyze(Array.from({length:12},(_,i)=>row(i*5,{temperature:20,humidity:95})));
 assert.equal(risks.some(r=>r.kind==='leaf-condensation'),false);assert.equal(risks[0].kind,'low-vpd');
});
test('a measured cold leaf supports dew-point screening, not a disease diagnosis',()=>{
 const risks=analyze(Array.from({length:12},(_,i)=>row(i*5,{temperature:20,humidity:95,leaf_temperature:18})));
 const r=risks.find(r=>r.kind==='leaf-condensation');assert.ok(r);assert.equal(r.minutes,60);assert.equal(r.leafTemperature,18);assert.ok(r.dewPoint>18);
});
test('changed profiles never merge agronomic exposure into one crop context',()=>{
 const risks=analyze(Array.from({length:12},(_,i)=>row(i*5,i>=6?{diagnostic_context_id:'new',context:{...context,stage:'fruiting'}}:{})));
 assert.equal(risks.filter(r=>r.kind==='high-vpd').length,2);assert.deepEqual(risks.filter(r=>r.kind==='high-vpd').map(r=>r.minutes),[30,30]);
});
