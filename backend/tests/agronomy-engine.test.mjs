import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHistoricalAgronomy, interpretAgronomicReport, withAgronomicInsights,
  buildTodayActions, buildAgronomicInteractionCandidates, AGRONOMY_ENGINE_VERSION, AGRONOMY_CATALOG_VERSION
} from '../agronomy/index.js';
import { HISTORICAL_RULES, WATER_RULES } from '../agronomy/catalog.js';

const water = {kind:'high-vpd',nodeId:'n',nodeName:'Sensor',sectionId:'s',sectionName:'Zone',profileId:'p',stage:null,crops:[],estimated:false,minutes:60,longestMinutes:30,rootDryMinutes:0,rootObservedMinutes:0,vpdMin:1.5,vpdMax:2,target:[.6,1.2],firstAt:'2026-09-01',lastAt:'2026-09-02',dewPoint:null,leafTemperature:null};
const growth = {kind:'ph-ec-imbalance',primaryMetric:'ph',nodeId:'n',nodeName:'Probe',sectionId:'s',sectionName:'Zone',profileId:'p',stage:'vegetative',crops:['tomato'],estimated:false,minutes:60,longestMinutes:30,firstAt:'2026-09-01',lastAt:'2026-09-02',support:[{metric:'ph',minimum:7,maximum:7.5,target:[5.5,6.5],unit:''},{metric:'ec',minimum:.4,maximum:.6,target:[1,3],unit:'mS/cm'}]};
const report = risks => ({agronomy:risks,nodes:[]});
const advise = risks => interpretAgronomicReport(report(risks)).en;

