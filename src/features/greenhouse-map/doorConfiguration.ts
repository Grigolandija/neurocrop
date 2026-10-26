import type { GreenhouseMap, GreenhouseObject, ObjectMetadata } from './model'

export const DEFAULT_DOOR_HEIGHT_M = 2.1
export const DOOR_TYPES = ['single', 'double', 'sliding'] as const
export type DoorType = typeof DOOR_TYPES[number]

export function defaultDoorHeight(roomHeight?: number) {
  return Math.min(DEFAULT_DOOR_HEIGHT_M, typeof roomHeight === 'number' && Number.isFinite(roomHeight) && roomHeight > 0 ? roomHeight : DEFAULT_DOOR_HEIGHT_M)
}

export function doorConfiguration(object: GreenhouseObject, roomHeight?: number): Required<NonNullable<ObjectMetadata['door']>> {
  const config = object.metadata.door
  return {
    type: config && DOOR_TYPES.includes(config.type) ? config.type : 'single',
    heightM: config?.heightM && Number.isFinite(config.heightM) && config.heightM > 0
      ? Math.min(config.heightM, roomHeight && roomHeight > 0 ? roomHeight : 100)
      : defaultDoorHeight(roomHeight),
  }
}

/** Opening width follows the mounted wall; east/west use plan Y. */
export function doorOpening(object: GreenhouseObject, dimensions: GreenhouseMap['dimensions'],outline?:Array<{xM:number;yM:number}>) {
  const edge=object.metadata.wallMount?.edgeIndex
  if(outline && edge!==undefined && outline[edge]){
    const a=outline[edge],b=outline[(edge+1)%outline.length]
    return {axis:'widthM' as const,widthM:object.widthM,maximumM:Math.hypot(b.xM-a.xM,b.yM-a.yM)}
  }
  const wall = object.metadata.wallMount?.wall
  const vertical = wall ? wall === 'east' || wall === 'west' : object.lengthM > object.widthM
  return { axis: vertical ? 'lengthM' as const : 'widthM' as const,
    widthM: vertical ? object.lengthM : object.widthM,
    maximumM: vertical ? dimensions.lengthM : dimensions.widthM }
}
