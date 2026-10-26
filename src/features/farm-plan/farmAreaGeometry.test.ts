import { describe, expect, it } from 'vitest'
import { rectangle } from '../living-greenhouse/siteDemoModel'
import { siteGeometry } from '../living-greenhouse/siteDemoGeometry'
import { dragFarmWall, fitFarmDrawing, setFarmWallLength, snapCorner, wallAngle, wallLength } from './farmAreaGeometry'
import { editFarmArea, emptyFarmPlan, farmPlanScene, insertFarmArea, moveFarmArea, validateFarmAreaPlan } from './farmPlanData'

const lShape=[{xM:1,yM:1},{xM:9,yM:1},{xM:9,yM:3},{xM:4,yM:3},{xM:4,yM:6},{xM:1,yM:6}]

describe('precise wall editing',()=>{
  it('sets an exact wall length while preserving a rectangular room and its right angles',()=>{
    const {plan,id}=insertFarmArea(emptyFarmPlan()),original=structuredClone(plan)
    const result=setFarmWallLength(plan,id,0,12.137)
    expect(result.error).toBeNull()
    const polygon=result.plan.areas[0].polygon
    expect(wallLength(polygon[0],polygon[1])).toBeCloseTo(12.137,8)
    expect(wallLength(polygon[2],polygon[3])).toBeCloseTo(12.137,8)
    expect(polygon[0]).toEqual(plan.areas[0].polygon[0])
    expect(polygon.map((a,i)=>Math.round(wallAngle(a,polygon[(i+1)%4])))).toEqual([0,90,180,270])
    expect(plan).toEqual(original)
  })
  it('edits every wall of an L-shaped room, including the closing wall',()=>{
    const inserted=insertFarmArea(emptyFarmPlan()),plan=editFarmArea(inserted.plan,inserted.id,{polygon:lShape}).plan
    for(let i=0;i<6;i++){
      const length=wallLength(lShape[i],lShape[(i+1)%6])+.137
      const result=setFarmWallLength(plan,inserted.id,i,length)
      expect(result.error,`wall ${i+1}`).toBeNull()
      expect(result.plan.areas[0].polygon).toHaveLength(6)
      expect(wallLength(result.plan.areas[0].polygon[i],result.plan.areas[0].polygon[(i+1)%6])).toBeCloseTo(length,8)
      expect(result.plan.areas[0].polygon[i]).toEqual(lShape[i])
      expect(validateFarmAreaPlan(result.plan)).toBeNull()
    }
  })
  it('rejects lengths that invert an L-shaped corner, overlap another room or are invalid',()=>{
    const first=insertFarmArea(emptyFarmPlan()),l=editFarmArea(first.plan,first.id,{polygon:lShape}).plan
    expect(setFarmWallLength(l,first.id,1,7).error).not.toBeNull()
    const second=insertFarmArea(first.plan)
    const result=setFarmWallLength(second.plan,first.id,0,15)
    expect(result.error).not.toBeNull();expect(result.plan).toBe(second.plan)
    for(const value of [0,-2,NaN,Infinity])expect(setFarmWallLength(first.plan,first.id,0,value).error).not.toBeNull()
  })
  it('retains closure for triangles and extra collinear contour vertices',()=>{
    const {plan,id}=insertFarmArea(emptyFarmPlan())
    for(const polygon of [[{xM:1,yM:1},{xM:6,yM:1},{xM:3,yM:6}], [{xM:1,yM:1},{xM:4,yM:1},{xM:7,yM:1},{xM:7,yM:6},{xM:1,yM:6}]]){
      const source=editFarmArea(plan,id,{polygon}).plan,result=setFarmWallLength(source,id,0,3.5)
      expect(result.error).toBeNull()
      expect(wallLength(result.plan.areas[0].polygon[0],result.plan.areas[0].polygon[1])).toBeCloseTo(3.5,8)
    }
  })
  it('extends internal bounds when an Area grows or moves beyond the previous drawing extent',()=>{
    const {plan,id}=insertFarmArea(emptyFarmPlan()),result=setFarmWallLength(plan,id,0,80)
    expect(result.error).toBeNull();expect(result.plan.dimensions.widthM).toBeGreaterThan(80)
    const moved=moveFarmArea(result.plan,id,100,120)
    expect(moved.error).toBeNull();expect(moved.plan.dimensions.lengthM).toBeGreaterThan(120)
    expect(moveFarmArea(plan,id,-1,1).error).not.toBeNull()
  })
})

describe('drawing snap constraints',()=>{
  it('snaps horizontal and vertical wall positions to actual grid lines without stretching the wall',()=>{
    const {plan}=insertFarmArea(emptyFarmPlan()),area={...plan.areas[0],polygon:rectangle(1.13,1.13,8,5)}
    for(const edge of [0,1,2,3]){
      const result=dragFarmWall(area,edge,{xM:2,yM:2},{xM:2.36,yM:2.36},true)
      const a=result[edge],b=result[(edge+1)%4]
      expect(wallLength(a,b)).toBeCloseTo(wallLength(area.polygon[edge],area.polygon[(edge+1)%4]),8)
      expect((edge%2 ? a.xM : a.yM)*4).toBeCloseTo(Math.round((edge%2 ? a.xM : a.yM)*4),8)
      expect(result[(edge+2)%4]).toEqual(area.polygon[(edge+2)%4])
    }
  })
  it('moves diagonal walls in parallel at 25 cm increments',()=>{
    const {plan}=insertFarmArea(emptyFarmPlan()),area={...plan.areas[0],polygon:[{xM:1,yM:1},{xM:4,yM:5},{xM:1,yM:8}]}
    const result=dragFarmWall(area,0,{xM:0,yM:0},{xM:.61,yM:0},true)
    expect(wallAngle(result[0],result[1])).toBeCloseTo(wallAngle(area.polygon[0],area.polygon[1]),8)
    expect(wallLength(result[0],area.polygon[0])).toBeCloseTo(.5,8)
  })
  it('lets the grid be disabled for exact corner positioning',()=>{
    const p={xM:1.13,yM:2.36}
    expect(snapCorner(p,false)).toEqual(p)
    expect(snapCorner(p,true)).toEqual({xM:1.25,yM:2.25})
  })
})

describe('drawing workspace',()=>{
  it('fits actual Area bounds rather than a mostly empty farm rectangle',()=>{
    const {plan}=insertFarmArea(emptyFarmPlan()),view=fitFarmDrawing(plan.areas,1.5)
    expect(view.width).toBeLessThan(15)
    expect(view.width/view.height).toBeCloseTo(1.5)
    for(const p of plan.areas[0].polygon){expect(p.xM).toBeGreaterThan(view.x);expect(p.xM).toBeLessThan(view.x+view.width);expect(p.yM).toBeGreaterThan(view.y);expect(p.yM).toBeLessThan(view.y+view.height)}
    expect(fitFarmDrawing([],1).width).toBeGreaterThan(0)
  })
  it('removes only the shared ground slab while preserving each Area floor and its walls',()=>{
    const {plan}=insertFarmArea(emptyFarmPlan()),scene=farmPlanScene(plan)
    const withGround=siteGeometry(null,'temperature',scene,{illustrateEquipment:false})
    const withoutGround=siteGeometry(null,'temperature',scene,{illustrateEquipment:false,showGround:false})
    expect(withGround.length-withoutGround.length).toBe(30*6)
    expect(withoutGround.length).toBeGreaterThan(0)
    expect(siteGeometry(null,'temperature',farmPlanScene(emptyFarmPlan()),{showGround:false})).toHaveLength(0)
  })
})
