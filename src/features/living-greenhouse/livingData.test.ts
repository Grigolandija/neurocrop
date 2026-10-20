import { describe, expect, it } from 'vitest'
import { livingDemo, livingMap, measuredSensors } from './livingData'
import { sceneGeometry } from './sceneGeometry'

describe('Living greenhouse evidence boundaries', () => {
  it('does not place unassigned nodes or reuse readings stored in the map', () => {
    const { context } = livingDemo()
    const placed = context.map!.objects.filter(o => o.type === 'sensor-node')
    const originalPosition = placed[0].xM
    context.nodes = [{ ...context.nodes[0], measurements: { airTemperatureC: 27, measuredAt: context.updatedAt! } }, { ...context.nodes[1], devEui: 'not-on-the-map' }]
    const map = livingMap(context, null, null)!
    expect(map.objects.filter(o => o.type === 'sensor-node')).toHaveLength(6)
    const readings = measuredSensors(map, 'air-temperature', Date.parse(context.updatedAt!))
    expect(readings.map(s => s.value)).toEqual([27, null, null, null, null, null])
    expect(readings[0].object.xM).toBe(originalPosition)
  })

  it('uses recorded historical locations, never a current layout or a backfill', () => {
    const { context, history } = livingDemo()
    history.layouts[0].map = structuredClone(context.map!)
    history.layouts[0].map.objects.find(o=>o.type==='sensor-node')!.xM = 9
    expect(livingMap(context,history,0)!.objects.find(o=>o.type==='sensor-node')!.xM).toBe(9)
    history.layouts[0].source = 'backfill'
    expect(livingMap(context,history,0)).toBeNull()
    history.layouts = []
    expect(livingMap(context,history,0)).toBeNull()
  })

  it('does not carry current values into a missing historical observation', () => {
    const { context, history } = livingDemo()
    history.frames[0].nodes = []
    const map = livingMap(context,history,0)!
    expect(measuredSensors(map,'air-temperature',Date.parse(history.frames[0].observedAt)).every(s=>s.value===null)).toBe(true)
  })

  it('rejects stale, undated and future metrics independently of the node timestamp', () => {
    const { context } = livingDemo()
    const at = Date.parse(context.updatedAt!)
    const n = context.nodes[0]
    n.measurements = { airTemperatureC: 0, relativeHumidityPercent: 60, measuredAt: new Date(at).toISOString(), measuredAtByMetric: { airTemperatureC: new Date(at-3600_000).toISOString() } }
    let map=livingMap(context,null,null)!
    expect(measuredSensors(map,'air-temperature',at)[0].value).toBeNull()
    expect(measuredSensors(map,'relative-humidity',at)[0].value).toBe(60)
    n.measurements = { airTemperatureC: 0, measuredAt: new Date(at).toISOString() }
    map=livingMap(context,null,null)!
    expect(measuredSensors(map,'air-temperature',at)[0].value).toBe(0)
    expect(measuredSensors(map,'air-temperature',at-3600_000)[0].value).toBeNull()
    n.measurements = { airTemperatureC: 20 }; n.lastSeenAt=undefined
    expect(measuredSensors(livingMap(context,null,null)!,'air-temperature',at)[0].value).toBeNull()
  })

  it('does not paint a spatial field from a single valid reading', () => {
    const { context } = livingDemo()
    context.nodes = context.nodes.slice(0,1)
    const map = livingMap(context,null,null)!
    const scene = sceneGeometry(map,'air-temperature',Date.parse(context.updatedAt!))
    expect(scene.coverage).toBe(0)
    expect(scene.volume.pixels.every(v=>v===0)).toBe(true)
    expect(scene.sensors.filter(s=>s.value!==null)).toHaveLength(1)
    expect(scene.vertices.length).toBeGreaterThan(0)
    expect(scene.vertices.every(Number.isFinite)).toBe(true)
  })
})