for (const rule of HISTORICAL_RULES) test(`backend decision has bilingual reasoning, verification and source: ${rule.id}`, () => {
  const result = interpretAgronomicReport(report([{...growth,kind:rule.id}]));
  for (const language of ['lt','en']) {
    const [a] = result[language];
    assert.ok(a.title.length > 15);
    assert.ok(a.action.length > 40);
    assert.ok(a.verify.length > 30);
    assert.match(a.source.url, /^https:\/\//);
    assert.equal(a.ruleId, rule.id);
    assert.equal(a.evidenceDetails.nodeId, growth.nodeId);
  }
});

test('VPD without root evidence requires a check, not an instruction to increase irrigation', () => {
  const [a] = advise([water]);
  assert.match(a.action, /before increasing irrigation/);
  assert.match(a.limits, /substrate water deficit is not established/);
  assert.match(a.meaning, /photosynthesis/);
  assert.equal(a.evidenceDetails.rootObservedMinutes, 0);
});
test('simultaneous dry roots change the first decision to checking water delivery', () => {
  const [a] = advise([{...water,rootDryMinutes:40,rootObservedMinutes:60}]);
  assert.match(a.action, /inspect emitters/);
  assert.match(a.title, /coincided/);
});
test('humidity alone cannot create a plant-stress or condensation diagnosis', () => {
  assert.deepEqual(interpretAgronomicReport({nodes:[{metric:'humidity',coveragePct:100,observedMinutes:100,aboveMinutes:100}]}).en, []);
});
test('legacy VPD cannot invent simultaneous roots, continuous episodes or captured context', () => {
  const old = {nodes:[{metric:'vpd',nodeId:'n',name:'Zone',nodeName:'Sensor',sectionId:'s',observedMinutes:100,coveragePct:100,aboveMinutes:90,belowMinutes:0,estimatedContextPct:20}]};
  const [a] = withAgronomicInsights(old).agronomicInsights.en;
  assert.doesNotMatch(a.evidence, /Concurrent|continuous/);
  assert.match(a.limits, /Historical targets/);
  assert.equal(a.evidenceDetails.contextQuality, 'summary-only');
  assert.equal(a.evidenceDetails.longestMinutes, null);
  assert.equal(a.evidenceDetails.rootDryMinutes, null);
});
test('pH and EC interpretation tests causes before adding nutrients', () => {
  const [a] = advise([growth]);
  assert.match(a.action, /pH and dosing causes/);
  assert.match(a.evidence, /EC/);
  assert.match(a.evidence, /0.5 h/);
});
test('lux is not described as measured photons or DLI', () => {
  const [a] = advise([{...growth,kind:'light-low',primaryMetric:'lux',support:[{metric:'lux',minimum:300,maximum:400,target:[1000,30000],unit:'lx'}]}]);
  assert.match(a.limits, /not a measurement of plant photons or DLI/);
});
test('probe exposure is selected, never added up into elapsed greenhouse time', () => {
  const [a] = advise([growth,{...growth,nodeId:'other',nodeName:'Other',minutes:120}]);
  assert.match(a.evidence, /Other/);
  assert.match(a.evidence, /2 h;/);
  assert.doesNotMatch(a.evidence, /3 h;/);
});
test('crop stages and different historical targets retain independent evidence and decisions', () => {
  const decisions = advise([water,{...water,stage:'fruiting'},{...water,target:[.4,.8]}]);
  assert.equal(decisions.length,3);
  assert.equal(new Set(decisions.map(a=>a.id)).size,3);
  assert.deepEqual(decisions.map(a=>a.evidenceDetails.stage),[null,'fruiting',null]);
});
test('an explicit empty risk analysis never falls back to summary-only advice', () => {
  assert.deepEqual(interpretAgronomicReport({agronomy:[],nodes:[{metric:'vpd',coveragePct:100,observedMinutes:100,aboveMinutes:100}]}).en,[]);
});
test('versioned snapshots retain their original decisions and are not reinterpreted', () => {
  const old = report([water]);
  const original = structuredClone(old);
  const migrated = withAgronomicInsights(old);
  assert.deepEqual(old,original);
  assert.equal(migrated.agronomicInsights.origin,'legacy-report');
  assert.equal(migrated.agronomicInsights.engineVersion,AGRONOMY_ENGINE_VERSION);
  assert.equal(migrated.agronomicInsights.catalogVersion,AGRONOMY_CATALOG_VERSION);
  migrated.agronomicInsights.en[0].title='Previously saved decision';
  migrated.agronomicInsights.catalogVersion='previous-catalog';
  const restored=JSON.parse(JSON.stringify(migrated));
  assert.equal(withAgronomicInsights(restored),restored);
  assert.equal(restored.agronomicInsights.en[0].title,'Previously saved decision');
});
test('real observations run through the common engine into evidence-backed bilingual decisions', () => {
  const start=Date.parse('2026-09-01T00:00:00Z');
  const rows=Array.from({length:12},(_,i)=>({time:new Date(start+i*300000),dev_eui:'n',diagnostic_context_id:'ctx',temperature:30,humidity:30,soil_moisture:20,context:{sectionId:'s',sectionName:'Zone',source:'physical',profileId:'p',metrics:{vpd:{optimal:[.5,1.2]},soilMoisture:{optimal:[30,60]}}}}));
  const result=analyzeHistoricalAgronomy(rows,{from:new Date(start),to:new Date(start+3600000)});
  assert.equal(result.agronomicInsights.origin,'historical-analysis');
  const high=result.agronomicInsights.en.find(a=>a.ruleId==='high-vpd');
  assert.match(high.action,/inspect emitters/);
  assert.equal(high.evidenceDetails.rootDryMinutes,60);
  assert.equal(high.evidenceDetails.contextId,'ctx');
  assert.deepEqual(result.agronomicInsights.en.map(a=>a.id),result.agronomicInsights.lt.map(a=>a.id));
  assert.equal(analyzeHistoricalAgronomy(rows.map(r=>({...r,context:{...r.context,source:'simulated'}})),{from:new Date(start),to:new Date(start+3600000)}).agronomicInsights.en.length,0);
});
test('live decisions use the same engine and carry the catalog version', () => {
  const actions=buildTodayActions([{section:{id:'s',name:'Zone'},reportingNodes:1,registeredNodes:1,scoreRules:{vpd:{optimal:[.5,1.2]},soilMoisture:{optimal:[30,60]}},evaluations:[{metricId:'vpd',value:2,state:'warning',direction:'high',severity:.7},{metricId:'soilMoisture',value:20,state:'warning',direction:'low',severity:.7}]}]);
  assert.ok(actions.length);
  assert.equal(actions[0].ruleId,'ATM_ROOT_DROUGHT');
  assert.equal(actions[0].agronomyEngineVersion,AGRONOMY_ENGINE_VERSION);
  assert.equal(actions[0].agronomyCatalogVersion,AGRONOMY_CATALOG_VERSION);
});
test('a missing live value is not converted into zero or treated as confirmed dry roots', () => {
  for (const value of [null,undefined,'',false]) {
    const candidates=buildAgronomicInteractionCandidates({section:{id:'s',name:'Zone'},scoreRules:{vpd:{optimal:[.5,1.2]},soilMoisture:{optimal:[30,60]}},evaluations:[{metricId:'vpd',value:2,state:'warning',direction:'high'},{metricId:'soilMoisture',value,state:'warning',direction:'low'}]});
    assert.deepEqual(candidates,[]);
  }
});
test('all water rules explicitly declare the observations they require', () => {
  assert.deepEqual(WATER_RULES['leaf-condensation'].requiredMetrics,['airTemp','humidity','leafTemp']);
});
test('live and historical condensation use one physical dew-point calculation', () => {
  const metrics={humidity:{optimal:[55,70]},airTemp:{optimal:[20,24]},leafTemp:{optimal:[20,24]}};
  const live=buildAgronomicInteractionCandidates({section:{id:'s',name:'Zone'},scoreRules:metrics,evaluations:[{metricId:'humidity',value:92,direction:'high',state:'warning'},{metricId:'airTemp',value:22,direction:'optimal',state:'ok'},{metricId:'leafTemp',value:20,direction:'optimal',state:'ok'}]}).find(a=>a.ruleId==='CONDENSATION_IMMINENT');
  const start=Date.parse('2026-09-01');
  const rows=Array.from({length:12},(_,i)=>({time:new Date(start+i*300000),dev_eui:'n',diagnostic_context_id:'c',temperature:22,humidity:92,leaf_temperature:20,context:{sectionId:'s',source:'physical',metrics}}));
  const historical=analyzeHistoricalAgronomy(rows,{from:new Date(start),to:new Date(start+3600000)}).agronomy.find(r=>r.kind==='leaf-condensation');
  assert.ok(live);assert.ok(historical);
  assert.equal(live.derived.dewPointMargin,Number((historical.leafTemperature-historical.dewPoint).toFixed(2)));
});
