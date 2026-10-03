import { describe, expect, it } from 'vitest'
import { overviewFacts } from './overviewFacts'
import type { DiagnosticReport } from './types'

const report = (nodes: unknown[]) => ({ nodes } as DiagnosticReport)
describe('diagnostic overview coverage', () => {
  it('includes intervals with missing measurements and counts each reporting node once', () => {
    const facts = overviewFacts(report([
      { nodeId: 'a', observedMinutes: 100, expectedMinutes: 100 },
      { nodeId: 'a', observedMinutes: 50, expectedMinutes: 100 },
      { nodeId: 'b', observedMinutes: 0, expectedMinutes: 100 },
    ]))
    expect(facts).toEqual({ nodeCount: 1, coverage: 50 })
  })
  it('shows no percentage when the observation window is unknown', () => {
    expect(overviewFacts(report([]))).toEqual({ nodeCount: 0, coverage: null })
  })
})
