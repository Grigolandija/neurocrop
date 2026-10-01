import type { DiagnosticReport } from './types'

export type DiagnosticSessionView = {
  areaId: string
  days: number
  report: DiagnosticReport
  savedId: string | null
  tab: string
}

// Keep only the last view in this browser tab's memory, never in persistent storage.
let current: { scope: string; view: DiagnosticSessionView } | null = null

export function readDiagnosticView(scope: string): DiagnosticSessionView | null {
  if (current?.scope !== scope) current = null
  return current?.view ?? null
}

export function rememberDiagnosticView(scope: string, view: DiagnosticSessionView) {
  current = { scope, view }
}

export function rememberDiagnosticTab(scope: string, tab: string) {
  if (current?.scope === scope) current.view = { ...current.view, tab }
}
