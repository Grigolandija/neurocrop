import { describe, expect, it } from 'vitest'
import { colorLegend } from './colorLegend'

describe('colour legend axis', () => {
  it('uses readable half-degree ticks for the reported temperature range', () => {
    const legend = colorLegend(15.5, 18, 1)
    expect(legend.ticks.map(tick => tick.value)).toEqual([15.5, 16, 16.5, 17, 17.5, 18])
    expect(legend.decimals).toBe(1)
    expect(legend.ticks[0].position).toBe(1)
    expect(legend.ticks.at(-1)?.position).toBe(0)
  })

  it('places round values at their true positions without stretching the colour range', () => {
    const legend = colorLegend(15.63, 18.12, 1)
    expect(legend.ticks.map(tick => tick.value)).toEqual([16, 16.5, 17, 17.5, 18])
    for (const tick of legend.ticks) {
      expect(tick.value).toBeGreaterThanOrEqual(15.63)
      expect(tick.value).toBeLessThanOrEqual(18.12)
      expect(tick.position).toBeCloseTo((18.12 - tick.value) / (18.12 - 15.63))
    }
  })

  it('keeps narrow contrast ranges distinguishable', () => {
    const legend = colorLegend(.851, .859, 2)
    expect(legend.ticks.map(tick => tick.value)).toEqual([.852, .854, .856, .858])
    expect(legend.decimals).toBe(3)
  })

  it('handles integer metrics, negative values and a constant field', () => {
    expect(colorLegend(400, 900, 0).ticks.map(tick => tick.value)).toEqual([400, 500, 600, 700, 800, 900])
    expect(colorLegend(-1, 1, 1).ticks.map(tick => tick.value)).toEqual([-1, -.5, 0, .5, 1])
    expect(colorLegend(20, 20, 1).ticks).toEqual([{ value: 20, position: .5 }])
    expect(colorLegend(NaN, 20, 1).ticks).toEqual([])
  })
})
