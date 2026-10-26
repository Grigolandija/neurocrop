import { describe,expect,it } from 'vitest'
import { rectangle } from '../living-greenhouse/siteDemoModel'
import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { snapObjectToMapWall } from '../greenhouse-map/geometry'
import { emptyFarmPlan } from './farmPlanData'
import { farmEditorMap,newFarmObject } from './farmLayoutData'
import { highlightFarmArea,wholeFarmGeometry,wholeFarmSceneMesh } from './farmSceneGeometry'

const contains=(haystack:Float32Array,needle:Float32Array)=>{
  for(let i=0;i<=haystack.length-needle.length;i+=6){
    let match=true
    for(let j=0;j<needle.length;j++)if(haystack[i+j]!==needle[j]){match=false;break}
    if(match)return true
  }
  return false
}
function fixture(){
  const plan={...emptyFarmPlan(),areas:['a','b','c'].map((id,i)=>({id,name:id,kind:'room' as const,height:3,polygon:rectangle(i*4,0,4,4)}))}
  const a=farmEditorMap(plan,'a',{}),b=farmEditorMap(plan,'b',{})
  const table=newFarmObject('growing-table',a,{xM:.25,yM:1}),tank=newFarmObject('ibc-tank',b,{xM:1,yM:1})
  a.objects=[{...table,widthM:3,lengthM:1}];b.objects=[tank]
  return {plan,maps:{a,b}}
}

describe('whole-farm hover presentation',()=>{
  it('keeps the hovered Area equipment solid and moves other equipment into the transparent pass',()=>{
    const {plan,maps}=fixture(),mesh=wholeFarmSceneMesh(plan,maps),hover=highlightFarmArea(mesh,'a')
    const table=objectGeometry(maps.a.objects[0],plan.dimensions,3)
    const tank=objectGeometry({...maps.b.objects[0],xM:maps.b.objects[0].xM+4},plan.dimensions,3)
    expect(contains(hover.vertices,table)).toBe(true)
    expect(contains(hover.surfaces,tank)).toBe(true)
    expect(contains(hover.vertices,tank)).toBe(false)
    expect(contains(hover.surfaces,table)).toBe(false)
    expect(hover.vertices.length+hover.surfaces.length).toBe(mesh.vertices.length)
  })
  it('restores every original vertex when the pointer leaves without changing saved layouts',()=>{
    const {plan,maps}=fixture(),snapshot=JSON.stringify({plan,maps}),mesh=wholeFarmSceneMesh(plan,maps),original=new Float32Array(mesh.vertices)
    highlightFarmArea(mesh,'a');highlightFarmArea(mesh,'b')
    expect(highlightFarmArea(mesh,null).vertices).toBe(mesh.vertices)
    expect(highlightFarmArea(mesh,null).surfaces).toHaveLength(0)
    expect(highlightFarmArea(mesh,'deleted-area').vertices).toBe(mesh.vertices)
    expect(mesh.vertices).toEqual(original)
    expect(mesh.vertices).toEqual(wholeFarmGeometry(plan,maps))
    expect(JSON.stringify({plan,maps})).toBe(snapshot)
  })
  it('keeps a shared door solid from either adjacent Area, but fades it for a different room',()=>{
    const {plan,maps}=fixture(),door=snapObjectToMapWall(newFarmObject('door',maps.a,{xM:3.8,yM:2}),maps.a,1)
    maps.a.objects.push(door)
    const mesh=wholeFarmSceneMesh(plan,maps),model=objectGeometry(door,plan.dimensions,3)
    expect(contains(highlightFarmArea(mesh,'a').vertices,model)).toBe(true)
    expect(contains(highlightFarmArea(mesh,'b').vertices,model)).toBe(true)
    expect(contains(highlightFarmArea(mesh,'c').surfaces,model)).toBe(true)
  })
})
