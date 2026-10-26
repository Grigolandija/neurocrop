import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { spatialContrastColorAt } from '../greenhouse-map/heatmap/heatmapColorScale'
import type { MetricKey } from '../greenhouse-map/model'
import { measuredSensors, spatialClimateMetrics } from '../living-greenhouse/livingData'
import { createVolumeGrid, VOLUME_LAYERS } from '../living-greenhouse/volumeGrid'
import type { VolumeField } from '../living-greenhouse/sceneGeometry'
import { zoneBounds } from '../living-greenhouse/siteDemoModel'
import { farmEditorMap, type FarmMaps } from './farmLayoutData'
import { farmComparisonScale, type FarmAreaComparison } from './farmMonitoringData'
import type { FarmPlanDocument } from './farmPlanData'

type FarmClimate = { field: VolumeField; owners: Uint16Array; areaIds: string[]; ready: boolean }

/** Reuse the detailed Area XYZ model; never spread one Area's mean into another room. */
export function farmClimateField(plan: FarmPlanDocument, maps: FarmMaps, comparison: Record<string, FarmAreaComparison>, metric: MetricKey, at: number): FarmClimate {
  const width = 192, depth = 128, layers = VOLUME_LAYERS
  const height = Math.max(1, ...plan.areas.map(area => area.height))
  const pixels = new Uint8Array(width * depth * layers * 4), owners = new Uint16Array(width * depth * layers)
  const scale = farmComparisonScale(Object.values(comparison), metric)
  const palette = new Float32Array(Array.from({ length: 33 }, (_, i) => [...spatialContrastColorAt(scale.min + (scale.max - scale.min) * i / 32, [scale.min, scale.max]).map(v => v / 255), 1]).flat())
  const field: VolumeField = { width, height: depth, layers, pixels, bounds: [plan.dimensions.widthM, plan.dimensions.lengthM, height], roofSlope: 0, palette, levels: [], contours: [] }
  const areaIds = plan.areas.map(area => area.id)
  if (!spatialClimateMetrics.has(metric)) return { field, owners, areaIds, ready: false }
  let ready = false
  plan.areas.forEach((area, index) => {
    const summary = comparison[area.id]
    if (!summary?.current || !maps[area.id]) return
    const map = farmEditorMap(plan, area.id, maps)
    const fresh = new Set(summary.readings.filter(reading => reading.fresh).map(reading => reading.id))
    const readings = measuredSensors(map, metric, at).filter(reading => fresh.has((reading.object.metadata.sensor?.devEui || reading.object.metadata.sensor?.nodeId || '').toLowerCase()))
    const grid = createVolumeGrid(map, readings, area.height, area.kind === 'greenhouse' ? .32 : 0)
    if (!grid.mask.some(Boolean)) return
    const bounds = zoneBounds(area), w = plan.dimensions.widthM, d = plan.dimensions.lengthM
    const minX = Math.max(0, Math.floor(bounds.minX / w * width)), maxX = Math.min(width, Math.ceil(bounds.maxX / w * width))
    const minZ = Math.max(0, Math.floor(bounds.minY / d * depth)), maxZ = Math.min(depth, Math.ceil(bounds.maxY / d * depth))
    for (let z = minZ; z < maxZ; z++) for (let x = minX; x < maxX; x++) {
      const point = { xM: (x + .5) * w / width, yM: (z + .5) * d / depth }
      if (!pointInPolygon(point, area.polygon)) continue
      const localX = Math.min(grid.width - 1, Math.floor((point.xM - bounds.minX) / map.dimensions.widthM * grid.width))
      const localZ = Math.min(grid.depth - 1, Math.floor((point.yM - bounds.minY) / map.dimensions.lengthM * grid.depth))
      for (let y = 0; y < layers; y++) {
        const level = (y + .5) * height / layers
        if (level > area.height) continue
        const localY = Math.min(grid.layers - 1, Math.floor(level / area.height * grid.layers))
        const source = (localY * grid.depth + localZ) * grid.width + localX
        if (!grid.mask[source]) continue
        const target = (y * depth + z) * width + x
        const normalized = Math.max(0, Math.min(1, (grid.values[source] - scale.min) / Math.max(1e-6, scale.max - scale.min)))
        pixels.set([Math.round(normalized * 255), Math.round(grid.confidence[source] * 255), grid.extrapolated[source] * 255, 255], target * 4)
        owners[target] = index + 1
        ready = true
      }
    }
  })
  return { field, owners, areaIds, ready }
}

/** Fade only neighbouring fields; keep selected geometry and observations at full strength. */
export function selectedFarmClimate(climate: FarmClimate, selectedAreaId?: string | null): VolumeField {
  const selected = selectedAreaId ? climate.areaIds.indexOf(selectedAreaId) + 1 : 0
  if (!selected) return climate.field
  const pixels = new Uint8Array(climate.field.pixels)
  for (let i = 0; i < climate.owners.length; i++) if (climate.owners[i] && climate.owners[i] !== selected) for (let channel = 0; channel < 4; channel++) pixels[i * 4 + channel] = Math.round(pixels[i * 4 + channel] * .3)
  return { ...climate.field, pixels }
}
