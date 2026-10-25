import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import { areaMapRepository, type AreaMapContext, type AreaMapHistory, type AreaSummary } from '../greenhouse-map/services/areaMapRepository'
import { livingDemo, livingMap, livingMetrics } from './livingData'
import { SpatialClimateMap } from './SpatialClimateMap'
import './living-greenhouse.css'

export default function LivingGreenhouse({ demoOnly = false }: { demoOnly?: boolean }) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'
  const text = (a: string, b: string) => lt ? a : b
  const [params, setParams] = useSearchParams()
  const [demo] = useState(() => livingDemo())
  const [observedNow, setObservedNow] = useState(() => Date.now())
  const [areas, setAreas] = useState<AreaSummary[]>([])
  const [areasReady, setAreasReady] = useState(demoOnly)
  const [context, setContext] = useState<AreaMapContext | null>(demoOnly ? demo.context : null)
  const [history, setHistory] = useState<AreaMapHistory | null>(demoOnly ? demo.history : null)
  const [metric, setMetric] = useState<MetricKey>('air-temperature')
  const [index, setIndex] = useState<number | null>(demoOnly ? demo.history.frames.reduce((best, f, i, all) => f.nodes[3].measurements.airTemperatureC! > all[best].nodes[3].measurements.airTemperatureC! ? i : best, 0) : null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [engine, setEngine] = useState('')
  const [refresh, setRefresh] = useState(0)
  const historyRequest = useRef(0)
  const currentArea = params.get('area') || areas.find(a=>a.mapEnabled && a.mapConfigured)?.id || areas.find(a=>a.mapEnabled)?.id || areas[0]?.id || ''
  const resolvedContext = demoOnly ? demo.context : context?.area.id === currentArea ? context : null
  const frame = index === null ? null : history?.frames[index]
  const at = frame ? Date.parse(frame.observedAt) + (history?.stepMinutes || 0) * 60_000 : demoOnly ? Date.parse(demo.history.to) : observedNow
  const map = useMemo(() => resolvedContext ? livingMap(resolvedContext, history, index) : null, [resolvedContext, history, index])
  const scale = useMemo(() => {
    const values = history?.frames.flatMap(f => f.nodes.flatMap(n => {
      const v = n.measurements[METRICS[metric].field as keyof typeof n.measurements]
      return typeof v === 'number' && Number.isFinite(v) ? [v] : []
    })) || []
    if (!values.length) return undefined
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(METRICS[metric].minimumSpan, max-min)
    return { min: Math.max(METRICS[metric].bounds[0], (min+max-span)/2), max: Math.min(METRICS[metric].bounds[1], (min+max+span)/2) }
  }, [history, metric])
  const metricOptions=livingMetrics.filter(m=>m===metric || map?.objects.some(o=>typeof o.metadata.sensor?.measurements?.[METRICS[m].field]==='number' || typeof o.metadata.sensor?.lastMeasurements?.[METRICS[m].field]==='number'))
  const clock = (stamp: string) => new Date(stamp).toLocaleTimeString(lt ? 'lt-LT' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' })

  useEffect(() => {
    if (demoOnly) return
    let cancelled = false
    areaMapRepository.listAreas().then(value => { if (!cancelled) { setAreas(value); setAreasReady(true) } }).catch(() => { if (!cancelled) { setError('areas'); setAreasReady(true) } })
    return () => { cancelled = true }
  }, [demoOnly, refresh])
  useEffect(() => {
    if (demoOnly || !currentArea) return
    let cancelled = false
    areaMapRepository.load(currentArea).then(value => { if (!cancelled) { setContext(value); setObservedNow(Date.now()); setError('') } }).catch(() => { if (!cancelled) setError('map') })
    return () => { cancelled = true }
  }, [demoOnly, currentArea, refresh])
  useEffect(() => {
    if (demoOnly || index !== null) return
    const timer = setInterval(() => setRefresh(v => v+1), 60_000)
    return () => clearInterval(timer)
  }, [demoOnly, index])
  useEffect(() => {
    if (!playing || !history?.frames.length) return
    const timer = setInterval(() => setIndex(i => ((i ?? -1)+1) % history.frames.length), 650)
    return () => clearInterval(timer)
  }, [playing, history])
  useEffect(() => () => { historyRequest.current += 1 }, [])
  async function showHistory() {
    if (history) { setIndex(history.frames.length-1); return }
    const request = ++historyRequest.current
    setLoadingHistory(true); setHistoryError('')
    try {
      const value = await areaMapRepository.loadHistory(currentArea)
      if (request !== historyRequest.current) return
      if (!value.frames.length) { setHistoryError('empty'); return }
      setHistory(value); setIndex(value.frames.length-1)
    } catch { if (request === historyRequest.current) setHistoryError('failed') }
    finally { if (request === historyRequest.current) setLoadingHistory(false) }
  }
  function chooseArea(area: string) { historyRequest.current += 1; setLoadingHistory(false); setPlaying(false); setIndex(null); setHistory(null); setHistoryError(''); setContext(null); setError(''); setParams({ area }) }
  const loading = !demoOnly && !error && (!areasReady || Boolean(currentArea && !resolvedContext))
  const hasFrames = Boolean(history?.frames.length)

  const Root = demoOnly ? 'main' : 'section'
  return <Root className="nc-living" data-view="spatial" data-demo={demoOnly} data-integrated={!demoOnly} aria-label={text('3D išdėstymas','3D layout')}>
    {demoOnly ? <header className="nc-living-topbar"><Link to="/areas" className="nc-living-brand"><i className="fa-solid fa-seedling" />NeuroCrop</Link><span className="nc-living-prototype">{text('Demonstracija','Demonstration')}</span><Link to="/areas" className="nc-living-back">{text('Grįžti į plotus','Back to areas')}</Link></header> : null}
    <section className="nc-living-heading"><div><p>{text('IŠSAUGOTAS IŠDĖSTYMAS','SAVED LAYOUT')}</p><h1>{text('3D išdėstymas','3D layout')}</h1><p className="nc-living-description">{text('Erdvinis klimato žemėlapis pagal sensorių vietas ir aukščius. Šį vaizdą taip pat rasite apžvalgoje.','Spatial climate map from sensor positions and heights. Also available in Overview.')}</p></div>
      {demoOnly ? <div className="nc-living-source"><span data-demo="true"><i />{text('Demonstraciniai duomenys','Demonstration data')}</span><small>{text('Pavyzdinis planas ir sintetiniai matavimai','Example layout and synthetic measurements')}</small></div> : <div className="nc-living-setup-links">{currentArea && resolvedContext?.permissions.canEdit ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}><i className="fa-solid fa-draw-polygon" />{text('Redaguoti planą','Edit layout')}</Link> : null}<Link to="/nodes">{text('Mazgai ir jų aukščiai','Nodes and their heights')}</Link></div>}
    </section>
    <section className="nc-living-workspace">
      <div className="nc-living-toolbar"><div className="nc-living-area">{demoOnly ? <strong>{demo.context.area.name}</strong> : <label><span className="sr-only">{text('Šiltnamis','Greenhouse')}</span><select value={currentArea} onChange={e=>chooseArea(e.target.value)}>{areas.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}<span>{map ? `${map.dimensions.widthM} × ${map.dimensions.lengthM} m` : '—'}</span></div>
        <label className="nc-living-metric"><span className="sr-only">{text('Rodiklis','Metric')}</span><select value={metric} onChange={e=>{setMetric(e.target.value as MetricKey)}}>{metricOptions.map(m=><option value={m} key={m}>{lt ? METRICS[m].labelLt : METRICS[m].label}</option>)}</select></label>
        <div className="nc-living-time-mode" aria-label={text('Laiko režimas','Time mode')}><button type="button" aria-pressed={index===null} onClick={()=>{setPlaying(false);setIndex(null)}}>{text('Dabar','Now')}</button><button type="button" aria-pressed={index!==null} disabled={loadingHistory || !resolvedContext} onClick={()=>void showHistory()}>{loadingHistory ? text('Kraunama…','Loading…') : text('24 valandos','24 hours')}</button></div>
      </div>
      {historyError ? <div className="nc-living-notice" role="status">{historyError==='empty' ? text('Per paskutines 24 valandas istorinių matavimų nėra.','No historical measurements in the last 24 hours.') : text('Istorijos nepavyko įkelti. Bandykite dar kartą.','History could not be loaded. Please try again.')}</div> : null}
      <SpatialClimateMap key={currentArea} map={map} context={resolvedContext} metric={metric} at={at} historyTime={frame?.observedAt} index={index} scale={index === null ? undefined : scale} loading={loading} error={error} onRetry={()=>{setError('');setRefresh(v=>v+1)}} onRendererReady={setEngine} />
      <footer className="nc-living-timeline"><button type="button" className="nc-living-play" disabled={!hasFrames || index===null} aria-label={playing ? text('Pristabdyti','Pause') : text('Paleisti istoriją','Play history')} onClick={()=>setPlaying(v=>!v)}><i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} /></button><div className="nc-living-timeline-label"><strong>{frame ? clock(frame.observedAt) : text('Dabar','Now')}</strong><span>{frame ? new Date(frame.observedAt).toLocaleDateString(lt?'lt-LT':'en-GB',{month:'short',day:'numeric',timeZone:'Europe/Vilnius'}) : text('Pasirinkite „24 valandos“','Select 24 hours')}</span></div><div className="nc-living-scrubber"><label className="sr-only" htmlFor="living-time">{text('Istorijos laikas','History time')}</label><input id="living-time" type="range" min={0} max={Math.max(1,(history?.frames.length || 1)-1)} value={index ?? (history?.frames.length || 1)-1} disabled={!hasFrames || index===null} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value))}} /><div><span>{history?.frames[0] ? clock(history.frames[0].observedAt) : '−24 h'}</span><span>{text('Europe/Vilnius · įrašyti intervalai','Europe/Vilnius · recorded intervals')}</span><span>{history?.frames.at(-1) ? clock(history.frames.at(-1)!.observedAt) : text('Dabar','Now')}</span></div></div><span className="nc-living-engine">{engine || '3D'}<i /></span></footer>
    </section>
    <footer className="nc-living-bottom"><span>{text('Vilkite, kad pasuktumėte · ratukas — priartinti','Drag to orbit · scroll to zoom')}</span>{demoOnly ? <Link to="/greenhouse-live">{text('Atverti savo 3D išdėstymą','Open my 3D layout')} ↗</Link> : null}</footer>
  </Root>
}
