import type { GreenhouseObject, ObjectType } from '../greenhouse-map/model'
import { colorAt } from '../greenhouse-map/heatmap/heatmapColorScale'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { objectGeometry } from './objectGeometry'
import { planToScene, type Vec3 } from './sceneMath'
import type { VolumeField } from './sceneGeometry'
import { VOLUME_LAYERS } from './volumeGrid'
import { createSitePlan, interpolateSite, SITE_SIZE, siteDimensions, siteMetrics, zoneBounds, zoneSources, type SiteMetric, type SitePlan, type SitePoint, type SiteZone } from './siteDemoModel'
import { containsPolygon, triangulateSitePolygon } from './sitePlanEditing'

type Color = [number, number, number]
export const SITE_COLORS = ['#247bb4', '#29b9c8', '#d9e8a3', '#f6ad42', '#e95842']
export const siteRgb = (value: number, metric: SiteMetric) => colorAt(value, siteMetrics[metric].min, siteMetrics[metric].max, SITE_COLORS)

export function siteVolume(zone: SiteZone | null, metric: SiteMetric, plan: SitePlan = createSitePlan()): VolumeField {
  const dimensions=siteDimensions(plan)
  const width = 192, depth = 128, layers = VOLUME_LAYERS
  const pixels = new Uint8Array(width * depth * layers * 4)
  const { min, max } = siteMetrics[metric]
  const fieldHeight = Math.max(SITE_SIZE.heightM,...plan.buildings.map(b=>b.height))
  const palette = new Float32Array(Array.from({ length: 33 }, (_, i) => [...siteRgb(min + (max - min) * i / 32, metric).map(c => c / 255), 1]).flat())
  if (zone) {
    const building = plan.buildings.find(b=>b.id===zone.buildingId)
    const bounds = zoneBounds(building || zone)
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const point = { xM: (x + .5) * dimensions.widthM / width, yM: (z + .5) * dimensions.lengthM / depth }
      const sources = zoneSources(zone, point,plan.rooms,plan.buildings)
      if (!sources.length) continue
      const roomHeight = plan.rooms.find(r=>r.buildingId===zone.buildingId && pointInPolygon(point,r.polygon))?.height || zone.height
      const roof = building?.greenhouse ? Math.min(roomHeight,building.height * (1 - .32 * Math.abs(point.yM - (bounds.minY + bounds.maxY) / 2) / ((bounds.maxY - bounds.minY) / 2))) : roomHeight
      const low = Math.min(...sources.map(s => s.height)), high = Math.max(...sources.map(s => s.height))
      for (let y = 0; y < layers; y++) {
        const height = (y + .5) * fieldHeight / layers
        if (height > roof) continue
        const value = interpolateSite(sources, point.xM, point.yM, height, metric)!
        const outsideHeight = Math.max(0, low - height, height - high)
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)))
        pixels.set([Math.round(normalized * 255), Math.round(255 / (1 + outsideHeight)), Number(outsideHeight > .2) * 255, 255], ((y * depth + z) * width + x) * 4)
      }
    }
  }
  return { width, height: depth, layers, pixels, bounds: [dimensions.widthM, dimensions.lengthM, fieldHeight], palette, levels: [], contours: [] }
}

