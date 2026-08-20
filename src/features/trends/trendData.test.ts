import { describe, expect, it } from 'vitest'
import { normalizeTrendPoints, numericTrendValue } from './trendData'

describe('Trends data normalization', () => {
  it('never converts missing or malformed telemetry into a real zero', () => {
    expect(numericTrendValue(null)).toBeNull()
    expect(numericTrendValue('')).toBeNull()
    expect(numericTrendValue('   ')).toBeNull()
    expect(numericTrendValue(false)).toBeNull()
    expect(numericTrendValue('not-a-number')).toBeNull()
    expect(numericTrendValue(0)).toBe(0)
  })

  it('keeps valid zeroes, drops invalid points and sorts by measured time', () => {
    expect(normalizeTrendPoints([
      { observedAt: '2026-08-20T10:10:00.000Z', value: 520 },
      { observedAt: '2026-08-20T10:00:00.000Z', value: 0 },
      { observedAt: '2026-08-20T10:05:00.000Z', value: null },
      { observedAt: 'invalid', value: 500 },
    ])).toEqual([
      { observedAt: '2026-08-20T10:00:00.000Z', value: 0 },
      { observedAt: '2026-08-20T10:10:00.000Z', value: 520 },
    ])
  })
})
