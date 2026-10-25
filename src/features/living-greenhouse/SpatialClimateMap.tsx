import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type GreenhouseMap, type MetricKey } from '../greenhouse-map/model'
import type { AreaMapContext, AreaMapHistory } from '../greenhouse-map/services/areaMapRepository'
import { heatmapColorAt, scaleGradient, type HeatmapColorMode } from '../greenhouse-map/heatmap/heatmapColorScale'
import { createLivingScene, type LivingScene } from './gpuScene'
import { livingMap, measuredSensors, spatialClimateMetrics } from './livingData'
import { sceneGeometry } from './sceneGeometry'
import { planToScene, project } from './sceneMath'
import { liveTarget, verticalComparisons } from './spatialEvidence'
import './living-greenhouse.css'

type Props = {
  map: GreenhouseMap | null
  context: AreaMapContext | null
  metric: MetricKey
  at: number
  historyTime?: string
  index: number | null
  scale?: { min: number; max: number }
  colorMode?: HeatmapColorMode
  soilEcDepthCm?: number
  loading?: boolean
  error?: string
  onRetry?: () => void
  onReady?: () => void
  onRendererReady?: (engine: string) => void
  onFallback?: () => void
}

/** The same read-only scene powers Overview and the dedicated 3D page. */
export function SpatialClimateMap({ map, context, metric, at, historyTime, index, scale, colorMode = 'condition', soilEcDepthCm, loading = false, error = '', onRetry, onReady, onRendererReady, onFallback }: Props) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'
  const text = (a: string, b: string) => lt ? a : b
  const currentArea = context?.area.id || ''
  const atmospheric = spatialClimateMetrics.has(metric)
  const panelId = useId()
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [engine, setEngine] = useState('')
  const [renderError, setRenderError] = useState(false)
  const measurementsToggle = useRef<HTMLButtonElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<LivingScene | null>(null)
  const pins = useRef(new Map<string, HTMLButtonElement>())
  const currentGeometry = useRef<ReturnType<typeof sceneGeometry> | null>(null)
  const engineReady = useRef(onRendererReady)
  useEffect(() => { engineReady.current = onRendererReady }, [onRendererReady])
  const renderNotified = useRef(false)
  const ready = useRef(onReady)
  useEffect(() => { ready.current = onReady }, [onReady])
  const dimensions = useRef({ widthM: 20, lengthM: 12 })
  const readings=useMemo(()=>map ? measuredSensors(map,metric,at,soilEcDepthCm) : [],[map,metric,at,soilEcDepthCm])
  const targets=useMemo(()=>new Map(readings.map(r=>[r.object.id,index===null && context ? liveTarget(context,r,metric) : null])),[readings,index,context,metric])
  const attentionIds=useMemo(()=>new Set(readings.filter(r=>{const t=targets.get(r.object.id);return t && r.value!==null && (r.value<t[0] || r.value>t[1])}).map(r=>r.object.id)),[readings,targets])
  const geometry = useMemo(() => map ? sceneGeometry(map, metric, at, scale, {view: atmospheric ? 'volume' : 'points',attentionIds,colorMode,soilEcDepthCm}) : null, [map, metric, at, scale, attentionIds, atmospheric, colorMode, soilEcDepthCm])
  const visibleReadings=readings.slice().sort((a,b)=>Number(attentionIds.has(b.object.id))-Number(attentionIds.has(a.object.id)))
  const measured=visibleReadings.filter(s=>s.value!==null)
  const delayed=visibleReadings.filter(s=>s.delayed)
  const missing=visibleReadings.filter(s=>s.value===null && !s.delayed)
  const assessedCount=measured.filter(s=>targets.get(s.object.id)).length
  const focused=readings.find(s=>s.object.id===selected)
  const comparison=useMemo(()=>map ? verticalComparisons(readings,map)[0] : undefined,[readings,map])
  const unknownHeights=readings.filter(r=>r.heightM===null).length
  const heightText=(height:number | null)=>height===null ? text('Aukštis nenurodytas','Height not specified') : `${height.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:2})} m`
  const number = (v: number) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: METRICS[metric].decimals })
  const displayValue=(s:typeof readings[number])=>s.value ?? s.lastValue
  const observedRange: [number, number] | undefined = measured.length ? [Math.min(...measured.map(r=>r.value!)), Math.max(...measured.map(r=>r.value!))] : undefined
  const pointColor=(s:typeof readings[number])=>s.value===null ? s.delayed ? '#9a6a20' : '#778b7d' : `rgb(${heatmapColorAt(s.value,METRICS[metric],observedRange,colorMode).join(' ')})`
  const ageText=(s:typeof readings[number])=>{
    const stamp=s.value===null ? s.lastTimestamp : s.timestamp
    if(!stamp)return text('Nėra matavimo','No reading')
    if(index !== null)return clock(stamp)
    const minutes=Math.max(0,Math.round((at-Date.parse(stamp))/60000))
    return minutes<1 ? text('Ką tik','Just now') : minutes<60 ? `${minutes} ${text('min. prieš','min ago')}` : `${Math.floor(minutes/60)} ${text('val.','h')} ${minutes%60} ${text('min. prieš','min ago')}`
  }
  const readingLabel=(s:typeof readings[number])=>s.delayed ? text('Vėluoja · paskutinis matavimas','Delayed · last reading') : s.value===null ? text('Matavimo nėra','No reading') : index === null ? text('Naujas matavimas','Current reading') : text('Istorinis matavimas','Historical reading')
  const clock = (stamp: string) => new Date(stamp).toLocaleTimeString(lt ? 'lt-LT' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' })
  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    const element = host.current
    createLivingScene(element, (matrix, width, height) => {
      if (!renderNotified.current) { renderNotified.current = true; ready.current?.() }
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
    }, () => { if (!cancelled) { setRenderError(true); ready.current?.() } }, { animateIntro: false }).then(scene => {
      if (cancelled) { scene.dispose(); return }
      renderer.current = scene; setEngine(scene.name); engineReady.current?.(scene.name)
      const g = currentGeometry.current
      if (g) scene.update(g.vertices, Math.max(dimensions.current.widthM, dimensions.current.lengthM), g.volume)
      scene.setPresentation(currentGeometry.current?.volumeReady ? 'volume' : 'points')
    }).catch(() => { if (!cancelled) { setRenderError(true); ready.current?.() } })
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null }
    // The parent keys this component by Area. Keep its camera and renderer
    // alive across historical frames, including gaps with no recorded layout.
    // The missing-layout overlay hides the previous scene until data returns.
  }, [])
  useEffect(() => {
    renderNotified.current = false
    currentGeometry.current = geometry
    if (map && geometry) { renderer.current?.setPresentation(geometry.volumeReady ? 'volume' : 'points'); dimensions.current = map.dimensions; renderer.current?.update(geometry.vertices, Math.max(map.dimensions.widthM,map.dimensions.lengthM), geometry.volume) }
  }, [geometry, map])

  const closePanel = () => { setPanelOpen(false); setSelected(null); measurementsToggle.current?.focus() }
  const valueText=(s:typeof readings[number])=>displayValue(s)===null ? '—' : `${number(displayValue(s)!)} ${METRICS[metric].unit}`
  return <>
      {map && !loading && !error && !geometry?.volumeReady ? <div className="nc-living-field-status" role="status">
        <i className={`fa-solid ${geometry?.volumeReady ? 'fa-cube' : 'fa-circle-info'}`} />
        {geometry?.volumeReady ? <span>{text('Erdvinis klimato įvertis','Spatial climate estimate')} · {geometry.knownHeights}/{readings.length} {text('matavimų su aukščiu','readings with height')} · {geometry.heightRange?.map(height=>heightText(height)).join('–')}</span>
          : <span>{atmospheric ? text('Erdviniam laukui reikia bent dviejų naujų matavimų su nurodytu aukščiu. Kol kas rodomi matavimo taškai.','The spatial field needs at least two current readings with a known height. Measurement points are shown for now.') : text('Šis rodiklis rodomas matavimo vietose — jis neapibūdina viso patalpos oro.','This metric is shown at measurement locations; it does not describe the room’s air.')}{atmospheric && unknownHeights ? <> <Link to="/nodes">{text('Nurodyti aukščius','Set node heights')} ↗</Link></> : null}</span>}
      </div> : null}
      <div className="nc-living-stage" data-panel-open={panelOpen} data-renderer={engine || undefined} data-spatial-field={geometry?.volumeReady ? 'volume' : 'points'}>
        <div className="nc-living-canvas" ref={host} role="group" aria-label={text('3D išdėstymas. Sukite vilkdami, didinkite laikydami Option / Alt ir sukdami ratuką.','3D layout. Drag to rotate, hold Option / Alt and scroll to zoom.')}>
          {map && !renderError ? <div className="nc-living-map-actions">
            {attentionIds.size > 0 ? <button type="button" className="nc-living-status-chip" onClick={()=>{setSelected(null);setPanelOpen(true)}}><i className="fa-solid fa-circle-exclamation" />{attentionIds.size} {text('už ribų','outside targets')}</button> : null}
            {delayed.length > 0 ? <button type="button" className="nc-living-status-chip" onClick={()=>{setSelected(null);setPanelOpen(true)}}><i className="fa-solid fa-clock" />{delayed.length} {text('vėluoja','delayed')}</button> : null}
            {missing.length > 0 ? <button type="button" className="nc-living-status-chip" onClick={()=>{setSelected(null);setPanelOpen(true)}}>{text('Matavimai','Readings')}: {measured.length}/{readings.length}</button> : null}
            <button type="button" className="nc-living-measurements-toggle" ref={measurementsToggle} aria-expanded={panelOpen} aria-controls={panelOpen ? panelId : undefined} onClick={()=>{setSelected(null);setPanelOpen(value=>!value)}}><i className="fa-solid fa-list" />{text('Matavimai','Measurements')} <span>{readings.length}</span></button>
          </div> : null}
          {map && geometry && !renderError ? <div className="nc-living-vertical-scale" role="img" aria-label={`${lt ? METRICS[metric].labelLt : METRICS[metric].label}, ${number(geometry.scale.min)}–${number(geometry.scale.max)} ${METRICS[metric].unit}`}>
            <span className="nc-living-scale-unit" aria-hidden="true">{METRICS[metric].unit}</span>
            <div className="nc-living-scale-ruler" aria-hidden="true">
              <div className="nc-living-scale" style={{background:scaleGradient(geometry.scale.min,geometry.scale.max,METRICS[metric],observedRange,colorMode,'vertical')}} />
              <div className="nc-living-scale-ticks">{[0,.25,.5,.75,1].map(fraction=><span key={fraction} style={{top:`${fraction*100}%`}}>{number(geometry.scale.max-(geometry.scale.max-geometry.scale.min)*fraction)}</span>)}</div>
            </div>
          </div> : null}
          {map ? visibleReadings.map(s=><button type="button" key={s.object.id} ref={el=>{if(el){pins.current.set(s.object.id,el);renderer.current?.invalidate()}else pins.current.delete(s.object.id)}} className="nc-living-pin" data-selected={selected===s.object.id} data-missing={displayValue(s)===null} data-delayed={s.delayed} data-attention={attentionIds.has(s.object.id)} data-height-unknown={s.heightM===null} aria-pressed={selected===s.object.id} onClick={()=>setSelected(previous=>previous===s.object.id ? null : s.object.id)} aria-label={`${s.object.name}: ${valueText(s)} · ${readingLabel(s)} · ${heightText(s.heightM)} · ${ageText(s)}`}>
            <i aria-hidden="true" style={{backgroundColor:pointColor(s)}} /><span className="nc-living-pin-label" aria-hidden="true"><strong>{s.object.name}</strong><span>{valueText(s)}</span><small>{heightText(s.heightM)} · {ageText(s)}</small></span>
          </button>) : null}
        </div>
        {loading || error || !map || renderError ? <div className="nc-living-empty" role="status"><i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-map-location-dot'}`} /><h2>{renderError ? text('3D vaizdo atverti nepavyko','3D view unavailable') : loading ? text('Atveriame sensorių planą…','Opening the sensor map…') : error ? text('Nepavyko įkelti plano','Could not load the plan') : index!==null ? text('Šiam laikui nėra užfiksuoto plano','No recorded layout for this time') : text('Pirmiausia išsaugokite šiltnamio planą','Save your greenhouse layout first')}</h2><p>{renderError ? text('Matavimus ir esamą klimato žemėlapį rasite apžvalgoje.','Readings and the existing climate map are available in Overview.') : index!==null ? text('Istorijai naudojamas tuo metu galiojęs išsaugotas planas. Pasirinkite kitą laiką arba grįžkite į „Dabar“.','History uses the layout recorded for that time. Choose another interval or return to Now.') : text('Rodomos tik plane išsaugotos sensorių vietos.','Only sensor positions saved on the plan are shown.')}</p>{renderError ? onFallback ? <button type="button" onClick={onFallback}>{text('Grįžti į 2D','Return to 2D')}</button> : <Link to="/">{text('Atverti apžvalgą','Open overview')}</Link> : error ? <button type="button" onClick={onRetry}>{text('Bandyti dar kartą','Try again')}</button> : !loading && index===null ? <Link to={`/area-map?area=${encodeURIComponent(currentArea)}`}>{text('Atverti plano redaktorių','Open layout editor')}</Link> : null}</div> : null}
        {map && !renderError ? <>
          {panelOpen ? <aside id={panelId} className="nc-living-inspector" aria-label={text('Matavimai','Measurements')} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closePanel()}}}><div className="nc-living-inspector-head"><span>{focused ? text('PASIRINKTAS SENSORIUS','SELECTED SENSOR') : text('IŠMATUOTA ŠILTNAMYJE','MEASURED IN THE GREENHOUSE')}</span><button type="button" onClick={closePanel} aria-label={text('Uždaryti matavimus','Close measurements')}><i className="fa-solid fa-xmark" /></button></div>
            <strong className="nc-living-big-number" data-range={!focused}>{focused ? displayValue(focused)===null ? '—' : number(displayValue(focused)!) : measured.length ? `${number(Math.min(...measured.map(r=>r.value!)))}–${number(Math.max(...measured.map(r=>r.value!)))}` : '—'}<small>{METRICS[metric].unit}</small></strong><p>{focused ? focused.object.name : index===null ? text('Naujų matavimų intervalas','Current reading range') : text('Pasirinkto laiko reikšmės','Readings at selected time')}</p>
            {focused ? <div className="nc-living-sensor-detail"><span>{text('Būsena','Status')}<b>{readingLabel(focused)} · {ageText(focused)}</b></span><span>{text('Matavimo aukštis','Measurement height')}<b>{heightText(focused.heightM)}</b></span><span>{text('Matavimo laikas','Reading time')}<b>{(focused.value===null ? focused.lastTimestamp : focused.timestamp) ? clock((focused.value===null ? focused.lastTimestamp : focused.timestamp)!) : '—'}</b></span>{targets.get(focused.object.id) ? <span>{text('Nustatytos ribos','Configured targets')}<b>{targets.get(focused.object.id)!.map(number).join('–')} {METRICS[metric].unit}</b></span> : null}</div> : <div className="nc-living-range"><span>{index===null ? text('Nauji matavimai','Current readings') : text('Turimi matavimai','Available readings')}<b>{measured.length}/{visibleReadings.length}</b></span><span>{text('Už nustatytų ribų','Outside targets')}<b>{index===null && assessedCount ? `${attentionIds.size}/${assessedCount}` : '—'}</b></span></div>}
            {delayed.length ? <p className="nc-living-delay-summary">{delayed.length} {text('matavimai vėluoja. Paskutinės reikšmės pažymėtos ir neįtrauktos į erdvinį lauką bei naujų matavimų intervalą.','readings are delayed. Last values are marked and excluded from the spatial field and current range.')}</p> : null}
            {index===null && attentionIds.size>0 ? <div className="nc-living-attention"><i className="fa-solid fa-circle-exclamation" />{attentionIds.size} {text('sensorių matavimai už nustatytų ribų. Jie sąraše pirmi.','sensor readings outside configured targets. Listed first.')}</div> : null}
            {comparison && Math.abs(comparison.delta) >= 10 ** -METRICS[metric].decimals && !focused ? <div className="nc-living-comparison"><span>{text('NETOLIESE, SKIRTINGAME AUKŠTYJE','NEARBY, AT DIFFERENT HEIGHTS')}</span><strong>{comparison.delta>0 ? '+' : ''}{number(comparison.delta)} {METRICS[metric].unit}</strong><p>{heightText(comparison.upper.heightM)} − {heightText(comparison.lower.heightM)}</p><small>{text('Sensoriai plane iki 0,5 m atstumu; matavimų laikas skiriasi iki 5 min. Skirtumo priežastis nenustatyta.','Sensors within 0.5 m; readings no more than 5 min apart. The cause of the difference is not established.')}</small><button type="button" onClick={()=>setSelected(comparison.upper.object.id)}>{comparison.upper.object.name} ↗</button><button type="button" onClick={()=>setSelected(comparison.lower.object.id)}>{comparison.lower.object.name} ↗</button></div> : null}
            <div className="nc-living-sensor-list">{visibleReadings.map(s=><button type="button" key={s.object.id} data-selected={selected===s.object.id} data-attention={attentionIds.has(s.object.id)} data-delayed={s.delayed} onClick={()=>setSelected(s.object.id)}><span><i data-missing={displayValue(s)===null}/><span>{s.object.name}<small>{heightText(s.heightM)} · {ageText(s)}</small>{s.delayed ? <small className="nc-living-delay-label">{text('Vėluoja · paskutinis matavimas','Delayed · last reading')}</small> : null}</span></span><b>{valueText(s)}</b></button>)}</div>
            <footer><i className="fa-solid fa-circle-info" />{text('Rodomi tikri matavimai jų vietose. Stogas ir įrangos aukščiai iliustraciniai; nežinomas sensoriaus aukštis nespėjamas.','Measured values at their locations. Roof and equipment heights are illustrative; unknown sensor heights are not guessed.')}</footer>
          </aside> : null}
          <div className="nc-living-view-controls"><button type="button" onClick={()=>renderer.current?.reset()} aria-label={text('Pradinis vaizdas','Reset view')}><i className="fa-solid fa-cube" /></button><span /><button type="button" onClick={()=>renderer.current?.zoom(.85)} aria-label={text('Priartinti','Zoom in')}><i className="fa-solid fa-plus" /></button><button type="button" onClick={()=>renderer.current?.zoom(1.18)} aria-label={text('Atitolinti','Zoom out')}><i className="fa-solid fa-minus" /></button></div>

        </> : null}
      </div>
      {map && geometry && !renderError ? <div className="nc-living-field-legend">
        <details className="nc-living-map-info" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary><i className="fa-solid fa-circle-info" />{geometry.volumeReady ? text('Erdvinis įvertis','Spatial estimate') : text('Matavimo taškai','Measurement points')}</summary><div>
          <p>{geometry.volumeReady ? text('Taškai — tikri matavimai. Spalvos tarp jų — apskaičiuotas įvertis; už matavimo aukščių ribų jis mažiau pagrįstas.','Points are measurements. Colours between them are estimates; beyond measured heights they have less support.') : text('Taškas rodo sensoriaus vietą. Paspauskite, kad matytumėte reikšmę, aukštį ir laiką.','Each point marks a sensor. Select it to see the value, height and reading time.')}</p>
          <dl><div><dt>{text('Matavimai su aukščiu','Readings with height')}</dt><dd>{geometry.knownHeights}/{readings.length}</dd></div>{geometry.heightRange ? <div><dt>{text('Matavimo aukščiai','Measured heights')}</dt><dd>{geometry.heightRange.map(heightText).join('–')}</dd></div> : null}{unknownHeights ? <div><dt>{text('Nenurodytas aukštis','Unknown height')}</dt><dd>{unknownHeights}</dd></div> : null}<div><dt>{text('Laikas','Time')}</dt><dd>{clock(historyTime || new Date(at).toISOString())}</dd></div></dl>
          <p>{colorMode === 'contrast' ? text('Spalvos išryškina skirtumus šiame kadre; jos nerodo augalo būklės.','Colours highlight differences in this frame; they do not indicate crop health.') : text('Tos pačios reikšmės išlaiko tą pačią spalvą.','The same values keep the same colours.')}</p>
        </div></details>
      </div> : null}
    </>

}

/** No requests here: area, metric and history are controlled by the parent map. */
export default function OverviewSpatialClimateMap({ context, history, index, ...props }: Omit<Props, 'map'> & { context: AreaMapContext; history: AreaMapHistory | null }) {
  const map = useMemo(() => livingMap(context, history, index), [context, history, index])
  return <div className="nc-living nc-living-embedded"><SpatialClimateMap {...props} map={map} context={context} index={index} /></div>
}
