import { describe, expect, it } from 'vitest'
import { livingDemo, livingMap, measuredSensors } from './livingData'
import { sceneGeometry, type VolumeField } from './sceneGeometry'
import { climateSlice, sliceNormal, sampleSliceField, sliceBoundary } from './climateSlice'

function fixture() {
  const { context } = livingDemo(), at = Date.parse(context.updatedAt!), map = livingMap(context, null, null)!
  const scene = sceneGeometry(map, 'air-temperature', at, undefined, { view: 'volume', colorMode: 'contrast' })
  return { map, readings: measuredSensors(map, 'air-temperature', at), scene }
}
describe('one spatial heatmap section', () => {
  it('starts with a centred longitudinal section aligned to the longer plan axis', () => {
    const { map, readings, scene } = fixture()
    const section = climateSlice(map, readings, scene.volume, scene.scale)
    expect(section.mode).toBe('longitudinal')
    expect(section.normal).toEqual(map.dimensions.widthM >= map.dimensions.lengthM ? [0,0,1] : [1,0,0])
    expect(section.position).toBeCloseTo((section.min + section.max) / 2)
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
    const low = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: .8 })
    const high = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: 2.4 })
    expect(low.plane).toEqual([0, 1, 0, .8]); expect(high.plane).toEqual([0, 1, 0, 2.4])
    expect(scene.volume.pixels).toEqual(before); expect(scene.vertices).toEqual(vertices)
    const clipped = climateSlice(map, readings, scene.volume, scene.scale, { scope: 'a', mode: 'horizontal', position: 999 })
    expect(clipped.position).toBeLessThan(scene.height)
  })
  it('resets a horizontal section at measured height without switching to vertical', () => {
    const { map, readings, scene } = fixture()
    const automatic = climateSlice(map, readings, scene.volume, scene.scale, { mode: 'horizontal' })
    const heights = readings.filter(r => r.value !== null && r.heightM !== null && r.heightM <= scene.height).map(r => r.heightM!)
    expect(automatic.mode).toBe('horizontal')
    expect(automatic.normal).toEqual([0, 1, 0])
    expect(automatic.position).toBeCloseTo(heights.reduce((a, b) => a + b, 0) / heights.length)
  })
  it('keeps horizontal boundaries on an L-shaped room rather than its bounding rectangle', () => {
    const field = { bounds: [6, 6, 4], roofSlope: 0 } as VolumeField
    const outline: [number, number, number][] = [[-3,0,-3],[3,0,-3],[3,0,-1],[-1,0,-1],[-1,0,3],[-3,0,3]]
    const edges = sliceBoundary(outline, [0,1,0,2], 'horizontal', field)
    expect(edges).toHaveLength(6)
    expect(edges.flat().every(p => p[1] === 2)).toBe(true)
    expect(edges).toContainEqual([[3,2,-1],[-1,2,-1]])
    const vertical = sliceBoundary(outline, [0,0,1,1], 'longitudinal', field)
    expect(vertical).toContainEqual([[-1,0,1],[-3,0,1]])
    expect(vertical.flat().every(p => p[0] <= -1 && p[2] === 1)).toBe(true)
  })
  it('clips both section boundaries to the real pitched roof', () => {
    const field = { bounds: [6, 6, 4], roofSlope: .5 } as VolumeField
    const outline: [number, number, number][] = [[-3,0,-3],[3,0,-3],[3,0,3],[-3,0,3]]
    const horizontal = sliceBoundary(outline, [0,1,0,3], 'horizontal', field)
    expect(horizontal).toHaveLength(4)
    expect(horizontal.flat().every(p => p[1] === 3 && Math.abs(p[2]) <= 1.5)).toBe(true)
    const vertical = sliceBoundary(outline, [1,0,0,0], 'transverse', field)
    expect(vertical).toContainEqual([[0,2,-3],[0,4,0]])
    expect(vertical).toContainEqual([[0,4,0],[0,2,3]])
  })
  it('keeps the two upright cuts perpendicular, including in a room whose longer side is Y', () => {
    expect(sliceNormal('longitudinal', { widthM: 8, lengthM: 5 })).toEqual([0,0,1])
    expect(sliceNormal('transverse', { widthM: 8, lengthM: 5 })).toEqual([1,0,0])
    expect(sliceNormal('longitudinal', { widthM: 5, lengthM: 8 })).toEqual([1,0,0])
    expect(sliceNormal('transverse', { widthM: 5, lengthM: 8 })).toEqual([0,0,1])
  })
  it('slides a transverse cut without rotating it when readings change', () => {
    const { map, readings, scene } = fixture()
    const first = climateSlice(map, readings, scene.volume, scene.scale, { mode: 'transverse', position: -.5 })
    const changed = readings.map((r, i) => ({ ...r, value: i % 2 ? 99 : -99 }))
    const moved = climateSlice(map, changed, scene.volume, scene.scale, { mode: 'transverse', position: .5 })
    expect(first.normal).toEqual(moved.normal)
    expect(first.normal[1]).toBe(0)
    expect(first.plane[3]).toBe(-.5)
    expect(moved.plane[3]).toBe(.5)
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
