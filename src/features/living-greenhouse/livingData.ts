import { objectInsideOutline } from '../../../backend/area-map-outline.js'
import { createDemoMap } from '../greenhouse-map/demo'
import { getMetricMeasurementTime, getMetricMeasurementValue } from '../greenhouse-map/heatmap/heatmapMetrics'
import { METRICS, type GreenhouseMap, type GreenhouseObject, type MetricKey } from '../greenhouse-map/model'
import type { AreaMapContext, AreaMapHistory } from '../greenhouse-map/services/areaMapRepository'

export const spatialClimateMetrics: ReadonlySet<MetricKey> = new Set(['air-temperature', 'relative-humidity', 'co2', 'vpd', 'illuminance'])

export const livingMetrics = Object.keys(METRICS) as MetricKey[]

// A rendering prototype must never invent positions for unplaced live nodes.
// Historical observations require the layout that was recorded for that time.
export function livingMap(context: AreaMapContext, history: AreaMapHistory | null, index: number | null): GreenhouseMap | null {
  if (!context.mapEnabled) return null
  const frame = index === null ? null : history?.frames[index]
  const at = frame ? Date.parse(frame.observedAt) : 0
  const layout = frame ? history?.layouts.find(l => l.source === 'recorded' && Date.parse(l.validFrom) <= at && (!l.validTo || at < Date.parse(l.validTo))) : null
  if (index !== null && (!frame || !layout)) return null
  if(frame && layout?.validTo && Date.parse(layout.validTo)<at+(history?.stepMinutes || 0)*60000)return null
  const source = frame ? layout!.map : context.map
  if (!source) return null
  const live = new Map(context.nodes.map(n => [n.devEui?.toLowerCase(), n]))
  const recorded = new Map(frame?.nodes.map(n => [n.devEui.toLowerCase(), n]))
  const visibleLayers = new Set(source.layers.filter(l => l.visible).map(l => l.id))
  return { ...source, objects: source.objects.filter(o => o.visible && visibleLayers.has(o.layerId)).map(o => {
    if (o.type !== 'sensor-node') return o
    const id = o.metadata.sensor?.devEui?.toLowerCase()
    const reading = id ? (frame ? recorded.get(id) : live.get(id)) : undefined
    const measurements = frame
      ? { ...reading?.measurements, measuredAt: reading && 'measuredAt' in reading ? reading.measuredAt || undefined : undefined }
      : reading?.measurements
    return { ...o, metadata: { ...o.metadata, sensor: { ...o.metadata.sensor, sensors: o.metadata.sensor?.sensors || [],
      status: frame ? reading ? 'online' : 'stale' : live.get(id)?.status || 'offline', measurements,
      lastMeasurements: frame ? undefined : live.get(id)?.lastMeasurements,
      lastSeenAt: frame ? undefined : live.get(id)?.lastSeenAt,
      measurementHeightsM: frame
        ? reading?.measurementHeightsM ?? Object.fromEntries(livingMetrics.map(m=>[m,null]))
        : live.get(id)?.measurementHeightsM,
      sectionId: frame ? o.metadata.sensor?.sectionId : live.get(id)?.sectionId || o.metadata.sensor?.sectionId,
    } } }
  }) }
}

export function measuredSensors(map: GreenhouseMap, metric: MetricKey, at: number, soilEcDepthCm?: number) {
  return map.objects.filter(o => objectInsideOutline(o,map) && o.type === 'sensor-node' && o.xM >= 0 && o.yM >= 0 && o.xM+o.widthM/2 <= map.dimensions.widthM && o.yM+o.lengthM/2 <= map.dimensions.lengthM).map(object => {
    const sensor = object.metadata.sensor
    const raw = getMetricMeasurementValue(sensor?.measurements, metric, soilEcDepthCm)
    const timestamp = getMetricMeasurementTime(sensor?.measurements, metric) || sensor?.lastSeenAt
    const age = timestamp ? at - Date.parse(timestamp) : NaN
    const valid = sensor && !['offline', 'stale', 'unassigned'].includes(sensor.status)
      && typeof raw === 'number' && Number.isFinite(raw)
      && Number.isFinite(age) && age >= -60_000 && age <= map.heatmapSettings.maxReadingAgeMinutes * 60_000
    const previous = sensor?.lastMeasurements ?? sensor?.measurements
    const lastRaw = getMetricMeasurementValue(previous, metric, soilEcDepthCm)
    const lastTimestamp = getMetricMeasurementTime(previous, metric)
    const lastAge = lastTimestamp ? at - Date.parse(lastTimestamp) : NaN
    const lastValue = typeof lastRaw === 'number' && Number.isFinite(lastRaw) && Number.isFinite(lastAge) && lastAge >= -60_000 ? lastRaw : null
    const heights=sensor?.measurementHeightsM
    const height=heights && Object.hasOwn(heights,metric) ? heights[metric] : sensor?.installationHeightM
    const heightM=typeof height==='number' && Number.isFinite(height) && height>=0 && height<=100 ? height : null
    return { object, value: valid ? raw as number : null, timestamp, heightM,
      lastValue, lastTimestamp, delayed: !valid && lastValue !== null }
  })
}

