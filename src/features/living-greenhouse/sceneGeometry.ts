import { getStableScale } from '../greenhouse-map/heatmap/heatmapMetrics'
import type { GreenhouseMap, MetricKey } from '../greenhouse-map/model'
import { measuredSensors } from './livingData'
import type { Vec3 } from './sceneMath'
import type { LivingView } from './spatialEvidence'
import { createVolumeGrid } from './volumeGrid'

type Color = [number, number, number]
export type VolumeField = { width: number; height: number; layers: number; pixels: Uint8Array; bounds: Vec3; levels: number[] }
export function climateColor(value: number, min: number, max: number): Color {
  const stops: Color[] = [[.10, .42, .90], [.06, .78, .86], [.89, .89, .45], [1, .57, .18], [.94, .22, .25]]
  const t = Math.max(0, Math.min(.99999, (value - min) / (max - min || 1))) * 4
  const i = Math.floor(t)
  return stops[i].map((c, j) => c + (stops[i + 1][j] - c) * (t - i)) as Color
}

export function sceneGeometry(map: GreenhouseMap, metric: MetricKey, at: number, scaleOverride?: { min: number; max: number }, options: {view:LivingView; attentionIds?:Set<string>} = {view:'volume'}) {
  const data: number[] = []
  const w = map.dimensions.widthM, l = map.dimensions.lengthM, size = Math.max(w, l)
  const sensors = measuredSensors(map, metric, at)
  // An illustrative roof must not cut off a Node whose measured height is known.
  // A configured greenhouse height remains authoritative.
  const nodeEnvelope = sensors.reduce((height,s)=>s.heightM===null ? height : Math.max(height,(s.heightM+.3)/(1-.32*Math.min(1,Math.abs(s.object.yM+s.object.lengthM/2-l/2)/(l/2)))),0)
  const h = map.dimensions.heightM || Math.max(Math.min(5, Math.max(2.5, size * .17)),nodeEnvelope)
  const white: Color = [.39, .55, .50], steel: Color = [.25, .37, .34], green: Color = [.20, .32, .27]
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Color, shade = 1) => {
    for (const p of [a, b, c]) data.push(...p, ...color.map(n => n * shade))
  }
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color, shade = 1) => { triangle(a, b, c, color, shade); triangle(a, c, d, color, shade) }
  const box = (cx: number, cy: number, cz: number, bw: number, bh: number, bl: number, color: Color, rotation = 0) => {
    const cs = Math.cos(rotation), sn = Math.sin(rotation)
    const p = (x: number, y: number, z: number): Vec3 => [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs]
    const a = bw / 2, b = bh / 2, c = bl / 2
    quad(p(-a,b,-c),p(a,b,-c),p(a,b,c),p(-a,b,c),color)
    quad(p(-a,-b,c),p(a,-b,c),p(a,b,c),p(-a,b,c),color,.68)
    quad(p(a,-b,-c),p(-a,-b,-c),p(-a,b,-c),p(a,b,-c),color,.82)
    quad(p(-a,-b,-c),p(-a,-b,c),p(-a,b,c),p(-a,b,-c),color,.6)
    quad(p(a,-b,c),p(a,-b,-c),p(a,b,-c),p(a,b,c),color,.78)
  }
  const beam = (a: Vec3, b: Vec3, r: number, color: Color) => {
    const d = b.map((v, i) => v - a[i]) as Vec3
    const len = Math.hypot(...d)
    const u: Vec3 = Math.abs(d[1]) > len * .95 ? [r,0,0] : [-d[2] / Math.hypot(d[0],d[2]) * r,0,d[0] / Math.hypot(d[0],d[2]) * r]
    const v: Vec3 = [(d[1]*u[2]-d[2]*u[1])/len,(d[2]*u[0]-d[0]*u[2])/len,(d[0]*u[1]-d[1]*u[0])/len]
    const p = (o: Vec3, s: number, t: number): Vec3 => o.map((n,i) => n + u[i]*s + v[i]*t) as Vec3
    quad(p(a,-1,-1),p(a,1,-1),p(b,1,-1),p(b,-1,-1),color,.8)
    quad(p(a,1,-1),p(a,1,1),p(b,1,1),p(b,1,-1),color)
    quad(p(a,1,1),p(a,-1,1),p(b,-1,1),p(b,1,1),color,.68)
    quad(p(a,-1,1),p(a,-1,-1),p(b,-1,-1),p(b,-1,1),color,.85)
  }
  // Floating architectural plinth and recessed floor grid.
  box(0,-.30,0,w + .8,.5,l + .8,[.16,.26,.26])
  box(0,-.04,0,w,.06,l,[.22,.32,.31])
  const step = Math.max(1, Math.ceil(size / 35))
  for (let x = 0; x <= w; x += step) box(x-w/2,0,0,.012,.012,l,[.28,.37,.35])
  for (let z = 0; z <= l; z += step) box(0,0,z-l/2,w,.012,.012,[.28,.37,.35])
  const values = sensors.flatMap(s => s.value === null ? [] : [s.value])
  const scale = scaleOverride || getStableScale(values, metric)
  const grid = createVolumeGrid(map, options.view==='volume' ? sensors : [], h)
  // Layers are stored in a 2D atlas for identical WebGPU and WebGL rendering.
  const pixels = new Uint8Array(grid.width*grid.depth*grid.layers*4)
  for(let i=0;i<grid.values.length;i++) {
    if(!grid.mask[i])continue
    const normalized=Math.max(0,Math.min(1,(grid.values[i]-scale.min)/(scale.max-scale.min || 1)))
    pixels.set([Math.round(normalized*255),Math.round(grid.confidence[i]*255),grid.extrapolated[i]*255,255],i*4)
  }
  // Show actual measured levels automatically, never a user-selected height.
  const heights=sensors.filter(s=>s.value!==null && s.heightM!==null && s.heightM<=h).map(s=>s.heightM!).sort((a,b)=>a-b)
  const levels=heights.filter((height,i)=>!i || height-heights[i-1]>.15)
  const shownLevels=levels.length<=8 ? levels : Array.from({length:8},(_,i)=>levels[Math.round(i*(levels.length-1)/7)])
  const volume: VolumeField = {width:grid.width,height:grid.depth,layers:grid.layers,pixels,bounds:[w,l,h],levels:shownLevels}
  // Footprints and rotations come from the saved plan; plant forms are illustrative.
  for (const object of map.objects) {
    const { type, widthM: ow, lengthM: ol, xM, yM, rotationDeg } = object
    const rot = rotationDeg * Math.PI / 180
    const pos = (x: number, z: number): [number,number] => [xM + x*Math.cos(rot)-z*Math.sin(rot)-w/2, yM + x*Math.sin(rot)+z*Math.cos(rot)-l/2]
    const [x,z] = pos(ow/2,ol/2)
    if (['growing-table','rack','growing-bed','hydroponic-channel'].includes(type)) {
      const level = type === 'growing-bed' ? .16 : .72
      box(x,level,z,ow,.18,ol,[.32,.44,.39],rot)
      for (const px of [.1,ow-.1]) for (const pz of [.1,ol-.1]) { const [a,b]=pos(px,pz); box(a,level/2,b,.06,level,.06,steel) }
      // A neutral canopy surface keeps the saved layout legible through the volume.
      box(x,level+.12,z,Math.max(.05,ow-.1),.06,Math.max(.05,ol-.1),green,rot)
    } else if (type==='partition') box(x,h*.32,z,ow,h*.64,Math.max(.05,ol),[.35,.44,.41],rot)
    else if (type==='door') { box(x,1.05,z,ow,2.1,Math.max(.07,ol),[.25,.63,.56],rot); box(x,2.14,z,ow+.1,.07,Math.max(.1,ol),white,rot) }
    else if (type==='walkway') box(x,.018,z,ow,.02,ol,[.28,.36,.34],rot)
    else if (type==='reservoir') box(x,.5,z,ow,1,ol,[.41,.63,.65],rot)
    else if (['heater','cooling-unit','electrical-cabinet','irrigation-unit'].includes(type)) box(x,.45,z,ow,.9,ol,steel,rot)
    else if (['fan','lamp','window','ventilation-opening'].includes(type)) box(x,h*.55,z,ow,.18,ol,white,rot)
  }
  const eave = h*.68, r = Math.max(.015, Math.min(.04,size*.0015))
  const frames = Math.min(14,Math.max(3,Math.ceil(w/3)))
  for (let i=0;i<=frames;i++) {
    const x=-w/2+w*i/frames
    for (const z of [-l/2,l/2]) beam([x,.01,z],[x,eave,z],r,white)
    beam([x,eave,-l/2],[x,h,0],r,white); beam([x,h,0],[x,eave,l/2],r,white)
    if (i===0 || i===frames) beam([x,eave,-l/2],[x,eave,l/2],r*.6,steel)
  }
  for (const [y,z] of [[eave,-l/2],[h,0],[eave,l/2],[eave+(h-eave)*.5,-l/4],[eave+(h-eave)*.5,l/4]]) beam([-w/2,y,z],[w/2,y,z],r*.7,white)
  for (const s of sensors) {
    const x=s.object.xM+s.object.widthM/2-w/2, z=s.object.yM+s.object.lengthM/2-l/2
    const y=s.heightM ?? 0
    const color: Color=s.value===null ? s.lastValue!==null ? [.78,.60,.32] : [.4,.46,.44] : climateColor(s.value,scale.min,scale.max)
    box(x,y/2,z,.035,y,.035,steel)
    box(x,y,z,.18,.16,.18,color)
    box(x,.025,z,.28,.03,.28,color)
  }
  return { vertices: new Float32Array(data), volume, sensors, scale, height: h, volumeReady: grid.mask.some(Boolean), knownHeights: grid.knownCount, heightRange: grid.heightRange, coverage: grid.mask.filter(Boolean).length / Math.max(1,grid.mask.length), modeledFraction:grid.extrapolated.filter(Boolean).length/Math.max(1,grid.mask.filter(Boolean).length) }
}
