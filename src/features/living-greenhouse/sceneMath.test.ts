import { describe, expect, it } from 'vitest'
import { cameraMatrix, inverseMatrix, planToScene, project } from './sceneMath'
import { worldToScreen } from '../greenhouse-map/geometry'

describe('volume camera reconstruction', () => {
  it('keeps the saved plan north, south, east and west in the same screen direction', () => {
    const dimensions={widthM:8,lengthM:5}
    const matrix=cameraMatrix([0,38,2],[0,0,0],1.6)
    const positions=[[.3,4.7],[7.7,4.7],[.3,.3],[7.7,.3]]
    const plan=positions.map(([x,y])=>worldToScreen(x,y,5,{scale:100,offsetX:0,offsetY:0}))
    const scene=positions.map(([x,y])=>project(planToScene(x,y,1.5,dimensions),matrix,800,500))
    for(const [a,b] of [[0,2],[1,3]]) {
      expect(plan[a].y).toBeLessThan(plan[b].y)
      expect(scene[a].y).toBeLessThan(scene[b].y)
    }
    for(const [a,b] of [[0,1],[2,3]]) {
      expect(plan[a].x).toBeLessThan(plan[b].x)
      expect(scene[a].x).toBeLessThan(scene[b].x)
    }
    expect(planToScene(8,5,2.5,dimensions)).toEqual([4,2.5,-2.5])
  })

  it('reconstructs the original world point from depth for orbit and top views', () => {
    for (const eye of [[20,20,30], [0,38,2], [-30,12,-20]] as [number,number,number][]) {
      const m=cameraMatrix(eye,[0,1,0],1.7), inverse=inverseMatrix(m)
      for(const point of [[0,0,0,1],[-5,1,3,1],[7,4,-4,1]]) {
        const clip=[0,1,2,3].map(r=>point.reduce((s,v,k)=>s+v*m[k*4+r],0))
        const ndc=clip.map(v=>v/clip[3])
        const restored=[0,1,2,3].map(r=>ndc.reduce((s,v,k)=>s+v*inverse[k*4+r],0))
        for(let i=0;i<3;i++)expect(restored[i]/restored[3]).toBeCloseTo(point[i],2)
      }
    }
  })
})
