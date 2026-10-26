import { describe, expect, it } from 'vitest'
import { OBJECT_LIBRARY, type GreenhouseObject } from '../greenhouse-map/model'
import { createDemoMap } from '../greenhouse-map/demo'
import { objectGeometry } from './objectGeometry'
import { sceneGeometry } from './sceneGeometry'
import { equipmentMountCeiling } from './wallSurfaces'

const dimensions = { widthM: 12, lengthM: 8, heightM: 4 }
function object(type: GreenhouseObject['type'], widthM = 1.4, lengthM = .2): GreenhouseObject {
  return { id: 'test', type, name: type, xM: 5, yM: 3, widthM, lengthM, rotationDeg: 0, visible: true, locked: false, layerId: 'structure', metadata: {} }
}
function points(mesh: Float32Array) {
  return Array.from({ length: mesh.length / 6 }, (_, i) => Array.from(mesh.slice(i * 6, i * 6 + 3)))
}
function bounds(mesh: Float32Array) {
  const p = points(mesh)
  return [0,1,2].map(axis => [Math.min(...p.map(v => v[axis])), Math.max(...p.map(v => v[axis]))])
}
describe('equipment models on the saved layout', () => {
  it('moves hanging equipment with the ceiling without stretching its model or moving floor equipment',()=>{
    for(const type of ['lamp','fan'] as const){
      const original=object(type,1,.35),low=points(objectGeometry(original,dimensions,3)),high=points(objectGeometry(original,dimensions,5))
      expect(high.length).toBe(low.length)
      // Ceiling attachments move exactly the same two metres as the room height.
      for(let i=0;i<low.length;i++){
        expect(high[i][0]).toBeCloseTo(low[i][0]);expect(high[i][2]).toBeCloseTo(low[i][2])
        expect(high[i][1]-low[i][1]).toBeCloseTo(2,5)
      }
    }
    expect(objectGeometry(object('growing-table',3,1),dimensions,3)).toEqual(objectGeometry(object('growing-table',3,1),dimensions,5))
  })
  it('keeps hanging equipment below the lowest pitched roof point over its rotated footprint',()=>{
    for(const rotationDeg of [0,35,90])for(const type of ['lamp','fan'] as const){
      const original={...object(type,1,.35),rotationDeg},ceiling=equipmentMountCeiling(original,dimensions,4,.32)
      const mesh=objectGeometry(original,dimensions,4,ceiling)
      expect(bounds(mesh)[1][1]).toBeLessThan(ceiling)
      expect(bounds(mesh)[1][0]).toBeGreaterThan(0)
    }
  })
  it('uses the configured door height and type, keeping a wide single door single', () => {
    const single = objectGeometry({...object('door',3,.2),metadata:{door:{type:'single',heightM:2.6}}},dimensions,4)
    const narrow = objectGeometry({...object('door',1.2,.2),metadata:{door:{type:'single',heightM:2.6}}},dimensions,4)
    const double = objectGeometry({...object('door',3,.2),metadata:{door:{type:'double',heightM:2.6}}},dimensions,4)
    const sliding = objectGeometry({...object('door',3,.2),metadata:{door:{type:'sliding',heightM:2.6}}},dimensions,4)
    expect(bounds(single)[1][1]).toBeCloseTo(2.6)
    expect(bounds(double)[1][1]).toBeCloseTo(2.6)
    expect(single.length).toBe(narrow.length)
    expect(double.length).toBeGreaterThan(single.length)
    expect(sliding).not.toEqual(single)
    expect(single.every(Number.isFinite) && double.every(Number.isFinite) && sliding.every(Number.isFinite)).toBe(true)
  })
  it('creates bounded, finite, distinct meshes for every physical equipment type', () => {
    const sizes = new Map<string, number>()
    for (const entry of OBJECT_LIBRARY.filter(e => !['sensor-node','section-zone','technical-zone','text-label'].includes(e.type))) {
      const o = object(entry.type, ...entry.size), snapshot = JSON.stringify(o)
      const mesh = objectGeometry(o, dimensions, 4)
      expect(mesh.length, entry.type).toBeGreaterThan(0)
      expect(mesh.length % 18).toBe(0)
      expect(mesh.every(Number.isFinite), entry.type).toBe(true)
      expect(mesh.length / 18, entry.type).toBeLessThan(15000)
      for (let i = 3; i < mesh.length; i += 6) expect(Array.from(mesh.slice(i, i + 3)).every(c => c >= 0 && c <= 1)).toBe(true)
      expect(JSON.stringify(o)).toBe(snapshot)
      sizes.set(entry.type, mesh.length)
    }
    expect(sizes.get('rack')).not.toBe(sizes.get('growing-table'))
    expect(sizes.get('fan')).not.toBe(sizes.get('window'))
    expect(sizes.get('window')).not.toBe(sizes.get('ventilation-opening'))
  })
  it('preserves the exact saved anchor and rotation, including reflected plan Y', () => {
    for (const type of ['door','window','fan','rack','lamp','reservoir'] as const) {
      const o = object(type), before = points(objectGeometry(o, dimensions, 4))
      const after = points(objectGeometry({ ...o, rotationDeg: 90 }, dimensions, 4))
      expect(after).toHaveLength(before.length)
      for(let i=0;i<before.length;i++) {
        const [x,y,z]=before[i], px=x+dimensions.widthM/2-o.xM, py=dimensions.lengthM/2-z-o.yM
        expect(after[i][0]).toBeCloseTo(o.xM-py-dimensions.widthM/2,4)
        expect(after[i][1]).toBeCloseTo(y,5)
        expect(after[i][2]).toBeCloseTo(dimensions.lengthM/2-o.yM-px,4)
      }
    }
  })
  it('keeps north and east doors on their walls without turning east doors into thick blocks', () => {
    const north = bounds(objectGeometry({ ...object('door'), xM: 9, yM: 7.8, metadata: { wallMount: { wall: 'north', offsetM: 9 } } }, dimensions, 4))
    expect(north[0][0]).toBeCloseTo(3); expect(north[0][1]).toBeCloseTo(4.4)
    expect(north[2][0]).toBeGreaterThanOrEqual(-4.03); expect(north[2][1]).toBeLessThan(-3.77)
    const east = bounds(objectGeometry({ ...object('door', .2, 1.4), xM: 11.8, yM: 5, metadata: { wallMount: { wall: 'east', offsetM: 5 } } }, dimensions, 4))
    expect(east[0][0]).toBeGreaterThan(5.77); expect(east[0][1]).toBeLessThanOrEqual(6.03)
    expect(east[2][0]).toBeCloseTo(-2.4); expect(east[2][1]).toBeCloseTo(-1)
    expect(east[1][1]).toBeGreaterThan(2)
  })
  it('gives glazing an open viewing area, while a rack has three separate shelf levels', () => {
    const window = objectGeometry(object('window'), dimensions, 4)
    // No glass-covering triangle crosses the middle of the clear window pane.
    const center = [5 + .7 - 6 - .32, 1.15 + .95 * .55, 4 - 3 - .1]
    for(let i=0;i<window.length;i+=18) {
      const vertices=[0,6,12].map(j=>Array.from(window.slice(i+j,i+j+3)))
      const minX=Math.min(...vertices.map(v=>v[0])),maxX=Math.max(...vertices.map(v=>v[0]))
      const minY=Math.min(...vertices.map(v=>v[1])),maxY=Math.max(...vertices.map(v=>v[1]))
      expect(minX<center[0] && maxX>center[0] && minY<center[1] && maxY>center[1]).toBe(false)
    }
    const rack = points(objectGeometry(object('rack', 2, .8), dimensions, 4))
    for(const height of [1.95*.13,1.95*.55,1.95*.95])expect(rack.some(v=>Math.abs(v[1]-(height+.0125))<1e-5)).toBe(true)
  })
  it('does not draw hidden objects or hidden layers, and keeps Nodes as projected points', () => {
    expect(objectGeometry({ ...object('fan'), visible:false },dimensions,4)).toHaveLength(0)
    expect(objectGeometry(object('sensor-node'),dimensions,4)).toHaveLength(0)
    const map=createDemoMap();map.dimensions=dimensions;map.objects=[]
    const empty=sceneGeometry(map,'air-temperature',Date.now(),undefined,{view:'points'})
    map.objects=[{ ...object('fan'),layerId:'climate' }]
    map.layers=map.layers.map(l=>l.id==='climate' ? {...l,visible:false} : l)
    expect(sceneGeometry(map,'air-temperature',Date.now(),undefined,{view:'points'}).vertices).toEqual(empty.vertices)
  })
})
