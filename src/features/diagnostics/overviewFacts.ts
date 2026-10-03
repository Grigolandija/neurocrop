import type { DiagnosticReport } from './types'

export function overviewFacts(report: DiagnosticReport) {
  const nodeCount = new Set(report.nodes.filter(node => node.observedMinutes > 0).map(node => node.nodeId).filter(Boolean)).size
  // Missing node/metric intervals remain in the denominator. Averaging only
  // reporting sources would hide gaps and overstate the evidence available.
  const expected = report.nodes.reduce((sum, node) => sum + node.expectedMinutes, 0)
  const observed = report.nodes.reduce((sum, node) => sum + node.observedMinutes, 0)
  const coverage = expected > 0 ? Math.min(100, observed / expected * 100) : null
  return { nodeCount, coverage }
}
