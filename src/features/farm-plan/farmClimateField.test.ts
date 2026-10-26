import { describe, expect, it } from 'vitest'
import { livingDemo, livingMap } from '../living-greenhouse/livingData'
import { rectangle } from '../living-greenhouse/siteDemoModel'
import { emptyFarmPlan } from './farmPlanData'
import { summarizeFarmArea } from './farmMonitoringData'
import { farmClimateField, selectedFarmClimate } from './farmClimateField'
import { wholeFarmSceneMesh } from './farmSceneGeometry'

function fixture() {
  const { context } = livingDemo(), map = livingMap(context, null, null)!, at = Date.parse(context.updatedAt!)
  const plan = { ...emptyFarmPlan(), areas: [
    { id: 'a', name: 'A', kind: 'room' as const, height: 4.2, polygon: rectangle(0, 0, 20, 12) },
    { id: 'b', name: 'B', kind: 'room' as const, height: 4.2, polygon: rectangle(24, 0, 20, 12) },
  ] }
  const summary = summarizeFarmArea('a', context, 'air-temperature', at)
  return { plan, maps: { a: map, b: map }, at, comparison: { a: summary, b: { ...summary, areaId: 'b' } } }
}
function sample(climate: ReturnType<typeof farmClimateField>, x: number, z: number, h: number) {
  const f = climate.field
  const i = (Math.floor(h / f.bounds[2] * f.layers) * f.height + Math.floor(z / f.bounds[1] * f.height)) * f.width + Math.floor(x / f.bounds[0] * f.width)
  return { owner: climate.owners[i], rgba: [...f.pixels.subarray(i * 4, i * 4 + 4)], i }
}
describe('whole-farm spatial heatmap', () => {
  it('uses positions and heights inside each room, with no fill in the gap or unmeasured rooms', () => {
    const { plan, maps, comparison, at } = fixture()
    const climate = farmClimateField(plan, maps, comparison, 'air-temperature', at)
    expect(climate.ready).toBe(true)
    expect(sample(climate, 10, 5, 1.5).owner).toBe(1)
    expect(sample(climate, 34, 5, 1.5).owner).toBe(2)
    expect(sample(climate, 22, 5, 1.5).rgba[3]).toBe(0)
    expect(sample(climate, 10, 5, 1.5).rgba[0]).not.toBe(sample(climate, 10, 5, 3).rgba[0])
    const missing = farmClimateField(plan, maps, { a: comparison.a }, 'air-temperature', at)
    expect(sample(missing, 34, 5, 1.5).rgba[3]).toBe(0)
  })
  it('does not create a field from stale, unplaced or heightless readings', () => {
    const { plan, maps, comparison, at } = fixture()
    const stale = { ...comparison.a, current: 0, readings: comparison.a.readings.map(reading => ({ ...reading, fresh: false })) }
    expect(farmClimateField(plan, maps, { a: stale }, 'air-temperature', at).ready).toBe(false)
    expect(farmClimateField(plan, {}, comparison, 'air-temperature', at).ready).toBe(false)
    const heightless = { ...maps.a, objects: maps.a.objects.map(object => object.metadata.sensor ? { ...object, metadata: { ...object.metadata, sensor: { ...object.metadata.sensor, installationHeightM: undefined, measurementHeightsM: { 'air-temperature': null } } } } : object) }
    expect(farmClimateField(plan, { a: heightless }, { a: comparison.a }, 'air-temperature', at).ready).toBe(false)
  })
  it('dims neighbouring fields moderately without changing their values or the source atlas', () => {
    const { plan, maps, comparison, at } = fixture(), climate = farmClimateField(plan, maps, comparison, 'air-temperature', at)
    const before = new Uint8Array(climate.field.pixels), selected = selectedFarmClimate(climate, 'a')
    const a = sample(climate, 10, 5, 1.5), b = sample(climate, 34, 5, 1.5)
    expect([...selected.pixels.subarray(a.i * 4, a.i * 4 + 4)]).toEqual(a.rgba)
    expect(selected.pixels[b.i * 4 + 3]).toBe(77)
    expect(selected.pixels[b.i * 4] / selected.pixels[b.i * 4 + 3]).toBeCloseTo(b.rgba[0] / b.rgba[3], 2)
    expect(climate.field.pixels).toEqual(before)
    expect(selectedFarmClimate(climate, null)).toBe(climate.field)
  })
  it('retains warm light physical floors and never changes them according to missing telemetry', () => {
    const { plan, maps } = fixture(), mesh = wholeFarmSceneMesh(plan, maps)
    expect([...mesh.vertices.subarray(3, 6)]).toEqual([expect.closeTo(.95), expect.closeTo(.945), expect.closeTo(.91)])
  })
})
