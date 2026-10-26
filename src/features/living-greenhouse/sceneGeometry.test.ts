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
  it('fills rooms to the ceiling at all four corners, while greenhouses keep their pitched envelope',()=>{
    const {map,at}=fixture(),w=map.dimensions.widthM,d=map.dimensions.lengthM
    map.shape={type:'polygon',points:[{xM:0,yM:0},{xM:w,yM:0},{xM:w,yM:d},{xM:0,yM:d}]}
    map.farmPlanGeometry={areaId:'room',revision:1,kind:'room'}
    map.dimensions.heightM=4.2
    const room=sceneGeometry(map,'air-temperature',at),v=room.volume
    expect(v.roofSlope).toBe(0)
    for(const x of [0,v.width-1])for(const z of [0,v.height-1])for(const y of [0,v.layers-1]){
      expect(v.pixels[((y*v.height+z)*v.width+x)*4+3]).toBe(255)
    }
    map.farmPlanGeometry.kind='greenhouse'
    const greenhouse=sceneGeometry(map,'air-temperature',at).volume
    expect(greenhouse.roofSlope).toBe(.32)
    expect(greenhouse.pixels[((greenhouse.layers-1)*greenhouse.height*greenhouse.width)*4+3]).toBe(0)
  })

  it('keeps concave room cutouts empty at every height',()=>{
    const {map,at}=fixture(),w=map.dimensions.widthM,d=map.dimensions.lengthM
    map.shape={type:'polygon',points:[{xM:0,yM:0},{xM:w,yM:0},{xM:w,yM:d/2},{xM:w/2,yM:d/2},{xM:w/2,yM:d},{xM:0,yM:d}]}
    map.farmPlanGeometry={areaId:'room',revision:1,kind:'room'}
    const v=sceneGeometry(map,'air-temperature',at).volume
    for(let y=0;y<v.layers;y++){
      expect(v.pixels[((y*v.height+v.height-1)*v.width+v.width-1)*4+3]).toBe(0)
      expect(v.pixels[((y*v.height)*v.width)*4+3]).toBe(255)
    }
  })
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
