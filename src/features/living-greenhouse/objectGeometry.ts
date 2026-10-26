import type { GreenhouseMap, GreenhouseObject } from '../greenhouse-map/model'
import { planToScene, type Vec3 } from './sceneMath'
import { doorConfiguration } from '../greenhouse-map/doorConfiguration'

type Color = [number, number, number]
const metal: Color = [.69, .75, .73]
const pale: Color = [.86, .89, .85]
const dark: Color = [.25, .33, .30]
const green: Color = [.31, .49, .39]
const blue: Color = [.32, .59, .65]
const rubber: Color = [.13, .19, .17]
const tau = Math.PI * 2

/** Shared, self-contained meshes for live layouts and the demonstration.
 * XY footprint and rotation are authoritative. Unrecorded equipment heights
 * are illustrative proportions, not measurements or states of the equipment.
 * Glazing is represented by open frames and fine reflection lines so that
 * equipment inside remains visible in the depth-based climate composite.
 */
export function objectGeometry(object: GreenhouseObject, dimensions: GreenhouseMap['dimensions'], roomHeight: number, ceilingHeight = roomHeight): Float32Array {
  if (!object.visible || ['sensor-node', 'section-zone', 'technical-zone', 'text-label'].includes(object.type)) return new Float32Array()
  const { widthM: ow, lengthM: od, type } = object
  if (![ow, od, object.xM, object.yM, object.rotationDeg, roomHeight].every(Number.isFinite) || ow <= 0 || od <= 0 || roomHeight <= 0 || !Number.isFinite(ceilingHeight) || ceilingHeight <= 0) return new Float32Array()
  const orientAlongLongSide = ['door', 'window', 'ventilation-opening', 'rack', 'growing-table', 'hydroponic-channel', 'growing-bed', 'lamp'].includes(type) && od > ow
  const w = orientAlongLongSide ? od : ow, d = orientAlongLongSide ? ow : od
  const angle = object.rotationDeg * Math.PI / 180
  // The map rotates about its saved lower-left anchor, not the footprint centre.
  const centerX = object.xM + ow / 2 * Math.cos(angle) - od / 2 * Math.sin(angle)
  const centerY = object.yM + ow / 2 * Math.sin(angle) + od / 2 * Math.cos(angle)
  const rotation = angle + (orientAlongLongSide ? Math.PI / 2 : 0)
  const point = ([x, y, z]: Vec3) => planToScene(centerX + x * Math.cos(rotation) - z * Math.sin(rotation), centerY + x * Math.sin(rotation) + z * Math.cos(rotation), y, dimensions)
  const vertices: number[] = []
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Color) => {
    const world = [point(a), point(b), point(c)]
    const u = world[1].map((v, i) => v - world[0][i]), v = world[2].map((n, i) => n - world[0][i])
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const length = Math.hypot(...normal)
    if (length < 1e-10) return
    // Two-sided ambient illumination keeps open metal profiles readable.
    const shade = .66 + .24 * Math.abs(normal[1]) / length + .10 * (normal[0] - normal[2]) / length
    for (const p of world) vertices.push(...p, ...color.map(channel => Math.max(0, Math.min(1, channel * shade))))
  }
  const quad = (a: Vec3, b: Vec3, c: Vec3, e: Vec3, color: Color) => { triangle(a, b, c, color); triangle(a, c, e, color) }
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, color: Color) => {
    if (Math.min(width, height, depth) <= 0) return
    const a = width / 2, b = height / 2, c = depth / 2
    const p = (dx: number, dy: number, dz: number): Vec3 => [x + dx, y + dy, z + dz]
    quad(p(-a,b,-c),p(a,b,-c),p(a,b,c),p(-a,b,c),color)
    quad(p(-a,-b,c),p(a,-b,c),p(a,b,c),p(-a,b,c),color)
    quad(p(a,-b,-c),p(-a,-b,-c),p(-a,b,-c),p(a,b,-c),color)
    quad(p(-a,-b,-c),p(-a,-b,c),p(-a,b,c),p(-a,b,-c),color)
    quad(p(a,-b,c),p(a,-b,-c),p(a,b,-c),p(a,b,c),color)
    quad(p(-a,-b,-c),p(a,-b,-c),p(a,-b,c),p(-a,-b,c),color)
  }
  const tube = (a: Vec3, b: Vec3, radius: number, color: Color, segments = 12) => {
    const direction = b.map((v, i) => v - a[i]), length = Math.hypot(...direction)
    if (length < 1e-6 || radius <= 0) return
    const n = direction.map(v => v / length)
    const up = Math.abs(n[1]) > .95 ? [1, 0, 0] : [0, 1, 0]
    const cross = (u: number[], v: number[]) => [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    const raw = cross(n, up), norm = Math.hypot(...raw), u = raw.map(v => v / norm), v = cross(n, u)
    const p = (center: Vec3, angle: number): Vec3 => center.map((c, i) => c + radius * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle))) as Vec3
    for (let i = 0; i < segments; i++) {
      const t = i / segments * tau, next = (i + 1) / segments * tau
      quad(p(a,t),p(a,next),p(b,next),p(b,t),color)
      triangle(a,p(a,next),p(a,t),color); triangle(b,p(b,t),p(b,next),color)
    }
  }
  const ring = (x: number, y: number, z: number, inner: number, outer: number, depth: number, color: Color, segments = 36) => {
    const p = (r: number, a: number, offset: number): Vec3 => [x + r * Math.cos(a), y + r * Math.sin(a), z + offset]
    for (let i = 0; i < segments; i++) {
      const a = i / segments * tau, b = (i + 1) / segments * tau
      quad(p(inner,a,depth/2),p(outer,a,depth/2),p(outer,b,depth/2),p(inner,b,depth/2),color)
      quad(p(outer,a,-depth/2),p(outer,b,-depth/2),p(outer,b,depth/2),p(outer,a,depth/2),color)
      quad(p(inner,b,-depth/2),p(inner,a,-depth/2),p(inner,a,depth/2),p(inner,b,depth/2),color)
      quad(p(outer,b,-depth/2),p(outer,a,-depth/2),p(inner,a,-depth/2),p(inner,b,-depth/2),color)
    }
  }
  const frame = (x: number, bottom: number, z: number, width: number, height: number, rail: number, depth: number, color: Color) => {
    for (const side of [-1, 1]) box(x + side * (width - rail) / 2, bottom + height / 2, z, rail, height, depth, color)
    for (const level of [bottom + rail / 2, bottom + height - rail / 2]) box(x, level, z, width - rail * 2, rail, depth, color)
  }
  const feet = (top: number, post = Math.min(.045, w * .07, d * .09)) => {
    for (const x of [-w / 2 + post, w / 2 - post]) for (const z of [-d / 2 + post, d / 2 - post]) {
      box(x, top / 2, z, post, top, post, metal)
      box(x, .025, z, post * 1.7, .035, post * 1.7, dark)
    }
  }
  const fan = (x: number, y: number, z: number, radius: number, depth: number) => {
    ring(x,y,z,radius*.88,radius,depth,pale)
    ring(x,y,z+depth*.55,radius*.88,radius*.93,.018,metal)
    tube([x,y,z-depth*.8],[x,y,z+depth*.35],radius*.19,dark,20)
    // Curved, pitched blades, not an opaque disk or an animation implying operation.
    for(let blade=0;blade<5;blade++)for(let part=0;part<5;part++) {
      const a=blade/5*tau, t=part/5, next=(part+1)/5
      const p=(r:number,offset:number):Vec3=>{
        const angle=a+r*.8+offset*(.36-r*.10)
        return [x+radius*(.18+r*.67)*Math.cos(angle),y+radius*(.18+r*.67)*Math.sin(angle),z+depth*(offset*.15+r*.15)]
      }
      quad(p(t,-1),p(next,-1),p(next,1),p(t,1),[.38,.48,.45])
    }
    for(const side of [-1,1]) {
      const face=z+side*depth*.62
      for(const fraction of [.40,.65,.87])ring(x,y,face,radius*fraction-.003,radius*fraction+.003,.009,metal,32)
      for(let i=0;i<8;i++) {
        const a=i/8*tau
        tube([x+Math.cos(a)*radius*.16,y+Math.sin(a)*radius*.16,face],[x+Math.cos(a)*radius*.88,y+Math.sin(a)*radius*.88,face],.004,metal,6)
      }
      tube([x,y,face-.012],[x,y,face+.012],radius*.16,pale,20)
    }
  }
  const glazing = (x: number, bottom: number, z: number, width: number, height: number) => {
    // A fine highlight suggests clear glazing without obscuring the interior.
    tube([x-width*.27,bottom+height*.64,z],[x-width*.12,bottom+height*.84,z],.006,[.88,.95,.94],6)
  }

  if (type === 'door') {
    const config=doorConfiguration(object,roomHeight)
    const height=config.heightM, rail=Math.min(.065,w*.10), depth=Math.min(d,.16)
    const sliding=config.type==='sliding'
    for(const x of [-w/2+rail/2,w/2-rail/2])box(x,height/2,0,rail,height,depth,pale)
    box(0,height-rail/2,0,w-rail*2,rail,depth,pale)
    box(0,.025,0,w-rail*2,.05,depth*.9,dark)
    const leaves=config.type==='double' ? 2 : 1, leafWidth=(w-rail*2)/leaves
    for(let i=0;i<leaves;i++) {
      const x=-w/2+rail+leafWidth*(i+.5), inner=leafWidth-rail*.6
      const bottom=sliding ? .045 : .065, leafH=height-(sliding ? .20 : .11)
      const z=sliding ? depth*.12 : 0
      frame(x,bottom,z,inner,leafH,rail*.48,depth*.55,metal)
      box(x,height*.22,z,inner-rail,.32*height,depth*.25,green)
      box(x,height*.41,z,inner-rail,rail*.55,depth*.6,metal)
      glazing(x,height*.43,z+depth*.1,inner-rail,leafH-height*.43)
      const handleSide=leaves===2 && i===1 ? -1 : 1
      const handleX=x+handleSide*Math.max(0,inner/2-.10)
      const handleY=Math.min(1.02,height*.49), leverLength=Math.min(.12,inner*.25)
      for(const side of [-1,1]) {
        if(sliding) {
          const grip=Math.min(.20,height*.14)
          for(const y of [handleY-grip/2,handleY+grip/2])tube([handleX,y,z+side*depth*.35],[handleX,y,z+side*depth*.64],.011,metal)
          tube([handleX,handleY-grip/2,z+side*depth*.64],[handleX,handleY+grip/2,z+side*depth*.64],.014,dark)
        }else {
          box(handleX,handleY-.02,side*depth*.37,.025,.12,.012,dark)
          tube([handleX,handleY,side*depth*.4],[handleX,handleY,side*depth*.65],.013,metal)
          tube([handleX,handleY,side*depth*.65],[handleX-handleSide*leverLength,handleY,side*depth*.65],.013,metal)
        }
      }
      if(sliding) {
        for(const rollerX of [x-inner*.33,x+inner*.33]) {
          tube([rollerX,height-.09,depth*.35],[rollerX,height-.09,depth*.55],.024,dark,16)
          box(rollerX,height-.13,depth*.22,.025,.07,.025,metal)
        }
      }else for(const y of [.18,.50,.82])box(x-handleSide*inner*.5,height*y,0,rail*.55,.085,depth*.8,dark)
    }
    if(sliding) {
      box(0,height-.045,depth*.37,w-rail*2,.035,depth*.22,metal)
      box(0,.055,depth*.30,w-rail*2,.012,.018,metal)
    }
  } else if (type === 'window' || type === 'ventilation-opening') {
    const height=Math.min(type==='window' ? .95 : .58,roomHeight*.32), bottom=Math.min(1.15,roomHeight*.4), rail=Math.min(.05,w*.11), depth=Math.min(d,.15)
    frame(0,bottom,0,w,height,rail,depth,pale)
    frame(0,bottom+rail,0,w-rail*2,height-rail*2,rail*.45,depth*.65,metal)
    if(type==='window') {
      const count=Math.max(1,Math.min(4,Math.ceil(w/1.2))), span=(w-rail*2)/count
      for(let i=1;i<count;i++)box(-w/2+rail+span*i,bottom+height/2,0,rail*.55,height-rail*2,depth*.7,metal)
      for(let i=0;i<count;i++)glazing(-w/2+rail+span*(i+.5),bottom+rail*2,0,span-rail,height-rail*4)
      box(0,bottom+height*.3,depth*.47,.025,.11,.025,dark)
      box(0,bottom-.018,0,w,.036,Math.min(d,.20),metal)
    }else {
      const rows=6
      for(let i=0;i<rows;i++) {
        const y=bottom+rail+(height-rail*2)*(i+.5)/rows, step=(height-rail*2)/rows
        quad([-w/2+rail,y-step*.35,-depth*.35],[w/2-rail,y-step*.35,-depth*.35],[w/2-rail,y+step*.35,depth*.35],[-w/2+rail,y+step*.35,depth*.35],metal)
      }
    }
  } else if (type === 'rack' || type === 'growing-table') {
    const rack=type==='rack', height=Math.min(rack ? 1.95 : .83,roomHeight*.75), post=Math.min(.045,w*.08,d*.09)
    feet(height,post)
    const levels=rack ? [height*.13,height*.55,height*.95] : [height]
    for(const y of levels) {
      for(const z of [-d/2+post,d/2-post])box(0,y-.035,z,w-post,.085,post,metal)
      for(const x of [-w/2+post,w/2-post])box(x,y-.035,0,post,.085,d-post,metal)
      const slats=Math.min(22,Math.max(3,Math.ceil(d/.12)))
      for(let i=0;i<slats;i++)box(0,y,(i+.5)/slats*(d-post*2)-d/2+post,w-post*2,.025,(d-post*2)/slats*.82,rack ? pale : [.64,.73,.59])
      // Raised tray edging and visible under-bench support, within the footprint.
      if(!rack)for(const z of [-d/2+post,d/2-post])box(0,y+.035,z,w-post,.06,post*.7,pale)
      const supports=Math.min(12,Math.max(1,Math.ceil(w/1.2)))
      for(let i=1;i<supports;i++)box(-w/2+w*i/supports,y-.055,0,post,.07,d-post,metal)
    }
    const braceY=rack ? height*.52 : height*.65
    tube([-w/2+post,.10,-d/2+post],[w/2-post,braceY,-d/2+post],post*.24,dark,6)
    if(rack)tube([w/2-post,.10,-d/2+post],[-w/2+post,braceY,-d/2+post],post*.24,dark,6)
    for(const x of [-w/2+post,w/2-post])box(x,.22,0,post,.035,d-post,metal)
  } else if (type === 'growing-bed') {
    const edge=Math.min(.065,w*.1,d*.1), height=Math.min(.30,roomHeight*.2)
    box(0,height*.45,0,w-edge*2,height*.8,d-edge*2,[.29,.24,.17])
    for(const z of [-d/2+edge/2,d/2-edge/2])box(0,height/2,z,w,height,edge,[.57,.48,.32])
    for(const x of [-w/2+edge/2,w/2-edge/2])box(x,height/2,0,edge,height,d,[.57,.48,.32])
    const rows=Math.min(8,Math.max(1,Math.floor(d/.25)))
    for(let i=0;i<rows;i++)tube([-w/2+edge,height*.9,-d/2+(i+.5)*d/rows],[w/2-edge,height*.9,-d/2+(i+.5)*d/rows],.008,dark,6)
  } else if (type === 'hydroponic-channel') {
    const height=Math.min(.8,roomHeight*.4), channelCount=Math.min(8,Math.max(1,Math.floor(d/.18))), spacing=d/channelCount
    feet(height-.07)
    for(const x of [-w*.38,w*.38])box(x,height-.07,0,.045,.06,d,metal)
    for(let row=0;row<channelCount;row++) {
      const z=-d/2+spacing*(row+.5), width=spacing*.8
      box(0,height,z,w,.10,width,pale)
      const holes=Math.min(24,Math.max(1,Math.floor(w/.26)))
      for(let i=0;i<holes;i++)tube([-w/2+(i+.5)*w/holes,height+.05,z],[-w/2+(i+.5)*w/holes,height+.054,z],Math.min(.035,width*.24),rubber,12)
    }
  } else if (type === 'fan') {
    const radius=Math.min(w*.46,(ceilingHeight-.20)/2), y=Math.max(radius+.04,ceilingHeight-radius-.20), depth=Math.min(d*.55,.28)
    fan(0,y,0,radius,depth)
    for(const x of [-radius*.6,radius*.6])tube([x,y+radius*.75,0],[x,y+radius+Math.min(.16,ceilingHeight*.06),0],.013,dark,8)
    box(0,y+radius+.10,0,radius*1.5,.035,Math.min(d,.14),metal)
  } else if (type === 'lamp') {
    const y=Math.max(.09,ceilingHeight-.35), bars=Math.min(5,Math.max(1,Math.round(d/.18)))
    for(let i=0;i<bars;i++) {
      const z=-d/2+(i+.5)*d/bars, depth=d/bars*.62
      box(0,y,z,w,.055,depth,metal)
      box(0,y-.032,z,w*.93,.012,depth*.72,[.99,.94,.72])
      for(let fin=0;fin<3;fin++)box(0,y+.036,z+(fin-1)*depth*.23,w,.02,depth*.06,dark)
    }
    for(const x of [-w*.35,w*.35]) {
      box(x,y+.05,0,.035,.035,d,metal)
      tube([x,y+.07,0],[x,Math.max(y+.07,ceilingHeight-.04),0],.005,dark,6)
    }
  } else if (type === 'reservoir') {
    const height=Math.min(1.15,roomHeight*.5), radius=Math.min(w,d)*.45, segments=40
    const at=(a:number,y:number):Vec3=>[Math.cos(a)*w*.46,y,Math.sin(a)*d*.46]
    for(let i=0;i<segments;i++) {
      const a=i/segments*tau,b=(i+1)/segments*tau
      quad(at(a,.08),at(b,.08),at(b,height),at(a,height),blue)
      triangle([0,height,0],at(a,height),at(b,height),[.63,.79,.79])
      for(const y of [height*.22,height*.76])quad(at(a,y),at(b,y),at(b,y+.025),at(a,y+.025),metal)
    }
    tube([0,height,0],[0,height+.055,0],radius*.22,dark,24)
    tube([0,.16,d*.41],[0,.16,d*.49],Math.min(.025,d*.03),metal)
    box(0,.21,d*.46,.09,.015,.018,[.68,.27,.20])
  } else if (type === 'heater' || type === 'cooling-unit') {
    const cooling=type==='cooling-unit', height=Math.min(cooling ? 1.18 : .75,roomHeight*.55), foot=.08
    box(0,height/2+foot,0,w,height,d,pale)
    for(const x of [-w*.35,w*.35])box(x,foot/2,0,w*.08,foot,d*.85,dark)
    const radius=Math.min(w*.32,height*.31)
    fan(0,foot+height*.60,d*.49,radius,Math.min(.06,d*.12))
    for(let i=0;i<5;i++)box(0,foot+height*.10+i*height*.027,d*.505,w*.72,height*.009,.008,dark)
    box(w*.31,foot+height*.87,d*.505,w*.09,height*.045,.012,cooling ? blue : [.78,.40,.19])
  } else if (type === 'electrical-cabinet') {
    const height=Math.min(1.6,roomHeight*.7)
    box(0,height/2,0,w,height,d,pale)
    frame(0,.06,d*.503,w*.9,height*.92,Math.min(.02,w*.04),.012,metal)
    box(w*.31,height*.53,d*.52,.025,height*.11,.025,dark)
    const y=height*.66, s=Math.min(w*.15,.09), z=d*.516
    triangle([-s,y,z],[s,y,z],[0,y+s*1.7,z],[.95,.73,.23])
    tube([s*.12,y+s*1.15,z+.003],[-s*.2,y+s*.7,z+.003],.007,dark,6)
    tube([-s*.2,y+s*.7,z+.003],[s*.2,y+s*.7,z+.003],.007,dark,6)
    tube([s*.2,y+s*.7,z+.003],[-s*.12,y+s*.28,z+.003],.007,dark,6)
  } else if (type === 'irrigation-unit') {
    const height=Math.min(.95,roomHeight*.5), pipe=Math.min(.025,w*.05,d*.05)
    box(0,.055,0,w,.11,d,metal)
    frame(0,.10,-d*.38,w*.8,height*.88,.035,.045,dark)
    tube([-w*.40,height*.55,0],[w*.40,height*.55,0],pipe,blue)
    for(let i=0;i<3;i++) {
      const x=(i-1)*w*.25
      tube([x,.14,0],[x,height*.8,0],pipe,blue)
      box(x,height*.69,0,pipe*2.5,pipe*2,pipe*2.5,metal)
      box(x,height*.72,0,w*.12,.015,.025,[.69,.26,.19])
    }
    tube([-w*.30,.24,d*.12],[-w*.30,.24,d*.37],Math.min(.10,w*.12),dark,20)
    ring(w*.26,height*.82,d*.04,.055,.068,.025,metal,24)
    tube([w*.26,height*.82,d*.03],[w*.26,height*.82,d*.065],.053,pale,24)
    tube([w*.26,height*.82,d*.07],[w*.26+.022,height*.84,d*.07],.004,dark,6)
  } else if (type === 'partition') {
    box(0,roomHeight*.32,0,w,roomHeight*.64,d,[.76,.80,.74])
    for(const x of [-w/2+.02,w/2-.02])box(x,roomHeight*.32,0,.025,roomHeight*.64,d,metal)
  } else if (type === 'walkway') {
    box(0,.012,0,w,.022,d,[.88,.90,.86])
  } else if (type === 'rectangle') {
    box(0,.015,0,w,.025,d,[.73,.79,.70])
  }
  return new Float32Array(vertices)
}
