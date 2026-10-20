import { describe,it,expect } from 'vitest'
import { livingDemo,livingMap,measuredSensors } from './livingData'
import { verticalComparisons } from './spatialEvidence'
import { sceneGeometry } from './sceneGeometry'

function example(){const data=livingDemo();const frame=data.history.frames.reduce((a,b)=>a.nodes[3].measurements.airTemperatureC!>b.nodes[3].measurements.airTemperatureC! ? a : b);const i=data.history.frames.indexOf(frame);const map=livingMap(data.context,data.history,i)!;const at=Date.parse(frame.observedAt)+900000;return{...data,map,at,readings:measuredSensors(map,'air-temperature',at)}}
describe('spatial evidence',()=>{
  it('uses all measured heights automatically in the climate volume',()=>{
    const {map,at}=example();
    const scene=sceneGeometry(map,'air-temperature',at);
    expect(scene.knownHeights).toBe(6);expect(scene.volumeReady).toBe(true);
    expect(scene.volume.layers).toBe(24);expect(scene.heightRange).toEqual([1.2,2.8]);
  })
  it('does not produce a field from readings whose height is unknown',()=>{
    const {map,at}=example();
    map.objects.filter(o=>o.type==='sensor-node').forEach(o=>{o.metadata.sensor!.measurementHeightsM={'air-temperature':null}})
    const scene=sceneGeometry(map,'air-temperature',at);
    expect(scene.volumeReady).toBe(false);expect(scene.volume.pixels.every(v=>v===0)).toBe(true);
  })
  it('compares only nearby, contemporary readings at different heights',()=>{
    const {readings,map}=example();const pairs=verticalComparisons(readings,map);expect(pairs).toHaveLength(3);expect(pairs[0].delta).toBeGreaterThan(2);
    const bad=structuredClone(readings);bad[3].timestamp=new Date(Date.parse(bad[3].timestamp!)-600000).toISOString();
    expect(verticalComparisons(bad,map)).toHaveLength(2);
    bad[4].heightM=null;expect(verticalComparisons(bad,map)).toHaveLength(1);
  })
  it('uses per-sensor heights and explicit unknowns instead of enclosure defaults',()=>{
    const {context}=livingDemo();context.nodes[0].measurementHeightsM={'air-temperature':2,co2:null};
    const map=livingMap(context,null,null)!,at=Date.parse(context.updatedAt!);
    expect(measuredSensors(map,'air-temperature',at)[0].heightM).toBe(2);expect(measuredSensors(map,'co2',at)[0].heightM).toBeNull();
    expect(measuredSensors(map,'relative-humidity',at)[0].heightM).toBe(1.2);
  })
  it('never borrows a current height for old measurements',()=>{
    const {context,history}=livingDemo();context.nodes[0].measurementHeightsM={'air-temperature':3.5};
    expect(measuredSensors(livingMap(context,history,0)!,'air-temperature',Date.parse(history.from)+900000)[0].heightM).toBe(1.2);
    delete history.frames[0].nodes[0].measurementHeightsM;
    expect(measuredSensors(livingMap(context,history,0)!,'air-temperature',Date.parse(history.from)+900000)[0].heightM).toBeNull();
  })
  it('keeps high Nodes inside an illustrative roof instead of clipping their measurements',()=>{
    const {context}=livingDemo();delete context.map!.dimensions.heightM
    context.nodes[0].measurementHeightsM={'air-temperature':3.5}
    const map=livingMap(context,null,null)!,at=Date.parse(context.updatedAt!)
    const scene=sceneGeometry(map,'air-temperature',at)
    const node=scene.sensors[0],z=node.object.yM+node.object.lengthM/2
    expect(scene.height*(1-.32*Math.abs(z-map.dimensions.lengthM/2)/(map.dimensions.lengthM/2))).toBeGreaterThan(3.5)
    expect(scene.knownHeights).toBe(6)
  })
})
