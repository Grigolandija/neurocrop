import { translateInterfaceText as tx } from '../../i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import { getMetricMeasurementValue } from '../greenhouse-map/heatmap/heatmapMetrics'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import {
  areaMapRepository,
  type AreaMapContext,
  type AreaMapHistory,
} from '../greenhouse-map/services/areaMapRepository'
import { historyFrameEndIso, latestCompletedHistoryFrameIndex } from '../greenhouse-map/services/historyFrameSelection'
import { prepareReadOnlyClimateMap } from './prepareReadOnlyClimateMap'
import '../../styles/climate-map.css'

const heatmapMetrics = Object.keys(METRICS) as MetricKey[]
const soilEcDepthStorageKey = 'neurocrop-soil-ec-depth-cm-v1'
type ClimateTimeMode = 'live' | 'history'

type Props = {
  areaId: string
  refreshToken: number
  presentation?: 'readings' | 'overview'
  areaNavigation?: ReactNode
}

export default function ReadingsClimateMap({ areaId, refreshToken, presentation = 'readings', areaNavigation }: Props) {
  const navigate = useNavigate()
  const { language } = useInterfaceLanguage()
  const lithuanian = language === 'lt'
  const locale = lithuanian ? 'lt-LT' : 'en-GB'
  const [context, setContext] = useState<AreaMapContext | null>(null)
  const [history, setHistory] = useState<AreaMapHistory | null>(null)
  const [timeMode, setTimeMode] = useState<ClimateTimeMode>('live')
  const [historyIndex, setHistoryIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [metric, setMetric] = useState<MetricKey>('air-temperature')
  const [soilEcDepthCm, setSoilEcDepthCm] = useState<number | null>(() => {
    try {
      const saved = Number(window.localStorage.getItem(soilEcDepthStorageKey))
      return Number.isFinite(saved) && saved > 0 ? saved : null
    } catch {
      return null
    }
  })
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [canvasReady, setCanvasReady] = useState(false)
  const contextRef = useRef<AreaMapContext | null>(null)
  const handleCanvasRenderReady = useCallback(() => setCanvasReady(true), [])

  useEffect(() => {
    let cancelled = false
    const hasCurrentArea = contextRef.current?.area.id === areaId
    const hasPreviousArea = Boolean(contextRef.current)
    void Promise.resolve().then(() => {
      if (cancelled) return
      setCanvasReady(false)
      if (hasPreviousArea) setUpdating(true)
      else {
        contextRef.current = null
        setContext(null)
        setStatus('loading')
      }
      setError('')
    })
    Promise.allSettled([
      areaMapRepository.load(areaId),
      areaMapRepository.loadHistory(areaId),
    ])
      .then(([contextResult, historyResult]) => {
        if (cancelled) return
        if (contextResult.status === 'rejected') throw contextResult.reason
        const next = contextResult.value
        if (!hasCurrentArea) {
          const savedMetric = next.map?.heatmapSettings.metric
          setMetric(savedMetric && Object.hasOwn(METRICS, savedMetric) ? savedMetric : 'air-temperature')
          setTimeMode('live')
          setPlaying(false)
        }
        if (historyResult.status === 'fulfilled') {
          setHistory(historyResult.value)
          setHistoryIndex(latestCompletedHistoryFrameIndex(historyResult.value))
          setHistoryError(historyResult.value.frames.some((frame) => frame.nodes.length)
            ? ''
            : 'No historical climate measurements are available in the last 24 hours.')
        } else {
          setHistory(null)
          setHistoryError(historyResult.reason instanceof Error ? historyResult.reason.message : 'Historical climate data could not be loaded.')
        }
        contextRef.current = next
        setContext(next)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (cancelled) return
        const message = loadError instanceof Error ? loadError.message : 'Climate map could not be loaded.'
        setError(message)
        if (contextRef.current) setStatus('ready')
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

  useEffect(() => {
    if (!playing || timeMode !== 'history' || !history?.frames.length) return
    const timer = window.setInterval(() => {
      setHistoryIndex((current) => {
        if (current >= history.frames.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 700)
    return () => window.clearInterval(timer)
  }, [history, playing, timeMode])

  const historyFrame = timeMode === 'history' ? history?.frames[historyIndex] : null
  const historyFrameEnd = historyFrame && history
    ? historyFrameEndIso(historyFrame.observedAt, history.stepMinutes)
    : undefined
  const historyLayout = useMemo(() => {
    if (!historyFrame) return null
    const selectedAt = new Date(historyFrame.observedAt).getTime()
    return history?.layouts.find((layout) => {
      const validFrom = new Date(layout.validFrom).getTime()
      const validTo = layout.validTo ? new Date(layout.validTo).getTime() : Number.POSITIVE_INFINITY
      return validFrom <= selectedAt && selectedAt < validTo
    }) || null
  }, [history, historyFrame])
  const historyLayoutNodes = useMemo(() => {
    if (!context || !historyLayout) return null
    const currentNodes = new Map(context.nodes
      .filter((node) => node.devEui)
      .map((node) => [node.devEui!.toLowerCase(), node]))
    const seen = new Set<string>()
    return historyLayout.map.objects.flatMap((object) => {
      const configured = object.metadata.sensor
      const devEui = configured?.devEui?.toLowerCase()
      if (!configured || !devEui || seen.has(devEui)) return []
      seen.add(devEui)
      return [{
        ...currentNodes.get(devEui),
        ...configured,
        devEui,
        displayName: configured.displayName || object.name,
        areaId: context.area.id,
        status: 'warning' as const,
        measurements: {},
      }]
    })
  }, [context, historyLayout])
  const displayedContext = useMemo(() => {
    if (!context || !historyFrame) return context
    const frameNodes = new Map(historyFrame.nodes.map((node) => [node.devEui.toLowerCase(), node]))
    const baseNodes = historyLayoutNodes || context.nodes
    return {
      ...context,
      map: historyLayout?.map || context.map,
      nodes: baseNodes.map((node) => {
        const historical = node.devEui ? frameNodes.get(node.devEui.toLowerCase()) : undefined
        return {
          ...node,
          status: historical ? 'online' as const : 'stale' as const,
          lastSeenAt: historical?.measuredAt || historyFrame.observedAt,
          measurements: {
            ...historical?.measurements,
            measuredAt: historical?.measuredAt || historyFrame.observedAt,
          },
        }
      }),
    }
  }, [context, historyFrame, historyLayout, historyLayoutNodes])
  const measurementSets = useMemo(() => timeMode === 'history'
    ? (history?.frames.flatMap((frame) => frame.nodes.map((node) => node.measurements)) ?? [])
    : (context?.nodes.map((node) => node.measurements) ?? []), [context?.nodes, history?.frames, timeMode])
  const availableMetrics = useMemo(() => {
    return heatmapMetrics.filter((key) => measurementSets.some((measurements) => {
      if (key === 'soil-ec' && measurements?.soilEcByDepth?.length) return true
      const value = measurements?.[METRICS[key].field]
      return typeof value === 'number' && Number.isFinite(value)
    }))
  }, [measurementSets])
  const selectedMetric = availableMetrics.includes(metric) ? metric : availableMetrics[0] || metric
  const availableSoilEcDepths = useMemo(() => [...new Set(measurementSets.flatMap((measurements) =>
    measurements?.soilEcByDepth?.map((reading) => reading.depthCm) ?? []))].sort((left, right) => left - right), [measurementSets])
  const selectedSoilEcDepthCm = selectedMetric === 'soil-ec' && availableSoilEcDepths.length
    ? soilEcDepthCm !== null && availableSoilEcDepths.includes(soilEcDepthCm) ? soilEcDepthCm : availableSoilEcDepths[Math.floor(availableSoilEcDepths.length / 2)]
    : undefined
  const selectSoilEcDepth = (depthCm: number) => {
    setSoilEcDepthCm(depthCm)
    try {
      window.localStorage.setItem(soilEcDepthStorageKey, String(depthCm))
    } catch {
      // The selected depth still remains active for this session.
    }
  }

  const map = useMemo(() => displayedContext ? prepareReadOnlyClimateMap(displayedContext, selectedMetric) : null, [displayedContext, selectedMetric])
  const validSensorObjects = map?.objects.filter((object) => {
    const sensor = object.metadata.sensor
    if (!sensor || sensor.status === 'offline' || sensor.status === 'stale') return false
    return typeof getMetricMeasurementValue(sensor.measurements, selectedMetric, selectedSoilEcDepthCm) === 'number'
  }) ?? []
  const validNodes = validSensorObjects.length
  const latestMeasurementAt = validSensorObjects.reduce<Date | null>((latest, object) => {
    const measuredAt = object.metadata.sensor?.measurements?.measuredAt
    if (!measuredAt) return latest
    const candidate = new Date(measuredAt)
    if (Number.isNaN(candidate.getTime())) return latest
    return !latest || candidate > latest ? candidate : latest
  }, null)
  const updatedLabel = latestMeasurementAt
    ? `${timeMode === 'history' ? lithuanian ? 'Pasirinkta' : 'Selected' : lithuanian ? 'Atnaujinta' : 'Updated'} ${latestMeasurementAt.toLocaleString(locale, {
        month: timeMode === 'history' ? 'short' : undefined,
        day: timeMode === 'history' ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Timestamp unavailable'

  const overviewPresentation = presentation === 'overview'

  if (status === 'error') {
    return <div className="nc-climate-map-state" data-state="error" data-overview-heatmap-settled={presentation === 'overview' ? 'true' : undefined} aria-busy="false"><i className="fa-solid fa-triangle-exclamation" /><strong>{tx("Climate map could not be loaded")}</strong><span>{error}</span></div>
  }
  if (status === 'loading' || !map || !context) {
    return <div className="nc-climate-map-state" data-state={status} aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><strong>{tx("Loading live climate map…")}</strong><span>{tx("Combining the saved Area plan with current and historical node readings.")}</span></div>
  }
  if (!context.map) {
    return <div className="nc-climate-map-state" data-state="unconfigured" data-overview-heatmap-settled={overviewPresentation ? 'true' : undefined} aria-busy="false">
      <i className="fa-solid fa-map-location-dot" />
      <strong>{tx("Area map has not been created")}</strong>
      <span>{tx("Create and save an Area Map before a live climate heatmap is shown here.")}</span>
      {context.permissions.canEdit ? <button type="button" onClick={() => navigate(`/area-map?area=${encodeURIComponent(context.area.id)}`)}>{tx("Create Area Map")}</button> : null}
    </div>
  }

  const historyAvailable = Boolean(history?.frames.some((frame) => frame.nodes.length))
  const expectedNodes = timeMode === 'history' && historyLayoutNodes
    ? historyLayoutNodes.length
    : history?.expectedNodes.length || context.nodes.length
  const coveragePercent = expectedNodes ? Math.round(validNodes / expectedNodes * 100) : 0
  const layoutLabel = historyLayout?.source === 'recorded'
    ? lithuanian ? 'istorinis planas' : 'recorded layout'
    : historyLayout?.source === 'backfill'
      ? lithuanian ? 'ankstesnio plano įvertis' : 'legacy layout estimate'
      : lithuanian ? 'dabartinio plano atsarginis vaizdas' : 'current layout fallback'
  const layoutTitle = historyLayout?.source === 'recorded'
    ? lithuanian ? 'Naudojamas šiuo laiku galiojęs išsaugotas Area planas.' : 'Using the saved Area layout that was active at this time.'
    : lithuanian ? 'Šiam laikui tikslios plano versijos nėra, todėl naudojamas artimiausias turimas išdėstymas.' : 'No exact layout revision exists for this time, so the closest available layout is used.'
  const selectTimeMode = (next: ClimateTimeMode) => {
    if (next === 'history' && !historyAvailable) return
    setTimeMode(next)
    if (next === 'live') setPlaying(false)
  }
  const togglePlayback = () => {
    if (!history?.frames.length) return
    if (!playing && historyIndex >= history.frames.length - 1) setHistoryIndex(0)
    setPlaying((current) => !current)
  }

  return <section className={`nc-live-climate-map ${overviewPresentation ? 'nc-overview-presentation' : ''}`} data-overview-heatmap-settled={overviewPresentation && canvasReady ? 'true' : undefined} aria-label={`${context.area.name} live climate map`}>
    <header>
      <div className="nc-climate-map-summary">
        <p className="nc-overline">{timeMode === 'history' ? lithuanian ? 'Istorinis klimato žemėlapis' :tx("Historical climate map") : overviewPresentation ? lithuanian ? 'Klimato žemėlapis' : 'Climate map' :tx("Live climate map")}</p>
        {!overviewPresentation ? <h3>{context.area.name}</h3> : null}
        <span><i className={`fa-solid ${timeMode === 'history' ? 'fa-clock-rotate-left' : 'fa-circle'}`} /> {timeMode === 'history' ? lithuanian ? 'Istorija' :tx("History") : lithuanian ? 'Dabar' :tx("Live")}{!overviewPresentation ? <> · {validNodes} {lithuanian ? 'sensorių šalt.' : `sensor source${validNodes === 1 ? '' : 's'}`}</> : null} · {updatedLabel}{updating ? <em className="nc-climate-refresh"><i className="fa-solid fa-rotate fa-spin" /> {tx("Updating…")}</em> : error ? <em className="nc-climate-refresh" data-state="warning" title={error}><i className="fa-solid fa-triangle-exclamation" /> {tx("Update delayed")}</em> : null}</span>
      </div>
      {overviewPresentation ? <div className="nc-climate-area-navigation">{areaNavigation}</div> : null}
      <div className="nc-climate-map-filters">
        <div className="nc-climate-time-mode" aria-label={lithuanian ? 'Klimato žemėlapio laikas' : 'Climate map time'}>
          <button type="button" className={timeMode === 'live' ? 'active' : ''} onClick={() => selectTimeMode('live')}>{lithuanian ? 'Dabar' :tx("Live")}</button>
          <button type="button" className={timeMode === 'history' ? 'active' : ''} disabled={!historyAvailable} title={historyError || undefined} onClick={() => selectTimeMode('history')}>{lithuanian ? 'Istorija' :tx("History")}</button>
        </div>
        <label><span>{tx("Metric")}</span><select value={availableMetrics.length ? selectedMetric : ''} disabled={!availableMetrics.length} onChange={(event) => setMetric(event.target.value as MetricKey)}>{availableMetrics.length ? availableMetrics.map((key) => <option value={key} key={key}>{lithuanian ? METRICS[key].labelLt : METRICS[key].label}</option>) : <option value="">{lithuanian ? 'Nėra matavimų' : 'No measurements'}</option>}</select></label>
        {selectedMetric === 'soil-ec' && availableSoilEcDepths.length ? <label className="nc-climate-depth"><span>{lithuanian ? 'Gylis' : 'Depth'}</span><select value={selectedSoilEcDepthCm} onChange={(event) => selectSoilEcDepth(Number(event.target.value))}>{availableSoilEcDepths.map((depthCm) => <option value={depthCm} key={depthCm}>{depthCm} cm</option>)}</select></label> : null}
        {!overviewPresentation ? <span className="nc-climate-lock"><i className="fa-solid fa-lock" />{tx("Read only")}</span> : null}
      </div>
    </header>
    {timeMode === 'history' && history?.frames.length
      ? <div className="nc-climate-history-controls">
          <button type="button" className="nc-climate-playback" onClick={togglePlayback}>
            <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} />
            {playing ? lithuanian ? 'Pristabdyti' :tx("Pause") : lithuanian ? 'Paleisti' :tx("Play")}
          </button>
          <label>
            <span>{lithuanian ? '24 valandų istorija' :tx("24-hour history")}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, history.frames.length - 1)}
              step={1}
              value={historyIndex}
              onChange={(event) => {
                setPlaying(false)
                setHistoryIndex(Number(event.target.value))
              }}
              aria-label={lithuanian ? 'Istorinio klimato žemėlapio laikas' : 'Historical climate map time'}
            />
          </label>
          <strong>{new Date(history.frames[historyIndex].observedAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
          <span className="nc-climate-coverage" title={layoutTitle}><i className="fa-solid fa-signal" /> {lithuanian ? 'Duomenų padengimas' :tx("Data coverage")} {validNodes}/{expectedNodes} · {coveragePercent}% · {layoutLabel}</span>
        </div>
      : historyError
        ? <div className="nc-climate-history-warning"><i className="fa-solid fa-triangle-exclamation" /> {lithuanian ? 'Istorinis klimato žemėlapis nepasiekiamas:' :tx("Historical climate map unavailable:")} {historyError}</div>
        : null}
    <div className="nc-climate-map-canvas">
      <GreenhouseCanvas
        map={map}
        mode="environment"
        readOnly
        legendHost={legendHost}
        compactLegend={overviewPresentation}
        soilEcDepthCm={selectedSoilEcDepthCm}
        selectedIds={[]}
        snap={false}
        onSelect={() => undefined}
        onMove={() => undefined}
        onUpdate={() => undefined}
        onAdd={() => undefined}
        onRenderReady={handleCanvasRenderReady}
        referenceTime={historyFrameEnd}
      />
    </div>
    <div className="nc-climate-map-legend-slot" ref={setLegendHost} />
  </section>
}
