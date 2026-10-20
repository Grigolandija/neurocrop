import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import { areaMapRepository, type AreaMapContext, type AreaMapHistory, type AreaSummary } from '../greenhouse-map/services/areaMapRepository'
import { createLivingScene, type LivingScene } from './gpuScene'
import { livingDemo, livingMap, livingMetrics, measuredSensors } from './livingData'
import { climateColor, sceneGeometry } from './sceneGeometry'
import { project } from './sceneMath'
import { liveTarget, verticalComparisons, type LivingView } from './spatialEvidence'
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
  const [view,setView]=useState<LivingView>('volume')
  const presentationRef=useRef<LivingView>('volume')
  const [index, setIndex] = useState<number | null>(demoOnly ? demo.history.frames.reduce((best, f, i, all) => f.nodes[3].measurements.airTemperatureC! > all[best].nodes[3].measurements.airTemperatureC! ? i : best, 0) : null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [engine, setEngine] = useState('')
  const [renderError, setRenderError] = useState(false)
  const [retry, setRetry] = useState(0)
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
  const geometry = useMemo(() => map ? sceneGeometry(map, metric, at, scale, {view,attentionIds}) : null, [map, metric, at, scale, view, attentionIds])
  const visibleReadings=readings.slice().sort((a,b)=>Number(attentionIds.has(b.object.id))-Number(attentionIds.has(a.object.id)))
  const measured=visibleReadings.filter(s=>s.value!==null)
  const focused=readings.find(s=>s.object.id===selected)
  const comparison=useMemo(()=>map ? verticalComparisons(readings,map)[0] : undefined,[readings,map])
  const unknownHeights=readings.filter(r=>r.heightM===null).length
  const heightText=(height:number | null)=>height===null ? text('Aukštis nenurodytas','Height not specified') : `${height.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:2})} m`
  function chooseView(next:LivingView){setView(next);setSelected(null)}
  const number = (v: number) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: METRICS[metric].decimals })
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
        const p = project([s.object.xM+s.object.widthM/2-d.widthM/2, (s.heightM ?? 0)+.3, s.object.yM+s.object.lengthM/2-d.lengthM/2], matrix, width, height)
        button.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
        button.style.visibility = p.visible && p.x>0 && p.x<width && p.y>0 && p.y<height ? 'visible' : 'hidden'
      }
    }, () => { if (!cancelled) setRenderError(true) }).then(scene => {
      if (cancelled) { scene.dispose(); return }
      renderer.current = scene; setEngine(scene.name)
      const g = currentGeometry.current
      if (g) scene.update(g.vertices, Math.max(dimensions.current.widthM, dimensions.current.lengthM), g.volume)
      scene.setPresentation(presentationRef.current)
    }).catch(() => { if (!cancelled) setRenderError(true) })
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null }
    // Scene lifetime follows availability, not playback or metric changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(map), retry])
  useEffect(() => {
    currentGeometry.current = geometry
    if (map && geometry) { dimensions.current = map.dimensions; renderer.current?.update(geometry.vertices, Math.max(map.dimensions.widthM,map.dimensions.lengthM), geometry.volume) }
  }, [geometry, map])
  useEffect(()=>{presentationRef.current=view;renderer.current?.setPresentation(view)},[view])

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

  const Root = demoOnly ? 'main' : 'section'
  return <Root className="nc-living" data-demo={demoOnly} data-integrated={!demoOnly} aria-label={text('3D mikroklimatas', '3D microclimate')}>
    {demoOnly ? <header className="nc-living-topbar"><Link to="/areas" className="nc-living-brand"><i className="fa-solid fa-seedling" />NeuroCrop<span>EXPERIENCE</span></Link><span className="nc-living-prototype">{text('3D prototipas', '3D prototype')}</span><Link to="/areas" className="nc-living-back"><i className="fa-solid fa-arrow-left" />{text('Grįžti į plotus', 'Back to areas')}</Link></header> : null}
    <section className="nc-living-heading"><div><p>{demoOnly ? text('NAUJAS ŽVILGSNIS Į AUGIMO SĄLYGAS', 'A NEW PERSPECTIVE ON GROWING CONDITIONS') : text('AUGIMO SĄLYGOS', 'GROWING CONDITIONS')}</p><h1>{demoOnly ? <>{text('Jūsų šiltnamis. ', 'Your greenhouse. ')}<em>{text('Gyvai.', 'Alive.')}</em></> : text('3D mikroklimatas', '3D microclimate')}</h1>{!demoOnly ? <p className="nc-living-description">{text('Matykite mikroklimatą pagal tikras mazgų vietas ir aukščius.', 'See the climate using actual Node positions and heights.')}</p> : null}</div>{demoOnly ? <div className="nc-living-source"><span data-demo="true"><i />{text('Demonstraciniai duomenys', 'Demonstration data')}</span><small>{text('Pavyzdinis planas ir sintetiniai matavimai', 'Example layout and synthetic measurements')}</small></div> : <div className="nc-living-setup-links">{currentArea && resolvedContext?.permissions.canEdit ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}><i className="fa-solid fa-draw-polygon" />{text('Redaguoti planą', 'Edit layout')}</Link> : null}<Link to="/nodes"><i className="fa-solid fa-arrows-up-down" />{text('Mazgų aukščiai', 'Node heights')}</Link></div>}</section>
    {!demoOnly && resolvedContext ? <p className="nc-living-source nc-living-source-inline"><span><i />{text('Jūsų duomenys', 'Your data')}</span><small>{text('Išsaugotas planas ir sensorių matavimai', 'Saved layout and sensor measurements')}</small></p> : null}
    <section className="nc-living-workspace">
      <div className="nc-living-toolbar"><div className="nc-living-area">{demoOnly ? <strong>{demo.context.area.name}</strong> : <label><span className="sr-only">{text('Šiltnamis', 'Greenhouse')}</span><select value={currentArea} onChange={e => chooseArea(e.target.value)}>{areas.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}<span>{map ? `${map.dimensions.widthM} × ${map.dimensions.lengthM} m` : '—'}</span></div>
        <label className="nc-living-metric"><span className="sr-only">{text('Rodiklis', 'Metric')}</span><i className="fa-solid fa-temperature-half" /><select value={metric} onChange={e => { setMetric(e.target.value as MetricKey); setSelected(null) }}>{livingMetrics.map(m => <option value={m} key={m}>{lt ? METRICS[m].labelLt : METRICS[m].label}</option>)}</select></label>
        <div className="nc-living-time-mode nc-living-volume-mode" role="group" aria-label={text('Mikroklimato vaizdavimas', 'Climate visualization')}>{([['volume','Mikroklimatas','Microclimate'],['points','Matavimai','Measurements']] as const).map(([key,a,b])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>chooseView(key)}>{text(a,b)}</button>)}</div>
        <div className="nc-living-time-mode" aria-label={text('Laiko režimas', 'Time mode')}><button type="button" aria-pressed={index === null} onClick={() => { setPlaying(false); setIndex(null) }}>{text('Dabar', 'Now')}</button><button type="button" aria-pressed={index !== null} disabled={loadingHistory || !resolvedContext} onClick={() => void showHistory()}>{loadingHistory ? text('Kraunama…', 'Loading…') : text('24 valandos', '24 hours')}</button></div>
      </div>
      {historyError ? <div className="nc-living-notice" role="status">{historyError === 'empty' ? text('Per paskutines 24 valandas istorinių matavimų nėra.', 'No historical measurements in the last 24 hours.') : text('Istorijos nepavyko įkelti. Bandykite dar kartą.', 'History could not be loaded. Please try again.')}</div> : null}
      {map && view==='volume' && !geometry?.volumeReady ? <div className="nc-living-notice" role="status">{text('Erdviniam vaizdui trūksta matavimų su žinomu aukščiu. Aukštį įveskite Mazgai → Redaguoti mazgą. Turimi matavimai rodomi taškais.','The spatial view needs readings with a known height. Enter the height in Nodes → Edit node. Available readings are shown as points.')}</div> : null}
      <div className="nc-living-stage">
        <div className="nc-living-canvas" ref={host} role="group" aria-label={text('Trimatis šiltnamis. Vaizdą sukite vilkdami, didinkite ratuku arba žemiau esančiais mygtukais.', '3D greenhouse. Drag to rotate, scroll or use the buttons below to zoom.')}>
          {map && visibleReadings.map(s => <button type="button" key={s.object.id} ref={el => { if (el) pins.current.set(s.object.id,el); else pins.current.delete(s.object.id) }} className="nc-living-pin" data-selected={selected === s.object.id} data-missing={s.value === null} data-attention={attentionIds.has(s.object.id)} data-height-unknown={s.heightM===null} onClick={() => setSelected(s.object.id)} aria-label={`${s.object.name}: ${s.value === null ? text('Nėra tinkamo matavimo','No valid measurement') : `${number(s.value)} ${METRICS[metric].unit}`}`}><i /><span>{s.value === null ? '—' : number(s.value)}<small>{METRICS[metric].unit}</small>{s.heightM===null ? <small> ?</small> : null}</span><b>{s.object.name} · {heightText(s.heightM)}</b></button>)}
        </div>
        {loading || error || !map || renderError ? <div className="nc-living-empty" role="status"><i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-cube'}`} /><h2>{renderError ? text('3D vaizdo atverti nepavyko', '3D view unavailable') : loading ? text('Atveriame jūsų šiltnamį…', 'Opening your greenhouse…') : error ? text('Nepavyko įkelti šiltnamio', 'Could not load the greenhouse') : index !== null ? text('Šiam laikui nėra užfiksuoto plano', 'No recorded layout for this time') : text('Pirmiausia išsaugokite šiltnamio planą', 'Save your greenhouse layout first')}</h2><p>{renderError ? text('Patikrinkite naršyklės grafikos spartinimą arba pabandykite kitą naršyklę.', 'Check browser graphics acceleration or try another browser.') : !loading && index !== null ? text('Dabartinio plano seniems matavimams nepriskiriame. Pasirinkite kitą laiką arba grįžkite į „Dabar“.', 'We do not apply today’s layout to older readings. Choose another time or return to Now.') : text('3D vaizdui naudojamos tik plane išsaugotos sensorių vietos.', 'The 3D view uses only sensor positions saved on your plan.')}</p>{renderError ? <button type="button" onClick={() => { setRenderError(false); setRetry(v=>v+1) }}>{text('Bandyti dar kartą', 'Try again')}</button> : error ? <button type="button" onClick={() => { setError(''); setRefresh(v=>v+1) }}>{text('Bandyti dar kartą', 'Try again')}</button> : !loading && index === null ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}>{text('Atverti plano redaktorių', 'Open layout editor')}</Link> : null}{!demoOnly && !loading ? <Link to="/greenhouse-live/demo">{text('Peržiūrėti demonstraciją', 'View demonstration')} →</Link> : null}</div> : null}
        {map && !renderError ? <>
          <div className="nc-living-scene-caption"><span><i />{index === null ? text('DABARTINIAI MATAVIMAI', 'CURRENT MEASUREMENTS') : `${text('ISTORIJA', 'HISTORY')} · ${clock(frame!.observedAt)}`}</span><p>{view==='volume' ? text('Mikroklimato įvertis pagal mazgų vietas ir aukščius.','Climate estimate from Node positions and heights.') : text('Matavimai jų vietose. Pasirinkite sensorių.', 'Readings in their locations. Select a sensor.')}</p>{unknownHeights ? <small className="nc-living-volume-note">{unknownHeights} {text('sensorių aukštis nenurodytas; žymos rodomos plano lygyje.','sensor heights are unknown; markers are shown at plan level.')}</small> : null}</div>
          <aside className="nc-living-inspector" aria-label={text('Matavimai', 'Measurements')}><div className="nc-living-inspector-head"><span>{focused ? text('PASIRINKTAS SENSORIUS', 'SELECTED SENSOR') : text('IŠMATUOTA ŠILTNAMYJE', 'MEASURED IN THE GREENHOUSE')}</span>{focused ? <button type="button" onClick={() => setSelected(null)} aria-label={text('Uždaryti sensorių', 'Close sensor')}><i className="fa-solid fa-xmark" /></button> : <i className="fa-solid fa-wave-square" />}</div>
            <strong className="nc-living-big-number" data-range={!focused}>{focused ? focused.value===null ? '—' : number(focused.value) : measured.length ? `${number(Math.min(...measured.map(r=>r.value!)))}–${number(Math.max(...measured.map(r=>r.value!)))}` : '—'}<small>{METRICS[metric].unit}</small></strong><p>{focused ? focused.object.name : text('Išmatuotas intervalas','Measured range')}</p>
            {focused ? <div className="nc-living-sensor-detail"><span>{text('Matavimo aukštis','Measurement height')}<b>{heightText(focused.heightM)}</b></span><span>{text('Matavimo laikas','Reading time')}<b>{focused.timestamp ? clock(focused.timestamp) : '—'}</b></span>{targets.get(focused.object.id) ? <span>{text('Nustatytos ribos','Configured targets')}<b>{targets.get(focused.object.id)!.map(number).join('–')} {METRICS[metric].unit}</b></span> : null}</div> : <div className="nc-living-range"><span>{text('Tinkami matavimai','Valid readings')}<b>{measured.length}/{visibleReadings.length}</b></span><span>{text('Aukštis nurodytas','Height specified')}<b>{visibleReadings.filter(r=>r.heightM!==null).length}/{visibleReadings.length}</b></span></div>}
            {index===null && attentionIds.size>0 ? <div className="nc-living-attention"><i className="fa-solid fa-circle-exclamation" />{attentionIds.size} {text('sensorių matavimai už nustatytų ribų. Jie sąraše pirmi.','sensor readings outside configured targets. Listed first.')}</div> : null}
            {comparison && !focused ? <div className="nc-living-comparison"><span>{text('DIDŽIAUSIAS SKIRTUMAS PAGAL AUKŠTĮ','LARGEST DIFFERENCE BY HEIGHT')}</span><strong>{comparison.delta>0 ? '+' : ''}{number(comparison.delta)} {METRICS[metric].unit}</strong><p>{heightText(comparison.upper.heightM)} − {heightText(comparison.lower.heightM)}</p><small>{index===null ? text('Taškai plane iki 0,5 m atstumu; matavimų laikas skiriasi iki 5 min.','Positions within 0.5 m; reading times differ by no more than 5 min.') : text('To paties istorijos intervalo vidurkiai; taškai plane iki 0,5 m atstumu.','Averages from the same recorded interval; positions within 0.5 m.')}</small><button type="button" onClick={()=>setSelected(comparison.upper.object.id)}>{comparison.upper.object.name} ↗</button><button type="button" onClick={()=>setSelected(comparison.lower.object.id)}>{comparison.lower.object.name} ↗</button></div> : null}
            <div className="nc-living-sensor-list">{visibleReadings.map(s=><button type="button" key={s.object.id} data-selected={selected===s.object.id} data-attention={attentionIds.has(s.object.id)} onClick={()=>setSelected(s.object.id)}><span><i data-missing={s.value===null}/><span>{s.object.name}<small>{heightText(s.heightM)}</small></span></span><b>{s.value===null ? '—' : `${number(s.value)} ${METRICS[metric].unit}`}</b></button>)}</div>
            <footer><i className="fa-solid fa-circle-info" />{view==='volume' ? text('Aukščiai naudojami automatiškai. Tarp sensorių spalvos yra apskaičiuotas įvertis. Nepakankamai stebimos vietos neužpildomos.','Heights are used automatically. Colors between sensors are estimates. Areas without enough observations stay unfilled.') : text('Rodomi tikri sensorių matavimai. Nežinomas aukštis nėra spėjamas.','Showing sensor measurements. Unknown heights are not guessed.')}</footer>
          </aside>
          <div className="nc-living-view-controls"><button type="button" onClick={()=>renderer.current?.reset()} title={text('Pradinis vaizdas', 'Reset view')} aria-label={text('Pradinis vaizdas', 'Reset view')}><i className="fa-solid fa-cube" /></button><button type="button" onClick={()=>renderer.current?.reset(true)} title={text('Vaizdas iš viršaus', 'Top view')} aria-label={text('Vaizdas iš viršaus', 'Top view')}><i className="fa-solid fa-border-all" /></button><span /><button type="button" onClick={()=>renderer.current?.zoom(.85)} aria-label={text('Priartinti', 'Zoom in')}><i className="fa-solid fa-plus" /></button><button type="button" onClick={()=>renderer.current?.zoom(1.18)} aria-label={text('Atitolinti', 'Zoom out')}><i className="fa-solid fa-minus" /></button></div>
          {view!=='points' ? <div className="nc-living-legend"><span>{lt ? METRICS[metric].labelLt : METRICS[metric].label} · {METRICS[metric].unit}</span><div style={{background:`linear-gradient(90deg, ${[0,.25,.5,.75,1].map(t=>`rgb(${climateColor(t,0,1).map(c=>Math.round(c*255)).join(',')})`).join(',')})`}} /><p><b>{geometry ? number(geometry.scale.min) : '—'}</b><span>{text('Reikšmių skalė, ne augalo būklė', 'Value scale, not crop health')}</span><b>{geometry ? number(geometry.scale.max) : '—'}</b></p></div> : <div className="nc-living-point-key"><span><i />{text('Matavimo taškas','Measurement point')}</span><span><i data-attention="true" />{text('Už nustatytų ribų','Outside configured targets')}</span></div>}
        </> : null}
      </div>
      <footer className="nc-living-timeline"><button type="button" className="nc-living-play" disabled={!hasFrames || index===null} aria-label={playing ? text('Pristabdyti', 'Pause') : text('Paleisti istoriją', 'Play history')} onClick={()=>setPlaying(v=>!v)}><i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} /></button><div className="nc-living-timeline-label"><strong>{frame ? clock(frame.observedAt) : text('Dabar', 'Now')}</strong><span>{frame ? new Date(frame.observedAt).toLocaleDateString(lt?'lt-LT':'en-GB',{month:'short',day:'numeric',timeZone:'Europe/Vilnius'}) : text('Pasirinkite „24 valandos“', 'Select 24 hours')}</span></div><div className="nc-living-scrubber"><label className="sr-only" htmlFor="living-time">{text('Istorijos laikas', 'History time')}</label><input id="living-time" type="range" min={0} max={Math.max(1,(history?.frames.length || 1)-1)} value={index ?? (history?.frames.length || 1)-1} disabled={!hasFrames || index===null} onChange={e=>{setPlaying(false);setIndex(Number(e.target.value))}} /><div><span>{history?.frames[0] ? clock(history.frames[0].observedAt) : '−24 h'}</span><span>{text('Europe/Vilnius · įrašyti intervalai', 'Europe/Vilnius · recorded intervals')}</span><span>{history?.frames.at(-1) ? clock(history.frames.at(-1)!.observedAt) : text('Dabar', 'Now')}</span></div></div><span className="nc-living-engine">{engine || '3D'}<i /></span></footer>
    </section>
    <footer className="nc-living-bottom"><span><i className="fa-solid fa-computer-mouse" />{text('Vilkite, kad pasuktumėte · ratukas — priartinti', 'Drag to orbit · scroll to zoom')}</span><span>{text('Stogas, įrangos aukščiai ir augalų formos — iliustraciniai.', 'Roof, equipment heights and plant forms are illustrative.')}</span>{!demoOnly ? <Link to="/greenhouse-live/demo">{text('Demonstracija', 'Demonstration')} ↗</Link> : <Link to="/greenhouse-live">{text('Atverti savo šiltnamį', 'Open my greenhouse')} ↗</Link>}</footer>
  </Root>
}
