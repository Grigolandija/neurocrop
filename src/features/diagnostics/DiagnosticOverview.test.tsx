import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DiagnosticOverview from './DiagnosticOverview'
import type { DiagnosticReport } from './types'

test('an old API response without interpretations is not presented as absence of agronomic risk',()=>{
  const report={nodes:[],metrics:[{observedMinutes:60}]} as unknown as DiagnosticReport
  const html=renderToStaticMarkup(<DiagnosticOverview report={report} advice={[]} lt={false}/>)
  expect(html).toContain('Agronomic assessment has not been loaded')
  expect(html).not.toContain('No specific agronomic risks identified')
  expect(html).toContain('—')
})
