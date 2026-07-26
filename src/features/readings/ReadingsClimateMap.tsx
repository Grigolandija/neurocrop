import { useEffect, useMemo, useRef, useState } from 'react'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import {
  areaMapRepository,
  type AreaMapContext,
} from '../greenhouse-map/services/areaMapRepository'
import { prepareReadOnlyClimateMap } from './prepareReadOnlyClimateMap'

const climateMetrics: MetricKey[] = ['air-temperature', 'relative-humidity', 'co2', 'vpd']

type Props = {
  areaId: string
  refreshToken: number
}

export default function ReadingsClimateMap({ areaId, refreshToken }: Props) {
  const [context, setContext] = useState<AreaMapContext | null>(null)
  const [metric, setMetric] = useState<MetricKey>('relative-humidity')
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const contextRef = useRef<AreaMapContext | null>(null)

  useEffect(() => {
    let cancelled = false
    const hasCurrentArea = contextRef.current?.area.id === areaId
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (hasCurrentArea) setUpdating(true)
      else {
        contextRef.current = null
        setContext(null)
        setStatus('loading')
      }
      setError('')
    })
    areaMapRepository.load(areaId)
      .then((next) => {
        if (cancelled) return
        if (!hasCurrentArea) {
          const savedMetric = next.map?.heatmapSettings.metric
          setMetric(savedMetric && climateMetrics.includes(savedMetric) ? savedMetric : 'air-temperature')
        }
        contextRef.current = next
        setContext(next)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (cancelled) return
        const message = loadError instanceof Error ? loadError.message : 'Climate map could not be loaded.'
        setError(message)
        if (contextRef.current?.area.id === areaId) setStatus('ready')
        else {
          contextRef.current = null
          setContext(null)
          setStatus('error')
        }
      })
      .finally(() => {
        if (!cancelled) setUpdating(false)
      })
    return () => { cancelled = true }
  }, [areaId, refreshToken])

  const map = useMemo(() => context ? prepareReadOnlyClimateMap(context, metric) : null, [context, metric])
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
        <span><i className="fa-solid fa-circle" /> Live estimate from {validNodes} valid node{validNodes === 1 ? '' : 's'}{updating ? <em className="nc-climate-refresh"><i className="fa-solid fa-rotate fa-spin" /> Updating…</em> : error ? <em className="nc-climate-refresh" data-state="warning" title={error}><i className="fa-solid fa-triangle-exclamation" /> Update delayed</em> : null}</span>
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
        legendHost={legendHost}
        selectedIds={[]}
        snap={false}
        onSelect={() => undefined}
        onMove={() => undefined}
        onUpdate={() => undefined}
        onAdd={() => undefined}
      />
    </div>
    <div className="nc-climate-map-legend-slot" ref={setLegendHost} />
    <footer><i className="fa-solid fa-circle-info" /> The Area heatmap uses every valid node. Hardware details remain available in Nodes.</footer>
  </section>
}
