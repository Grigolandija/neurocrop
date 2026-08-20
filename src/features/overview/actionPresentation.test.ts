import { describe, expect, it } from 'vitest'
import { buildActionMetricPresentation } from './actionPresentation'

const vpdFallback = {
  metricKey: 'vpd',
  riskKind: 'uniformity',
  currentValue: 0.3,
  target: [0, 0.1] as [number, number],
  unit: 'kPa',
  observedAt: '2026-08-20T08:00:00Z',
}

describe('action metric presentation', () => {
  it('does not inherit another action metric from the same Section row', () => {
    const result = buildActionMetricPresentation({
      metricId: 'co2',
      riskKind: 'target-deviation',
      value: 588,
      target: [650, 950],
      unit: 'ppm',
      observedAt: '2026-08-20T08:01:00Z',
    }, vpdFallback)

    expect(result).toMatchObject({
      metricKey: 'co2',
      riskKind: 'target-deviation',
      currentValue: 588,
      target: [650, 950],
      unit: 'ppm',
      deviation: -62,
      direction: 'below',
    })
  })

  it('keeps each uniformity action spread and unit', () => {
    const result = buildActionMetricPresentation({
      metricId: 'airTemp',
      riskKind: 'uniformity',
      value: 1.93,
      target: [0, 1.2],
      unit: 'degC',
    }, vpdFallback)

    expect(result).toMatchObject({
      currentValue: 1.93,
      target: [0, 1.2],
      unit: '°C',
      deviation: 0.73,
      direction: 'above',
    })
  })

  it('uses the Section row only when metric and risk kind match', () => {
    const result = buildActionMetricPresentation({ metricId: 'vpd', riskKind: 'uniformity' }, vpdFallback)
    expect(result).toMatchObject({ currentValue: 0.3, target: [0, 0.1], unit: 'kPa' })
  })
})
