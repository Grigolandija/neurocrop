import type { LivingScene,LivingSceneCamera } from '../living-greenhouse/gpuScene'
import type { DrawingView } from './farmAreaGeometry'
type Dimensions={widthM:number;lengthM:number}
type SavedScene={camera:LivingSceneCamera;dimensions:Dimensions}
export type FarmSceneMemory=Map<string,SavedScene>
export type FarmViewMemory={scope:string;drawing:Map<string,DrawingView>;scene:FarmSceneMemory}
export const farmViewKey=(areaId?:string|null)=>areaId ? `area:${areaId}` : 'farm'
export const createFarmViewMemory=(scope=''):FarmViewMemory=>({scope,drawing:new Map(),scene:new Map()})

export function rememberFarmScene(memory:FarmSceneMemory,key:string,scene:Pick<LivingScene,'getCamera'>,dimensions:Dimensions){
  memory.set(key,{camera:structuredClone(scene.getCamera()),dimensions:{...dimensions}})
}
export function restoreFarmScene(memory:FarmSceneMemory,key:string,scene:Pick<LivingScene,'restoreCamera'|'shiftOrigin'>,dimensions:Dimensions){
  const saved=memory.get(key)
  if(!saved)return false
  scene.restoreCamera(structuredClone(saved.camera))
  // Storage bounds may grow while the Area is edited; retain the same world position.
  if(saved.dimensions.widthM!==dimensions.widthM || saved.dimensions.lengthM!==dimensions.lengthM)scene.shiftOrigin([(saved.dimensions.widthM-dimensions.widthM)/2,0,(dimensions.lengthM-saved.dimensions.lengthM)/2])
  return true
}
