import { describe, expect, it } from 'vitest'
import { climateContours } from './climateContours'

const grid=(values=[11,13,17,19])=>({width:4,depth:1,layers:1,values:Float32Array.from(values),confidence:new Float32Array(4).fill(1),mask:new Uint8Array(4).fill(1),extrapolated:new Uint8Array(4),knownCount:2,heightRange:[1,1] as const})

describe('climate topography boundaries',()=>{
  it('places each numeric caption on its interpolated value boundary in XYZ',()=>{
    const result=climateContours(grid(),[4,2,2],{min:10,max:20})
    expect(result.map(c=>c.value)).toEqual([14,16])
    expect(result.map(c=>c.anchors[0])).toEqual([[-.25,1,0],[.25,1,0]])
    expect(result.map(c=>c.normalized)).toEqual([.4,.6])
  })
  it('does not invent boundaries in uniform or unsupported data',()=>{
    expect(climateContours(grid([15,15,15,15]),[4,2,2],{min:10,max:20})).toEqual([])
    const absent=grid();absent.mask.fill(0)
    expect(climateContours(absent,[4,2,2],{min:10,max:20})).toEqual([])
    const gap=grid();gap.mask[1]=0;gap.mask[2]=0
    expect(climateContours(gap,[4,2,2],{min:10,max:20})).toEqual([])
  })
  it('keeps the same value levels across time instead of stretching a frame’s range',()=>{
    const result=climateContours(grid([15,16,17,18]),[4,2,2],{min:10,max:20})
    expect(result.map(c=>c.value)).toEqual([16,17])
    expect(climateContours(grid(),[4,2,2],{min:20,max:10})).toEqual([])
  })
})
