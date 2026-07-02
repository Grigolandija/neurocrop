import { metricDefinitions } from '../data/mock'
import type { Block } from '../types'

export function sectionScore(section: Block) {
  const outside = metricDefinitions.filter((metric) => {
    const value = section.readings[metric.key]
    return section.installedMetrics.includes(metric.key)
      && value !== undefined
      && (value < metric.target[0] || value > metric.target[1])
  }).length
  return Math.max(0, 100 - outside * 35)
}

export function areaScore(sections: Block[]) {
  if (!sections.length) return null
  return Math.round(sections.reduce((sum, section) => sum + sectionScore(section), 0) / sections.length)
}

export function scoreState(score: number | null) {
  if (score === null) return 'neutral'
  if (score >= 90) return 'optimal'
  if (score >= 70) return 'warning'
  return 'critical'
}
