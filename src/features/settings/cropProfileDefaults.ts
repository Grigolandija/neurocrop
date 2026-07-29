import { createStarterCropProfileMetrics } from '../../domain/metricRegistry'

export const starterCropProfileMetrics = createStarterCropProfileMetrics()

export function withStarterMetrics(metrics: unknown): Record<string, Record<string, unknown>> {
  if (metrics && typeof metrics === 'object' && !Array.isArray(metrics) && Object.keys(metrics).length > 0) {
    return metrics as Record<string, Record<string, unknown>>
  }
  return structuredClone(starterCropProfileMetrics) as unknown as Record<string, Record<string, unknown>>
}
