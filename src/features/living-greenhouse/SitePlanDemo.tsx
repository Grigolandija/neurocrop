import { useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { createLivingScene, type LivingScene } from './gpuScene'
import { colorLegend } from './colorLegend'
import { planToScene, project } from './sceneMath'
import { SITE_COLORS, siteGeometry, siteRgb, siteVolume } from './siteDemoGeometry'
import { pickSitePoint, SITE_SIZE, siteMetrics, zoneArea, zoneBounds, type SiteMetric, type SiteZone } from './siteDemoModel'
import SitePlanEditor from './SitePlanEditor'
import { loadSitePlan, SITE_PLAN_KEY } from './sitePlanEditing'
import './site-plan-demo.css'

const number = (v: number, decimals = 0) => v.toLocaleString('lt-LT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
function frameZone(scene:LivingScene|null,zone:SiteZone|null,aspect=1){
  if(!scene)return
  const margin=Math.max(1,.9/Math.max(.35,aspect))
  if(!zone){scene.focus(null,SITE_SIZE.widthM*margin);return}
  const bounds=zoneBounds(zone)
  scene.focus(planToScene((bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,zone.height*.35,SITE_SIZE),Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY,zone.height*1.4)*1.12*margin)
}

export default function SitePlanDemo() {
  const [plan, setPlan] = useState(loadSitePlan)
  const [editing, setEditing] = useState(true)
  const [storageError, setStorageError] = useState(false)
  const deferredPlan = useDeferredValue(plan)
  const siteZones = plan.zones
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [sensorId, setSensorId] = useState<string | null>(null)
  const [metric, setMetric] = useState<SiteMetric>('temperature')
  const [engine, setEngine] = useState('')
  const [failed, setFailed] = useState(false)
  const selected = siteZones.find(zone => zone.id === selectedId) || null
  const definition = siteMetrics[metric]
  const geometry = useMemo(() => siteGeometry(selectedId, metric, plan), [selectedId, metric, plan])
  const deferredZone = deferredPlan.zones.find(zone=>zone.id===selectedId) || null
  const calculatedVolume = useMemo(() => siteVolume(deferredZone, metric, deferredPlan), [deferredZone, metric, deferredPlan])
  const emptyVolume = useMemo(() => siteVolume(null, metric, plan), [metric, plan])
  const volume = deferredPlan===plan ? calculatedVolume : emptyVolume
  const scene = useRef<LivingScene | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const outlines = useRef(new Map<string, SVGPolygonElement>())
  const labels = useRef(new Map<string, HTMLButtonElement>())
  const pins = useRef(new Map<string, HTMLButtonElement>())
  const projection = useRef<{ matrix: Float32Array; width: number; height: number } | null>(null)
  const pointerStart = useRef<{ x: number; y: number; pointerId: number; moved: boolean } | null>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const zoneButtons = useRef(new Map<string, HTMLButtonElement>())
  const latest = useRef({ geometry, volume, selected, zones: siteZones })

  const choose = (zone: SiteZone | null) => {
    const previous = selectedId
    setSelectedId(zone?.id || null); setHoveredId(null); setSensorId(null)
    if (!zone && previous) requestAnimationFrame(() => zoneButtons.current.get(previous)?.focus())
    if (zone) requestAnimationFrame(() => backButton.current?.focus())
  }

  useEffect(() => {
    latest.current = { geometry, volume, selected, zones: siteZones }
    scene.current?.update(geometry, SITE_SIZE.widthM, volume)
    scene.current?.setPresentation(selected ? 'volume' : 'points', false, true)
  }, [geometry, volume, selected, siteZones])

  useEffect(() => {
    frameZone(scene.current,latest.current.selected,host.current ? host.current.clientWidth/host.current.clientHeight : 1)
  }, [selectedId, engine, editing])

  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    createLivingScene(host.current, (matrix, width, height) => {
      projection.current = { matrix, width, height }
      for (const zone of latest.current.zones) {
        const polygon = outlines.current.get(zone.id)
        polygon?.setAttribute('points', zone.polygon.map(p => { const v=project(planToScene(p.xM,p.yM,.07,SITE_SIZE),matrix,width,height); return `${v.x},${v.y}` }).join(' '))
        const label = labels.current.get(zone.id)
        if (label) {
          const p = project(planToScene(zone.label.xM,zone.label.yM,zone.kind==='greenhouse' ? zone.height+.35 : .9,SITE_SIZE),matrix,width,height)
          label.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`
          label.style.visibility=p.visible ? 'visible' : 'hidden'
        }
        for (const sensor of zone.sensors) {
          const pin = pins.current.get(sensor.id)
          if (!pin) continue
          const p=project(planToScene(sensor.xM,sensor.yM,sensor.height,SITE_SIZE),matrix,width,height)
          pin.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`
          pin.style.visibility=p.visible && p.x>0 && p.x<width && p.y>0 && p.y<height ? 'visible' : 'hidden'
        }
      }
    }, () => { if (!cancelled) setFailed(true) }, { animateIntro: false, elevation: .85, zoom: .95 }).then(renderer => {
      if (cancelled) { renderer.dispose(); return }
      scene.current=renderer
      renderer.update(latest.current.geometry,SITE_SIZE.widthM,latest.current.volume)
      renderer.setPresentation(latest.current.selected ? 'volume' : 'points',false,true)
      setEngine(renderer.name)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled=true; scene.current?.dispose(); scene.current=null }
  }, [])

  useEffect(() => {
    const timer=setTimeout(()=>{
      try { localStorage.setItem(SITE_PLAN_KEY,JSON.stringify(plan));setStorageError(false) }
      catch { setStorageError(true) }
    },200)
    return ()=>clearTimeout(timer)
  },[plan])
  const changePlan=(next:typeof plan)=>{
    setPlan(next)
    setHoveredId(null)
    if(selectedId && !next.zones.some(zone=>zone.id===selectedId)){setSelectedId(null);setSensorId(null)}
  }

  const hit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const view=projection.current, element=host.current
    if (!view || !element) return null
    const rect=element.getBoundingClientRect()
    const point=pickSitePoint(event.clientX-rect.left,event.clientY-rect.top,view.width,view.height,view.matrix)
    return point ? siteZones.find(zone=>pointInPolygon(point,zone.polygon)) || null : null
  }
  const interactive = (event: ReactPointerEvent<HTMLDivElement>) => (event.target as HTMLElement).closest('button,select,a')
  const values = selected?.sensors.map(sensor=>sensor[metric]) || []
  const legend = colorLegend(definition.min, definition.max, definition.decimals)

  return <div className="nc-site-demo">
    <header className="ncs-header"><Link to="/" className="ncs-brand"><i className="fa-solid fa-seedling" />NeuroCrop</Link><span>INTERAKTYVI DEMONSTRACIJA</span><Link to="/greenhouse-live/demo">Kita demonstracija ↗</Link></header>
    <main className="ncs-main">
      <div className="ncs-heading"><div><p>BENDRAS ŪKIO PLANAS</p><h1>{editing ? 'Susibraižyk savo ūkį.' : 'Vienas ūkis. Visos erdvės.'}</h1><span>{editing ? 'Keisk kontūrus kairėje – rezultatas iškart matomas 3D.' : 'Pasirink zoną plane ir peržiūrėk jos mikroklimatą.'}</span></div><div className="ncs-heading-actions"><span className="ncs-demo-badge">DEMO · sintetiniai duomenys</span><button type="button" aria-pressed={editing} onClick={()=>setEditing(value=>!value)}><i className={`fa-solid ${editing ? 'fa-check' : 'fa-pen-ruler'}`} />{editing ? 'Baigti braižymą' : 'Redaguoti planą'}</button></div></div>
      <div className="ncs-workspace" data-focused={!!selected} data-editing={editing}>
        {editing ? <SitePlanEditor plan={plan} onChange={changePlan} storageError={storageError} onInspectZone={id=>{setSelectedId(id);setSensorId(null);setHoveredId(null)}} /> : <>
        <aside className="ncs-zones" aria-label="Ūkio zonos">
          <button type="button" className="ncs-overview" aria-pressed={!selected} onClick={()=>choose(null)}><i className="fa-solid fa-cubes" /><span>Visas ūkis<small>{plan.buildings.length} pastatai · {plan.zones.length} zonos</small></span></button>
          {(['greenhouse','room'] as const).map(kind=><section key={kind}><h2>{kind==='greenhouse' ? 'Šiltnamių zonos' : 'Pastatų zonos'}</h2>{siteZones.filter(zone=>zone.kind===kind).map(zone=><button type="button" key={zone.id} ref={el=>{if(el)zoneButtons.current.set(zone.id,el);else zoneButtons.current.delete(zone.id)}} aria-pressed={selectedId===zone.id} data-hovered={hoveredId===zone.id} onMouseEnter={()=>setHoveredId(zone.id)} onMouseLeave={()=>setHoveredId(null)} onFocus={()=>setHoveredId(zone.id)} onBlur={()=>setHoveredId(null)} onClick={()=>choose(zone)}><span>{zone.name}<small>{number(zoneArea(zone))} m² · {zone.sensors.length} jutikliai</small></span><i className="fa-solid fa-chevron-right" /></button>)}</section>)}
          <p className="ncs-zone-note">Zonos kontūras apibrėžia stebimą plotą. Sienos apibrėžia fizines patalpas.</p>
        </aside></>}
        <section className="ncs-map">
          <div className="ncs-toolbar"><div>{selected ? <button ref={backButton} type="button" className="ncs-back" onClick={()=>choose(null)}><i className="fa-solid fa-arrow-left" /> Bendras planas</button> : <span className="ncs-map-title">Bendras 3D planas</span>}<span className="ncs-breadcrumb">{selected?.name || '50 × 34 m'}</span></div><label><span className="sr-only">Rodiklis</span><select aria-label="Rodiklis" value={metric} onChange={event=>setMetric(event.target.value as SiteMetric)}>{(Object.keys(siteMetrics) as SiteMetric[]).map(key=><option key={key} value={key}>{siteMetrics[key].label}</option>)}</select></label></div>
          <div className="ncs-scene" ref={host} role="group" aria-label="3D ūkio planas. Pasirinkite zoną pele arba zonų sąraše. Tempkite, kad pasuktumėte. Option / Alt ir ratukas – priartinti." data-hovered={!!hoveredId}
            onKeyDown={event=>{if(event.key==='Escape' && selected){event.stopPropagation();choose(null)}}}
            onPointerDown={event=>{if(interactive(event) || event.button!==0)return;pointerStart.current={x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false};setHoveredId(null)}}
            onPointerMove={event=>{const start=pointerStart.current;if(start && (start.pointerId!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6))start.moved=true;if(event.buttons || interactive(event))return;setHoveredId(hit(event)?.id || null)}}
            onPointerLeave={()=>setHoveredId(null)} onPointerCancel={()=>{pointerStart.current=null}}
            onPointerUp={event=>{const start=pointerStart.current;pointerStart.current=null;if(interactive(event) || !start || start.pointerId!==event.pointerId || start.moved || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;const zone=hit(event);if(zone && zone.id!==selectedId)choose(zone)}}>
            <svg className="ncs-zone-outlines" aria-hidden="true">{siteZones.map(zone=><polygon key={zone.id} ref={el=>{if(el)outlines.current.set(zone.id,el);else outlines.current.delete(zone.id)}} data-highlighted={hoveredId===zone.id || selectedId===zone.id} />)}</svg>
            {!selected && siteZones.map(zone=><button type="button" className="ncs-zone-label" key={zone.id} ref={el=>{if(el)labels.current.set(zone.id,el);else labels.current.delete(zone.id)}} onMouseEnter={()=>setHoveredId(zone.id)} onMouseLeave={()=>setHoveredId(null)} onClick={()=>choose(zone)} data-hovered={hoveredId===zone.id}><span>{zone.name}</span><i className="fa-solid fa-arrow-up-right-from-square" /></button>)}
            {selected && <>
              <div className="ncs-selection-summary" aria-live="polite"><span>{selected.name}</span><strong>{number(Math.min(...values),definition.decimals)}–{number(Math.max(...values),definition.decimals)} <small>{definition.unit}</small></strong><p>{selected.sensors.length} jutikliai · {number(Math.min(...selected.sensors.map(s=>s.height)),1)}–{number(Math.max(...selected.sensors.map(s=>s.height)),1)} m aukštyje</p></div>
              {selected.sensors.map(sensor=><button type="button" className="ncs-sensor" key={sensor.id} ref={el=>{if(el){pins.current.set(sensor.id,el);scene.current?.invalidate()}else pins.current.delete(sensor.id)}} aria-label={`${sensor.id}: ${number(sensor[metric],definition.decimals)} ${definition.unit}, ${number(sensor.height,1)} m aukštyje`} aria-pressed={sensorId===sensor.id} onClick={()=>setSensorId(value=>value===sensor.id ? null : sensor.id)}><i style={{background:`rgb(${siteRgb(sensor[metric],metric).join(' ')})`}} /><span><b>{number(sensor[metric],definition.decimals)} {definition.unit}</b><small>{sensor.id} · {number(sensor.height,1)} m</small></span></button>)}
              <div className="ncs-colorbar" role="img" aria-label={`${definition.label}, skalė nuo ${definition.min} iki ${definition.max} ${definition.unit}`}><b>{definition.unit}</b><div><i style={{background:`linear-gradient(0deg, ${SITE_COLORS.join(',')})`}} /><span>{legend.ticks.map(tick=><em key={tick.value} style={{top:`${tick.position*100}%`}}>{number(tick.value,legend.decimals)}</em>)}</span></div></div>
            </>}
            <div className="ncs-camera"><button type="button" aria-label="Pradinis vaizdas" title="Pradinis vaizdas" onClick={()=>{scene.current?.reset();frameZone(scene.current,selected,host.current ? host.current.clientWidth/host.current.clientHeight : 1)}}><i className="fa-solid fa-cube" /></button><button type="button" aria-label="Priartinti" onClick={()=>scene.current?.zoom(.85)}>+</button><button type="button" aria-label="Atitolinti" onClick={()=>scene.current?.zoom(1.18)}>−</button><span>Option / Alt + ratukas</span></div>
            {!plan.buildings.length && engine && <div className="ncs-plan-empty">Nubrėžk pirmą pastatą plano redaktoriuje.</div>}
            {!engine && !failed && <div className="ncs-status" role="status">Ruošiamas 3D planas…</div>}
            {failed && <div className="ncs-status" role="alert">3D vaizdo paleisti nepavyko. Pabandykite naršyklę su WebGL 2 arba WebGPU palaikymu.</div>}
          </div>
          <footer className="ncs-footer"><span><i className="fa-solid fa-circle-info" />{selected ? 'Taškai – pavyzdiniai matavimai nurodytame aukštyje. Spalvos tarp jų – įvertis.' : 'Užvesk – paryškink kontūrą. Paspausk – atverk zonos heatmap.'}</span><span>{editing ? 'Gyva 3D peržiūra' : 'Atviras stogas – patalpų vidui matyti'}</span></footer>
        </section>
      </div>
    </main>
  </div>
}
