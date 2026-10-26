import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { siteEditorText } from '../living-greenhouse/siteEditorText'
import { zoneArea, zoneBounds, type SitePoint } from '../living-greenhouse/siteDemoModel'
import { insideLabel } from '../living-greenhouse/sitePlanEditing'
import { editFarmArea, insertFarmArea, moveFarmArea, resizeFarmArea, validateFarmAreaPlan, type FarmArea, type FarmPlanDocument } from './farmPlanData'
import '../living-greenhouse/site-plan-editor.css'
import './farm-area-editor.css'

type Props={plan:FarmPlanDocument;onChange:(plan:FarmPlanDocument)=>void;areas:FarmArea[];onSections:(id:string,create:boolean)=>void;disabled?:boolean;selectedId?:string|null;onSelect?:(id:string|null)=>void}
type Drag={plan:FarmPlanDocument;id:string;start:SitePoint;vertex?:number;edge?:number;pointerId:number;changed:boolean}
function NumberField({label,value,onCommit,min=0,max=10000,step=.25}:{label:string;value:number;onCommit:(n:number)=>void;min?:number;max?:number;step?:number}){
  const [text,setText]=useState(String(Math.round(value*1000)/1000))
  const commit=()=>{const next=Number(text);if(text.trim() && Number.isFinite(next) && next>=min && next<=max)onCommit(next);setText(String(value))}
  return <label>{label}<input type="number" min={min} max={max} step={step} value={text} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label>
}

