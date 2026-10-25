import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDemoMap } from './demo'
import { doorConfiguration, doorOpening } from './doorConfiguration'
import { snapWallMountedObject } from './geometry'
import type { GreenhouseObject } from './model'
import { mapRepository, validateMap } from './services/mapRepository'
import { normalizeMapGeometry } from './useMapEditor'
import ObjectPropertiesPanel from './components/ObjectPropertiesPanel'

const dimensions = { widthM: 8, lengthM: 5, heightM: 3.2 }
const door = (): GreenhouseObject => ({ id: 'door', type: 'door', name: 'Durys', xM: 1, yM: 0, widthM: 1.2, lengthM: .2, rotationDeg: 0, visible: true, locked: false, layerId: 'structure', metadata: { wallMount: { wall: 'south', offsetM: 1 } } })
afterEach(() => vi.unstubAllGlobals())

describe('explicit door configuration in the area layout', () => {
  it('never chooses a leaf count from width, including legacy and narrow double doors', () => {
    expect(doorConfiguration({ ...door(), widthM: 3 }, 3.2).type).toBe('single')
    const double = { ...door(), metadata: { ...door().metadata, door: { type: 'double' as const, heightM: 2.4 } } }
    expect(doorConfiguration(double, 3.2)).toEqual({ type: 'double', heightM: 2.4 })
    expect(doorConfiguration({ ...double, widthM: 3 }, 3.2)).toEqual(doorConfiguration(double, 3.2))
  })
  it('resizes the opening along every mounted wall without changing type, height or plan thickness', () => {
    for (const wall of ['south','north','east','west'] as const) {
      const original = snapWallMountedObject({ ...door(), metadata: { ...door().metadata, door: { type: 'sliding' as const, heightM: 2.3 } } }, dimensions, wall)
      const opening = doorOpening(original, dimensions)
      const resized = snapWallMountedObject({ ...original, [opening.axis]: 2.8 }, dimensions, wall)
      expect(doorOpening(resized, dimensions).widthM).toBe(2.8)
      expect(Math.min(resized.widthM,resized.lengthM)).toBe(.2)
      expect(resized.metadata.door).toEqual({ type: 'sliding', heightM: 2.3 })
      expect(resized.metadata.wallMount?.wall).toBe(wall)
    }
  })
  it('round-trips configured doors through normalization, validation, storage and reload', () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
    for (const type of ['single','double','sliding'] as const) {
      const map = createDemoMap(); map.dimensions = dimensions
      map.objects = [{ ...door(), metadata: { ...door().metadata, door: { type, heightM: 2.4 } } }]
      const normalized = normalizeMapGeometry(map)
      expect(validateMap(normalized).ok).toBe(true)
      mapRepository.save(normalized)
      const restored = mapRepository.load().objects[0]
      expect(restored.metadata.door).toEqual({ type, heightM: 2.4 })
      expect(restored.metadata.wallMount).toEqual(normalized.objects[0].metadata.wallMount)
    }
  })
  it('rejects malformed door settings and a door taller than the room', () => {
    for (const config of [null, [], {type:'auto'}, {type:'single',heightM:-1}, {type:'single',heightM:0}, {type:'single',heightM:3.3}, {type:'double',heightM:'2.1'}]) {
      const map=createDemoMap(); map.dimensions=dimensions
      map.objects=[door()]; Object.assign(map.objects[0].metadata,{door:config})
      const result=validateMap(map)
      expect(result.ok).toBe(false)
      if(!result.ok)expect(result.error).toMatch(/door configuration/i)
    }
  })
  it('exposes width, height and type in the real properties panel, respecting placement locks', () => {
    const map=createDemoMap();map.dimensions=dimensions
    const selected={...door(),metadata:{...door().metadata,door:{type:'double' as const,heightM:2.4}}}
    const html=renderToStaticMarkup(createElement(ObjectPropertiesPanel,{map,selected:[selected],onUpdate:()=>{},onAlign:()=>{},language:'lt'}))
    expect(html).toContain('aria-label="Durų angos plotis"')
    expect(html).toContain('aria-label="Durų aukštis"')
    expect(html).toContain('value="2.4"')
    expect(html).toMatch(/value="double" selected=""/)
    const locked=renderToStaticMarkup(createElement(ObjectPropertiesPanel,{map,selected:[{...selected,locked:true}],onUpdate:()=>{},onAlign:()=>{},language:'lt'}))
    expect(locked).toMatch(/aria-label="Durų tipas" disabled=""/)
  })
})
