import { translateInterfaceText as tx } from '../../i18n'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { getMetricIdByHeatmapKey } from '../../domain/metricRegistry'
import { useInterfaceLanguage } from '../../i18n'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import type { HeatmapColorMode } from '../greenhouse-map/heatmap/heatmapColorScale'
import { getMetricMeasurementTime, getMetricMeasurementValue } from '../greenhouse-map/heatmap/heatmapMetrics'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import {
  areaMapRepository,
  type AreaMapContext,
  type AreaMapHistory,
} from '../greenhouse-map/services/areaMapRepository'
import { historyFrameEndIso, latestCompletedHistoryFrameIndex } from '../greenhouse-map/services/historyFrameSelection'
import { prepareReadOnlyClimateMap } from './prepareReadOnlyClimateMap'
import '../../styles/climate-map.css'

const SpatialClimateMap = lazy(() => import('../living-greenhouse/SpatialClimateMap'))

const heatmapMetrics = Object.keys(METRICS) as MetricKey[]
const soilEcDepthStorageKey = 'neurocrop-soil-ec-depth-cm-v1'
const colorModeStorageKey = 'neurocrop-climate-map-color-mode-v1'
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
  const [observedNow, setObservedNow] = useState(() => Date.now())
  const [mapView, setMapView] = useState<'2d' | '3d'>('3d')
  const [timeMode, setTimeMode] = useState<ClimateTimeMode>('live')
  const [historyIndex, setHistoryIndex] = useState(0)
  const [historyError, setHistoryError] = useState('')
  const [metric, setMetric] = useState<MetricKey>('air-temperature')
  const [colorMode, setColorMode] = useState<HeatmapColorMode>(() => {
    try {
      return window.localStorage.getItem(colorModeStorageKey) === 'contrast' ? 'contrast' : 'condition'
    } catch {
      return 'condition'
    }
  })
  const [soilEcDepthCm, setSoilEcDepthCm] = useState<number | null>(() => {
    try {
      const saved = Number(window.localStorage.getItem(soilEcDepthStorageKey))
      return Number.isFinite(saved) && saved > 0 ? saved : null
    } catch {
      return null
    }
  })
  const [legendHost, setLegendHost] = useState<HTMLDivElement | null>(null)
  const [soilProfileHost, setSoilProfileHost] = useState<HTMLDivElement | null>(null)
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
        setObservedNow(Date.now())
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
    if (mapView !== '3d' || timeMode !== 'live') return
    const timer = window.setInterval(() => setObservedNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [mapView, timeMode])

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
  const selectedMetric = metric
  const selectedMetricId = getMetricIdByHeatmapKey(selectedMetric)
  const target = useMemo<[number, number] | undefined>(() => {
    if (!context || !selectedMetricId) return undefined
    const profileByReference = new Map(context.profiles.flatMap((profile) => [
      [profile.id, profile] as const,
      [profile.name, profile] as const,
    ]))
    const ranges = context.sections.flatMap((section) => {
      const profile = section.cropProfile ? profileByReference.get(section.cropProfile) : undefined
      const optimal = profile?.metrics[selectedMetricId]?.optimal
      return optimal && Number.isFinite(optimal[0]) && Number.isFinite(optimal[1]) && optimal[0] <= optimal[1]
        ? [optimal]
        : []
    })
    if (!ranges.length) return undefined
    const sharedLow = Math.max(...ranges.map((range) => range[0]))
    const sharedHigh = Math.min(...ranges.map((range) => range[1]))
    return sharedLow <= sharedHigh ? [sharedLow, sharedHigh] : undefined
  }, [context, selectedMetricId])
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
  const selectColorMode = (next: HeatmapColorMode) => {
    setColorMode(next)
    try {
      window.localStorage.setItem(colorModeStorageKey, next)
    } catch {
      // The selected colour mode still remains active for this session.
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
    const measuredAt = getMetricMeasurementTime(object.metadata.sensor?.measurements, selectedMetric)
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
  }
  const stepHistory = (direction: -1 | 1) => setHistoryIndex((current) =>
    Math.max(0, Math.min((history?.frames.length ?? 1) - 1, current + direction)))

  return <section className={`nc-live-climate-map ${overviewPresentation ? 'nc-overview-presentation' : ''}`} data-overview-heatmap-settled={overviewPresentation && canvasReady ? 'true' : undefined} aria-label={`${context.area.name} live climate map`}>
    <header className="nc-climate-toolbar">
      {overviewPresentation ? <div className="nc-climate-area-navigation">{areaNavigation}</div> : <strong>{context.area.name}</strong>}
      <div className="nc-climate-map-filters">
        <label className="nc-climate-filter-control nc-climate-metric-control"><span className="sr-only">{tx("Metric")}</span><select value={selectedMetric} onChange={(event) => setMetric(event.target.value as MetricKey)}>{heatmapMetrics.map((key) => <option value={key} key={key}>{lithuanian ? METRICS[key].labelLt : METRICS[key].label}</option>)}</select></label>
        {selectedMetric === 'soil-ec' && availableSoilEcDepths.length ? <label className="nc-climate-filter-control nc-climate-depth"><span className="sr-only">{lithuanian ? 'Gylis' : 'Depth'}</span><select value={selectedSoilEcDepthCm} onChange={(event) => selectSoilEcDepth(Number(event.target.value))}>{availableSoilEcDepths.map((depthCm) => <option value={depthCm} key={depthCm}>{depthCm} cm</option>)}</select></label> : null}
        <div className="nc-climate-view-mode" role="group" aria-label={lithuanian ? 'Žemėlapio vaizdas' : 'Map view'}>
          <button type="button" className={mapView === '2d' ? 'active' : ''} aria-pressed={mapView === '2d'} onClick={() => setMapView('2d')}>2D</button>
          <button type="button" className={mapView === '3d' ? 'active' : ''} aria-pressed={mapView === '3d'} onClick={() => { setObservedNow(Date.now()); setMapView('3d') }}>3D</button>
        </div>
        <button type="button" className="nc-climate-history-toggle" aria-pressed={timeMode === 'history'} disabled={!historyAvailable} title={historyError || undefined} onClick={() => selectTimeMode(timeMode === 'history' ? 'live' : 'history')}><i className={`fa-solid ${timeMode === 'history' ? 'fa-xmark' : 'fa-clock-rotate-left'}`} />{timeMode === 'history' ? lithuanian ? 'Grįžti į dabar' : 'Back to live' : lithuanian ? 'Istorija' : 'History'}</button>
        <details className="nc-climate-options" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}>
          <summary aria-label={lithuanian ? 'Žemėlapio nustatymai ir duomenys' : 'Map settings and data'} title={lithuanian ? 'Nustatymai ir duomenys' : 'Settings and data'}><i className="fa-solid fa-ellipsis" /></summary>
          <div className="nc-climate-options-panel">
            <strong>{lithuanian ? 'Spalvos' : 'Colours'}</strong>
            <div className="nc-climate-color-mode" role="group" aria-label={lithuanian ? 'Žemėlapio spalvų režimas' : 'Map colour mode'}>
              <button type="button" className={colorMode === 'condition' ? 'active' : ''} aria-pressed={colorMode === 'condition'} onClick={() => selectColorMode('condition')}>{lithuanian ? 'Būklė' : 'Condition'}</button>
              <button type="button" className={colorMode === 'contrast' ? 'active' : ''} aria-pressed={colorMode === 'contrast'} onClick={() => selectColorMode('contrast')}>{lithuanian ? 'Kontrastas' : 'Contrast'}</button>
            </div>
            <p>{colorMode === 'condition' ? lithuanian ? 'Ta pati reikšmė išlaiko tą pačią spalvą.' : 'A value keeps the same colour over time.' : lithuanian ? 'Išryškinami skirtumai pasirinktame kadre. Spalvos nerodo augalo būklės.' : 'Highlights differences in this frame. Colours do not indicate crop health.'}</p>
            <span>{updatedLabel}</span>
            {timeMode === 'history' ? <span title={layoutTitle}>{lithuanian ? 'Duomenų padengimas' : 'Data coverage'}: {validNodes}/{expectedNodes} · {coveragePercent}% · {layoutLabel}</span> : null}
            {historyError ? <span>{lithuanian ? 'Istorija nepasiekiama.' : 'History unavailable.'}</span> : null}
          </div>
        </details>
        {updating ? <i className="fa-solid fa-rotate fa-spin nc-climate-update-icon" aria-label={lithuanian ? 'Atnaujinama' : 'Updating'} /> : error ? <span className="nc-climate-update-warning" title={error}><i className="fa-solid fa-triangle-exclamation" />{tx("Update delayed")}</span> : null}
      </div>
    </header>
    {timeMode === 'history' && history?.frames.length
      ? <div className="nc-climate-history-controls">
          <div className="nc-climate-history-stepper" aria-label={lithuanian ? 'Keisti istorijos laiką' : 'Change history time'}>
            <button type="button" onClick={() => stepHistory(-1)} disabled={historyIndex === 0} title={lithuanian ? 'Ankstesnis laikas' : 'Previous time'} aria-label={lithuanian ? 'Ankstesnis laikas' : 'Previous time'}><i className="fa-solid fa-arrow-left" /></button>
            <button type="button" onClick={() => stepHistory(1)} disabled={historyIndex === history.frames.length - 1} title={lithuanian ? 'Kitas laikas' : 'Next time'} aria-label={lithuanian ? 'Kitas laikas' : 'Next time'}><i className="fa-solid fa-arrow-right" /></button>
          </div>
          <label>
            <span>{lithuanian ? '24 valandų istorija' :tx("24-hour history")}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, history.frames.length - 1)}
              step={1}
              value={historyIndex}
              onChange={(event) => {
                setHistoryIndex(Number(event.target.value))
              }}
              aria-label={lithuanian ? 'Istorinio klimato žemėlapio laikas' : 'Historical climate map time'}
            />
          </label>
          <strong>{new Date(history.frames[historyIndex].observedAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
          {historyLayout?.source !== 'recorded' ? <span className="nc-climate-coverage" title={layoutTitle}><i className="fa-solid fa-circle-info" />{layoutLabel}</span> : null}
        </div>
      : timeMode === 'history' && historyError
        ? <div className="nc-climate-history-warning"><i className="fa-solid fa-triangle-exclamation" /> {lithuanian ? 'Istorinis klimato žemėlapis nepasiekiamas:' :tx("Historical climate map unavailable:")} {historyError}</div>
        : null}
    {mapView === '3d' ? <Suspense fallback={<div className="nc-climate-map-state" aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><strong>{lithuanian ? 'Atveriamas erdvinis žemėlapis…' : 'Opening spatial map…'}</strong></div>}>
      <SpatialClimateMap key={context.area.id} context={context} history={history} index={timeMode === 'history' ? historyIndex : null} historyTime={historyFrame?.observedAt} metric={selectedMetric} colorMode={colorMode} soilEcDepthCm={selectedSoilEcDepthCm} at={historyFrameEnd ? Date.parse(historyFrameEnd) : observedNow} onReady={handleCanvasRenderReady} onFallback={() => setMapView('2d')} />
    </Suspense> : <div className="nc-climate-map-canvas">
      <GreenhouseCanvas
        map={map}
        mode="environment"
        readOnly
        showObjectNames={false}
        legendHost={legendHost}
        soilProfileHost={soilProfileHost}
        compactLegend={overviewPresentation}
        soilEcDepthCm={selectedSoilEcDepthCm}
        language={lithuanian ? 'lt' : 'en'}
        selectedIds={[]}
        snap={false}
        onSelect={() => undefined}
        onMove={() => undefined}
        onUpdate={() => undefined}
        onAdd={() => undefined}
        onRenderReady={handleCanvasRenderReady}
        referenceTime={historyFrameEnd}
        target={target}
        colorMode={colorMode}
      />
    </div>}
    <div className="nc-climate-soil-section-slot" ref={setSoilProfileHost} />
    <div className="nc-climate-map-legend-slot" ref={setLegendHost} />
  </section>
}
