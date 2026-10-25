import type { GreenhouseMap, MetricKey } from '../greenhouse-map/model'
import {
  createAreaMap,
  mergeAreaMapContext,
  type AreaMapContext,
} from '../greenhouse-map/services/areaMapRepository'

export function prepareReadOnlyClimateMap(context: AreaMapContext, metric: MetricKey): GreenhouseMap {
  const source = context.map
    ? mergeAreaMapContext(context.map, context.area, context.nodes, context.sections)
    : createAreaMap(context.area, context.nodes, context.sections)
  const visibleLayerIds = new Set(['structure', 'cultivation', 'irrigation', 'climate', 'environment', 'labels'])
  return {
    ...source,
    layers: source.layers.map((layer) => ({
      ...layer,
      visible: visibleLayerIds.has(layer.id),
      locked: true,
      opacity: layer.id === 'environment' ? 1 : layer.opacity,
    })),
    objects: source.objects.flatMap((object) => {
      // Keep lighting in the saved plan and 3D scene, not in the 2D climate projection.
      if (object.type === 'section-zone' || object.type === 'lamp') return []
      return [{ ...object, locked: true }]
    }),
    heatmapSettings: {
      ...source.heatmapSettings,
      enabled: true,
      metric,
      opacity: Math.max(0.95, source.heatmapSettings.opacity),
      scaleMode: 'auto',
      manualMin: undefined,
      manualMax: undefined,
    },
  }
}
