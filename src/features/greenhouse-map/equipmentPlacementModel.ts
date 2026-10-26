import { objectGeometry } from '../living-greenhouse/objectGeometry'
import { equipmentMountCeiling } from '../living-greenhouse/wallSurfaces'
import { equipmentPlacementBounds,equipmentVerticalBounds,resolveEquipmentPlacement,supportsEquipmentPlacement } from './equipmentPlacement'
import type { GreenhouseMap,GreenhouseObject } from './model'

export function equipmentMountingSpace(object:GreenhouseObject,map:GreenhouseMap){
  const roomHeight=map.dimensions.heightM || 3,roofSlope=map.farmPlanGeometry?.kind==='greenhouse' || (!map.farmPlanGeometry && map.shape.type==='rectangle') ? .32 : 0
  const ceiling=equipmentMountCeiling(object,map.dimensions,roomHeight,roofSlope)
  return {roomHeight,ceiling}
}

export function equipmentPlacementModel(object:GreenhouseObject,map:GreenhouseMap){
  if(!supportsEquipmentPlacement(object))return null
  const {roomHeight,ceiling}=equipmentMountingSpace(object,map)
  const mesh=objectGeometry(object,map.dimensions,roomHeight,ceiling,{bodyOnly:true,ignorePlacement:true})
  if(!mesh.length)return null
  const placement=resolveEquipmentPlacement(object,equipmentVerticalBounds(mesh),ceiling)
  const bounds=equipmentPlacementBounds(placement,ceiling)
  return {placement,ceiling,...bounds,fits:bounds.bottom>=-1e-6 && bounds.top<=ceiling+1e-6}
}

/** Store inferred defaults only when adding new hardware; never rewrite an existing layout. */
export function withDefaultEquipmentPlacement(object:GreenhouseObject,map:GreenhouseMap){
  const model=equipmentPlacementModel(object,map)
  return !model ? object : {...object,metadata:{...object.metadata,equipmentPlacement:model.placement}}
}
