import type { AgronomicAdvice, DiagnosticReport } from './types'

export type { AgronomicAdvice } from './types'

// Decisions and order belong to the versioned backend snapshot. The browser
// chooses a language only; it must not reinterpret or reprioritize the evidence.
export function agronomicAdvice(report: DiagnosticReport, lt: boolean): AgronomicAdvice[] {
  return report.agronomicInsights?.[lt ? 'lt' : 'en'] ?? []
}
