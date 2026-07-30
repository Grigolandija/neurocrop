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
  const usesSavedMetricScale = metric === source.heatmapSettings.metric
  const visibleLayerIds = new Set(['structure', 'cultivation', 'irrigation', 'climate', 'lighting', 'environment', 'labels'])
  return {
    ...source,
    layers: source.layers.map((layer) => ({
      ...layer,
      visible: visibleLayerIds.has(layer.id),
      locked: true,
      opacity: layer.id === 'environment' ? 1 : layer.opacity,
    })),
    objects: source.objects.flatMap((object) => {
      if (object.type === 'section-zone') return []
      if (object.type === 'sensor-node' && object.metadata.sensor?.status === 'offline') return []
      return [{ ...object, locked: true }]
    }),
    heatmapSettings: {
      ...source.heatmapSettings,
      enabled: true,
      metric,
      opacity: Math.max(0.95, source.heatmapSettings.opacity),
      scaleMode: usesSavedMetricScale ? source.heatmapSettings.scaleMode : 'auto',
      manualMin: usesSavedMetricScale ? source.heatmapSettings.manualMin : undefined,
      manualMax: usesSavedMetricScale ? source.heatmapSettings.manualMax : undefined,
    },
  }
}
