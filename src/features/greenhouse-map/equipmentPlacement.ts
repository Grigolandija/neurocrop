import type { EquipmentPlacement,GreenhouseObject } from './model'

const excluded=new Set<GreenhouseObject['type']>(['sensor-node','section-zone','technical-zone','text-label','rectangle','walkway','partition','door','window','ventilation-opening'])
export const supportsEquipmentPlacement=(object:GreenhouseObject)=>!excluded.has(object.type)
export function equipmentVerticalBounds(mesh:ArrayLike<number>){
  let bottom=Infinity,top=-Infinity
  for(let i=1;i<mesh.length;i+=6){bottom=Math.min(bottom,mesh[i]);top=Math.max(top,mesh[i])}
  return {bottom:Number.isFinite(bottom) ? bottom : 0,top:Number.isFinite(top) ? top : 0}
}
const positive=(n:unknown):n is number=>typeof n==='number' && Number.isFinite(n) && n>0
export function resolveEquipmentPlacement(object:GreenhouseObject,bounds:{bottom:number;top:number},ceiling:number):EquipmentPlacement{
  const fallback:EquipmentPlacement={mount:object.type==='lamp' || object.type==='fan' ? 'ceiling' : 'floor',heightM:Math.max(.01,bounds.top-bounds.bottom),offsetM:0}
  if(fallback.mount==='ceiling')fallback.offsetM=Math.max(0,ceiling-bounds.top)
  const saved=object.metadata.equipmentPlacement
  if(!saved || !['floor','wall','ceiling'].includes(saved.mount) || !positive(saved.heightM) || !Number.isFinite(saved.offsetM) || saved.offsetM<0)return fallback
  return {...saved,offsetM:saved.mount==='floor' ? 0 : saved.offsetM}
}
export function equipmentPlacementBounds(placement:EquipmentPlacement,ceiling:number){
  const bottom=placement.mount==='ceiling' ? ceiling-placement.offsetM-placement.heightM : placement.mount==='floor' ? 0 : placement.offsetM
  return {bottom,top:bottom+placement.heightM}
}
