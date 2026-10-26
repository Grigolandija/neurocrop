import type { LivingScene,LivingSceneCamera } from '../living-greenhouse/gpuScene'
import type { DrawingView } from './farmAreaGeometry'
import { siteDimensions,zoneBounds,type SitePlan } from '../living-greenhouse/siteDemoModel'
import { planToScene } from '../living-greenhouse/sceneMath'
type Dimensions={widthM:number;lengthM:number}
type SavedScene={camera:LivingSceneCamera;dimensions:Dimensions}
export type FarmSceneMemory=Map<string,SavedScene>
export type FarmViewMemory={scope:string;drawing:Map<string,DrawingView>;scene:FarmSceneMemory}
export const farmViewKey=(areaId?:string|null)=>areaId ? `area:${areaId}` : 'farm'
export const createFarmViewMemory=(scope=''):FarmViewMemory=>({scope,drawing:new Map(),scene:new Map()})

/** Fit the selected Area bounds, never the farm's storage dimensions. */
export function focusFarmSceneArea(scene:Pick<LivingScene,'focus'>,plan:SitePlan,id?:string|null,padding=1.3){
  const area=plan.zones.find(zone=>zone.id===id),shapes=area ? [area] : plan.zones
  if(!shapes.length){scene.focus(null);return}
  const bounds=zoneBounds({polygon:shapes.flatMap(zone=>zone.polygon)}),height=Math.max(...shapes.map(zone=>zone.height))
  scene.focus(planToScene((bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,height*.3,siteDimensions(plan)),Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY,height)*padding)
}

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