/** A cutaway campus built from physical structures, with independent zone polygons. */
export function siteGeometry(selectedId: string | null, metric: SiteMetric, plan: SitePlan = createSitePlan(), options:{illustrateEquipment?:boolean;showGround?:boolean}={}) {
  const dimensions=siteDimensions(plan)
  const vertices: number[] = []
  const point = (x: number, y: number, h: number) => planToScene(x, y, h, dimensions)
  let muted = false
  const tint = (color: Color): Color => muted ? color.map(c => c * .22 + .96 * .78) as Color : color
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Color) => { for (const p of [a, b, c]) vertices.push(...p, ...tint(color)) }
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color) => { triangle(a, b, c, color); triangle(a, c, d, color) }
  const box = (x: number, y: number, h: number, width: number, depth: number, height: number, color: Color) => {
    const p = (dx: number, dy: number, dh: number) => point(x + dx * width / 2, y + dy * depth / 2, h + dh * height / 2)
    quad(p(-1,-1,1),p(1,-1,1),p(1,1,1),p(-1,1,1),color)
    quad(p(-1,-1,-1),p(1,-1,-1),p(1,-1,1),p(-1,-1,1),color.map(c=>c*.85) as Color)
    quad(p(1,-1,-1),p(1,1,-1),p(1,1,1),p(1,-1,1),color.map(c=>c*.78) as Color)
    quad(p(1,1,-1),p(-1,1,-1),p(-1,1,1),p(1,1,1),color.map(c=>c*.9) as Color)
    quad(p(-1,1,-1),p(-1,-1,-1),p(-1,-1,1),p(-1,1,1),color.map(c=>c*.78) as Color)
  }
  const beam = (a: Vec3, b: Vec3, radius: number, color: Color) => {
    const d = b.map((n,i)=>n-a[i]), length = Math.hypot(...d)
    if(length<1e-8)return
    const direction = d.map(n=>n/length)
    const raw = Math.abs(direction[1]) > .95 ? [1,0,0] : [-direction[2],0,direction[0]]
    const u = raw.map(n=>n/Math.hypot(...raw)*radius)
    const v = [direction[1]*u[2]-direction[2]*u[1],direction[2]*u[0]-direction[0]*u[2],direction[0]*u[1]-direction[1]*u[0]]
    const p = (center: Vec3, x: number, y: number) => center.map((n,i)=>n+u[i]*x+v[i]*y) as Vec3
    for (const [x,y,nx,ny] of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]]) quad(p(a,x,y),p(a,nx,ny),p(b,nx,ny),p(b,x,y),color)
  }
  const equipment = (type: ObjectType, x: number, y: number, width: number, depth: number, roomHeight: number,rotationDeg=0) => {
    const object: GreenhouseObject = { id: `${type}-${x}-${y}`, type, name: type, xM: x, yM: y, widthM: width, lengthM: depth, rotationDeg, layerId: 'equipment', visible: true, locked: false, metadata: {} }
    const mesh = objectGeometry(object, dimensions, roomHeight)
    for (let i=0;i<mesh.length;i+=6) vertices.push(mesh[i],mesh[i+1],mesh[i+2],...tint([mesh[i+3],mesh[i+4],mesh[i+5]]))
  }

  const floor = (polygon:SitePoint[],height:number,color:Color,zone?:SiteZone) => {
    const draw = (a:SitePoint,b:SitePoint,c:SitePoint,depth=0) => {
      const lengths=[Math.hypot(a.xM-b.xM,a.yM-b.yM),Math.hypot(b.xM-c.xM,b.yM-c.yM),Math.hypot(c.xM-a.xM,c.yM-a.yM)]
      if(zone && depth<14 && Math.max(...lengths)>.9){
        const points=[a,b,c],edge=lengths.indexOf(Math.max(...lengths)),p=points[edge],q=points[(edge+1)%3],opposite=points[(edge+2)%3]
        const middle={xM:(p.xM+q.xM)/2,yM:(p.yM+q.yM)/2}
        draw(p,middle,opposite,depth+1);draw(middle,q,opposite,depth+1);return
      }
      const center={xM:(a.xM+b.xM+c.xM)/3,yM:(a.yM+b.yM+c.yM)/3}
      const value=zone ? interpolateSite(zoneSources(zone,center,plan.rooms,plan.buildings),center.xM,center.yM,1.5,metric) : null
      const shade:Color=value===null ? color : siteRgb(value,metric).map(c=>.16+.84*c/255) as Color
      triangle(point(a.xM,a.yM,height),point(b.xM,b.yM,height),point(c.xM,c.yM,height),shade)
    }
    for(const [a,b,c] of triangulateSitePolygon(polygon))draw(a,b,c)
  }
  const wall = (a:SitePoint,b:SitePoint,h:number,steel:Color) => {
    quad(point(a.xM,a.yM,0),point(b.xM,b.yM,0),point(b.xM,b.yM,.58),point(a.xM,a.yM,.58),[.74,.78,.73])
    beam(point(a.xM,a.yM,.58),point(b.xM,b.yM,.58),.045,[.7,.75,.7])
    beam(point(a.xM,a.yM,h),point(b.xM,b.yM,h),.035,steel)
    beam(point(a.xM,a.yM,0),point(a.xM,a.yM,h),.045,steel)
  }
  if(options.showGround!==false)box(dimensions.widthM/2,dimensions.lengthM/2,-.25,dimensions.widthM,dimensions.lengthM,.4,[.87,.9,.85])
  for(const building of plan.buildings){
    muted=!!selectedId && plan.zones.find(z=>z.id===selectedId)?.buildingId!==building.id
    floor(building.polygon,.01,building.greenhouse ? [.84,.89,.82] : [.87,.88,.85])
  }
  for(const zone of plan.zones){
    muted=!!selectedId && selectedId!==zone.id
    floor(zone.polygon,.035,zone.kind==='greenhouse' ? [.83,.88,.8] : [.86,.87,.83],selectedId===zone.id ? zone : undefined)
  }
  const selected=plan.zones.find(z=>z.id===selectedId)
  for(const building of plan.buildings){
    muted=!!selected && selected.buildingId!==building.id
    if(building.open)continue
    const bounds=zoneBounds(building),h=building.height,steel:Color=[.42,.55,.48]
    const roof=(y:number)=>h*(1-.32*Math.abs(y-(bounds.minY+bounds.maxY)/2)/((bounds.maxY-bounds.minY)/2))
    if(building.greenhouse){
      const count=Math.min(128,Math.max(2,Math.ceil((bounds.maxX-bounds.minX)/4)))
      for(let i=0;i<=count;i++){
        const x=bounds.minX+(bounds.maxX-bounds.minX)*(i+.001)/(count+.002)
        const intersections:number[]=[]
        building.polygon.forEach((a,j)=>{const b=building.polygon[(j+1)%building.polygon.length];if((a.xM<=x && b.xM>x)||(b.xM<=x && a.xM>x))intersections.push(a.yM+(x-a.xM)/(b.xM-a.xM)*(b.yM-a.yM))})
        intersections.sort((a,b)=>a-b)
        for(let j=0;j+1<intersections.length;j+=2){
          const low=intersections[j],high=intersections[j+1],ridge=Math.max(low,Math.min(high,(bounds.minY+bounds.maxY)/2))
          beam(point(x,low,0),point(x,low,roof(low)),.035,steel)
          beam(point(x,low,roof(low)),point(x,ridge,roof(ridge)),.035,steel)
          beam(point(x,ridge,roof(ridge)),point(x,high,roof(high)),.035,steel)
          beam(point(x,high,roof(high)),point(x,high,0),.035,steel)
        }
      }
      building.polygon.forEach((a,i)=>{const b=building.polygon[(i+1)%building.polygon.length];beam(point(a.xM,a.yM,.12),point(b.xM,b.yM,.12),.035,steel);beam(point(a.xM,a.yM,roof(a.yM)),point(b.xM,b.yM,roof(b.yM)),.035,steel)})
    }else{
      building.polygon.forEach((a,i)=>wall(a,building.polygon[(i+1)%building.polygon.length],h,steel))
    }
    // Furnish only footprints that fit the edited physical shell.
    const w=bounds.maxX-bounds.minX,d=bounds.maxY-bounds.minY
    if(options.illustrateEquipment!==false && w>4 && d>4){
      for(const ratio of [.2,.65]){
        const x=bounds.minX+w*.12,y=bounds.minY+d*ratio,width=w*.72,depth=Math.min(2,d*.18)
        const footprint=[{xM:x,yM:y},{xM:x+width,yM:y},{xM:x+width,yM:y+depth},{xM:x,yM:y+depth}]
        const crossesRoom=plan.rooms.some(room=>room.buildingId===building.id && footprint.some(p=>pointInPolygon(p,room.polygon)))
        if(containsPolygon(building.polygon,footprint) && !crossesRoom)equipment('growing-table',x,y,width,depth,h)
      }
    }
    const a=building.polygon[0],b=building.polygon[1],length=Math.hypot(b.xM-a.xM,b.yM-a.yM),doorWidth=Math.min(1.6,length*.5)
    if(options.illustrateEquipment!==false && length>1 && h>2)equipment('door',a.xM+(b.xM-a.xM)*.35,a.yM+(b.yM-a.yM)*.35,doorWidth,.14,h,Math.atan2(b.yM-a.yM,b.xM-a.xM)*180/Math.PI)
  }
  for(const room of plan.rooms){
    muted=!!selected && selected.roomId!==room.id
    const steel:Color=[.42,.55,.48]
    room.polygon.forEach((a,i)=>wall(a,room.polygon[(i+1)%room.polygon.length],room.height,steel))
  }
  return new Float32Array(vertices)
}
