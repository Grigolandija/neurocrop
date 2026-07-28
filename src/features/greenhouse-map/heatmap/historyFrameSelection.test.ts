import { describe, expect, it } from 'vitest'
import { historyFrameEndIso, latestCompletedHistoryFrameIndex } from '../services/historyFrameSelection'
import type { AreaMapHistory } from '../services/areaMapRepository'

function history(overrides: Partial<AreaMapHistory> = {}): AreaMapHistory {
  return {
    areaId: 'area-1',
    from: '2026-07-27T08:00:00.000Z',
    to: '2026-07-27T08:27:00.000Z',
    stepMinutes: 10,
    expectedNodes: ['a', 'b', 'c', 'd', 'e'],
    layouts: [],
    frames: [
      { observedAt: '2026-07-27T08:00:00.000Z', nodes: [{ devEui: 'a', measuredAt: null, measurements: {} }] },
      { observedAt: '2026-07-27T08:10:00.000Z', nodes: [{ devEui: 'a', measuredAt: null, measurements: {} }] },
      { observedAt: '2026-07-27T08:20:00.000Z', nodes: [{ devEui: 'a', measuredAt: null, measurements: {} }] },
    ],
    ...overrides,
  }
}

describe('historical climate map initial frame', () => {
  it('selects the latest completed interval instead of the current partial interval', () => {
    expect(latestCompletedHistoryFrameIndex(history())).toBe(1)
  })

  it('skips an empty completed interval', () => {
    const value = history()
    value.frames[1].nodes = []
    expect(latestCompletedHistoryFrameIndex(value)).toBe(0)
  })

  it('falls back to the latest frame when interval metadata is invalid', () => {
    expect(latestCompletedHistoryFrameIndex(history({ to: 'invalid' }))).toBe(2)
  })
})

describe('historical climate map freshness reference', () => {
  it('uses the end of a ten-minute rollup interval', () => {
    expect(historyFrameEndIso('2026-07-27T08:00:00.000Z', 10)).toBe('2026-07-27T08:10:00.000Z')
  })

  it('rejects invalid frame boundaries', () => {
    expect(historyFrameEndIso('invalid', 10)).toBeUndefined()
    expect(historyFrameEndIso('2026-07-27T08:00:00.000Z', 0)).toBeUndefined()
  })
})
