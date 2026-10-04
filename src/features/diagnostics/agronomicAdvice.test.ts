import { expect, test } from 'vitest'
import { agronomicAdvice } from './agronomicAdvice'
import type { AgronomicAdvice, DiagnosticReport } from './types'

const en=[{id:'first',title:'Saved first decision',priority:10},{id:'second',title:'Saved second decision',priority:100}] as AgronomicAdvice[]
const lt=[{id:'first',title:'Išsaugota pirma išvada',priority:10},{id:'second',title:'Išsaugota antra išvada',priority:100}] as AgronomicAdvice[]
const report={agronomicInsights:{schemaVersion:1,engineVersion:'saved-engine',catalogVersion:'saved-rules',origin:'historical-analysis',en,lt}} as DiagnosticReport

test('the browser selects the saved language and preserves backend ordering',()=>{
 expect(agronomicAdvice(report,false)).toBe(en)
 expect(agronomicAdvice(report,true)).toBe(lt)
 expect(agronomicAdvice(report,false).map(a=>a.id)).toEqual(['first','second'])
})
test('missing backend interpretations do not cause the browser to invent agronomic decisions',()=>{
 const old={agronomy:[{kind:'high-vpd',rootDryMinutes:100}],nodes:[{metric:'vpd',aboveMinutes:100}]} as unknown as DiagnosticReport
 expect(agronomicAdvice(old,false)).toEqual([])
})
test('an explicit empty server result remains empty',()=>{
 expect(agronomicAdvice({...report,agronomicInsights:{...report.agronomicInsights!,en:[]}},false)).toEqual([])
})
