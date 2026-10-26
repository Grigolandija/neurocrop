import { supportsEquipmentPlacement } from './equipmentPlacement'
import type { GreenhouseObject } from './model'

export type EquipmentInspectorSection='size'|'position'|'mounting'|'details'
export type EquipmentInspector={section:EquipmentInspectorSection;idPrefix:string}
export function equipmentInspectorSections(object:GreenhouseObject):EquipmentInspectorSection[]{
  return ['size','position',...((supportsEquipmentPlacement(object) || object.type==='door') ? ['mounting' as const] : []),'details']
}
export function activeEquipmentInspectorSection(object:GreenhouseObject,section:EquipmentInspectorSection){
  return equipmentInspectorSections(object).includes(section) ? section : 'size'
}
