import { useEffect, useMemo, useState } from 'react'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import { METRICS, type GreenhouseMap, type MetricKey } from '../greenhouse-map/model'
import {
  areaMapRepository,
  createAreaMap,
  mergeAreaMapContext,
  type AreaMapContext,
} from '../greenhouse-map/services/areaMapRepository'

const climateMetrics: MetricKey[] = ['air-temperature', 'relative-humidity', 'co2', 'vpd']

type Props = {
  areaId: string
  refreshToken: number
}

function prepareReadOnlyMap(context: AreaMapContext, metric: MetricKey): GreenhouseMap {
  const source = context.map
    ? mergeAreaMapContext(context.map, context.area, context.nodes, context.sections)
    : createAreaMap(context.area, context.nodes, context.sections)
  const visibleLayerIds = new Set(['structure', 'cultivation', 'irrigation', 'climate', 'lighting', 'environment', 'labels'])
  return {
    ...source,
    layers: source.layers.map((layer) => ({
      ...layer,
      visible: visibleLayerIds.has(layer.id),
      locked: true,
      opacity: layer.id === 'environment' ? 1 : layer.opacity,
    })),
    objects: source.objects.flatMap((object) => object.type === 'section-zone' ? [] : [{ ...object, locked: true }]),
    heatmapSettings: {
      ...source.heatmapSettings,
      enabled: true,
      metric,
      opacity: Math.max(.88, source.heatmapSettings.opacity),
      scaleMode: 'auto',
      showConfidence: true,
    },
  }
}

export default function ReadingsClimateMap({ areaId, refreshToken }: Props) {
  const [context, setContext] = useState<AreaMapContext | null>(null)
  const [metric, setMetric] = useState<MetricKey>('relative-humidity')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setStatus('loading')
      setError('')
    })
    areaMapRepository.load(areaId)
      .then((next) => {
        if (cancelled) return
        setContext(next)
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
  const validNodes = map?.objects.filter((object) => {
    const sensor = object.metadata.sensor
    if (!sensor || sensor.status === 'offline' || sensor.status === 'stale') return false
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
        <label><span>Metric</span><select value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)}>{climateMetrics.map((key) => <option value={key} key={key}>{METRICS[key].label}</option>)}</select></label>
      </div>
    </header>
    <div className="nc-climate-map-canvas">
      <GreenhouseCanvas
        map={map}
        mode="environment"
        readOnly
        selectedIds={[]}
        snap={false}
        onSelect={() => undefined}
        onMove={() => undefined}
        onUpdate={() => undefined}
        onAdd={() => undefined}
      />
    </div>
    <footer><i className="fa-solid fa-circle-info" /> The Area heatmap uses every valid node. Hardware details remain available in Nodes.</footer>
  </section>
}
