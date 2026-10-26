import { describe, expect, it } from 'vitest'
import type { AreaMapContext, AreaMapHistory, AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import { contrastFarmAreas, farmAreaTrend, farmComparisonScale, summarizeFarmArea } from './farmMonitoringData'

const now = Date.parse('2026-10-26T12:00:00Z')
const stamp = (minutes = 0) => new Date(now - minutes * 60000).toISOString()
const node = (id: string, value: number, minutes = 0): AreaMapNode => ({ devEui: id, nodeId: id, sensors: [], status: 'online', sectionId: 'default', measurements: { airTemperatureC: value, measuredAt: stamp(minutes) } })
const context = (nodes: AreaMapNode[]): AreaMapContext => ({ area: { id: 'a', name: 'A' }, mapEnabled: false, map: null, revision: 0, updatedAt: null, nodes, sections: [{ id: 'default', name: 'A', areaId: 'a', nodes: nodes.length, isAreaDefault: true, cropProfile: 'crop' }], profiles: [{ id: 'crop', name: 'Crop', metrics: { airTemp: { optimal: [18, 24] } } }], permissions: { canEdit: false } })

describe('farm comparison evidence', () => {
  it('includes unplaced hardware and zero measurements, with one reading per DevEUI', () => {
    const result = summarizeFarmArea('a', context([node('ABC', 0), node('abc', 99), node('def', 21)]), 'air-temperature', now)
    expect(result).toMatchObject({ total: 2, current: 2, range: [0, 21], mean: 10.5, assessed: 2, state: 'current' })
    expect(result.outside.map(item => item.id)).toEqual(['abc'])
  })
  it('rejects old, future, undated and offline values from the current comparison', () => {
    const undated = node('undated', 44); undated.measurements!.measuredAt = undefined
    const offline = { ...node('offline', 33), status: 'offline' as const }
    const result = summarizeFarmArea('a', context([node('old', 31, 50), node('future', 66, -5), undated, offline]), 'air-temperature', now)
    expect(result.range).toBeNull(); expect(result.mean).toBeNull(); expect(result.current).toBe(0)
    expect(result.lastRange).toEqual([31, 33]); expect(result.state).toBe('delayed')
  })
  it('uses the selected metric timestamp instead of a newer heartbeat or another metric', () => {
    const reading = node('a', 99)
    reading.lastSeenAt = stamp()
    reading.measurements!.relativeHumidityPercent = 65
    reading.measurements!.measuredAtByMetric = { airTemperatureC: stamp(90), relativeHumidityPercent: stamp() }
    const temperature = summarizeFarmArea('a', context([reading]), 'air-temperature', now)
    const humidity = summarizeFarmArea('a', context([reading]), 'relative-humidity', now)
    expect(temperature.range).toBeNull(); expect(temperature.lastRange).toEqual([99, 99])
    expect(humidity.range).toEqual([65, 65]); expect(humidity.assessed).toBe(0)
  })
  it('shows a partial range while excluding delayed extremes and applies each group target', () => {
    const data = context([node('a', 20), { ...node('b', 27), sectionId: 'warm' }, node('old', 80, 90), { ...node('c', 30), sectionId: 'unknown' }])
    data.sections.push({ id: 'warm', name: 'Warm', areaId: 'a', nodes: 1, cropProfile: 'warm' })
    data.profiles.push({ id: 'warm', name: 'Warm', metrics: { airTemp: { optimal: [25, 29] } } })
    const summary = summarizeFarmArea('a', data, 'air-temperature', now)
    expect(summary).toMatchObject({ state: 'partial', range: [20, 30], current: 3, total: 4, assessed: 2, outside: [] })
    expect(summary.latest).toBe(stamp())
  })
  it('never presents a failed refresh or missing response as current', () => {
    const failed = summarizeFarmArea('a', context([node('a', 21)]), 'air-temperature', now, true)
    expect(failed).toMatchObject({ state: 'error', range: null, lastRange: [21, 21], current: 0 })
    expect(summarizeFarmArea('b', undefined, 'air-temperature', now).state).toBe('loading')
    expect(summarizeFarmArea('b', undefined, 'air-temperature', now, true).state).toBe('error')
    expect(summarizeFarmArea('b', context([]), 'air-temperature', now).state).toBe('empty')
  })
  it('keeps colours identical for equal values and derives one scale from fresh farm readings', () => {
    const a = summarizeFarmArea('a', context([node('a', 20)]), 'air-temperature', now)
    const b = summarizeFarmArea('b', context([node('b', 20)]), 'air-temperature', now)
    const delayed = summarizeFarmArea('c', context([node('c', 100, 90)]), 'air-temperature', now)
    expect(a.color).toBe(b.color)
    expect(farmComparisonScale([a, b, delayed], 'air-temperature')).toEqual(farmComparisonScale([a], 'air-temperature'))
    expect(a.color).not.toBe(delayed.color)
  })
  it('makes nearby values distinguishable on one scale without assigning stale data an extreme colour', () => {
    const a = summarizeFarmArea('a', context([node('a', 20)]), 'air-temperature', now)
    const b = summarizeFarmArea('b', context([node('b', 21)]), 'air-temperature', now)
    const same = summarizeFarmArea('same', context([node('same', 20)]), 'air-temperature', now)
    const delayed = summarizeFarmArea('old', context([node('old', 99, 90)]), 'air-temperature', now)
    const snapshot = structuredClone([a, b, same, delayed])
    const [cold, warm, equal, missing] = contrastFarmAreas([a, b, same, delayed], 'air-temperature')
    const distance = (x: number[], y: number[]) => Math.hypot(...x.map((v, i) => v - y[i]))
    expect(distance(cold.colorRgb, warm.colorRgb)).toBeGreaterThan(distance(a.colorRgb, b.colorRgb) * 2)
    expect(cold.color).toBe(equal.color)
    expect(missing.color).toBe(delayed.color)
    expect(contrastFarmAreas([a, b, same], 'air-temperature').map(item => item.color)).toEqual([cold.color, warm.color, equal.color])
    expect([a, b, same, delayed]).toEqual(snapshot)
  })
  it('does not stretch a tiny temperature change across the full contrast palette', () => {
    const a = summarizeFarmArea('a', context([node('a', 20)]), 'air-temperature', now)
    const b = summarizeFarmArea('b', context([node('b', 20.01)]), 'air-temperature', now)
    const colors = contrastFarmAreas([a, b], 'air-temperature').map(item => item.colorRgb)
    expect(Math.hypot(...colors[0].map((v, i) => v - colors[1][i]))).toBeLessThan(10)
  })
  it('preserves missing history buckets and selects the requested parameter', () => {
    const history = { frames: [
      { observedAt: stamp(30), nodes: [{ measurements: { airTemperatureC: 20, relativeHumidityPercent: 70 } }, { measurements: { airTemperatureC: 24, relativeHumidityPercent: 80 } }] },
      { observedAt: stamp(15), nodes: [] },
      { observedAt: stamp(), nodes: [{ measurements: { airTemperatureC: 18 } }] },
    ] } as AreaMapHistory
    expect(farmAreaTrend(history, 'air-temperature').map(item => item.mean)).toEqual([22, null, 18])
    expect(farmAreaTrend(history, 'relative-humidity').map(item => item.range)).toEqual([[70, 80], null, null])
  })
})
