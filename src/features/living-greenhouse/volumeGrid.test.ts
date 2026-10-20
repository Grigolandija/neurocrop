import { describe, it, expect } from 'vitest'
import { livingDemo, livingMap, measuredSensors } from './livingData'
import { createVolumeGrid } from './volumeGrid'

function fixture() {
  const {context}=livingDemo(),map=livingMap(context,null,null)!,at=Date.parse(context.updatedAt!)
  const readings=measuredSensors(map,'air-temperature',at)
  readings.forEach((r,i)=>{r.value=i<3 ? 20 : 30})
  return {map,readings}
}
function valueAt(grid:ReturnType<typeof createVolumeGrid>,x:number,z:number,y:number,w=20,d=12,h=4.2) {
  const cell=(Math.min(grid.layers-1,Math.floor(y/h*grid.layers))*grid.depth+Math.floor(z/d*grid.depth))*grid.width+Math.floor(x/w*grid.width)
  return grid.mask[cell] ? grid.values[cell] : null
}
describe('measured XYZ climate field',()=>{
  it('interpolates different values at different heights, without a user-selected plane',()=>{
    const {map,readings}=fixture(),grid=createVolumeGrid(map,readings,4.2)
    const low=valueAt(grid,10,5,1.3)!,high=valueAt(grid,10,5,2.7)!
    expect(low).not.toBeNull();expect(high).not.toBeNull();expect(high).toBeGreaterThan(low)
    expect(valueAt(grid,10,5,.2)).toBeNull();expect(valueAt(grid,10,5,3.8)).toBeNull()
  })
  it('changing only Node heights changes the spatial result',()=>{
    const {map,readings}=fixture(),before=createVolumeGrid(map,readings,4.2)
    readings.forEach(r=>{r.heightM=1.5})
    const after=createVolumeGrid(map,readings,4.2)
    expect(valueAt(before,10,5,2.7)).not.toBeNull();expect(valueAt(after,10,5,2.7)).toBeNull()
    expect(valueAt(after,10,5,1.5)).not.toBeNull()
  })
  it('never extends a single height across the whole greenhouse volume',()=>{
    const {map,readings}=fixture();readings.forEach(r=>{r.heightM=1.5})
    const grid=createVolumeGrid(map,readings,4.2)
    expect(valueAt(grid,10,5,.5)).toBeNull();expect(valueAt(grid,10,5,3)).toBeNull()
  })
  it('excludes unknown heights and blocks interpolation through a partition',()=>{
    const {map,readings}=fixture();readings.forEach(r=>{r.heightM=null})
    expect(createVolumeGrid(map,readings,4.2).mask.some(Boolean)).toBe(false)
    readings[0].heightM=1.5;readings[1].heightM=1.5
    readings[1].object.xM=3;readings[1].object.yM=2.3
    map.objects.push({id:'barrier',type:'partition',name:'Wall',xM:3.8,yM:0,widthM:.2,lengthM:12,rotationDeg:0,layerId:'structure',visible:true,locked:false,metadata:{}})
    const grid=createVolumeGrid(map,readings,4.2)
    expect(valueAt(grid,3.2,2.3,1.5)).not.toBeNull()
    expect(valueAt(grid,4.1,2.2,1.5)).toBeNull()
  })
})