// Synthetic data exists only behind an explicitly selected demonstration route.
export function livingDemo(): { context: AreaMapContext; history: AreaMapHistory } {
  const map = createDemoMap()
  map.name = 'NeuroCrop Glasshouse'
  map.areaId = 'living-demo'
  map.dimensions = { widthM: 20, lengthM: 12, heightM: 4.2 }
  const rack = (i: number, xM: number, yM: number): GreenhouseObject => ({ id: `bed-${i}`, type: 'growing-table', name: `Bed ${i + 1}`, xM, yM, widthM: 7.4, lengthM: 1.8, rotationDeg: 0, layerId: 'cultivation', locked: true, visible: true, metadata: {} })
  const originals=map.objects.filter(o=>o.type==='sensor-node')
  const nodes=Array.from({length:6},(_,i)=>structuredClone(originals[i%4]))
  const positions=[[3,2],[16,3],[10,9]]
  nodes.forEach((n,i)=>{
    n.id=`demo-node-${i+1}`;n.xM=positions[i%3][0];n.yM=positions[i%3][1];n.name=`NSN-DEMO-0${i+1}`
    const height=i<3 ? 1.2 : 2.8
    n.metadata.sensor={...n.metadata.sensor!,devEui:`70b3d57ed006a10${i+1}`,displayName:n.name,sectionId:'demo-section',installationHeightM:height,
      measurementHeightsM:Object.fromEntries(livingMetrics.map(m=>[m,height]))}
  })
  map.objects = [rack(0, 1.3, 1.2), rack(1, 11.3, 1.2), rack(2, 1.3, 5.1), rack(3, 11.3, 5.1), rack(4, 1.3, 9), rack(5, 11.3, 9),
    ...map.objects.filter(o => ['door', 'reservoir', 'fan'].includes(o.type)), ...nodes]
  const end = new Date(); end.setMinutes(0, 0, 0)
  const start = end.getTime() - 24 * 3600_000
  const frames = Array.from({ length: 97 }, (_, i) => {
    const time = start + i * 15 * 60_000
    const hour = Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/Vilnius'}).format(new Date(time)))
    const sun = Math.max(0, Math.sin((hour - 6) * Math.PI / 12))
    return { observedAt: new Date(time).toISOString(), nodes: nodes.map((n, j) => ({ devEui: n.metadata.sensor!.devEui!.toLowerCase(), measuredAt: new Date(time).toISOString(), measurementHeightsM:n.metadata.sensor!.measurementHeightsM, measurements: {
      airTemperatureC: 18.8 + sun * (6 + (j%3) * .8) + (j%3) * .35 + (j>=3 ? .3 + sun*2.4 : 0),
      relativeHumidityPercent: 77 - sun * (17 + j * 2), co2Ppm: 680 - sun * (80 + j * 20), vpdKpa: .5 + sun * (.8 + j * .12),
    } })) }
  })
  const latest = frames.at(-1)!
  nodes.forEach((n, i) => { n.metadata.sensor = { ...n.metadata.sensor!, status: 'online', lastSeenAt: end.toISOString(), measurements: { ...latest.nodes[i].measurements, measuredAt: end.toISOString() } } })
  return {
    context: { area: { id: 'living-demo', name: map.name }, mapEnabled: true, map, revision: 1, updatedAt: end.toISOString(), nodes: nodes.map(n => n.metadata.sensor!), sections: [{id:'demo-section',name:'Demo',areaId:'living-demo',cropProfile:'demo-tomato',nodes:6}], profiles: [{id:'demo-tomato',name:'Demo tomatoes',metrics:{airTemp:{optimal:[20,27]},humidity:{optimal:[60,80]},vpd:{optimal:[.6,1.2]},co2:{optimal:[600,1000]}}}], permissions: { canEdit: false } },
    history: { areaId: 'living-demo', from: new Date(start).toISOString(), to: end.toISOString(), stepMinutes: 15, expectedNodes: nodes.map(n => n.metadata.sensor!.devEui!), frames,
      layouts: [{ revision: 1, map, validFrom: new Date(start - 1).toISOString(), validTo: null, source: 'recorded' }] },
  }
}
