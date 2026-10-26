import { describe,expect,it,vi } from 'vitest'
import type { LivingSceneCamera } from '../living-greenhouse/gpuScene'
import { createFarmViewMemory,farmViewKey,rememberFarmScene,restoreFarmScene } from './farmViewMemory'

describe('farm drawing and 3D view navigation',()=>{
  const dimensions={widthM:50,lengthM:34}
  const camera:LivingSceneCamera={azimuth:1.3,elevation:.9,zoom:1.7,target:[-12,2,5],extent:9}
  it('retains separate cameras for the whole farm and each Area across a scene remount',()=>{
    const memory=createFarmViewMemory('account-a')
    rememberFarmScene(memory.scene,farmViewKey(),{getCamera:()=>camera},dimensions)
    const areaCamera={...camera,zoom:.8,target:[3,1,7] as [number,number,number]}
    rememberFarmScene(memory.scene,farmViewKey('a'),{getCamera:()=>areaCamera},dimensions)
    const scene={restoreCamera:vi.fn(),shiftOrigin:vi.fn()}
    expect(restoreFarmScene(memory.scene,farmViewKey(),scene,dimensions)).toBe(true)
    expect(scene.restoreCamera).toHaveBeenLastCalledWith(camera)
    expect(restoreFarmScene(memory.scene,farmViewKey('a'),scene,dimensions)).toBe(true)
    expect(scene.restoreCamera).toHaveBeenLastCalledWith(areaCamera)
    expect(scene.shiftOrigin).not.toHaveBeenCalled()
    expect(restoreFarmScene(memory.scene,farmViewKey('unvisited'),scene,dimensions)).toBe(false)
  })
  it('compensates for expanded farm bounds without changing the stored snapshot',()=>{
    const memory=createFarmViewMemory(),scene={restoreCamera:vi.fn(),shiftOrigin:vi.fn()}
    rememberFarmScene(memory.scene,'farm',{getCamera:()=>camera},dimensions)
    restoreFarmScene(memory.scene,'farm',scene,{widthM:60,lengthM:40})
    expect(scene.shiftOrigin).toHaveBeenCalledWith([-5,0,3])
    scene.restoreCamera.mock.calls[0][0].target![0]=100
    restoreFarmScene(memory.scene,'farm',scene,dimensions)
    expect(scene.restoreCamera).toHaveBeenLastCalledWith(camera)
  })
  it('keeps Area drawing views independent from the whole farm and other accounts',()=>{
    const first=createFarmViewMemory('a'),second=createFarmViewMemory('b')
    const farm={x:1,y:2,width:50,height:34},room={x:2,y:3,width:8,height:5}
    first.drawing.set(farmViewKey(),farm);first.drawing.set(farmViewKey('a'),room)
    expect(first.drawing.get(farmViewKey())).toEqual(farm)
    expect(first.drawing.get(farmViewKey('a'))).toEqual(room)
    expect(second.drawing.size).toBe(0)
    expect(farmViewKey('farm')).not.toBe(farmViewKey())
  })
})
