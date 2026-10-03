import {expect,test} from 'vitest'
import {agronomicAdvice} from './agronomicAdvice'
import type {AgronomicRisk,DiagnosticReport} from './types'
const risk:AgronomicRisk={kind:'high-vpd',nodeId:'n',nodeName:'Sensor',sectionId:'s',sectionName:'Zone',profileId:'p',stage:null,crops:[],estimated:false,minutes:60,longestMinutes:30,rootDryMinutes:0,rootObservedMinutes:0,vpdMin:1.5,vpdMax:2,target:[.6,1.2],firstAt:'2026-09-01',lastAt:'2026-09-02',dewPoint:null,leafTemperature:null}
const report=(r:AgronomicRisk[])=>({agronomy:r,nodes:[]} as unknown as DiagnosticReport)
test('missing root evidence does not produce an instruction to increase irrigation',()=>{
 const [a]=agronomicAdvice(report([risk]),false)
 expect(a.action).toContain('before increasing irrigation')
 expect(a.limits).toContain('substrate water deficit is not established')
 expect(a.meaning).toContain('photosynthesis')
})
test('concurrent dry roots change the first decision to water-delivery inspection',()=>{
 const [a]=agronomicAdvice(report([{...risk,rootDryMinutes:40,rootObservedMinutes:60}]),false)
 expect(a.action).toContain('inspect emitters')
 expect(a.title).toContain('coincided')
})
test('humidity summaries alone cannot create a condensation or plant-stress diagnosis',()=>{
 expect(agronomicAdvice({nodes:[{metric:'humidity',coveragePct:100,observedMinutes:100,aboveMinutes:100}]} as DiagnosticReport,false)).toEqual([])
})
test('legacy VPD supports conditional advice but never invents simultaneous root evidence',()=>{
 const [a]=agronomicAdvice({nodes:[{metric:'vpd',nodeId:'n',name:'Zone',nodeName:'Sensor',sectionId:'s',observedMinutes:100,coveragePct:100,aboveMinutes:90,belowMinutes:0,estimatedContextPct:20}]} as DiagnosticReport,false)
 expect(a.evidence).not.toContain('Concurrent')
 expect(a.evidence).not.toContain('continuous')
 expect(a.limits).toContain('Historical targets')
})
