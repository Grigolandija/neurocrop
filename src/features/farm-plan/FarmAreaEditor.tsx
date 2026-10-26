import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { siteEditorText } from '../living-greenhouse/siteEditorText'
import { zoneArea, zoneBounds, type SitePoint } from '../living-greenhouse/siteDemoModel'
import { insideLabel } from '../living-greenhouse/sitePlanEditing'
import { editFarmArea, insertFarmArea, moveFarmArea, resizeFarmArea, type FarmArea, type FarmPlanDocument } from './farmPlanData'
import { dragFarmWall, fitFarmDrawing, setFarmWallLength, snapCorner, snapValue, wallAngle, wallLength, type DrawingView } from './farmAreaGeometry'
import '../living-greenhouse/site-plan-editor.css'
import './farm-area-editor.css'

type Props={plan:FarmPlanDocument;onChange:(plan:FarmPlanDocument)=>void;areas:FarmArea[];onSections:(id:string,create:boolean)=>void;disabled?:boolean;selectedId?:string|null;onSelect?:(id:string|null)=>void}
type Drag={plan:FarmPlanDocument;id:string;start:SitePoint;vertex?:number;edge?:number;pointerId:number;changed:boolean}
function NumberField({label,value,onCommit,min=0,max=10000,step=.25}:{label:string;value:number;onCommit:(n:number)=>void;min?:number;max?:number;step?:number}){
  const [text,setText]=useState(String(Math.round(value*1000)/1000))
  const changed=useRef(false)
  const commit=()=>{const next=Number(text);if(changed.current && text.trim() && Number.isFinite(next) && next>=min && next<=max && Math.abs(next-value)>1e-8)onCommit(next);changed.current=false;setText(String(Math.round(value*1000)/1000))}
  return <label>{label}<input type="number" min={min} max={max} step={step} value={text} onChange={e=>{changed.current=true;setText(e.target.value)}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label>
}

export default function FarmAreaEditor({plan,onChange,areas,onSections,disabled=false,selectedId,onSelect}:Props){
  const {language}=useInterfaceLanguage(),lt=language==='lt',t=(value:string)=>siteEditorText(value,!lt)
  const [ownSelected,setOwnSelected]=useState<string|null>(plan.areas[0]?.id || null)
  const selected=selectedId===undefined ? ownSelected : selectedId
  const setSelected=(id:string|null)=>{setOwnSelected(id);onSelect?.(id)}
  const [vertex,setVertex]=useState(0),[snap,setSnap]=useState(true),[angleSnap,setAngleSnap]=useState(true),[wall,setWall]=useState<number|null>(null),[expanded,setExpanded]=useState(false)
  const [message,setMessage]=useState(''),[undo,setUndo]=useState<FarmPlanDocument[]>([]),[redo,setRedo]=useState<FarmPlanDocument[]>([])
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),pattern=useId().replaceAll(':','')
  const [size,setSize]=useState({width:900,height:650})
  const [camera,setCamera]=useState<{selection:string|null;view:DrawingView}|null>(null)
  const pan=useRef<{pointerId:number;x:number;y:number;view:DrawingView;moved:boolean}|null>(null)
  const editor=useRef<HTMLElement>(null)
  const expandButton=useRef<HTMLButtonElement>(null)
  const closeExpanded=()=>{setExpanded(false);expandButton.current?.focus()}
  useEffect(()=>{
    if(!expanded)return
    const previous=document.body.style.overflow;document.body.style.overflow='hidden'
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);expandButton.current?.focus()}}
    document.addEventListener('keydown',escape)
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)}
  },[expanded])
  useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r?.width && r.height)setSize({width:r.width,height:r.height})});observer.observe(el);return()=>observer.disconnect()},[])
  const area=plan.areas.find(a=>a.id===selected),saved=areas.find(a=>a.id===selected),bounds=area ? zoneBounds(area) : null
  const aspect=size.width/size.height,fitted=fitFarmDrawing(area ? [area] : plan.areas,aspect)
  const stored=camera?.selection===selected ? camera.view : fitted
  const height=stored.width/aspect,view={...stored,y:stored.y+(stored.height-height)/2,height}
  const unit=view.width/size.width
  const gridStep=unit*12<=.25 ? .25 : unit*12<=1 ? 1 : 10**Math.ceil(Math.log10(unit*12))
  const points=(polygon:SitePoint[])=>polygon.map(p=>`${p.xM},${-p.yM}`).join(' ')
  const setView=(next:DrawingView)=>setCamera({selection:selected,view:next})
  const zoom=(factor:number)=>{const width=Math.min(20000,Math.max(2,view.width*factor)),height=width/aspect;setView({x:view.x+(view.width-width)/2,y:view.y+(view.height-height)/2,width,height})}
  const fit=(all=false)=>setView(fitFarmDrawing(!all && area ? [area] : plan.areas,aspect))
  useEffect(()=>{
    const el=svg.current;if(!el)return
    const wheel=(event:WheelEvent)=>{if(!event.altKey)return;event.preventDefault();zoom(Math.exp(Math.max(-1,Math.min(1,event.deltaY*.002))))}
    el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel)
  })
  const remember=(before:FarmPlanDocument)=>{setUndo(p=>[...p.slice(-29),before]);setRedo([])}
  const commit=(result:{plan:FarmPlanDocument;error:string|null})=>{
    if(result.error){setMessage(t(result.error));return false}
    remember(plan);onChange(result.plan);setMessage('');return true
  }
  const add=()=>{
    try{const next=insertFarmArea(plan,!lt);remember(plan);onChange(next.plan);setSelected(next.id);setVertex(0);setWall(null);setMessage(lt ? 'Forma įterpta. Pakeiskite pavadinimą, matmenis ir kontūrą.' : 'Area inserted. Set its name, dimensions and outline.')}
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
    return {xM:p.x,yM:-p.y}
  }
  const begin=(event:ReactPointerEvent<SVGElement>,id:string,index?:number,edge?:number)=>{
    if(disabled || event.button!==0)return
    event.stopPropagation();event.preventDefault();setSelected(id);setWall(edge ?? null);if(index!==undefined)setVertex(index)
    setCamera({selection:id,view})
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
  const format=(n:number)=>n.toLocaleString(lt ? 'lt-LT' : 'en-GB',{maximumFractionDigits:2})
  const selectedVertex=area ? Math.min(vertex,area.polygon.length-1) : 0
  return <aside ref={editor} className="nfa-editor" data-expanded={expanded} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={lt ? 'Ūkio plano redaktorius' : 'Farm plan editor'} inert={disabled} onKeyDown={event=>{
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z' && !(event.target instanceof HTMLInputElement)){event.preventDefault();revert(event.shiftKey)}
    if(event.key==='Escape' && !expanded){setSelected(null);setMessage('')}
    if(event.key==='Tab' && expanded){const controls=editor.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]');if(controls?.length){const first=controls[0],last=controls[controls.length-1];if(event.shiftKey && event.target===first){event.preventDefault();last.focus()}else if(!event.shiftKey && event.target===last){event.preventDefault();first.focus()}}}
  }}>
    <header className="nfa-header"><strong>{lt ? 'Auginimo erdvės' : 'Growing Areas'} <span>{plan.areas.length}</span></strong><div><button ref={expandButton} type="button" aria-label={expanded ? (lt ? 'Sumažinti brėžinį' : 'Exit expanded drawing') : (lt ? 'Išplėsti brėžinį' : 'Expand drawing')} aria-pressed={expanded} onClick={()=>expanded ? closeExpanded() : setExpanded(true)}><i className={`fa-solid ${expanded ? 'fa-compress' : 'fa-expand'}`} /></button><button type="button" aria-label={lt ? 'Atšaukti pakeitimą' : 'Undo'} disabled={!undo.length} onClick={()=>revert()}><i className="fa-solid fa-rotate-left" /></button><button type="button" aria-label={lt ? 'Pakartoti pakeitimą' : 'Redo'} disabled={!redo.length} onClick={()=>revert(true)}><i className="fa-solid fa-rotate-right" /></button></div></header>
    <div className="nfa-insert"><button type="button" onClick={add} disabled={plan.areas.length>=80}><i className="fa-solid fa-plus" />{lt ? 'Pridėti Area' : 'Add Area'}</button><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)} />{lt ? 'Tinklelis 0,25 m' : 'Grid 0.25 m'}</label><label><input type="checkbox" checked={angleSnap} onChange={e=>setAngleSnap(e.target.checked)} />{lt ? 'Kampai 10°' : 'Angles 10°'}</label></div>
    <details className="nfa-plan-settings"><summary>{lt ? 'Ūkio pavadinimas' : 'Farm name'}</summary><label>{lt ? 'Ūkio pavadinimas' : 'Farm name'}<input value={plan.name} maxLength={120} onChange={e=>{remember(plan);onChange({...plan,name:e.target.value})}} /></label></details>
    <div className="nfa-workbench"><div className="nfa-drawing">
    <div className="nfa-canvas-wrap">
    <svg ref={svg} className="nce-canvas nfa-canvas" viewBox={`${view.x} ${-view.y-view.height} ${view.width} ${view.height}`} role="group" aria-label={lt ? 'Erdvių kontūrai bendrame plane' : 'Area outlines in the farm plan'} onPointerDown={event=>{
      if(disabled || event.button!==0)return
      event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)
      pan.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,view,moved:false}
    }} onPointerMove={event=>{
        const moving=pan.current
        if(moving && moving.pointerId===event.pointerId){
          const dx=event.clientX-moving.x,dy=event.clientY-moving.y
          if(Math.hypot(dx,dy)>3)moving.moved=true
          setView({...moving.view,x:moving.view.x-dx*moving.view.width/size.width,y:moving.view.y+dy*moving.view.height/size.height});return
        }
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return
        const p=point(event),a=active.plan.areas.find(a=>a.id===active.id)!,b=zoneBounds(a)
        const dx=p.xM-active.start.xM,dy=p.yM-active.start.yM
        const target=active.vertex===undefined ? null : snapCorner(a.polygon[(active.vertex+a.polygon.length-1)%a.polygon.length],p,snap,angleSnap)
        const result=active.edge!==undefined ? editFarmArea(active.plan,a.id,{polygon:dragFarmWall(a,active.edge,active.start,p,snap)}) : active.vertex===undefined ? moveFarmArea(active.plan,a.id,snap ? snapValue(b.minX+dx) : b.minX+dx,snap ? snapValue(b.minY+dy) : b.minY+dy) : editFarmArea(active.plan,a.id,{polygon:a.polygon.map((v,i)=>i===active.vertex ? target! : v)})
        if(result.error){setMessage(t(result.error));return}
        active.changed=true;onChange(result.plan);setMessage('')
      }} onPointerUp={event=>{
        if(pan.current?.pointerId===event.pointerId){if(!pan.current.moved)setSelected(null);pan.current=null;return}
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return;drag.current=null;if(active.changed)remember(active.plan)
      }} onPointerCancel={()=>{if(drag.current)onChange(drag.current.plan);drag.current=null;pan.current=null}}>
      <defs><pattern id={pattern} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#e1e8e0" strokeWidth={unit*.5} /></pattern></defs>
      <rect x={view.x} y={-view.y-view.height} width={view.width} height={view.height} fill={`url(#${pattern})`} />
      {Array.from({length:6},(_,i)=>i/5).map(r=><g key={r}><text className="nfa-ruler" style={{fontSize:`${11*unit}px`}} x={view.x+r*view.width} y={-view.y-unit*10}>{format(view.x+r*view.width)}</text><text className="nfa-ruler" style={{fontSize:`${11*unit}px`}} textAnchor="start" x={view.x+unit*8} y={-view.y-r*view.height-unit*5}>{format(view.y+r*view.height)}</text></g>)}
      {plan.areas.map(a=>{const label=insideLabel(a.polygon);return <g key={a.id}><polygon className="nfa-shape" points={points(a.polygon)} data-selected={a.id===selected} data-kind={a.kind} role="button" tabIndex={0} aria-label={a.name} onFocus={()=>setSelected(a.id)} onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setSelected(a.id)}}} onPointerDown={e=>begin(e,a.id)} /><text className="nfa-name" style={{fontSize:`${12*unit}px`}} x={label.xM} y={-label.yM}>{a.name}</text></g>})}
      {area && <g className="nfa-handles">{area.polygon.map((p,i)=>{const q=area.polygon[(i+1)%area.polygon.length];return <g key={i}><line className="nfa-wall-hit" x1={p.xM} y1={-p.yM} x2={q.xM} y2={-q.yM} strokeWidth={unit*14} data-active={wall===i} onPointerDown={e=>begin(e,area.id,undefined,i)} onDoubleClick={e=>{e.stopPropagation();addVertex(i)}} /><text className="nfa-wall-label" style={{fontSize:`${12*unit}px`}} x={(p.xM+q.xM)/2} y={-(p.yM+q.yM)/2-12*unit} onPointerDown={e=>{e.stopPropagation();setWall(i)}}>{i+1} · {format(wallLength(p,q))} m</text><circle className="nfa-midpoint" cx={(p.xM+q.xM)/2} cy={-(p.yM+q.yM)/2} r={4*unit} onPointerDown={e=>{e.stopPropagation();addVertex(i)}} /></g>})}{area.polygon.map((p,i)=><circle key={i} cx={p.xM} cy={-p.yM} r={6*unit} data-active={selectedVertex===i} role="button" tabIndex={0} aria-label={`${lt ? 'Kontūro taškas' : 'Vertex'} ${i+1}`} onFocus={()=>setVertex(i)} onPointerDown={e=>begin(e,area.id,i)} onKeyDown={e=>{
        if(e.key==='Delete' || e.key==='Backspace'){e.preventDefault();removeVertex(i)}
        const delta=e.shiftKey ? 1 : .25,shifts:Record<string,SitePoint>={ArrowLeft:{xM:-delta,yM:0},ArrowRight:{xM:delta,yM:0},ArrowUp:{xM:0,yM:delta},ArrowDown:{xM:0,yM:-delta}}
        if(shifts[e.key]){e.preventDefault();e.stopPropagation();alterVertex(i,{xM:p.xM+shifts[e.key].xM,yM:p.yM+shifts[e.key].yM})}
      }} />)}</g>}
    </svg>
    <div className="nfa-view-controls"><button type="button" onClick={()=>fit(true)}>{lt ? 'Visas planas' : 'Fit plan'}</button>{area && <button type="button" onClick={()=>fit()}>{lt ? 'Pasirinkta Area' : 'Fit Area'}</button>}<button type="button" aria-label={lt ? 'Priartinti brėžinį' : 'Zoom drawing in'} onClick={()=>zoom(.75)}>+</button><button type="button" aria-label={lt ? 'Atitolinti brėžinį' : 'Zoom drawing out'} onClick={()=>zoom(1.333)}>−</button></div>
    <p className="nfa-canvas-help">{lt ? 'Tempkite foną · Option / Alt + ratukas priartina' : 'Drag background to pan · Option / Alt + scroll to zoom'}</p>
    </div>
    {!plan.areas.length && <p className="nfa-start">{lt ? 'Paspauskite „Pridėti Area“. Atsiras stačiakampis, kurį galėsite pritaikyti savo patalpai.' : 'Select Add Area to insert a rectangle, then shape it to match your growing space.'}</p>}
    {message && <p className="nfa-message" role="status">{message}</p>}
    {!!plan.areas.length && <nav className="nfa-area-list" aria-label={lt ? 'Plano erdvės' : 'Plan Areas'}>{plan.areas.map(a=><button type="button" key={a.id} aria-pressed={a.id===selected} onClick={()=>{setSelected(a.id);setVertex(0)}}>{a.name}</button>)}</nav>}
    </div>
    {area && bounds ? <section className="nfa-properties"><div className="nfa-property-heading"><strong>{area.name} · {format(zoneArea(area))} m²</strong><button type="button" onClick={()=>setSelected(null)}>{lt ? 'Baigti redaguoti' : 'Done'}</button></div>
      <div className="nfa-fields"><label>{lt ? 'Pavadinimas' : 'Name'}<input key={`${area.id}-${area.name}`} defaultValue={area.name} maxLength={120} onBlur={e=>{if(e.target.value.trim()!==area.name && !commit(editFarmArea(plan,area.id,{name:e.target.value.trim()})))e.currentTarget.value=area.name}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label><label>{lt ? 'Erdvės tipas' : 'Area type'}<select value={area.kind} onChange={e=>commit(editFarmArea(plan,area.id,{kind:e.target.value as typeof area.kind}))}><option value="room">{lt ? 'Patalpa' : 'Room'}</option><option value="greenhouse">{lt ? 'Šiltnamis' : 'Greenhouse'}</option><option value="zone">{lt ? 'Zona be sienų' : 'Zone without walls'}</option></select></label></div>
      <div className="nfa-fields nfa-measurements"><NumberField key={`${area.id}-w-${bounds.maxX-bounds.minX}`} label={lt ? 'Plotis, m' : 'Width, m'} value={bounds.maxX-bounds.minX} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,n,bounds.maxY-bounds.minY))} /><NumberField key={`${area.id}-l-${bounds.maxY-bounds.minY}`} label={lt ? 'Ilgis, m' : 'Length, m'} value={bounds.maxY-bounds.minY} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,bounds.maxX-bounds.minX,n))} /><NumberField key={`${area.id}-h-${area.height}`} label={lt ? 'Aukštis, m' : 'Height, m'} value={area.height} min={.5} max={12} step={.1} onCommit={n=>commit(editFarmArea(plan,area.id,{height:n}))} /></div>
      <p className="nfa-hint">{lt ? 'Tempkite sieną arba kampą. Kampo kryptis fiksuojama kas 10°, atstumas — kas 0,25 m. Tiksliai įvesti matmenys neapvalinami.' : 'Drag a wall or corner. Corner directions snap every 10°, distances every 0.25 m. Typed dimensions stay exact.'}</p>
      <div className="nfa-walls"><strong>{lt ? 'Kiekvienos sienos ilgis' : 'Individual wall lengths'}</strong><p>{lt ? 'Numeriai atitinka brėžinį. Keičiant ilgį pirmas sienos taškas lieka vietoje, gretimos sienos persiskaičiuoja.' : 'Numbers match the drawing. The wall start stays fixed; adjoining walls adjust to keep the outline closed.'}</p><div>{area.polygon.map((p,i)=>{const q=area.polygon[(i+1)%area.polygon.length];return <div key={`${area.id}-${i}`} data-active={wall===i} onFocus={()=>setWall(i)}><NumberField key={wallLength(p,q)} label={`${lt ? 'Siena' : 'Wall'} ${i+1} · m`} value={wallLength(p,q)} min={.1} step={.01} onCommit={n=>{setView(view);commit(setFarmWallLength(plan,area.id,i,n))}} /><small>{format(wallAngle(p,q))}°</small></div>})}</div></div>
      <div className="nfa-vertex"><label>{lt ? 'Taškas' : 'Vertex'}<select value={selectedVertex} onChange={e=>setVertex(Number(e.target.value))}>{area.polygon.map((_,i)=><option value={i} key={i}>{i+1}</option>)}</select></label>{(['xM','yM'] as const).map(axis=><NumberField key={`${area.id}-${selectedVertex}-${axis}-${area.polygon[selectedVertex][axis]}`} label={axis==='xM' ? 'X, m' : 'Y, m'} value={area.polygon[selectedVertex][axis]} onCommit={n=>alterVertex(selectedVertex,{...area.polygon[selectedVertex],[axis]:n})} />)}<button type="button" disabled={area.polygon.length>=64} onClick={()=>addVertex(selectedVertex)}>{lt ? '+ taškas' : '+ vertex'}</button><button type="button" aria-label={lt ? 'Pašalinti tašką' : 'Remove vertex'} disabled={area.polygon.length<=3} onClick={()=>removeVertex(selectedVertex)}>−</button></div>
      <details className="nfa-position"><summary>{lt ? 'Vieta plane' : 'Position in the plan'}</summary><div className="nfa-fields"><NumberField key={`${area.id}-x-${bounds.minX}`} label="X, m" value={bounds.minX} onCommit={n=>commit(moveFarmArea(plan,area.id,n,bounds.minY))} /><NumberField key={`${area.id}-y-${bounds.minY}`} label="Y, m" value={bounds.minY} onCommit={n=>commit(moveFarmArea(plan,area.id,bounds.minX,n))} /></div></details>
      <div className="nfa-next"><button type="button" disabled={!saved} onClick={()=>onSections(area.id,!saved?.sectionCount)}>{saved?.sectionCount ? (lt ? `Sections (${saved.sectionCount})` : `Sections (${saved.sectionCount})`) : (lt ? 'Kurti Section šioje Area' : 'Create a Section in this Area')}<i className="fa-solid fa-arrow-right" /></button>{!saved && <small>{lt ? 'Pirmiausia išsaugokite planą — tuomet galėsite kurti Sections.' : 'Save the plan first, then create Sections inside this Area.'}</small>}</div>
      <button type="button" className="nfa-remove" disabled={!!saved?.sectionCount || !!saved?.nodeCount} onClick={()=>{remember(plan);onChange({...plan,areas:plan.areas.filter(a=>a.id!==area.id)});setSelected(null)}}>{lt ? 'Pašalinti Area' : 'Remove Area'}</button>{(!!saved?.sectionCount || !!saved?.nodeCount) && <small className="nfa-hint">{lt ? 'Erdvę su sekcijomis ar jutikliais šalinkite per „Areas“, kur parodomos pasekmės.' : 'Remove an Area containing Sections or Nodes through Areas, where the consequences are shown.'}</small>}
    </section> : <div className="nfa-unselected"><i className="fa-solid fa-draw-polygon" /><strong>{lt ? 'Pasirinkite Area' : 'Select an Area'}</strong><p>{lt ? 'Pridėkite arba pasirinkite erdvę. Čia galėsite įvesti kiekvienos sienos ilgį.' : 'Add or select an Area to edit each wall length here.'}</p></div>}
    </div>
  </aside>
}
