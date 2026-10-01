import { expect, test } from 'vitest'
import { findingNarrative } from './narrative'
import type { DiagnosticReport, DiagnosticMetric } from './types'
const metric={sectionId:'s',metric:'airTemp',unit:'°C',observedMinutes:120,aboveMinutes:30,belowMinutes:30,minimum:15,maximum:30,coveragePct:90,estimatedContextPct:70,peerMinutes:0,hourly:[{hour:3,observedMinutes:120,outsideMinutes:100,recurringDays:3}]} as DiagnosticMetric
const finding={...metric,kind:'outside-target',severity:'medium'}
const report={metrics:[metric],nodes:[{...metric,nodeName:'Sensor A'}],explanations:[],timeZone:'UTC'} as unknown as DiagnosticReport

test('older results produce concrete per-sensor findings without invented episodes or causes',()=>{
 const text=findingNarrative(report,finding,false)
 expect(text.evidence.join(' ')).toContain('Sensor A: outside targets for 50%')
 expect(text.pattern.join(' ')).toContain('3:00–4:00')
 expect(text.pattern.join(' ')).toContain('no individual episode analysis')
 expect(text.interpretation.join(' ')).toContain('both directions')
 expect(text.confidence).toContain('70%')
})
test('VPD is explicitly identified as derived evidence',()=>{
 const vpd={...finding,metric:'vpd'}
 expect(findingNarrative({...report,metrics:[vpd],nodes:[]},vpd,false).interpretation.join(' ')).toContain('not independent confirmation')
})
