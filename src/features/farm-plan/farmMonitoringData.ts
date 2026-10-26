import { getMetricIdByHeatmapKey } from '../../domain/metricRegistry'
import { getMetricMeasurementTime, getMetricMeasurementValue, getStableScale } from '../greenhouse-map/heatmap/heatmapMetrics'
import { semanticColorAt, spatialContrastColorAt } from '../greenhouse-map/heatmap/heatmapColorScale'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import type { AreaMapContext, AreaMapHistory, AreaMapNode } from '../greenhouse-map/services/areaMapRepository'

export type FarmReading = { id: string; name: string; value: number | null; at: string | null; fresh: boolean; target: [number, number] | null }
export type FarmAreaComparison = {
  areaId: string; readings: FarmReading[]; current: number; total: number; assessed: number; outside: FarmReading[]
  range: [number, number] | null; lastRange: [number, number] | null; mean: number | null; latest: string | null
  state: 'current' | 'partial' | 'delayed' | 'empty' | 'error' | 'loading'; color: string; colorRgb: [number, number, number]
}
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const range = (values: number[]): [number, number] | null => values.length ? [Math.min(...values), Math.max(...values)] : null

function nodeTarget(context: AreaMapContext, node: AreaMapNode, metric: MetricKey): [number, number] | null {
  const section = context.sections.find(item => item.id === node.sectionId) || (!node.sectionId ? context.sections.find(item => item.isAreaDefault) : undefined)
  const profile = context.profiles.find(item => item.id === section?.cropProfile || item.name === section?.cropProfile)
  const optimal = profile?.metrics[getMetricIdByHeatmapKey(metric) || '']?.optimal
  return optimal?.length === 2 && optimal.every(validNumber) && optimal[0] <= optimal[1] ? optimal : null
}

/** Compare real hardware, including unplaced Nodes; stale readings never become current ranges. */
export function summarizeFarmArea(areaId: string, context: AreaMapContext | undefined, metric: MetricKey, now: number, failed = false): FarmAreaComparison {
  const seen = new Set<string>(), maximumAge = (context?.map?.heatmapSettings.maxReadingAgeMinutes ?? 30) * 60_000
  const readings: FarmReading[] = (context?.nodes || []).flatMap(node => {
    const id = (node.devEui || node.nodeId || '').toLowerCase()
    if (!id || seen.has(id)) return []
    seen.add(id)
    const raw = getMetricMeasurementValue(node.measurements, metric), at = getMetricMeasurementTime(node.measurements, metric)
    const age = at ? now - Date.parse(at) : NaN
    const value = validNumber(raw) ? raw : null
    const fresh = !failed && value !== null && Number.isFinite(age) && age >= -60_000 && age <= maximumAge && ['online', 'warning', 'low-battery'].includes(node.status)
    return [{ id, name: node.displayName || node.nodeId || node.devEui || id, value, at: at || null, fresh, target: nodeTarget(context!, node, metric) }]
  })
  const fresh = readings.filter(item => item.fresh), values = fresh.map(item => item.value!)
  const last = readings.filter(item => item.value !== null && item.at && Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) <= now + 60_000)
  const latest = fresh.reduce<string | null>((stamp, item) => !stamp || Date.parse(item.at!) > Date.parse(stamp) ? item.at : stamp, null)
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  const colorRgb: [number, number, number] = mean === null ? [154, 166, 158] : semanticColorAt(mean, METRICS[metric])
  return {
    areaId, readings, current: fresh.length, total: readings.length, assessed: fresh.filter(item => item.target).length,
    outside: fresh.filter(item => item.target && (item.value! < item.target[0] || item.value! > item.target[1])),
    range: range(values), lastRange: range(last.map(item => item.value!)), mean, latest,
    state: failed ? 'error' : !context ? 'loading' : fresh.length ? fresh.length < readings.length ? 'partial' : 'current' : last.length ? 'delayed' : 'empty',
    colorRgb, color: `rgb(${colorRgb.join(' ')})`,
  }
}

export function farmComparisonScale(areas: FarmAreaComparison[], metric: MetricKey) {
  return getStableScale(areas.flatMap(area => area.readings.filter(reading => reading.fresh).map(reading => reading.value!)), metric)
}

/** One fresh-reading scale for all Areas; missing readings remain neutral, never a cold extreme. */
export function contrastFarmAreas(areas: FarmAreaComparison[], metric: MetricKey): FarmAreaComparison[] {
  const scale = farmComparisonScale(areas, metric)
  return areas.map(area => {
    const colorRgb = area.mean === null ? area.colorRgb : spatialContrastColorAt(area.mean, [scale.min, scale.max])
    return { ...area, colorRgb, color: `rgb(${colorRgb.join(' ')})` }
  })
}

/** Preserve gaps: a time bucket with no measurements is not bridged by a fabricated line. */
export function farmAreaTrend(history: AreaMapHistory, metric: MetricKey) {
  return history.frames.map(frame => {
    const values = frame.nodes.flatMap(node => { const value = getMetricMeasurementValue(node.measurements, metric); return validNumber(value) ? [value] : [] })
    return { at: frame.observedAt, range: range(values), mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
  })
}
