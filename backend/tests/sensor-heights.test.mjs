import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementHeights,historicalMeasurementHeights,saveSensorHeight,loadHeightEvents } from '../sensor-heights.js';

test('height normalization distinguishes zero, absent and explicitly unknown heights per channel',()=>{
  assert.deepEqual(measurementHeights({sht45:{height_cm:0},scd4x:{height_cm:null,height_recorded_at:'2026-10-20T12:00:00Z'}}),{'air-temperature':0,'relative-humidity':0,vpd:0,co2:null});
  assert.deepEqual(measurementHeights({sht45:{height_cm:null}}),{});
  assert.deepEqual(measurementHeights({sht45:{height_cm:150},scd4x:{height_cm:280}}),{'air-temperature':1.5,'relative-humidity':1.5,vpd:1.5,co2:2.8});
});
const event=(time,height,port='sht45')=>({recorded_at:new Date(time).toISOString(),operation:'UPDATE',snapshot:{node_dev_eui:'a',port,height_cm:height,height_recorded_at:new Date(time).toISOString()}});
test('historical heights use the configuration at that time and reject rollups spanning a change',()=>{
  const events=[event(0,120),event(900000,280),event(1800000,null)];
  assert.equal(historicalMeasurementHeights(events,'a',0,600000)['air-temperature'],1.2);
  assert.equal(historicalMeasurementHeights(events,'a',600000,1200000)['air-temperature'],null);
  assert.equal(historicalMeasurementHeights(events,'a',1200000,1800000)['air-temperature'],2.8);
  assert.equal(historicalMeasurementHeights(events,'a',1800000,2400000)['air-temperature'],null);
  assert.equal(historicalMeasurementHeights(events,'other',0,600000)['air-temperature'],null);
});
test('height writes update only height and its timestamp, preserving crop and sensor purpose',async()=>{
  let sql,params;
  await saveSensorHeight({query:async(s,p)=>{sql=s;params=p}},'org-a','a',{port:'scd4x',medium:'air',spatialScope:'point',targetType:'incubator',targetName:'Incubator 1',useForSectionScore:false,allowSpatialInterpolation:false},150);
  assert.equal(params[1],'org-a');assert.equal(params[10],150);
  const mutation=sql.split('DO UPDATE')[1];
  assert.match(mutation,/height_recorded_at=now\(\)/);
  assert.doesNotMatch(mutation,/medium=|spatial_scope=|use_for_section_score=|target_type=/);
  await assert.rejects(saveSensorHeight({},'org','a',{},'150'),/Invalid/);
  await assert.rejects(saveSensorHeight({},'org','a',{},-1),/Invalid/);
});
test('height history reads are tenant-scoped and bounded by node IDs and time',async()=>{
  let sql,params;
  await loadHeightEvents({query:async(s,p)=>{sql=s;params=p;return{rows:[]}}},'org-a',['abc'],'2026-10-20T00:00:00Z','2026-10-21T00:00:00Z');
  assert.equal(params[0],'org-a');assert.ok(params[1].includes('abc:sht45'));
  assert.match(sql,/organization_id=\$1/g);assert.match(sql,/entity_id=ANY\(\$2::text\[\]\)/);
  assert.match(sql,/recorded_at>\$3 AND recorded_at<=\$4/);
});

test('Node height automatically supplies every channel, with only external sensor overrides',()=>{
  const node={installation_height_cm:150,installation_height_recorded_at:'2026-10-20T12:00:00Z'};
  const heights=measurementHeights({sht45:{height_cm:250},scd4x:{height_cm:280}},node);
  assert.equal(heights['air-temperature'],1.5);assert.equal(heights['relative-humidity'],1.5);
  assert.equal(heights.co2,2.8);assert.equal(heights.vpd,1.5);
  assert.equal(measurementHeights({},node).co2,1.5);
  assert.equal(measurementHeights({},{...node,installation_height_cm:null})['air-temperature'],null);
});
test('historical Node heights do not rewrite older readings and rollups spanning a move are unknown',()=>{
  const events=[{recorded_at:new Date(0).toISOString(),operation:'UPDATE',snapshot:{dev_eui:'a',installation_height_cm:120,installation_height_recorded_at:new Date(0).toISOString()}},
    {recorded_at:new Date(900000).toISOString(),operation:'UPDATE',snapshot:{dev_eui:'a',installation_height_cm:280,installation_height_recorded_at:new Date(900000).toISOString()}}];
  assert.equal(historicalMeasurementHeights(events,'a',0,600000)['air-temperature'],1.2);
  assert.equal(historicalMeasurementHeights(events,'a',600000,1200000)['air-temperature'],null);
  assert.equal(historicalMeasurementHeights(events,'a',1200000,1800000).co2,2.8);
});
