import { expect, test } from 'vitest'
import { readDiagnosticView, rememberDiagnosticTab, rememberDiagnosticView } from './sessionView'
import type { DiagnosticReport } from './types'

test('restores report, period and tab for the same user and organization', () => {
  const report = { area: { id: 'a' } } as DiagnosticReport
  rememberDiagnosticView('user:org', { areaId: 'a', days: 30, report, savedId: null, tab: 'insights' })
  rememberDiagnosticTab('user:org', 'reports')
  expect(readDiagnosticView('user:org')).toEqual({ areaId: 'a', days: 30, report, savedId: null, tab: 'reports' })
})

test('account or organization change discards the previous analysis', () => {
  rememberDiagnosticView('user:org', { areaId: 'a', days: 30, report: {} as DiagnosticReport, savedId: 'saved', tab: 'insights' })
  expect(readDiagnosticView('other:org')).toBeNull()
  expect(readDiagnosticView('user:org')).toBeNull()
})
