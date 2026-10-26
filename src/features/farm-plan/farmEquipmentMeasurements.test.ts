import { describe, expect, it } from 'vitest'
import { objectInsideOutline, validOutlineMount } from '../../../backend/area-map-outline.js'
import { snapObjectToMapWall } from '../greenhouse-map/geometry'
import { emptyFarmPlan } from './farmPlanData'
import { farmEditorMap, newFarmObject } from './farmLayoutData'
import { equipmentWallClearances, setEquipmentWallClearance, wallClearanceEditable } from './farmEquipmentClearances'

function fixture() {
  const plan = { ...emptyFarmPlan(), areas: [{ id: 'a', name: 'Room', kind: 'room' as const, height: 3, polygon: [{ xM: 20, yM: 30 }, { xM: 32, yM: 30 }, { xM: 32, yM: 40 }, { xM: 20, yM: 40 }] }] }
  const map = farmEditorMap(plan, 'a', {})
  const object = { ...newFarmObject('growing-table', map), xM: 2, yM: 2, widthM: 4, lengthM: 1 }
  map.objects = [object]
  return { map, object }
}

describe('equipment dimensions and wall clearances', () => {
  it('measures footprint edges in the local Area frame, including rotation and contact', () => {
    const { map, object } = fixture()
    const byWall = Object.fromEntries(equipmentWallClearances(object, map).map(value => [value.wallIndex, value.distanceM]))
    expect(byWall).toEqual({ 0: 2, 1: 6, 2: 7, 3: 2 })
    const rotated = { ...object, xM: 3, rotationDeg: 90 }
    const values = equipmentWallClearances(rotated, map)
    expect(values.find(value => value.wallIndex === 3)?.distanceM).toBeCloseTo(2)
    expect(values.find(value => value.wallIndex === 2)?.distanceM).toBeCloseTo(4)
    const moved = setEquipmentWallClearance(rotated, map, 3, .37)!
    expect(moved.xM).toBeCloseTo(1.37)
    expect(moved).toMatchObject({ rotationDeg: 90, widthM: 4, lengthM: 1 })
    expect(equipmentWallClearances(moved, map).find(value => value.wallIndex === 3)?.distanceM).toBeCloseTo(.37)
    const touching = { ...object, xM: 0 }
    expect(equipmentWallClearances(touching, map).find(value => value.wallIndex === 3)?.distanceM).toBe(0)
    expect(setEquipmentWallClearance(touching, map, 3, .5)?.xM).toBeCloseTo(.5)
  })

  it('applies exact typed distances without grid rounding or changing dimensions and metadata', () => {
    const { map, object } = fixture()
    object.metadata.equipmentPlacement = { mount: 'ceiling', heightM: .1, offsetM: .25 }
    const next = setEquipmentWallClearance(object, map, 3, .537)!
    expect(next.xM).toBeCloseTo(.537)
    expect(next).toMatchObject({ yM: 2, widthM: 4, lengthM: 1, rotationDeg: 0, metadata: object.metadata })
    expect(object.xM).toBe(2)
    const flush = setEquipmentWallClearance(object, map, 0, 0)!
    expect(flush.yM).toBeCloseTo(0)
    expect(objectInsideOutline(flush, map)).toBe(true)
  })

  it('uses real angled walls and verifies the resulting distance', () => {
    const { map, object } = fixture()
    map.shape = { type: 'polygon', points: [{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 10 }] }
    const square = { ...object, xM: 4, yM: 1, widthM: 1, lengthM: 1 }
    expect(equipmentWallClearances(square, map).find(value => value.wallIndex === 2)?.distanceM).toBeCloseTo(Math.SQRT2)
    const moved = setEquipmentWallClearance(square, map, 2, .5)!
    expect(moved).not.toBeNull()
    expect(equipmentWallClearances(moved, map).find(value => value.wallIndex === 2)?.distanceM).toBeCloseTo(.5)
    expect(moved.rotationDeg).toBe(0)
    expect(objectInsideOutline(moved, map)).toBe(true)
    map.shape = { type: 'polygon', points: [...map.shape.points].reverse() }
    expect(equipmentWallClearances(square, map).find(value => value.wallIndex === 2)?.distanceM).toBeCloseTo(Math.SQRT2)
  })

  it('measures an L-shaped inner wall and rejects destinations outside the actual outline', () => {
    const { map, object } = fixture()
    map.shape = { type: 'polygon', points: [{ xM: 0, yM: 0 }, { xM: 8, yM: 0 }, { xM: 8, yM: 2 }, { xM: 2, yM: 2 }, { xM: 2, yM: 8 }, { xM: 0, yM: 8 }] }
    const narrow = { ...object, xM: .5, yM: 4, widthM: 1, lengthM: 1 }
    const distances = equipmentWallClearances(narrow, map)
    expect(distances.find(value => value.wallIndex === 3)?.distanceM).toBeCloseTo(.5)
    expect(distances.some(value => value.wallIndex === 1)).toBe(false)
    expect(setEquipmentWallClearance(narrow, map, 3, .25)?.xM).toBeCloseTo(.75)
    expect(setEquipmentWallClearance(narrow, map, 5, 3)).toBeNull()
  })

  it('cannot jump across a U-shaped recess even when the destination fits', () => {
    const { map, object } = fixture()
    map.shape = { type: 'polygon', points: [{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 8 }, { xM: 7, yM: 8 }, { xM: 7, yM: 2 }, { xM: 3, yM: 2 }, { xM: 3, yM: 8 }, { xM: 0, yM: 8 }] }
    const narrow = { ...object, xM: 1, yM: 4, widthM: 1, lengthM: 1 }
    expect(objectInsideOutline({ ...narrow, xM: 8 }, map)).toBe(true)
    expect(setEquipmentWallClearance(narrow, map, 7, 8)).toBeNull()
  })

  it('keeps openings attached to their original wall while adjusting the side clearance', () => {
    const { map } = fixture()
    const door = snapObjectToMapWall({ ...newFarmObject('door', map), xM: 4, yM: 0, widthM: 1.2, lengthM: .2 }, map, 0)
    const ownWall = equipmentWallClearances(door, map).find(value => value.wallIndex === 0)!
    expect(wallClearanceEditable(door, map, ownWall)).toBe(false)
    expect(setEquipmentWallClearance(door, map, 0, .5)).toBeNull()
    const moved = setEquipmentWallClearance(door, map, 3, .65)!
    expect(moved.xM).toBeCloseTo(.65)
    expect(moved.metadata.wallMount?.offsetM).toBeCloseTo(.65)
    expect(moved.metadata.wallMount?.edgeIndex).toBe(0)
    expect(validOutlineMount(moved, map)).toBe(true)
  })

  it('rejects locked objects, invalid numbers and Nodes without mutating the original', () => {
    const { map, object } = fixture(), original = structuredClone(object)
    for (const value of [-1, NaN, Infinity, 20000, 11]) expect(setEquipmentWallClearance(object, map, 3, value)).toBeNull()
    expect(setEquipmentWallClearance({ ...object, locked: true }, map, 3, .5)).toBeNull()
    expect(equipmentWallClearances({ ...object, type: 'sensor-node' }, map)).toEqual([])
    map.layers = map.layers.map(layer => layer.id === object.layerId ? { ...layer, locked: true } : layer)
    expect(setEquipmentWallClearance(object, map, 3, .5)).toBeNull()
    expect(object).toEqual(original)
    map.farmPlanGeometry = { areaId: 'a', revision: 1, kind: 'zone' }
    expect(equipmentWallClearances(object, map)).toEqual([])
  })
})
