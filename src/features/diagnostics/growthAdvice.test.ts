import {expect,test} from 'vitest'
import {growthAdvice,growthAdviceRules} from './growthAdvice'
import {agronomicAdvice} from './agronomicAdvice'
import type {DiagnosticReport,GrowthRisk} from './types'
const risk:GrowthRisk={kind:'ph-ec-imbalance',primaryMetric:'ph',nodeId:'n',nodeName:'Probe',sectionId:'s',sectionName:'Zone',profileId:'p',stage:'vegetative',crops:['tomato'],estimated:false,minutes:60,longestMinutes:30,firstAt:'2026-09-01',lastAt:'2026-09-02',support:[{metric:'ph',minimum:7,maximum:7.5,target:[5.5,6.5],unit:''},{metric:'ec',minimum:.4,maximum:.6,target:[1,3],unit:'mS/cm'}]}
const report={agronomy:[risk],nodes:[]} as unknown as DiagnosticReport
for(const kind of Object.keys(growthAdviceRules))test(`bilingual decision and source: ${kind}`,()=>{
 for(const lt of [true,false]){
  const [a]=growthAdvice({...report,agronomy:[{...risk,kind}]},lt)
  expect(a.title.length).toBeGreaterThan(15);expect(a.action.length).toBeGreaterThan(40);expect(a.verify.length).toBeGreaterThan(30);expect(a.source.url).toMatch(/^https:\/\//)
 }
})
test('pH/EC interaction recommends testing before adding nutrients',()=>{
 const [a]=agronomicAdvice(report,false);expect(a.action).toContain('pH and dosing causes');expect(a.evidence).toContain('EC');expect(a.evidence).toContain('0.5 h');
})
test('lux is never described as measured plant photons or DLI',()=>{
 const [a]=growthAdvice({...report,agronomy:[{...risk,kind:'light-low',primaryMetric:'lux',support:[{metric:'lux',minimum:300,maximum:400,target:[1000,30000],unit:'lx'}]}]},false)
 expect(a.limits).toContain('not a measurement of plant photons or DLI')
})
test('repeated sensor findings choose an evidenced location rather than summing exposure',()=>{
 const [a]=growthAdvice({...report,agronomy:[risk,{...risk,nodeId:'other',nodeName:'Other',minutes:120}]},false)
 expect(a.evidence).toContain('Other');expect(a.evidence).toContain('2 h;');expect(a.evidence).not.toContain('3 h;')
})
