import registryJson from '../../backend/metric-registry.json'

type NumericRange = [number, number]

export type MetricProfileDefinition = {
  enabled: boolean
  section: string
  optimal: NumericRange
  warning: NumericRange
  critical: NumericRange
  growth: boolean
  warningPadding: NumericRange
  criticalPadding: NumericRange
  lightingSchedule?: {
    enabled: boolean
    start: string
    end: string
    timeZone: string
    darkThresholdLux: number
  }
}

export type MetricHeatmapDefinition = {
  key: string
  field: string
  decimals?: number
  bounds: NumericRange
  scaleStep: number
  minimumSpan: number
  fullContrastSpan: number
  colorInterval: number
  contourInterval: number
  contourCandidates: number[]
  lowConfidenceMinimum: number
  palette: string
}

export type MetricDefinition = {
  label: string
  labelLt: string
  unit: string
  decimals: number
  telemetryKey?: string
  column?: string
  sourceColumns?: string[]
  sensorKey?: string
  intervalSec: number
  physicalRange: NumericRange
  derivedFrom?: string[]
  depth?: {
    mode: 'multi'
    minimumCm: number
    maximumCm: number
    metadataKey: string
  }
  profile: MetricProfileDefinition
  heatmap?: MetricHeatmapDefinition
}

type MetricPalette = {
  colors: string[]
  stops?: Array<{ value: number; color: string }>
}

type MetricRegistry = {
  version: number
  metrics: Record<string, MetricDefinition>
  palettes: Record<string, MetricPalette>
}

export const metricRegistry = registryJson as unknown as MetricRegistry
export const metricDefinitions = metricRegistry.metrics

export function getMetricDefinition(metricId: string) {
  return metricDefinitions[metricId]
}

export function getMetricIdByHeatmapKey(heatmapKey: string) {
  return Object.entries(metricDefinitions).find(([, definition]) => definition.heatmap?.key === heatmapKey)?.[0]
}

export function profileMetricIds(section: string) {
  return Object.entries(metricDefinitions)
    .filter(([, definition]) => definition.profile.enabled && definition.profile.section === section)
    .map(([metricId]) => metricId)
}

export function createStarterCropProfileMetrics() {
  return Object.fromEntries(
    Object.entries(metricDefinitions)
      .filter(([, definition]) => definition.profile.enabled)
      .map(([metricId, definition]) => [metricId, {
        label: definition.label,
        unit: definition.unit,
        decimals: definition.decimals,
        optimal: [...definition.profile.optimal],
        warning: [...definition.profile.warning],
        critical: [...definition.profile.critical],
        ...(definition.profile.lightingSchedule
          ? { lightingSchedule: structuredClone(definition.profile.lightingSchedule) }
          : {}),
      }]),
  )
}

export function createHeatmapMetricDefinitions() {
  return Object.fromEntries(
    Object.values(metricDefinitions)
      .filter((definition) => definition.heatmap)
      .map((definition) => {
        const heatmap = definition.heatmap!
        const palette = metricRegistry.palettes[heatmap.palette]
        if (!palette) throw new Error(`Unknown heatmap palette: ${heatmap.palette}`)
        return [heatmap.key, {
          label: definition.label,
          labelLt: definition.labelLt,
          unit: definition.unit,
          decimals: heatmap.decimals ?? definition.decimals,
          scaleStep: heatmap.scaleStep,
          minimumSpan: heatmap.minimumSpan,
          fullContrastSpan: heatmap.fullContrastSpan,
          field: heatmap.field,
          bounds: heatmap.bounds,
          colors: palette.colors,
          colorStops: palette.stops,
          colorInterval: heatmap.colorInterval,
          contourInterval: heatmap.contourInterval,
          contourCandidates: heatmap.contourCandidates,
          lowConfidenceMinimum: heatmap.lowConfidenceMinimum,
        }]
      }),
  )
}
