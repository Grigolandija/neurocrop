import * as areas from './areas/model'
import * as sections from './sections/model'

export const neurocropFeatures = { areas, sections }

export function installNeuroCropFeatures() {
  window.NeuroCropFeatures = neurocropFeatures
}

export type NeuroCropFeatures = typeof neurocropFeatures
