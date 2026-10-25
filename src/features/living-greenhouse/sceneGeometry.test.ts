import { describe, expect, it } from 'vitest'
import { heatmapColorAt } from '../greenhouse-map/heatmap/heatmapColorScale'
import { METRICS } from '../greenhouse-map/model'
import { livingDemo, livingMap } from './livingData'
import { sceneGeometry } from './sceneGeometry'

function fixture() {
  const { context } = livingDemo()
  return { map: livingMap(context, null, null)!, at: Date.parse(context.updatedAt!) }
}

describe('shared 2D / 3D climate presentation', () => {
  it('fills a supported XYZ field and uses the 2D semantic colours in its GPU palette', () => {
    const { map, at } = fixture()
    const scene = sceneGeometry(map, 'air-temperature', at, { min: 15, max: 35 }, { view: 'volume', colorMode: 'condition' })
    expect(scene.volumeReady).toBe(true)
    expect(scene.heightRange).toEqual([1.2, 2.8])
    const i = 16, value = 25
    const expected = heatmapColorAt(value, METRICS['air-temperature'], undefined, 'condition')
    Array.from(scene.volume.palette!.slice(i * 4, i * 4 + 3)).forEach((v, j) => expect(v).toBeCloseTo(expected[j] / 255, 6))
  })

  it('preserves small differences in contrast mode, including in a wide historical scale', () => {
    const { map, at } = fixture()
    map.objects.filter(o => o.metadata.sensor).forEach((o, i) => { o.metadata.sensor!.measurements = { airTemperatureC: 21 + i * .001, measuredAt: new Date(at).toISOString() } })
    const scene = sceneGeometry(map, 'air-temperature', at, { min: 0, max: 40 }, { view: 'volume', colorMode: 'contrast' })
    expect(scene.scale.min).toBe(21)
    expect(scene.scale.max).toBeCloseTo(21.005)
    expect(Array.from(scene.volume.palette!.slice(0, 3))).not.toEqual(Array.from(scene.volume.palette!.slice(-4, -1)))
    const scalars = new Set(Array.from(scene.volume.pixels).filter((_, i) => i % 4 === 0))
    expect(scalars.size).toBeGreaterThan(10)
  })

  it('does not invent a climate field when heights are unknown or readings have expired', () => {
    const { map, at } = fixture()
    expect(sceneGeometry(map, 'air-temperature', at + 24 * 3600_000).volumeReady).toBe(false)
    map.objects.filter(o => o.metadata.sensor).forEach(o => { o.metadata.sensor!.measurementHeightsM = { 'air-temperature': null }; o.metadata.sensor!.installationHeightM = undefined })
    expect(sceneGeometry(map, 'air-temperature', at).volumeReady).toBe(false)
  })

  it('keeps substrate measurements as points and respects the selected soil EC depth', () => {
    const { map, at } = fixture()
    map.objects.filter(o => o.metadata.sensor).forEach(o => { o.metadata.sensor!.measurements = { soilEcByDepth: [{ depthCm: 10, value: .8 }, { depthCm: 30, value: 2.1 }], measuredAt: new Date(at).toISOString() } })
    const scene = sceneGeometry(map, 'soil-ec', at, undefined, { view: 'volume', soilEcDepthCm: 30 })
    expect(scene.sensors.every(s => s.value === 2.1)).toBe(true)
    expect(scene.volumeReady).toBe(false)
    expect(scene.volume.pixels.every(v => v === 0)).toBe(true)
  })
})
