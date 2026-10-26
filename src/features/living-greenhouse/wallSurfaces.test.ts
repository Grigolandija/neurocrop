import { describe,expect,it } from 'vitest'
import { areaWallSurfaces,perimeterWallGeometry,sortWallSurfaces,wallSurfaceGeometry } from './wallSurfaces'
import { emptyFarmPlan } from '../farm-plan/farmPlanData'
import { farmEditorMap } from '../farm-plan/farmLayoutData'
import { wholeFarmSurfaces } from '../farm-plan/farmSceneGeometry'

describe('unobtrusive architectural wall surfaces',()=>{
  const dimensions={widthM:10,lengthM:8}
  const wall={a:{xM:0,yM:0},b:{xM:10,yM:0},height:3}
  const points=(mesh:Float32Array)=>Array.from({length:mesh.length/6},(_,i)=>Array.from(mesh.slice(i*6,i*6+3)))
  it('caps the opaque perimeter at 30 cm, with real thickness and a clear door opening',()=>{
    const surfaces=perimeterWallGeometry([{...wall,height:12}],[{a:{xM:2,yM:0},b:{xM:4,yM:0},sill:0,height:2.2}],dimensions),p=points(surfaces)
    expect(Math.max(...p.map(v=>v[1]))).toBeCloseTo(.30,6)
    expect(Math.min(...p.map(v=>v[1]))).toBe(0)
    expect(Math.max(...p.map(v=>v[2]))-Math.min(...p.map(v=>v[2]))).toBeCloseTo(.06,6)
    for(let i=0;i<p.length;i+=3){const x=(p[i][0]+p[i+1][0]+p[i+2][0])/3+5;expect(x>2+1e-5 && x<4-1e-5).toBe(false)}
  })
  it('cuts true door and window openings through full-height walls',()=>{
    const surfaces=wallSurfaceGeometry([wall],[{a:{xM:2,yM:0},b:{xM:4,yM:0},sill:0,height:2.2},{a:{xM:6,yM:0},b:{xM:8,yM:0},sill:1,height:1}],dimensions)
    let area=0
    for(let i=0;i<surfaces.length;i+=18){
      const [a,b,c]=points(surfaces.subarray(i,i+18))
      area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2
      const x=(a[0]+b[0]+c[0])/3+5,y=(a[1]+b[1]+c[1])/3
      expect(x>2 && x<4 && y<2.2).toBe(false)
      expect(x>6 && x<8 && y>1 && y<2).toBe(false)
    }
    expect(area).toBeCloseTo(30-4.4-2,5)
  })
  it('leaves open zones without walls and renders shared farm walls once',()=>{
    const p={...emptyFarmPlan(),areas:[{id:'a',name:'A',kind:'room' as const,height:3,polygon:[{xM:0,yM:0},{xM:4,yM:0},{xM:4,yM:4},{xM:0,yM:4}]},{id:'b',name:'B',kind:'room' as const,height:3,polygon:[{xM:4,yM:0},{xM:8,yM:0},{xM:8,yM:4},{xM:4,yM:4}]}]}
    expect(wholeFarmSurfaces(p)).toHaveLength(7*36)
    const m=farmEditorMap(p,'a',{})
    expect(areaWallSurfaces(m,3,0)).toHaveLength(4*36)
    m.farmPlanGeometry!.kind='zone'
    expect(areaWallSurfaces(m,3,0)).toHaveLength(0)
  })
  it('sorts transparent triangles in camera depth order without mutating the original',()=>{
    const mesh=wallSurfaceGeometry([wall],[],dimensions),front=new Float32Array(mesh)
    for(let i=2;i<front.length;i+=6)front[i]=1
    const back=new Float32Array(front)
    for(let i=2;i<back.length;i+=6)back[i]=3
    const combined=new Float32Array([...front,...back]),snapshot=new Float32Array(combined),matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
    expect(sortWallSurfaces(combined,matrix).slice(0,back.length)).toEqual(back)
    matrix[10]=-1
    expect(sortWallSurfaces(combined,matrix).slice(0,front.length)).toEqual(front)
    expect(combined).toEqual(snapshot)
  })
})
