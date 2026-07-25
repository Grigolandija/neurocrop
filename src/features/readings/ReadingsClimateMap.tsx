import { useEffect, useMemo, useState } from 'react'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import { METRICS, type GreenhouseMap, type MetricKey } from '../greenhouse-map/model'
import {
  areaMapRepository,
  createAreaMap,
  mergeAreaMapContext,
  type AreaMapContext,
} from '../greenhouse-map/services/areaMapRepository'

const climateMetrics: MetricKey[] = ['air-temperature', 'relative-humidity', 'co2', 'vpd', 'root-temperature']
const profileMetricKeys: Record<MetricKey, string> = {
  'air-temperature': 'airTemp',
  'relative-humidity': 'humidity',
  co2: 'co2',
  vpd: 'vpd',
  'root-temperature': 'soilTemp',
}

type Props = {
  areaId: string
  refreshToken: number
}

function prepareReadOnlyMap(context: AreaMapContext, metric: MetricKey): GreenhouseMap {
  const source = context.map
    ? mergeAreaMapContext(context.map, context.area, context.nodes, context.sections)
    : createAreaMap(context.area, context.nodes, context.sections)
  const visibleLayerIds = new Set(['structure', 'cultivation', 'irrigation', 'climate', 'lighting', 'sensors', 'environment', 'labels'])
  return {
    ...source,
    layers: source.layers.map((layer) => ({
      ...layer,
      visible: visibleLayerIds.has(layer.id),
      locked: true,
      opacity: layer.id === 'environment' ? Math.max(.72, layer.opacity) : layer.opacity,
    })),
    objects: source.objects.flatMap((object) => object.type === 'section-zone' ? [] : [{ ...object, locked: true }]),
    heatmapSettings: {
      ...source.heatmapSettings,
      enabled: true,
      metric,
      scaleMode: 'auto',
      showConfidence: true,
    },
  }
}

export default function ReadingsClimateMap({ areaId, refreshToken }: Props) {
  const [context, setContext] = useState<AreaMapContext | null>(null)
  const [metric, setMetric] = useState<MetricKey>('relative-humidity')
  const [sectionId, setSectionId] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setStatus('loading')
      setError('')
      setSelectedIds([])
    })
    areaMapRepository.load(areaId)
      .then((next) => {
        if (cancelled) return
        setContext(next)
        setSectionId((current) => next.sections.some((section) => section.id === current) ? current : '')
        setStatus('ready')
      })
      .catch((loadError) => {
        if (cancelled) return
        setContext(null)
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : 'Climate map could not be loaded.')
      })
    return () => { cancelled = true }
  }, [areaId, refreshToken])

  const map = useMemo(() => context ? prepareReadOnlyMap(context, metric) : null, [context, metric])
  const selectedSection = context?.sections.find((section) => section.id === sectionId)
  const selectedProfile = context?.profiles.find((profile) => profile.id === selectedSection?.cropProfile)
  const target = selectedProfile?.metrics?.[profileMetricKeys[metric]]?.optimal
  const selectedSensor = map?.objects.find((object) => object.id === selectedIds[0] && object.type === 'sensor-node')
  const selectedMeasurement = selectedSensor?.metadata.sensor?.measurements?.[METRICS[metric].field]
  const validNodes = map?.objects.filter((object) => {
    const sensor = object.metadata.sensor
    if (!sensor || sensor.status === 'offline' || sensor.status === 'stale') return false
    if (sectionId && sensor.sectionId !== sectionId) return false
    return typeof sensor.measurements?.[METRICS[metric].field] === 'number'
  }).length ?? 0

  if (status === 'error') {
    return <div className="nc-climate-map-state" data-state="error"><i className="fa-solid fa-triangle-exclamation" /><strong>Climate map could not be loaded</strong><span>{error}</span></div>
  }
  if (status === 'loading' || !map || !context) {
    return <div className="nc-climate-map-state" data-state={status}><i className="fa-solid fa-spinner fa-spin" /><strong>Loading live climate map…</strong><span>Combining the saved Area plan with current node readings.</span></div>
  }

  return <section className="nc-live-climate-map" aria-label={`${context.area.name} live climate map`}>
    <header>
      <div>
        <p className="nc-overline">Read-only spatial view</p>
        <h3>{context.area.name}</h3>
        <span><i className="fa-solid fa-circle" /> Live estimate from {validNodes} valid node{validNodes === 1 ? '' : 's'}</span>
      </div>
      <div className="nc-climate-map-filters">
        <label><span>Metric</span><select value={metric} onChange={(event) => { setMetric(event.target.value as MetricKey); setSelectedIds([]) }}>{climateMetrics.map((key) => <option value={key} key={key}>{METRICS[key].label}</option>)}</select></label>
        <label><span>Section</span><select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setSelectedIds([]) }}><option value="">Whole Area</option>{context.sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label>
      </div>
    </header>
    <div className="nc-climate-map-canvas">
      <GreenhouseCanvas
        map={map}
        mode="environment"
        readOnly
        measurementSectionId={sectionId}
        highlightSectionId={sectionId}
        target={target}
        selectedIds={selectedIds}
        snap={false}
        onSelect={setSelectedIds}
        onMove={() => undefined}
        onUpdate={() => undefined}
        onAdd={() => undefined}
      />
      {selectedSensor ? <aside className="nc-climate-node-card">
        <button type="button" onClick={() => setSelectedIds([])} aria-label="Close node reading"><i className="fa-solid fa-xmark" /></button>
        <small>{selectedSensor.metadata.sensor?.sectionName || 'Unassigned node'}</small>
        <strong>{selectedSensor.name}</strong>
        <b>{typeof selectedMeasurement === 'number' ? selectedMeasurement.toFixed(metric === 'vpd' ? 2 : metric === 'co2' ? 0 : 1) : '—'} <em>{METRICS[metric].unit}</em></b>
        <span>{selectedSensor.metadata.sensor?.status || 'unknown'} · {selectedSensor.metadata.sensor?.lastSeenAt ? new Date(selectedSensor.metadata.sensor.lastSeenAt).toLocaleString() : 'No timestamp'}</span>
      </aside> : null}
    </div>
    <footer><i className="fa-solid fa-circle-info" /> Interpolated values between nodes are estimates. Sensor positions can only be changed in Area Map.</footer>
  </section>
}
