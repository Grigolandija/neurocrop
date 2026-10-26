import type { GreenhouseMap, GreenhouseObject } from '../src/features/greenhouse-map/model'
export type OutlinePoint={xM:number;yM:number}
export type AreaGeometry={areaId:string;revision:number;name:string;kind:'room'|'greenhouse'|'zone';heightM:number;widthM:number;lengthM:number;polygon:OutlinePoint[];origin:OutlinePoint}
export function insideOutline(point:OutlinePoint,polygon:OutlinePoint[]):boolean
export function outlinePoints(map:Pick<GreenhouseMap,'shape'|'dimensions'>):OutlinePoint[]
export function objectFootprint(object:GreenhouseObject):OutlinePoint[]
export function objectInsideOutline(object:GreenhouseObject,map:Pick<GreenhouseMap,'shape'|'dimensions'>):boolean
export function areaGeometry(plan:unknown,revision:number,areaId:string,zoneId?:string):AreaGeometry|null
export function applyAreaGeometry(map:GreenhouseMap,geometry?:AreaGeometry|null):GreenhouseMap
export function outlineError(map:Pick<GreenhouseMap,'shape'|'dimensions'>):string|null
export function validOutlineMount(object:GreenhouseObject,map:Pick<GreenhouseMap,'shape'|'dimensions'>):boolean
