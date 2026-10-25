import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import { areaMapRepository, type AreaMapContext, type AreaMapHistory, type AreaSummary } from '../greenhouse-map/services/areaMapRepository'
import { createLivingScene, type LivingScene } from './gpuScene'
import { livingDemo, livingMap, livingMetrics, measuredSensors } from './livingData'
import { sceneGeometry } from './sceneGeometry'
import { planToScene, project } from './sceneMath'
import { liveTarget, verticalComparisons } from './spatialEvidence'
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
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [engine, setEngine] = useState('')
  const [renderError, setRenderError] = useState(false)
  const historyRequest = useRef(0)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<LivingScene | null>(null)
  const pins = useRef(new Map<string, HTMLButtonElement>())
  const currentGeometry = useRef<ReturnType<typeof sceneGeometry> | null>(null)
  const dimensions = useRef({ widthM: 20, lengthM: 12 })
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
  const readings=useMemo(()=>map ? measuredSensors(map,metric,at) : [],[map,metric,at])
  const targets=useMemo(()=>new Map(readings.map(r=>[r.object.id,index===null && resolvedContext ? liveTarget(resolvedContext,r,metric) : null])),[readings,index,resolvedContext,metric])
  const attentionIds=useMemo(()=>new Set(readings.filter(r=>{const t=targets.get(r.object.id);return t && r.value!==null && (r.value<t[0] || r.value>t[1])}).map(r=>r.object.id)),[readings,targets])
  const geometry = useMemo(() => map ? sceneGeometry(map, metric, at, scale, {view:'points',attentionIds}) : null, [map, metric, at, scale, attentionIds])
  const visibleReadings=readings.slice().sort((a,b)=>Number(attentionIds.has(b.object.id))-Number(attentionIds.has(a.object.id)))
  const measured=visibleReadings.filter(s=>s.value!==null)
  const delayed=visibleReadings.filter(s=>s.delayed)
  const assessedCount=measured.filter(s=>targets.get(s.object.id)).length
  const metricOptions=livingMetrics.filter(m=>m===metric || map?.objects.some(o=>typeof o.metadata.sensor?.measurements?.[METRICS[m].field]==='number' || typeof o.metadata.sensor?.lastMeasurements?.[METRICS[m].field]==='number'))
  const focused=readings.find(s=>s.object.id===selected)
  const comparison=useMemo(()=>map ? verticalComparisons(readings,map)[0] : undefined,[readings,map])
  const unknownHeights=readings.filter(r=>r.heightM===null).length
  const heightText=(height:number | null)=>height===null ? text('Aukštis nenurodytas','Height not specified') : `${height.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:2})} m`
  const number = (v: number) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: METRICS[metric].decimals })
  const displayValue=(s:typeof readings[number])=>s.value ?? s.lastValue
  const pointColor=(s:typeof readings[number])=>s.value===null ? s.delayed ? '#9a6a20' : '#778b7d' : attentionIds.has(s.object.id) ? '#a36a14' : '#28694f'
  const ageText=(s:typeof readings[number])=>{
    const stamp=s.value===null ? s.lastTimestamp : s.timestamp
    if(!stamp)return text('Nėra matavimo','No reading')
    const minutes=Math.max(0,Math.round((at-Date.parse(stamp))/60000))
    return minutes<1 ? text('Ką tik','Just now') : minutes<60 ? `${minutes} ${text('min. prieš','min ago')}` : `${Math.floor(minutes/60)} ${text('val.','h')} ${minutes%60} ${text('min. prieš','min ago')}`
  }
  const readingLabel=(s:typeof readings[number])=>s.delayed ? text('Vėluoja · paskutinis matavimas','Delayed · last reading') : s.value===null ? text('Matavimo nėra','No reading') : text('Naujas matavimas','Current reading')
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
  useEffect(() => {
    if (!host.current || !map) return
    let cancelled = false
    const element = host.current
    createLivingScene(element, (matrix, width, height) => {
      const d = dimensions.current
      for (const s of currentGeometry.current?.sensors || []) {
        const button = pins.current.get(s.object.id)
        if (!button) continue
        const p = project(planToScene(s.object.xM+s.object.widthM/2,s.object.yM+s.object.lengthM/2,s.heightM ?? 0,d), matrix, width, height)
        button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
        button.dataset.labelAlign=p.x<140 ? 'start' : p.x>width-140 ? 'end' : 'center'
        button.dataset.labelBelow=String(p.y<90)
        button.style.visibility = p.visible && p.x>0 && p.x<width && p.y>0 && p.y<height ? 'visible' : 'hidden'
      }
    }, () => { if (!cancelled) setRenderError(true) }).then(scene => {
      if (cancelled) { scene.dispose(); return }
      renderer.current = scene; setEngine(scene.name)
      const g = currentGeometry.current
      if (g) scene.update(g.vertices, Math.max(dimensions.current.widthM, dimensions.current.lengthM), g.volume)
      scene.setPresentation('points')
    }).catch(() => { if (!cancelled) setRenderError(true) })
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null }
    // Scene lifetime follows availability, not playback or metric changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(map)])
  useEffect(() => {
    currentGeometry.current = geometry
    if (map && geometry) { dimensions.current = map.dimensions; renderer.current?.update(geometry.vertices, Math.max(map.dimensions.widthM,map.dimensions.lengthM), geometry.volume) }
  }, [geometry, map])


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
  function chooseArea(area: string) { historyRequest.current += 1; setLoadingHistory(false); setPlaying(false); setIndex(null); setHistory(null); setHistoryError(''); setSelected(null); setContext(null); setError(''); setParams({ area }) }
  const loading = !demoOnly && !error && (!areasReady || Boolean(currentArea && !resolvedContext))
  const hasFrames = Boolean(history?.frames.length)

  const valueText=(s:typeof readings[number])=>displayValue(s)===null ? '—' : `${number(displayValue(s)!)} ${METRICS[metric].unit}`
  const Root = demoOnly ? 'main' : 'section'
  return <Root className="nc-living" data-view="spatial" data-demo={demoOnly} data-integrated={!demoOnly} aria-label={text('3D išdėstymas','3D layout')}>
    {demoOnly ? <header className="nc-living-topbar"><Link to="/areas" className="nc-living-brand"><i className="fa-solid fa-seedling" />NeuroCrop</Link><span className="nc-living-prototype">{text('Demonstracija','Demonstration')}</span><Link to="/areas" className="nc-living-back">{text('Grįžti į plotus','Back to areas')}</Link></header> : null}
    <section className="nc-living-heading"><div><p>{text('IŠSAUGOTAS IŠDĖSTYMAS','SAVED LAYOUT')}</p><h1>{text('3D išdėstymas','3D layout')}</h1><p className="nc-living-description">{text('Sensorių vietos ir aukščiai išsaugotame šiltnamio plane.','Sensor positions and heights on the saved greenhouse layout.')}</p></div>
      {demoOnly ? <div className="nc-living-source"><span data-demo="true"><i />{text('Demonstraciniai duomenys','Demonstration data')}</span><small>{text('Pavyzdinis planas ir sintetiniai matavimai','Example layout and synthetic measurements')}</small></div> : <div className="nc-living-setup-links">{currentArea && resolvedContext?.permissions.canEdit ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}><i className="fa-solid fa-draw-polygon" />{text('Redaguoti planą','Edit layout')}</Link> : null}<Link to="/nodes">{text('Mazgai ir jų aukščiai','Nodes and their heights')}</Link></div>}
    </section>
    <section className="nc-living-workspace">
      <div className="nc-living-toolbar"><div className="nc-living-area">{demoOnly ? <strong>{demo.context.area.name}</strong> : <label><span className="sr-only">{text('Šiltnamis','Greenhouse')}</span><select value={currentArea} onChange={e=>chooseArea(e.target.value)}>{areas.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}<span>{map ? `${map.dimensions.widthM} × ${map.dimensions.lengthM} m` : '—'}</span></div>
        <label className="nc-living-metric"><span className="sr-only">{text('Rodiklis','Metric')}</span><select value={metric} onChange={e=>{setMetric(e.target.value as MetricKey);setSelected(null)}}>{metricOptions.map(m=><option value={m} key={m}>{lt ? METRICS[m].labelLt : METRICS[m].label}</option>)}</select></label>
        <div className="nc-living-time-mode" aria-label={text('Laiko režimas','Time mode')}><button type="button" aria-pressed={index===null} onClick={()=>{setPlaying(false);setIndex(null)}}>{text('Dabar','Now')}</button><button type="button" aria-pressed={index!==null} disabled={loadingHistory || !resolvedContext} onClick={()=>void showHistory()}>{loadingHistory ? text('Kraunama…','Loading…') : text('24 valandos','24 hours')}</button></div>
      </div>
      {historyError ? <div className="nc-living-notice" role="status">{historyError==='empty' ? text('Per paskutines 24 valandas istorinių matavimų nėra.','No historical measurements in the last 24 hours.') : text('Istorijos nepavyko įkelti. Bandykite dar kartą.','History could not be loaded. Please try again.')}</div> : null}
      <div className="nc-living-stage">
        <div className="nc-living-canvas" ref={host} role="group" aria-label={text('3D išdėstymas. Sukite vilkdami, didinkite ratuku.','3D layout. Drag to rotate, scroll to zoom.')}>
          {map ? visibleReadings.map(s=><button type="button" key={s.object.id} ref={el=>{if(el){pins.current.set(s.object.id,el);renderer.current?.invalidate()}else pins.current.delete(s.object.id)}} className="nc-living-pin" data-selected={selected===s.object.id} data-missing={displayValue(s)===null} data-delayed={s.delayed} data-attention={attentionIds.has(s.object.id)} data-height-unknown={s.heightM===null} aria-pressed={selected===s.object.id} onClick={()=>setSelected(previous=>previous===s.object.id ? null : s.object.id)} aria-label={`${s.object.name}: ${valueText(s)} · ${readingLabel(s)} · ${heightText(s.heightM)} · ${ageText(s)}`}>
            <i aria-hidden="true" style={{backgroundColor:pointColor(s)}} /><span className="nc-living-pin-label" aria-hidden="true"><strong>{s.object.name}</strong><span>{valueText(s)}</span><small>{heightText(s.heightM)} · {ageText(s)}</small></span>
          </button>) : null}
        </div>
        {loading || error || !map || renderError ? <div className="nc-living-empty" role="status"><i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-map-location-dot'}`} /><h2>{renderError ? text('3D vaizdo atverti nepavyko','3D view unavailable') : loading ? text('Atveriame sensorių planą…','Opening the sensor map…') : error ? text('Nepavyko įkelti plano','Could not load the plan') : index!==null ? text('Šiam laikui nėra užfiksuoto plano','No recorded layout for this time') : text('Pirmiausia išsaugokite šiltnamio planą','Save your greenhouse layout first')}</h2><p>{renderError ? text('Matavimus ir esamą klimato žemėlapį rasite apžvalgoje.','Readings and the existing climate map are available in Overview.') : index!==null ? text('Istorijai naudojamas tuo metu galiojęs išsaugotas planas. Pasirinkite kitą laiką arba grįžkite į „Dabar“.','History uses the layout recorded for that time. Choose another interval or return to Now.') : text('Rodomos tik plane išsaugotos sensorių vietos.','Only sensor positions saved on the plan are shown.')}</p>{renderError ? <Link to="/">{text('Atverti apžvalgą','Open overview')}</Link> : error ? <button type="button" onClick={()=>{setError('');setRefresh(v=>v+1)}}>{text('Bandyti dar kartą','Try again')}</button> : !loading && index===null ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}>{text('Atverti plano redaktorių','Open layout editor')}</Link> : null}</div> : null}
        {map && !renderError ? <>
          <div className="nc-living-scene-caption"><span><i />{index===null ? text('DABARTINIAI MATAVIMAI','CURRENT MEASUREMENTS') : `${text('ISTORIJA','HISTORY')} · ${clock(frame!.observedAt)}`}</span><p>{text('Sensorių vietos ir matavimo aukščiai.','Sensor positions and measurement heights.')}</p>{unknownHeights ? <small className="nc-living-volume-note">{unknownHeights} {text('sensorių aukštis nenurodytas; jų žymos rodomos plano lygyje.','sensor heights are unknown; their markers are shown at plan level.')}</small> : null}</div>
          <aside className="nc-living-inspector" aria-label={text('Matavimai','Measurements')}><div className="nc-living-inspector-head"><span>{focused ? text('PASIRINKTAS SENSORIUS','SELECTED SENSOR') : text('IŠMATUOTA ŠILTNAMYJE','MEASURED IN THE GREENHOUSE')}</span>{focused ? <button type="button" onClick={()=>setSelected(null)} aria-label={text('Uždaryti sensorių','Close sensor')}><i className="fa-solid fa-xmark" /></button> : <i className="fa-solid fa-wave-square" />}</div>
            <strong className="nc-living-big-number" data-range={!focused}>{focused ? displayValue(focused)===null ? '—' : number(displayValue(focused)!) : measured.length ? `${number(Math.min(...measured.map(r=>r.value!)))}–${number(Math.max(...measured.map(r=>r.value!)))}` : '—'}<small>{METRICS[metric].unit}</small></strong><p>{focused ? focused.object.name : index===null ? text('Naujų matavimų intervalas','Current reading range') : text('Pasirinkto laiko reikšmės','Readings at selected time')}</p>
            {focused ? <div className="nc-living-sensor-detail"><span>{text('Būsena','Status')}<b>{readingLabel(focused)} · {ageText(focused)}</b></span><span>{text('Matavimo aukštis','Measurement height')}<b>{heightText(focused.heightM)}</b></span><span>{text('Matavimo laikas','Reading time')}<b>{(focused.value===null ? focused.lastTimestamp : focused.timestamp) ? clock((focused.value===null ? focused.lastTimestamp : focused.timestamp)!) : '—'}</b></span>{targets.get(focused.object.id) ? <span>{text('Nustatytos ribos','Configured targets')}<b>{targets.get(focused.object.id)!.map(number).join('–')} {METRICS[metric].unit}</b></span> : null}</div> : <div className="nc-living-range"><span>{index===null ? text('Nauji matavimai','Current readings') : text('Turimi matavimai','Available readings')}<b>{measured.length}/{visibleReadings.length}</b></span><span>{text('Už nustatytų ribų','Outside targets')}<b>{index===null && assessedCount ? `${attentionIds.size}/${assessedCount}` : '—'}</b></span></div>}
            {delayed.length ? <p className="nc-living-delay-summary">{delayed.length} {text('matavimai vėluoja. Paskutinės reikšmės pažymėtos ir neįtrauktos į naujų matavimų intervalą.','readings are delayed. Last values are marked and excluded from the current range.')}</p> : null}
            {index===null && attentionIds.size>0 ? <div className="nc-living-attention"><i className="fa-solid fa-circle-exclamation" />{attentionIds.size} {text('sensorių matavimai už nustatytų ribų. Jie sąraše pirmi.','sensor readings outside configured targets. Listed first.')}</div> : null}
            {comparison && !focused ? <div className="nc-living-comparison"><span>{text('NETOLIESE, SKIRTINGAME AUKŠTYJE','NEARBY, AT DIFFERENT HEIGHTS')}</span><strong>{comparison.delta>0 ? '+' : ''}{number(comparison.delta)} {METRICS[metric].unit}</strong><p>{heightText(comparison.upper.heightM)} − {heightText(comparison.lower.heightM)}</p><small>{text('Sensoriai plane iki 0,5 m atstumu; matavimų laikas skiriasi iki 5 min. Skirtumo priežastis nenustatyta.','Sensors within 0.5 m; readings no more than 5 min apart. The cause of the difference is not established.')}</small><button type="button" onClick={()=>setSelected(comparison.upper.object.id)}>{comparison.upper.object.name} ↗</button><button type="button" onClick={()=>setSelected(comparison.lower.object.id)}>{comparison.lower.object.name} ↗</button></div> : null}
            <div className="nc-living-sensor-list">{visibleReadings.map(s=><button type="button" key={s.object.id} data-selected={selected===s.object.id} data-attention={attentionIds.has(s.object.id)} data-delayed={s.delayed} onClick={()=>setSelected(s.object.id)}><span><i data-missing={displayValue(s)===null}/><span>{s.object.name}<small>{heightText(s.heightM)} · {ageText(s)}</small>{s.delayed ? <small className="nc-living-delay-label">{text('Vėluoja · paskutinis matavimas','Delayed · last reading')}</small> : null}</span></span><b>{valueText(s)}</b></button>)}</div>
            <footer><i className="fa-solid fa-circle-info" />{text('Rodomi tikri matavimai jų vietose. Stogas ir įrangos aukščiai iliustraciniai; nežinomas sensoriaus aukštis nespėjamas.','Measured values at their locations. Roof and equipment heights are illustrative; unknown sensor heights are not guessed.')}</footer>
          </aside>
          <div className="nc-living-view-controls"><button type="button" onClick={()=>renderer.current?.reset()} aria-label={text('Pradinis vaizdas','Reset view')}><i className="fa-solid fa-cube" /></button><button type="button" onClick={()=>renderer.current?.reset(true)} aria-label={text('Vaizdas iš viršaus','Top view')}><i className="fa-solid fa-border-all" /></button><span /><button type="button" onClick={()=>renderer.current?.zoom(.85)} aria-label={text('Priartinti','Zoom in')}><i className="fa-solid fa-plus" /></button><button type="button" onClick={()=>renderer.current?.zoom(1.18)} aria-label={text('Atitolinti','Zoom out')}><i className="fa-solid fa-minus" /></button></div>
          <div className="nc-living-point-key"><span><i />{text('Matavimo vieta','Reading location')}</span><span><i data-attention="true" />{text('Už nustatytų ribų','Outside configured targets')}</span></div>
        </> : null}
      </div>
      <footer className="nc-living-timeline"><button type="button" className="nc-living-play" disabled={!hasFrames || index===null} aria-label={playing ? text('Pristabdyti','Pause') : text('Paleisti istoriją','Play history')} onClick={()=>setPlaying(v=>!v)}><i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} /></button><div className="nc-living-timeline-label"><strong>{frame ? clock(frame.observedAt) : text('Dabar','Now')}</strong><span>{frame ? new Date(frame.observedAt).toLocaleDateString(lt?'lt-LT':'en-GB',{month:'short',day:'numeric',timeZone:'Europe/Vilnius'}) : text('Pasirinkite „24 valandos“','Select 24 hours')}</span></div><div className="nc-living-scrubber"><label className="sr-only" htmlFor="living-time">{text('Istorijos laikas','History time')}</label><input id="living-time" type="range" min={0} max={Math.max(1,(history?.frames.length || 1)-1)} value={index ?? (history?.frames.length || 1)-1} disabled={!hasFrames || index===null} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value))}} /><div><span>{history?.frames[0] ? clock(history.frames[0].observedAt) : '−24 h'}</span><span>{text('Europe/Vilnius · įrašyti intervalai','Europe/Vilnius · recorded intervals')}</span><span>{history?.frames.at(-1) ? clock(history.frames.at(-1)!.observedAt) : text('Dabar','Now')}</span></div></div><span className="nc-living-engine">{engine || '3D'}<i /></span></footer>
    </section>
    <footer className="nc-living-bottom"><span>{text('Vilkite, kad pasuktumėte · ratukas — priartinti','Drag to orbit · scroll to zoom')}</span>{demoOnly ? <Link to="/greenhouse-live">{text('Atverti savo 3D išdėstymą','Open my 3D layout')} ↗</Link> : null}</footer>
  </Root>
}
