import type { GreenhouseMap } from '../greenhouse-map/model'
import { pointInPolygon, segmentCrossesPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { footprintHull, insideHull, type SensorReading } from './spatialEvidence'

export const VOLUME_LAYERS = 24
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** A full-envelope XYZ estimate. Measurements remain separate from modeled voxels. */
export function createVolumeGrid(map: GreenhouseMap, readings: SensorReading[], roofHeightM: number) {
  const w = map.dimensions.widthM, d = map.dimensions.lengthM
  const cell = Math.max(w, d) / 56
  const width = Math.max(2, Math.ceil(w / cell)), depth = Math.max(2, Math.ceil(d / cell)), layers = VOLUME_LAYERS
  const length = width * depth * layers
  const values = new Float32Array(length), confidence = new Float32Array(length), mask = new Uint8Array(length), extrapolated = new Uint8Array(length)
  const settings = map.heatmapSettings
  // The old radius / convex-hull cutoffs left holes. Distance now changes the
  // support indicator, not the extent of the estimated greenhouse volume.
  const supportRadius = Math.max(.1, settings.maxInfluenceDistanceM)
  const nearestCount = Math.max(2, settings.nearestSensorCount)
  const power = Math.max(1, settings.idwPower)
  const polygon = (o: GreenhouseMap['objects'][number]) => {
    const a = o.rotationDeg * Math.PI / 180
    return [[0,0],[o.widthM,0],[o.widthM,o.lengthM],[0,o.lengthM]].map(([x,y])=>({xM:o.xM+x*Math.cos(a)-y*Math.sin(a),yM:o.yM+x*Math.sin(a)+y*Math.cos(a)}))
  }
  const barriers = map.objects.filter(o=>o.type==='partition' && o.visible).map(polygon)
  const zones = map.objects.filter(o=>o.type==='section-zone' && o.visible).map(o=>({id:o.metadata.section?.sectionId || o.id,polygon:polygon(o)}))
  const sources = readings.filter(r=>r.value!==null && r.heightM!==null && r.heightM <= roofHeightM).map(r=>({
    ...r, x:r.object.xM+r.object.widthM/2, z:r.object.yM+r.object.lengthM/2,
    zone:r.object.metadata.sensor?.sectionId,
  }))
  const heightRange = sources.length ? [Math.min(...sources.map(s=>s.heightM!)),Math.max(...sources.map(s=>s.heightM!))] as const : null
  if (sources.length < 2) return {width,depth,layers,values,confidence,mask,extrapolated,knownCount:sources.length,heightRange}
  for(let z=0;z<depth;z++) for(let x=0;x<width;x++) {
    const position={xM:(x+.5)*w/width,yM:(z+.5)*d/depth}
    if(barriers.some(p=>pointInPolygon(position,p)))continue
    const zone=zones.find(zone=>pointInPolygon(position,zone.polygon))?.id
    const horizontal=sources.flatMap(s=>{
      if(zone && s.zone!==zone)return []
      if(barriers.some(p=>segmentCrossesPolygon(position,{xM:s.x,yM:s.z},p)))return []
      return [{source:s,distance:Math.hypot(s.x-position.xM,s.z-position.yM)}]
    }).sort((a,b)=>a.distance-b.distance)
    if(!horizontal.length)continue
    // A full-field estimate must still respect independent Sections and walls.
    const section=horizontal[0].source.zone
    const candidates=horizontal.filter(s=>s.source.zone===section)
    const hull=footprintHull(candidates.map(c=>c.source))
    const bounded=insideHull(position.xM,position.yM,hull)
    const low=Math.min(...candidates.map(s=>s.source.heightM!)), high=Math.max(...candidates.map(s=>s.source.heightM!))
    const roof=roofHeightM*(1-.32*Math.abs(position.yM-d/2)/(d/2))
    for(let y=0;y<layers;y++) {
      const height=(y+.5)*roofHeightM/layers
      if(height>roof)continue
      const near=candidates.map(s=>({...s,distance:Math.hypot(s.distance,height-s.source.heightM!)})).sort((a,b)=>a.distance-b.distance).slice(0,nearestCount)
      let sum=0,weights=0
      for(const s of near) {
        const weight=1/Math.pow(Math.max(.04,s.distance),power)
        sum+=s.source.value!*weight;weights+=weight
      }
      const index=(y*depth+z)*width+x
      values[index]=sum/weights;mask[index]=1
      const outsideHeight=Math.max(low-height,height-high,0)
      extrapolated[index]=Number(!bounded || outsideHeight>roofHeightM/layers/2)
      // This is observation support, not a calibrated probability of accuracy.
      const proximity=1/(1+near[0].distance/supportRadius)
      const verticalSupport=1/(1+outsideHeight/.5)
      confidence[index]=clamp01(proximity*verticalSupport*(bounded ? 1 : .55)*Math.min(1,near.length/3))
    }
  }
  return {width,depth,layers,values,confidence,mask,extrapolated,knownCount:sources.length,heightRange}
}