export default function FarmAreaEditor({plan,onChange,areas,onSections,disabled=false,selectedId,onSelect}:Props){
  const {language}=useInterfaceLanguage(),lt=language==='lt',t=(value:string)=>siteEditorText(value,!lt)
  const [ownSelected,setOwnSelected]=useState<string|null>(plan.areas[0]?.id || null)
  const selected=selectedId===undefined ? ownSelected : selectedId
  const setSelected=(id:string|null)=>{setOwnSelected(id);onSelect?.(id)}
  const [vertex,setVertex]=useState(0),[snap,setSnap]=useState(true)
  const [message,setMessage]=useState(''),[undo,setUndo]=useState<FarmPlanDocument[]>([]),[redo,setRedo]=useState<FarmPlanDocument[]>([])
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),pattern=useId().replaceAll(':','')
  const [size,setSize]=useState({width:600,height:400})
  useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r?.width && r.height)setSize({width:r.width,height:r.height})});observer.observe(el);return()=>observer.disconnect()},[])
  const d=plan.dimensions,unit=Math.max(d.widthM*1.1/size.width,d.lengthM*1.12/size.height)
  const gridStep=Math.max(.25,10**Math.floor(Math.log10(Math.max(d.widthM,d.lengthM)/50)))
  const points=(polygon:SitePoint[])=>polygon.map(p=>`${p.xM},${d.lengthM-p.yM}`).join(' ')
  const area=plan.areas.find(a=>a.id===selected),saved=areas.find(a=>a.id===selected),bounds=area ? zoneBounds(area) : null
  const remember=(before:FarmPlanDocument)=>{setUndo(p=>[...p.slice(-29),before]);setRedo([])}
  const commit=(result:{plan:FarmPlanDocument;error:string|null})=>{
    if(result.error){setMessage(t(result.error));return false}
    remember(plan);onChange(result.plan);setMessage('');return true
  }
  const add=()=>{
    try{const next=insertFarmArea(plan,!lt);remember(plan);onChange(next.plan);setSelected(next.id);setVertex(0);setMessage(lt ? 'Forma įterpta. Pakeiskite pavadinimą, matmenis ir kontūrą.' : 'Area inserted. Set its name, dimensions and outline.')}
    catch(error){setMessage(error instanceof Error ? t(error.message) : 'Area could not be added.')}
  }
  const revert=(forward=false)=>{
    const next=forward ? redo[0] : undo.at(-1);if(!next)return
    if(forward){setUndo(p=>[...p,plan]);setRedo(p=>p.slice(1))}else{setRedo(p=>[plan,...p]);setUndo(p=>p.slice(0,-1))}
    onChange(next);setMessage('')
  }
  const point=(event:ReactPointerEvent<SVGElement>):SitePoint=>{
    const matrix=svg.current?.getScreenCTM();if(!matrix)return {xM:0,yM:0}
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    const round=(n:number)=>snap ? Math.round(n*4)/4 : Math.round(n*100)/100
    return {xM:round(p.x),yM:round(d.lengthM-p.y)}
  }
  const begin=(event:ReactPointerEvent<SVGElement>,id:string,index?:number,edge?:number)=>{
    if(disabled || event.button!==0)return
    event.stopPropagation();event.preventDefault();setSelected(id);if(index!==undefined)setVertex(index)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current={plan,id,start:point(event),vertex:index,edge,pointerId:event.pointerId,changed:false}
  }
  const alterVertex=(index:number,p:SitePoint)=>{if(area)commit(editFarmArea(plan,area.id,{polygon:area.polygon.map((q,i)=>i===index ? p : q)}))}
  const addVertex=(index:number)=>{
    if(!area)return
    const a=area.polygon[index],b=area.polygon[(index+1)%area.polygon.length]
    if(commit(editFarmArea(plan,area.id,{polygon:area.polygon.toSpliced(index+1,0,{xM:(a.xM+b.xM)/2,yM:(a.yM+b.yM)/2})})))setVertex(index+1)
  }
  const removeVertex=(index:number)=>{if(area && commit(editFarmArea(plan,area.id,{polygon:area.polygon.filter((_,i)=>i!==index)})))setVertex(Math.max(0,index-1))}
  const format=(n:number)=>n.toLocaleString(lt ? 'lt-LT' : 'en-GB',{maximumFractionDigits:1})
  const selectedVertex=area ? Math.min(vertex,area.polygon.length-1) : 0
  const changeDimensions=(axis:'widthM'|'lengthM',value:number)=>{const next={...plan,dimensions:{...d,[axis]:value}};commit({plan:next,error:validateFarmAreaPlan(next)})}
  return <aside className="nfa-editor" aria-label={lt ? 'Ūkio plano redaktorius' : 'Farm plan editor'} inert={disabled} onKeyDown={event=>{
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z' && !(event.target instanceof HTMLInputElement)){event.preventDefault();revert(event.shiftKey)}
    if(event.key==='Escape'){setSelected(null);setMessage('')}
  }}>
    <header className="nfa-header"><strong>{lt ? 'Auginimo erdvės' : 'Growing Areas'} <span>{plan.areas.length}</span></strong><div><button type="button" aria-label={lt ? 'Atšaukti pakeitimą' : 'Undo'} disabled={!undo.length} onClick={()=>revert()}><i className="fa-solid fa-rotate-left" /></button><button type="button" aria-label={lt ? 'Pakartoti pakeitimą' : 'Redo'} disabled={!redo.length} onClick={()=>revert(true)}><i className="fa-solid fa-rotate-right" /></button></div></header>
    <div className="nfa-insert"><button type="button" onClick={add} disabled={plan.areas.length>=80}><i className="fa-solid fa-plus" />{lt ? 'Pridėti Area' : 'Add Area'}</button><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)} />{lt ? 'Tinklelis 0,25 m' : 'Snap 0.25 m'}</label></div>
    <details className="nfa-plan-settings"><summary>{lt ? 'Ūkio pavadinimas ir plano matmenys' : 'Farm name and plan dimensions'}</summary><label>{lt ? 'Ūkio pavadinimas' : 'Farm name'}<input value={plan.name} maxLength={120} onChange={e=>{remember(plan);onChange({...plan,name:e.target.value})}} /></label><div>{(['widthM','lengthM'] as const).map(axis=><NumberField key={`${axis}-${d[axis]}`} label={axis==='widthM' ? (lt ? 'Plotis, m' : 'Width, m') : (lt ? 'Ilgis, m' : 'Length, m')} value={d[axis]} min={1} step={1} onCommit={value=>changeDimensions(axis,value)} />)}</div></details>
    <svg ref={svg} className="nce-canvas nfa-canvas" style={{aspectRatio:`${d.widthM*1.1}/${d.lengthM*1.12}`}} viewBox={`${-d.widthM*.065} ${-d.lengthM*.04} ${d.widthM*1.1} ${d.lengthM*1.12}`} role="group" aria-label={lt ? 'Erdvių kontūrai bendrame plane' : 'Area outlines in the farm plan'} onPointerDown={()=>setSelected(null)}
      onPointerMove={event=>{
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return
        const p=point(event),a=active.plan.areas.find(a=>a.id===active.id)!
        const b=zoneBounds(a)
        const result=active.edge!==undefined ? editFarmArea(active.plan,a.id,{polygon:a.polygon.map((v,i)=>i===active.edge || i===(active.edge!+1)%a.polygon.length ? {xM:v.xM+p.xM-active.start.xM,yM:v.yM+p.yM-active.start.yM} : v)}) : active.vertex===undefined ? moveFarmArea(active.plan,a.id,b.minX+p.xM-active.start.xM,b.minY+p.yM-active.start.yM) : editFarmArea(active.plan,a.id,{polygon:a.polygon.map((v,i)=>i===active.vertex ? p : v)})
        if(result.error){setMessage(t(result.error));return}
        active.changed=true;onChange(result.plan);setMessage('')
      }} onPointerUp={event=>{const active=drag.current;if(!active || active.pointerId!==event.pointerId)return;drag.current=null;if(active.changed)remember(active.plan)}} onPointerCancel={()=>{if(drag.current)onChange(drag.current.plan);drag.current=null}}>
      <defs><pattern id={pattern} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#e1e8e0" strokeWidth={unit*.5} /></pattern></defs>
      <rect width={d.widthM} height={d.lengthM} fill={`url(#${pattern})`} stroke="#b8cabb" strokeWidth={unit} />
      {Array.from({length:6},(_,i)=>i/5).map(r=><g key={r}><text className="nfa-ruler" style={{fontSize:`${11*unit}px`}} x={r*d.widthM} y={d.lengthM+unit*18}>{format(r*d.widthM)}</text><text className="nfa-ruler" style={{fontSize:`${11*unit}px`}} textAnchor="end" x={-unit*8} y={(1-r)*d.lengthM+unit*4}>{format(r*d.lengthM)}</text></g>)}
      {plan.areas.map(a=>{const label=insideLabel(a.polygon);return <g key={a.id}><polygon className="nfa-shape" points={points(a.polygon)} data-selected={a.id===selected} data-kind={a.kind} role="button" tabIndex={0} aria-label={a.name} onFocus={()=>setSelected(a.id)} onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setSelected(a.id)}}} onPointerDown={e=>begin(e,a.id)} /><text className="nfa-name" style={{fontSize:`${12*unit}px`}} x={label.xM} y={d.lengthM-label.yM}>{a.name}</text></g>})}
      {area && <g className="nfa-handles">{area.polygon.map((p,i)=>{const q=area.polygon[(i+1)%area.polygon.length];return <g key={i}><line x1={p.xM} y1={d.lengthM-p.yM} x2={q.xM} y2={d.lengthM-q.yM} stroke="transparent" strokeWidth={unit*10} onPointerDown={e=>begin(e,area.id,undefined,i)} onDoubleClick={e=>{e.stopPropagation();addVertex(i)}} /><circle className="nfa-midpoint" cx={(p.xM+q.xM)/2} cy={d.lengthM-(p.yM+q.yM)/2} r={3*unit} onPointerDown={e=>{e.stopPropagation();addVertex(i)}} /></g>})}{area.polygon.map((p,i)=><circle key={i} cx={p.xM} cy={d.lengthM-p.yM} r={5*unit} data-active={selectedVertex===i} role="button" tabIndex={0} aria-label={`${lt ? 'Kontūro taškas' : 'Vertex'} ${i+1}`} onFocus={()=>setVertex(i)} onPointerDown={e=>begin(e,area.id,i)} onKeyDown={e=>{
        if(e.key==='Delete' || e.key==='Backspace'){e.preventDefault();removeVertex(i)}
        const delta=e.shiftKey ? 1 : .25,shifts:Record<string,SitePoint>={ArrowLeft:{xM:-delta,yM:0},ArrowRight:{xM:delta,yM:0},ArrowUp:{xM:0,yM:delta},ArrowDown:{xM:0,yM:-delta}}
        if(shifts[e.key]){e.preventDefault();e.stopPropagation();alterVertex(i,{xM:p.xM+shifts[e.key].xM,yM:p.yM+shifts[e.key].yM})}
      }} />)}</g>}
    </svg>
    {!plan.areas.length && <p className="nfa-start">{lt ? 'Paspauskite „Pridėti Area“. Atsiras stačiakampis, kurį galėsite pritaikyti savo patalpai.' : 'Select Add Area to insert a rectangle, then shape it to match your growing space.'}</p>}
    {message && <p className="nfa-message" role="status">{message}</p>}
    {!!plan.areas.length && <nav className="nfa-area-list" aria-label={lt ? 'Plano erdvės' : 'Plan Areas'}>{plan.areas.map(a=><button type="button" key={a.id} aria-pressed={a.id===selected} onClick={()=>{setSelected(a.id);setVertex(0)}}>{a.name}</button>)}</nav>}
    {area && bounds && <section className="nfa-properties"><div className="nfa-property-heading"><strong>{area.name} · {format(zoneArea(area))} m²</strong><button type="button" onClick={()=>setSelected(null)}>{lt ? 'Baigti redaguoti' : 'Done'}</button></div>
      <div className="nfa-fields"><label>{lt ? 'Pavadinimas' : 'Name'}<input key={`${area.id}-${area.name}`} defaultValue={area.name} maxLength={120} onBlur={e=>{if(e.target.value.trim()!==area.name && !commit(editFarmArea(plan,area.id,{name:e.target.value.trim()})))e.currentTarget.value=area.name}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label><label>{lt ? 'Erdvės tipas' : 'Area type'}<select value={area.kind} onChange={e=>commit(editFarmArea(plan,area.id,{kind:e.target.value as typeof area.kind}))}><option value="room">{lt ? 'Patalpa' : 'Room'}</option><option value="greenhouse">{lt ? 'Šiltnamis' : 'Greenhouse'}</option><option value="zone">{lt ? 'Zona be sienų' : 'Zone without walls'}</option></select></label></div>
      <div className="nfa-fields nfa-measurements"><NumberField key={`${area.id}-w-${bounds.maxX-bounds.minX}`} label={lt ? 'Plotis, m' : 'Width, m'} value={bounds.maxX-bounds.minX} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,n,bounds.maxY-bounds.minY))} /><NumberField key={`${area.id}-l-${bounds.maxY-bounds.minY}`} label={lt ? 'Ilgis, m' : 'Length, m'} value={bounds.maxY-bounds.minY} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,bounds.maxX-bounds.minX,n))} /><NumberField key={`${area.id}-h-${area.height}`} label={lt ? 'Aukštis, m' : 'Height, m'} value={area.height} min={.5} max={12} step={.1} onCommit={n=>commit(editFarmArea(plan,area.id,{height:n}))} /></div>
      <p className="nfa-hint">{lt ? 'Tempkite kampus, kad pakeistumėte formą. „+ taškas“ leidžia suformuoti L ar kitokį kontūrą. Plotis ir ilgis keičia viso kontūro matmenis.' : 'Drag corners to change the shape. Add vertices for L-shaped or other outlines. Width and length resize the whole outline.'}</p>
      <div className="nfa-vertex"><label>{lt ? 'Taškas' : 'Vertex'}<select value={selectedVertex} onChange={e=>setVertex(Number(e.target.value))}>{area.polygon.map((_,i)=><option value={i} key={i}>{i+1}</option>)}</select></label>{(['xM','yM'] as const).map(axis=><NumberField key={`${area.id}-${selectedVertex}-${axis}-${area.polygon[selectedVertex][axis]}`} label={axis==='xM' ? 'X, m' : 'Y, m'} value={area.polygon[selectedVertex][axis]} onCommit={n=>alterVertex(selectedVertex,{...area.polygon[selectedVertex],[axis]:n})} />)}<button type="button" disabled={area.polygon.length>=64} onClick={()=>addVertex(selectedVertex)}>{lt ? '+ taškas' : '+ vertex'}</button><button type="button" aria-label={lt ? 'Pašalinti tašką' : 'Remove vertex'} disabled={area.polygon.length<=3} onClick={()=>removeVertex(selectedVertex)}>−</button></div>
      <details className="nfa-position"><summary>{lt ? 'Vieta plane' : 'Position in the plan'}</summary><div className="nfa-fields"><NumberField key={`${area.id}-x-${bounds.minX}`} label="X, m" value={bounds.minX} onCommit={n=>commit(moveFarmArea(plan,area.id,n,bounds.minY))} /><NumberField key={`${area.id}-y-${bounds.minY}`} label="Y, m" value={bounds.minY} onCommit={n=>commit(moveFarmArea(plan,area.id,bounds.minX,n))} /></div></details>
      <div className="nfa-next"><button type="button" disabled={!saved} onClick={()=>onSections(area.id,!saved?.sectionCount)}>{saved?.sectionCount ? (lt ? `Sections (${saved.sectionCount})` : `Sections (${saved.sectionCount})`) : (lt ? 'Kurti Section šioje Area' : 'Create a Section in this Area')}<i className="fa-solid fa-arrow-right" /></button>{!saved && <small>{lt ? 'Pirmiausia išsaugokite planą — tuomet galėsite kurti Sections.' : 'Save the plan first, then create Sections inside this Area.'}</small>}</div>
      <button type="button" className="nfa-remove" disabled={!!saved?.sectionCount || !!saved?.nodeCount} onClick={()=>{remember(plan);onChange({...plan,areas:plan.areas.filter(a=>a.id!==area.id)});setSelected(null)}}>{lt ? 'Pašalinti Area' : 'Remove Area'}</button>{(!!saved?.sectionCount || !!saved?.nodeCount) && <small className="nfa-hint">{lt ? 'Erdvę su sekcijomis ar jutikliais šalinkite per „Areas“, kur parodomos pasekmės.' : 'Remove an Area containing Sections or Nodes through Areas, where the consequences are shown.'}</small>}
    </section>}
  </aside>
}
