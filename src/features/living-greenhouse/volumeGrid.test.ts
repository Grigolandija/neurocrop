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
    expect(valueAt(grid,10,5,.2)).not.toBeNull();expect(valueAt(grid,10,5,3.8)).not.toBeNull()
  })
  it('changing only Node heights changes the spatial result',()=>{
    const {map,readings}=fixture(),before=createVolumeGrid(map,readings,4.2)
    readings.forEach(r=>{r.heightM=1.5})
    const after=createVolumeGrid(map,readings,4.2)
    expect(valueAt(before,10,5,2.7)).not.toBe(valueAt(after,10,5,2.7))
    expect(valueAt(after,10,5,1.5)).not.toBeNull()
  })
  it('fills the envelope from one measured level while explicitly lowering support elsewhere',()=>{
    const {map,readings}=fixture();readings.forEach(r=>{r.heightM=1.5})
    const grid=createVolumeGrid(map,readings,4.2)
    expect(valueAt(grid,10,5,.5)).not.toBeNull();expect(valueAt(grid,10,5,3)).not.toBeNull()
    const at=(height:number)=>(Math.floor(height/4.2*grid.layers)*grid.depth+Math.floor(5/12*grid.depth))*grid.width+Math.floor(10/20*grid.width)
    expect(grid.extrapolated[at(.5)]).toBe(1)
    expect(grid.confidence[at(.5)]).toBeLessThan(grid.confidence[at(1.5)])
  })
  it('covers every interior voxel, including corners outside the sensor hull and the old radius',()=>{
    const {map,readings}=fixture()
    map.heatmapSettings.maxInfluenceDistanceM=.2
    const grid=createVolumeGrid(map,readings,4.2)
    for(let y=0;y<grid.layers;y++)for(let z=0;z<grid.depth;z++)for(let x=0;x<grid.width;x++){
      const height=(y+.5)*4.2/grid.layers,roof=4.2*(1-.32*Math.abs((z+.5)*12/grid.depth-6)/6)
      const i=(y*grid.depth+z)*grid.width+x
      if(height>roof){expect(grid.mask[i]).toBe(0);continue}
      expect(grid.mask[i]).toBe(1)
      expect(grid.values[i]).toBeGreaterThanOrEqual(20)
      expect(grid.values[i]).toBeLessThanOrEqual(30.00001)
    }
    expect(valueAt(grid,.2,.2,.2)).not.toBeNull()
  })
  it('uses each independent XYZ location when every Node has a different height',()=>{
    const {map,readings}=fixture()
    readings.forEach((r,i)=>{r.heightM=.4+i*.5;r.value=17+i*2})
    const before=createVolumeGrid(map,readings,4.2)
    const first=readings[0].heightM;readings[0].heightM=readings[5].heightM;readings[5].heightM=first
    const after=createVolumeGrid(map,readings,4.2)
    expect(valueAt(before,3.2,2.2,.5)).not.toBeCloseTo(valueAt(after,3.2,2.2,.5)!,1)
  })
  it('also fills aisles outside drawn growing zones, without borrowing readings for another named zone',()=>{
    const {map,readings}=fixture()
    map.objects.push({id:'zone',type:'section-zone',name:'Crop',xM:1,yM:1,widthM:17,lengthM:9,rotationDeg:0,layerId:'sensors',visible:true,locked:false,metadata:{section:{sectionId:'demo-section',sectionName:'Crop'}}})
    const grid=createVolumeGrid(map,readings,4.2)
    expect(valueAt(grid,.2,.2,1.5)).not.toBeNull()
    map.objects.push({id:'empty-zone',type:'section-zone',name:'Another room',xM:0,yM:0,widthM:.8,lengthM:.8,rotationDeg:0,layerId:'sensors',visible:true,locked:false,metadata:{section:{sectionId:'unmeasured-section',sectionName:'Another room'}}})
    expect(valueAt(createVolumeGrid(map,readings,4.2),.2,.2,1.5)).toBeNull()
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
