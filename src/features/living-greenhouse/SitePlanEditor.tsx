import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { siteEditorText } from './siteEditorText'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { createSitePlan, siteDimensions, zoneArea, type SitePlan, type SitePoint } from './siteDemoModel'
import { addSiteEntity, deleteSiteEntity, editSitePolygon, moveSiteEntity, normalizeSitePlan, validateSitePlan, type PlanLayer, type PlanSelection } from './sitePlanEditing'
import './site-plan-editor.css'

type Props={plan:SitePlan;onChange:(plan:SitePlan)=>void;onInspectZone:(id:string)=>void;storageError?:boolean;production?:boolean;areas?:Array<{id:string;name:string}>;saveStateLabel?:string}
type Drag={base:SitePlan;selection:PlanSelection;start:SitePoint;vertex?:number;sensor?:number;accepted:boolean;pointerId:number}
const names:Record<PlanLayer,string>={buildings:'Pastatai',rooms:'Patalpos',zones:'Zonos'}
const layerClasses:Record<PlanLayer,string>={buildings:'nce-buildings',rooms:'nce-rooms',zones:'nce-zones'}

export default function SitePlanEditor({plan,onChange,onInspectZone,storageError,production=false,areas=[],saveStateLabel}:Props){
  const {language}=useInterfaceLanguage(),english=production && language==='en'
  const t=(value:string)=>siteEditorText(value,english)
  const format=(value:number)=>value.toLocaleString(english ? 'en-GB' : 'lt-LT',{maximumFractionDigits:2})
  const dimensions=siteDimensions(plan)
  const drawingScale=Math.max(dimensions.widthM/50,dimensions.lengthM/34)
  const gridStep=Math.max(1,10**Math.floor(Math.log10(Math.max(dimensions.widthM,dimensions.lengthM)/50)))
  const points=(polygon:SitePoint[])=>polygon.map(p=>`${p.xM},${dimensions.lengthM-p.yM}`).join(' ')
  const [layer,setLayer]=useState<PlanLayer>(production && !plan.buildings.length ? 'buildings' : 'rooms')
  const [mode,setMode]=useState<'select'|'draw'>('select')
  const [selection,setSelection]=useState<PlanSelection|null>(production ? null : {layer:'rooms',id:'room-l'})
  const [vertex,setVertex]=useState(0)
  const [draft,setDraft]=useState<SitePoint[]>([])
  const [cursor,setCursor]=useState<SitePoint|null>(null)
  const [snap,setSnap]=useState(true)
  const [greenhouse,setGreenhouse]=useState(true)
  const [message,setMessage]=useState(t('Pasirinkite kontūrą. Tempkite taškus arba dukart spustelėkite kraštinę, kad pridėtumėte tašką.'))
  const [undo,setUndo]=useState<SitePlan[]>([])
  const [redo,setRedo]=useState<SitePlan[]>([])
  const drag=useRef<Drag|null>(null)
  const svg=useRef<SVGSVGElement>(null)
  const patternId=useId().replaceAll(':','')
  const entity=selection ? plan[selection.layer].find(item=>item.id===selection.id) : undefined
  const selectedZone=selection?.layer==='zones' ? plan.zones.find(z=>z.id===selection.id) : null
  const selectedRoom=selection?.layer==='rooms' ? plan.rooms.find(r=>r.id===selection.id) : null
  const associatedZone=selectedZone || (selectedRoom ? plan.zones.find(z=>z.roomId===selectedRoom.id) : selection?.layer==='buildings' ? plan.zones.find(z=>z.buildingId===selection.id) : null)
  const remember=(base:SitePlan)=>{setUndo(previous=>[...previous.slice(-29),base]);setRedo([])}
  const apply=(result:{plan:SitePlan;error:string|null},base=plan)=>{
    if(result.error){setMessage(t(result.error));return false}
    remember(base);onChange(result.plan);setMessage(t("Pakeitimas rodomas 3D vaizde."));return true
  }
  const point=(event:ReactPointerEvent<SVGElement>):SitePoint=>{
    const matrix=svg.current?.getScreenCTM()
    if(!matrix)return {xM:0,yM:0}
    const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    const rounding=(n:number)=>snap ? Math.round(n*4)/4 : Math.round(n*100)/100
    return {xM:Math.max(0,Math.min(dimensions.widthM,rounding(local.x))),yM:Math.max(0,Math.min(dimensions.lengthM,rounding(dimensions.lengthM-local.y)))}
  }
  const startDrag=(event:ReactPointerEvent<SVGElement>,item:PlanSelection,index?:number,sensor?:number)=>{
    if(mode!=='select' || event.button!==0)return
    event.stopPropagation();event.preventDefault()
    setSelection(item);if(index!==undefined)setVertex(index)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current={base:plan,selection:item,start:point(event),vertex:index,sensor,accepted:false,pointerId:event.pointerId}
  }
  const finish=()=>{
    const result=addSiteEntity(plan,layer,draft,greenhouse,!production)
    if(english && result.id){const item=result.plan[layer].find(e=>e.id===result.id);if(item)item.name=`${layer==='buildings' ? (greenhouse ? 'Greenhouse' : 'Building') : layer==='rooms' ? 'Room' : 'Zone'} ${result.plan[layer].length}`}
    if(!apply(result))return
    setSelection({layer,id:result.id!});setVertex(0);setDraft([]);setCursor(null);setMode('select')
    if(layer==='zones')onInspectZone(result.id!)
  }
  const alterVertex=(index:number,position:SitePoint)=>{
    if(!selection || !entity)return
    const polygon=entity.polygon.map((p,i)=>i===index ? position : p)
    apply(editSitePolygon(plan,selection,polygon,index))
  }
  const removeVertex=(index:number)=>{
    if(!selection || !entity)return
    if(apply(editSitePolygon(plan,selection,entity.polygon.filter((_,i)=>i!==index))))setVertex(Math.max(0,index-1))
  }
  const addVertex=(index:number,position?:SitePoint)=>{
    if(!selection || !entity)return
    const a=entity.polygon[index],b=entity.polygon[(index+1)%entity.polygon.length]
    const polygon=entity.polygon.toSpliced(index+1,0,position || {xM:(a.xM+b.xM)/2,yM:(a.yM+b.yM)/2})
    if(apply(editSitePolygon(plan,selection,polygon)))setVertex(index+1)
  }
  const updateProperty=(key:'name'|'height',value:string|number)=>{
    if(!selection)return
    const next=structuredClone(plan),item=next[selection.layer].find(e=>e.id===selection.id)
    if(!item)return
    if(key==='name')item.name=String(value)
    else {
      const parent=selectedRoom ? plan.buildings.find(b=>b.id===selectedRoom.buildingId) : null
      if(parent && Number(value)>parent.height){setMessage(t("Patalpos aukštis negali viršyti pastato. Pirmiausia padidinkite pastato aukštį."));return}
      item.height=Number(value)
    }
    const error=validateSitePlan(next)
    if(error){setMessage(t(error));return}
    remember(plan);onChange(normalizeSitePlan(next));setMessage(t("Pakeitimas rodomas 3D vaizde."))
  }
  const cancel=()=>{setDraft([]);setCursor(null);setMode('select');if(drag.current){onChange(drag.current.base);drag.current=null}setMessage(t("Braižymas atšauktas."))}
  const undoChange=()=>{const previous=undo.at(-1);if(!previous)return;setRedo(current=>[plan,...current]);setUndo(current=>current.slice(0,-1));onChange(previous);setDraft([]);setMode('select');setMessage(t("Pakeitimas atšauktas."))}
  const redoChange=()=>{const next=redo[0];if(!next)return;setUndo(current=>[...current,plan]);setRedo(current=>current.slice(1));onChange(next);setMessage(t("Pakeitimas pakartotas."))}

  return <aside className="nce-editor" aria-label={t("Plano redaktorius")} onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();cancel()}
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z' && !(event.target instanceof HTMLInputElement)){event.preventDefault();if(event.shiftKey)redoChange();else undoChange()}
  }}>
    <header className="nce-header"><strong>{t("Plano redaktorius")}</strong><div><button type="button" aria-label={t("Atšaukti pakeitimą")} title={t("Atšaukti (⌘ / Ctrl + Z)")} disabled={!undo.length} onClick={undoChange}><i className="fa-solid fa-rotate-left" /></button><button type="button" aria-label={t("Pakartoti pakeitimą")} title={t("Pakartoti (⌘ / Ctrl + Shift + Z)")} disabled={!redo.length} onClick={redoChange}><i className="fa-solid fa-rotate-right" /></button></div></header>
    {production && <details className="nce-dimensions"><summary>{english ? 'Plan dimensions' : 'Plano matmenys'} · {format(dimensions.widthM)} × {format(dimensions.lengthM)} m</summary><div>{(['widthM','lengthM'] as const).map(axis=><label key={axis}>{t(axis==='widthM' ? 'Plotis, m' : 'Ilgis, m')}<input type="number" min="1" max="10000" step="1" value={dimensions[axis]} onChange={event=>{const value=event.target.valueAsNumber;if(!Number.isFinite(value))return;const next={...plan,dimensions:{...dimensions,[axis]:value}};apply({plan:next,error:validateSitePlan(next)})}} /></label>)}</div></details>}
    <div className="nce-layers" aria-label={t("Redaguojamas sluoksnis")}>{(Object.keys(names) as PlanLayer[]).map(key=><button type="button" key={key} aria-pressed={layer===key} onClick={()=>{setLayer(key);setDraft([]);setMode('select');setSelection(null);setMessage(t(key==='zones' ? 'Zona yra stebimas plotas. Jos kontūras nesukuria sienos.' : key==='rooms' ? 'Patalpos kontūras sukuria sienas. Bendri sienų taškai juda kartu.' : 'Braižykite šiltnamio arba pastato išorinį kontūrą.'))}}>{t(names[key])} <small>{plan[key].length}</small></button>)}</div>
    <div className="nce-tools"><button type="button" aria-pressed={mode==='select'} onClick={()=>{setMode('select');setDraft([])}}><i className="fa-solid fa-arrow-pointer" />{t("Pasirinkti")}</button><button type="button" aria-pressed={mode==='draw'} onClick={()=>{setMode('draw');setDraft([]);setSelection(null);setMessage(t("Dėkite kontūro taškus. Užbaikite paspaudę pirmą tašką arba „Užbaigti“."))}}><i className="fa-solid fa-plus" />{t("Brėžti")}</button>{layer==='buildings' && <label><span className="sr-only">{t("Naujo pastato tipas")}</span><select value={greenhouse ? 'greenhouse' : 'building'} onChange={event=>setGreenhouse(event.target.value==='greenhouse')}><option value="greenhouse">{t("Šiltnamis")}</option><option value="building">{t("Pastatas")}</option></select></label>}<label className="nce-snap"><input type="checkbox" checked={snap} onChange={event=>setSnap(event.target.checked)} /> 0,25 m</label></div>
    <svg ref={svg} className="nce-canvas" viewBox={`${-dimensions.widthM*.028} ${-dimensions.lengthM*.03} ${dimensions.widthM*1.06} ${dimensions.lengthM*1.07}`} role="group" aria-label={`${dimensions.widthM} × ${dimensions.lengthM} ${english ? 'metre plan drawing' : 'metrų plano brėžinys'}`} tabIndex={0} data-drawing={mode==='draw'}
      onKeyDown={event=>{if(event.key==='Enter' && mode==='draw'){event.preventDefault();finish()}}}
      onPointerDown={event=>{if(event.button!==0)return;if(mode==='draw'){event.preventDefault();event.currentTarget.focus();const next=point(event);setDraft(current=>[...current,next]);setCursor(next)}else setSelection(null)}}
      onPointerMove={event=>{
        const current=drag.current,p=point(event)
        if(!current){if(mode==='draw')setCursor(p);return}
        if(event.pointerId!==current.pointerId)return
        let result:{plan:SitePlan;error:string|null}
        const item=current.base[current.selection.layer].find(e=>e.id===current.selection.id)!
        if(current.sensor!==undefined){
          const next=structuredClone(current.base),zone=next.zones.find(z=>z.id===current.selection.id)!
          if(!pointInPolygon(p,zone.polygon)){setMessage(t("Jutiklis turi likti savo zonoje."));return}
          zone.sensors[current.sensor]={...zone.sensors[current.sensor],...p};result={plan:normalizeSitePlan(next),error:null}
        }else if(current.vertex!==undefined){const polygon=item.polygon.map((v,i)=>i===current.vertex ? p : v);result=editSitePolygon(current.base,current.selection,polygon,current.vertex)}
        else result=moveSiteEntity(current.base,current.selection,p.xM-current.start.xM,p.yM-current.start.yM)
        if(result.error){setMessage(t(result.error));return}
        current.accepted=true;onChange(result.plan);setMessage(t("3D vaizdas atnaujinamas pagal kontūrą."))
      }}
      onPointerUp={event=>{const current=drag.current;if(!current || current.pointerId!==event.pointerId)return;drag.current=null;if(current.accepted)remember(current.base)}}
      onPointerCancel={()=>{if(drag.current)onChange(drag.current.base);drag.current=null}}>
      <defs><pattern id={patternId} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#e6ece1" strokeWidth={.045*drawingScale} /></pattern></defs>
      <rect x="0" y="0" width={dimensions.widthM} height={dimensions.lengthM} fill={`url(#${patternId})`} stroke="#bbcdb6" strokeWidth={.1*drawingScale} />
      {Array.from({length:11},(_,i)=>i*dimensions.widthM/10).map(x=><text className="nce-ruler" style={{fontSize:.6*drawingScale}} key={`x${x}`} x={x} y={dimensions.lengthM*1.03}>{format(x)}</text>)}{Array.from({length:7},(_,i)=>i*dimensions.lengthM/6).map(y=><text className="nce-ruler" style={{fontSize:.6*drawingScale}} key={`y${y}`} x={-dimensions.widthM*.02} y={dimensions.lengthM-y+dimensions.lengthM*.006}>{format(y)}</text>)}
      {(['buildings','rooms','zones'] as PlanLayer[]).map(key=><g key={key} className={`nce-layer ${layerClasses[key]}`} data-active={layer===key}>{plan[key].map(item=><g key={item.id}><polygon points={points(item.polygon)} data-selected={selection?.id===item.id && selection.layer===key} aria-label={item.name} role={layer===key && mode==='select' ? 'button' : undefined} tabIndex={layer===key && mode==='select' ? 0 : undefined} onKeyDown={event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();setSelection({layer:key,id:item.id})}}} onPointerDown={event=>startDrag(event,{layer:key,id:item.id})} /><text className="nce-object-label" style={{fontSize:.85*drawingScale}} x={key==='zones' ? (item as SiteZoneLike).label.xM : item.polygon[0].xM+.35} y={dimensions.lengthM-(key==='zones' ? (item as SiteZoneLike).label.yM : item.polygon[0].yM+.65)}>{item.name || t('Be pavadinimo')}</text></g>)}</g>)}
      {entity && mode==='select' && selection?.layer===layer && <g className="nce-handles">
        {entity.polygon.map((p,i)=>{
          const q=entity.polygon[(i+1)%entity.polygon.length]
          return <g key={i}>
            <line className="nce-edge-hit" x1={p.xM} y1={dimensions.lengthM-p.yM} x2={q.xM} y2={dimensions.lengthM-q.yM} onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>{
              event.stopPropagation()
              const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
              const dx=q.xM-p.xM,dy=q.yM-p.yM,t=Math.max(0,Math.min(1,((local.x-p.xM)*dx+(dimensions.lengthM-local.y-p.yM)*dy)/(dx*dx+dy*dy)))
              addVertex(i,{xM:p.xM+dx*t,yM:p.yM+dy*t})
            }} />
            <circle className="nce-midpoint" cx={(p.xM+q.xM)/2} cy={dimensions.lengthM-(p.yM+q.yM)/2} r={.18*drawingScale} onPointerDown={event=>{event.stopPropagation();addVertex(i)}} />
          </g>
        })}
        {entity.polygon.map((p,i)=><circle key={i} role="button" tabIndex={0} aria-label={`${t('Kontūro taškas')} ${i+1}: X ${format(p.xM)}, Y ${format(p.yM)} m`} data-active={vertex===i} cx={p.xM} cy={dimensions.lengthM-p.yM} r={.32*drawingScale} onPointerDown={event=>startDrag(event,selection,i)} onFocus={()=>setVertex(i)} onKeyDown={event=>{
          if(event.key==='Delete' || event.key==='Backspace'){event.preventDefault();removeVertex(i)}
          const delta=event.shiftKey ? 1 : .25
          const shifts:Record<string,SitePoint>={ArrowLeft:{xM:-delta,yM:0},ArrowRight:{xM:delta,yM:0},ArrowUp:{xM:0,yM:delta},ArrowDown:{xM:0,yM:-delta}}
          if(shifts[event.key]){event.preventDefault();event.stopPropagation();alterVertex(i,{xM:p.xM+shifts[event.key].xM,yM:p.yM+shifts[event.key].yM})}
        }} />)}
      </g>}
      {selectedZone && layer==='zones' && mode==='select' && selectedZone.sensors.map((sensor,i)=><circle className="nce-sensor" key={sensor.id} cx={sensor.xM} cy={dimensions.lengthM-sensor.yM} r=".24" onPointerDown={event=>startDrag(event,selection!,undefined,i)}><title>{sensor.id} · {format(sensor.height)} m aukštyje</title></circle>)}
      {draft.length>0 && <g className="nce-draft"><polyline points={points(cursor ? [...draft,cursor] : draft)} />{draft.map((p,i)=><circle key={i} cx={p.xM} cy={dimensions.lengthM-p.yM} r={(i===0 ? .4 : .22)*drawingScale} onPointerDown={event=>{if(i===0 && draft.length>=3){event.stopPropagation();finish()}}} />)}</g>}
    </svg>
    <div className="nce-message" role="status">{message}{draft.length>0 && <span>{draft.length} {english ? 'vertices' : 'taškai'} <button type="button" disabled={draft.length<3} onClick={finish}>{t("Užbaigti")}</button><button type="button" onClick={()=>setDraft(current=>current.slice(0,-1))}>{t("Atgal")}</button><button type="button" onClick={cancel}>{t("Atšaukti")}</button></span>}</div>
    {entity && selection && <div className="nce-properties"><div className="nce-property-title"><strong>{t(names[selection.layer])} · {format(zoneArea(entity))} m²</strong><button type="button" className="nce-delete" onClick={()=>{remember(plan);onChange(deleteSiteEntity(plan,selection));setSelection(null);setMessage(t("Objektas pašalintas. Galite atšaukti šį veiksmą."))}}><i className="fa-solid fa-trash" />{t("Ištrinti")}</button></div><div className="nce-property-row"><label>{t("Pavadinimas")}<input aria-label={t("Objekto pavadinimas")} value={entity.name} maxLength={160} onChange={event=>updateProperty('name',event.target.value)} /></label>{selection.layer!=='zones' && <label>{t("Aukštis, m")}<input aria-label={t("Patalpos arba pastato aukštis")} type="number" step="0.1" min="0.5" max="12" value={entity.height} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))updateProperty('height',event.target.valueAsNumber)}} /></label>}</div>
      <div className="nce-vertex-row"><label>{t("Taškas")}<select aria-label={t("Kontūro taškas")} value={Math.min(vertex,entity.polygon.length-1)} onChange={event=>setVertex(Number(event.target.value))}>{entity.polygon.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>{(['xM','yM'] as const).map(axis=><label key={axis}>{axis==='xM' ? 'X, m' : 'Y, m'}<input type="number" step="0.25" value={entity.polygon[Math.min(vertex,entity.polygon.length-1)][axis]} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))alterVertex(Math.min(vertex,entity.polygon.length-1),{...entity.polygon[Math.min(vertex,entity.polygon.length-1)],[axis]:event.target.valueAsNumber})}} /></label>)}<button type="button" title={t("Pridėti tašką po pasirinkto")} onClick={()=>addVertex(Math.min(vertex,entity.polygon.length-1))}>{t("+ taškas")}</button><button type="button" aria-label={t("Pašalinti pasirinktą tašką")} disabled={entity.polygon.length<=3} onClick={()=>removeVertex(Math.min(vertex,entity.polygon.length-1))}>−</button></div>
      {selectedZone && production && <label className="nce-area-binding">{t("Susieti su esama Area")}<select value={selectedZone.areaId || ''} onChange={event=>{const next=structuredClone(plan);next.zones.find(z=>z.id===selectedZone.id)!.areaId=event.target.value || undefined;remember(plan);onChange(next);setMessage(t("Susiejimas pakeistas. Išsaugokite bendrą planą."))}}><option value="">{t("Nesusieta")}</option>{areas.map(area=><option key={area.id} value={area.id} disabled={plan.zones.some(z=>z.id!==selectedZone.id && z.areaId===area.id)}>{area.name}</option>)}</select><small>{t("Susiejami esami matavimai. Jutiklių vietos ir atskiras Area planas nekeičiami.")}</small></label>}
      {associatedZone && (!production || associatedZone.areaId) && <button type="button" className="nce-heatmap" onClick={()=>onInspectZone(associatedZone.id)}><i className="fa-solid fa-cube" />{t("Atverti zonos heatmap")}</button>}
      {selectedZone && !production && <details className="nce-sensors"><summary>Pavyzdiniai jutikliai · {selectedZone.sensors.length}</summary><p>Taškus galima tempti plane. Už kontūro likę pavyzdiniai jutikliai perkeliami į jo vidų.</p>{selectedZone.sensors.map((sensor,i)=><label key={sensor.id}>{sensor.id}<span><input aria-label={`${sensor.id} aukštis metrais`} type="number" min="0.1" max={selectedZone.height-.1} step="0.1" value={Number(sensor.height.toFixed(2))} onChange={event=>{const h=event.target.valueAsNumber;if(!Number.isFinite(h) || h<.1 || h>=selectedZone.height)return;const next=structuredClone(plan);next.zones.find(z=>z.id===selectedZone.id)!.sensors[i].height=h;remember(plan);onChange(normalizeSitePlan(next))}} /> m</span></label>)}</details>}
    </div>}
    <div className="nce-bottom"><span data-error={storageError}>{saveStateLabel || (storageError ? 'Nepavyko išsaugoti naršyklėje.' : 'Automatiškai saugoma šioje naršyklėje.')}</span><div><button type="button" onClick={()=>{remember(plan);onChange({version:1,dimensions:{...dimensions},buildings:[],rooms:[],zones:[]});setSelection(null);setDraft([]);setMode('select');setLayer('buildings');setMessage(t("Tuščias planas. Pasirinkite „Brėžti“ ir sukurkite pirmą pastatą."))}}>{t("Tuščias planas")}</button>{!production && <button type="button" onClick={()=>{remember(plan);onChange(createSitePlan());setSelection(null);setDraft([]);setMode('select');setMessage('Atkurtas pradinis pavyzdys.')}}>Atkurti pavyzdį</button>}</div></div>
  </aside>
}

type SiteZoneLike={label:SitePoint}
