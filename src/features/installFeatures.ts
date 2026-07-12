import * as areas from './areas/model'
import * as sections from './sections/model'
import * as nodes from './nodes/model'

export const neurocropFeatures = { areas, sections, nodes }

export function installNeuroCropFeatures() {
  window.NeuroCropFeatures = neurocropFeatures
}

export type NeuroCropFeatures = typeof neurocropFeatures
