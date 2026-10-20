import { describe, expect, it } from 'vitest'
import { cameraMatrix, inverseMatrix } from './sceneMath'

describe('volume camera reconstruction', () => {
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
