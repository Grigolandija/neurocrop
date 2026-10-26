import { describe, expect, it } from 'vitest'
import { livingDemo, livingMap, measuredSensors } from './livingData'
import { sceneGeometry, type VolumeField } from './sceneGeometry'
import { climateSlice, initialSliceNormal, sampleSliceField } from './climateSlice'
import { planToScene } from './sceneMath'

function fixture() {
  const { context } = livingDemo(), at = Date.parse(context.updatedAt!), map = livingMap(context, null, null)!
  const scene = sceneGeometry(map, 'air-temperature', at, undefined, { view: 'volume', colorMode: 'contrast' })
  return { map, readings: measuredSensors(map, 'air-temperature', at), scene }
}
describe('one spatial heatmap section', () => {
  it('places the automatic vertical plane through the two most different current XYZ observations', () => {
    const { map, readings, scene } = fixture()
    const sorted = readings.filter(r => r.value !== null && r.heightM !== null).sort((a, b) => a.value! - b.value!)
    const section = climateSlice(map, readings, scene.volume, scene.scale)
    expect(section.mode).toBe('vertical')
    expect(Math.hypot(...section.normal)).toBeCloseTo(1)
    for (const r of [sorted[0], sorted.at(-1)!]) {
      const point = planToScene(r.object.xM + r.object.widthM / 2, r.object.yM + r.object.lengthM / 2, r.heightM!, map.dimensions)
      expect(section.normal.reduce((v, n, i) => v + n * point[i], 0)).toBeCloseTo(section.position)
    }
    expect(section.captions.length).toBeGreaterThan(0)
    for (const contour of section.captions) {
      expect(contour.value).toBeGreaterThan(scene.scale.min)
      expect(contour.value).toBeLessThan(scene.scale.max)
      for (const anchor of contour.anchors) {
        const sampled = sampleSliceField(scene.volume, anchor)
        expect(sampled).not.toBeNull()
        expect(sampled!.value).toBeCloseTo(contour.normalized, 1)
        expect(section.normal.reduce((v, n, i) => v + n * anchor[i], 0)).toBeCloseTo(section.position)
      }
    }
  })
  it('moves one horizontal section in metres without modifying the volume or equipment geometry', () => {
    const { map, readings, scene } = fixture(), before = new Uint8Array(scene.volume.pixels), vertices = new Float32Array(scene.vertices)
    const low = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: .8, normal: [0, 0, 1] })
    const high = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: 2.4, normal: [0, 0, 1] })
    expect(low.plane).toEqual([0, 1, 0, .8]); expect(high.plane).toEqual([0, 1, 0, 2.4])
    expect(scene.volume.pixels).toEqual(before); expect(scene.vertices).toEqual(vertices)
    const clipped = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: 999, normal: [0, 0, 1] })
    expect(clipped.position).toBeLessThan(scene.height)
  })
  it('ignores stale extremes and handles stacked sensors without an invalid normal', () => {
    const { map, readings } = fixture()
    const fresh = readings.filter(r => r.value !== null && r.heightM !== null)
    const original = initialSliceNormal(fresh, map.dimensions)
    expect(initialSliceNormal([...fresh, { ...fresh[0], value: null, lastValue: 999 }], map.dimensions)).toEqual(original)
    const stacked = fresh.map((r, i) => ({ ...r, heightM: 1 + i * .3, object: { ...r.object, xM: 1, yM: 2, widthM: .2, lengthM: .2 } }))
    const normal = initialSliceNormal(stacked, map.dimensions)
    expect(normal.every(Number.isFinite)).toBe(true); expect(Math.hypot(...normal)).toBe(1)
  })
  it('does not sample empty space or above the roof and retains the support channel', () => {
    const field: VolumeField = { width: 2, height: 2, layers: 2, bounds: [4, 4, 4], roofSlope: .32, levels: [], contours: [], pixels: new Uint8Array(32) }
    for (let i = 0; i < 8; i++) field.pixels.set([128, 64, 0, 255], i * 4)
    expect(sampleSliceField(field, [0, 2, 0])).toEqual({ value: 128 / 255, support: 64 / 255 })
    expect(sampleSliceField(field, [3, 2, 0])).toBeNull()
    expect(sampleSliceField(field, [0, 4, 1.9])).toBeNull()
    field.pixels.fill(0)
    expect(sampleSliceField(field, [0, 2, 0])).toBeNull()
  })
})
