import { describe, expect, it } from 'vitest'
import { METRICS } from '../features/greenhouse-map/model'
import { METRIC_LEVELS } from '../features/greenhouse-map/heatmap/contourLines'
import {
  createHeatmapMetricDefinitions,
  createStarterCropProfileMetrics,
  getMetricIdByHeatmapKey,
  metricDefinitions,
} from './metricRegistry'

describe('canonical metric registry contract', () => {
  it('generates all crop profile defaults from enabled registry metrics', () => {
    const expected = Object.entries(metricDefinitions)
      .filter(([, definition]) => definition.profile.enabled)
      .map(([metricId]) => metricId)
      .sort()
    expect(Object.keys(createStarterCropProfileMetrics()).sort()).toEqual(expected)
  })

  it('generates the heatmap model and contour intervals from the same definitions', () => {
    const generated = createHeatmapMetricDefinitions()
    const expectedKeys = Object.values(metricDefinitions)
      .flatMap((definition) => definition.heatmap ? [definition.heatmap.key] : [])
      .sort()
    expect(Object.keys(METRICS).sort()).toEqual(expectedKeys)
    expect(Object.keys(generated).sort()).toEqual(expectedKeys)
    expect(Object.keys(METRIC_LEVELS).sort()).toEqual(expectedKeys)

    for (const key of expectedKeys) {
      const metricId = getMetricIdByHeatmapKey(key)
      expect(metricId).toBeTruthy()
      expect(METRICS[key as keyof typeof METRICS].field).toBe(metricDefinitions[metricId!].heatmap!.field)
      expect(METRIC_LEVELS[key as keyof typeof METRIC_LEVELS].contourInterval)
        .toBe(metricDefinitions[metricId!].heatmap!.contourInterval)
    }
  })

  it('keeps multi-depth Soil EC metadata attached to the map metric', () => {
    expect(metricDefinitions.soilEc.depth).toMatchObject({
      mode: 'multi',
      metadataKey: 'soil_ec_depths',
    })
    expect(metricDefinitions.soilEc.heatmap?.field).toBe('soilEcMsCm')
  })
})
