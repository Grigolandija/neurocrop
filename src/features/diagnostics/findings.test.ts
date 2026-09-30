import {describe,it,expect} from 'vitest'
import {prioritizeFindings} from './findings'
import type {DiagnosticReport} from './types'
const finding=(metric:string,sectionId='one',extra={})=>({metric,sectionId,name:sectionId,kind:'outside-target',severity:'medium',coveragePct:100,estimatedContextPct:0,outsideObservedPct:20,recurringDays:1,...extra})
const report=(insights:unknown[])=>({insights} as DiagnosticReport)
describe('cross-metric diagnostic priorities',()=>{
 it('groups humidity and VPD in one location but keeps both facts and other locations',()=>{
  const groups=prioritizeFindings(report([finding('humidity'),finding('vpd'),finding('airTemp'),finding('humidity','two')]))
  expect(groups).toHaveLength(3);expect(groups.find(g=>g.id==='one:air-moisture')?.items.map(i=>i.metric)).toEqual(['humidity','vpd'])
 })
 it('ranks reliable strong findings first and keeps peer and target evidence',()=>{
  const groups=prioritizeFindings(report([finding('co2','one'),finding('airTemp','two',{severity:'high'}),finding('airTemp','two',{kind:'systematic-peer'}),finding('lux','three',{kind:'insufficient-data'})]))
  expect(groups[0].sectionId).toBe('two');expect(groups[0].items).toHaveLength(2);expect(groups).toHaveLength(2)
 })
})
