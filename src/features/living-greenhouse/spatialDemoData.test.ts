import { describe, expect, it } from 'vitest'
import { createSpatialDemo, demoValue, spatialDemoMap } from './spatialDemoData'
import { measuredSensors } from './livingData'
import { createVolumeGrid } from './volumeGrid'

describe('isolated 3D workspace demonstration', () => {
  const demo = createSpatialDemo(Date.UTC(2026, 9, 22, 12))
  it('provides six independent measured XYZ locations within the schematic room', () => {
    const map = spatialDemoMap(demo, 96)
    const readings = measuredSensors(map, 'air-temperature', Date.parse(demo.frames[96].measuredAt))
    expect(readings).toHaveLength(6)
    expect(new Set(readings.map(r => r.heightM)).size).toBe(6)
    expect(readings.every(r => r.value !== null && r.heightM! > 0 && r.heightM! < map.dimensions.heightM!)).toBe(true)
    expect(map.objects.filter(o => o.type === 'door')).toHaveLength(2)
    expect(map.objects.filter(o => o.type === 'growing-table')).toHaveLength(2)
    const grid = createVolumeGrid(map, readings, 3.2, 0)
    expect(grid.knownCount).toBe(6)
    expect(grid.mask.every(Boolean)).toBe(true)
  })
  it('uses the same timestamp and metric for history, labels and the volume, without mutating the fixture', () => {
    const snapshot = JSON.stringify(demo)
    for (const index of [0, 48, 96]) {
      const map = spatialDemoMap(demo, index), frame = demo.frames[index]
      const readings = measuredSensors(map, 'relative-humidity', Date.parse(frame.measuredAt))
      expect(readings.every((r, i) => r.value === demoValue(frame.readings[i], 'relative-humidity') && r.timestamp === frame.measuredAt)).toBe(true)
    }
    expect(JSON.stringify(demo)).toBe(snapshot)
    expect(demoValue(demo.frames[48].readings[0], 'air-temperature')).not.toBe(demoValue(demo.frames[96].readings[0], 'air-temperature'))
  })
  it('responds to height changes without moving the sensor in the plan', () => {
    const map = spatialDemoMap(demo, 96)
    const readings = measuredSensors(map, 'air-temperature', Date.parse(demo.frames[96].measuredAt))
    const before = createVolumeGrid(map, readings, 3.2, 0)
    readings[0] = { ...readings[0], heightM: 2.9 }
    const after = createVolumeGrid(map, readings, 3.2, 0)
    expect(Array.from(before.values)).not.toEqual(Array.from(after.values))
    expect(readings[0].object.xM).toBe(demo.nodes[0].xM)
  })
})
