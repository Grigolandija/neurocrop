import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { siteEditorText } from '../living-greenhouse/siteEditorText'
import { zoneArea, zoneBounds, type SitePoint } from '../living-greenhouse/siteDemoModel'
import { insideLabel } from '../living-greenhouse/sitePlanEditing'
import { editFarmArea, insertFarmArea, moveFarmArea, resizeFarmArea, type FarmArea, type FarmPlanDocument } from './farmPlanData'
import { dragFarmWall, fitFarmDrawing, snapFarmAreaPosition, setFarmWallLength, snapCorner, snapValue, wallLength, type DrawingView } from './farmAreaGeometry'
import { objectFootprint,objectInsideOutline,validOutlineMount } from '../../../backend/area-map-outline.js'
import { isWallMountedType,snapObjectToMapWall } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject,ObjectType } from '../greenhouse-map/model'
import { OBJECT_LIBRARY } from '../greenhouse-map/model'
import type { AreaMapContext,AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import { farmEditorMap,newFarmObject,reconcileFarmMaps,type FarmMaps } from './farmLayoutData'
import FarmEquipmentPanel from './FarmEquipmentPanel'
import FarmAreaDeleteDialog from './FarmAreaDeleteDialog'
import FarmObjectHandles from './FarmObjectHandles'
import { equipmentUnlocked,equipmentDuplicable,pasteFarmEquipment,resizeFarmEquipment,type EquipmentHandle } from './farmEquipmentEditing'
import '../living-greenhouse/site-plan-editor.css'
import './farm-area-editor.css'

type Props={plan:FarmPlanDocument;layouts:FarmMaps;onChange:(plan:FarmPlanDocument,layouts:FarmMaps)=>void;areas:FarmArea[];scene:ReactNode;nodeContext?:AreaMapContext;contextLoading:boolean;contextError?:string;onCreateSection:(name:string,profile:string)=>Promise<boolean>;onAssignSection:(devEui:string,sectionId:string)=>Promise<void>;onNodeHeight:(devEui:string,heightM:number|null)=>Promise<void>;unassignedNodes:AreaMapNode[];inventoryError?:string;onConnectNode:(devEui:string,sectionId:string)=>Promise<AreaMapNode>;onDeleteArea:(id:string)=>Promise<void>;initialEquipment?:boolean;disabled?:boolean;selectedId?:string|null;onSelect?:(id:string|null)=>void}
type Snapshot={plan:FarmPlanDocument;layouts:FarmMaps}
type Drag=Snapshot & {id:string;start:SitePoint;vertex?:number;edge?:number;pointerId:number;changed:boolean}
type GearDrag=Snapshot & {areaId:string;object:GreenhouseObject;objects:GreenhouseObject[];handle?:EquipmentHandle;start:SitePoint;screen:{x:number;y:number};moved:boolean;pointerId:number;changed:boolean}
function NumberField({label,value,onCommit,min=0,max=10000,step=.25}:{label:string;value:number;onCommit:(n:number)=>void;min?:number;max?:number;step?:number}){
  const [text,setText]=useState(String(Math.round(value*1000)/1000))
  const changed=useRef(false)
  const commit=()=>{const next=Number(text);if(changed.current && text.trim() && Number.isFinite(next) && next>=min && next<=max && Math.abs(next-value)>1e-8)onCommit(next);changed.current=false;setText(String(Math.round(value*1000)/1000))}
  return <label>{label}<input type="number" min={min} max={max} step={step} value={text} onChange={e=>{changed.current=true;setText(e.target.value)}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label>
}

export default function FarmAreaEditor({plan,layouts,onChange,areas,scene,nodeContext,contextLoading,contextError,onCreateSection,onAssignSection,onNodeHeight,unassignedNodes,inventoryError,onConnectNode,onDeleteArea,initialEquipment=false,disabled=false,selectedId,onSelect}:Props){
  const {language}=useInterfaceLanguage(),lt=language==='lt',t=(value:string)=>siteEditorText(value,!lt)
  const [ownSelected,setOwnSelected]=useState<string|null>(plan.areas[0]?.id || null)
  const selected=selectedId===undefined ? ownSelected : selectedId
  const setSelected=(id:string|null)=>{setOwnSelected(id);onSelect?.(id)}
  const [mode,setMode]=useState<'contour'|'equipment'>(initialEquipment ? 'equipment' : 'contour'),[display,setDisplay]=useState<'2d'|'3d'>('2d'),[selectedObject,setSelectedObject]=useState<{areaId:string;id:string;ids?:string[]}|null>(null)
  const [deleteTarget,setDeleteTarget]=useState<{id:string;name:string;saved:boolean;objects:number;sections:number;nodes:number}|null>(null)
  const [equipmentTab,setEquipmentTab]=useState<'nodes'|'equipment'|'sections'>('nodes')
  const [copiedObjects,setCopiedObjects]=useState<GreenhouseObject[]>([])
  const gearDrag=useRef<GearDrag|null>(null)
  const [vertex,setVertex]=useState(0),[snap,setSnap]=useState(true),[wall,setWall]=useState<number|null>(null),[expanded,setExpanded]=useState(false)
  const [message,setMessage]=useState(''),[undo,setUndo]=useState<Snapshot[]>([]),[redo,setRedo]=useState<Snapshot[]>([])
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
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape' && !document.querySelector('.nfa-delete-dialog[open]')){event.preventDefault();setExpanded(false);expandButton.current?.focus()}}
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
  const remember=(before:FarmPlanDocument,beforeMaps=layouts)=>{setUndo(p=>[...p.slice(-29),{plan:before,layouts:beforeMaps}]);setRedo([])}
  const commit=(result:{plan:FarmPlanDocument;error:string|null})=>{
    if(result.error){setMessage(t(result.error));return false}
    remember(plan);onChange(result.plan,reconcileFarmMaps(plan,result.plan,layouts));setMessage('');return true
  }
  const add=()=>{
    try{const next=insertFarmArea(plan,!lt);remember(plan);onChange(next.plan,layouts);setSelected(next.id);setMode('contour');setSelectedObject(null);setDisplay('2d');setVertex(0);setWall(null);setMessage(lt ? 'Forma įterpta. Pakeiskite pavadinimą, matmenis ir kontūrą.' : 'Area inserted. Set its name, dimensions and outline.')}
    catch(error){setMessage(error instanceof Error ? t(error.message) : 'Area could not be added.')}
  }
  const revert=(forward=false)=>{
    const next=forward ? redo[0] : undo.at(-1);if(!next)return
    if(forward){setUndo(p=>[...p,{plan,layouts}]);setRedo(p=>p.slice(1))}else{setRedo(p=>[{plan,layouts},...p]);setUndo(p=>p.slice(0,-1))}
    onChange(next.plan,next.layouts);setMessage('');setSelectedObject(null)
  }
  const point=(event:{clientX:number;clientY:number}):SitePoint=>{
    const matrix=svg.current?.getScreenCTM();if(!matrix)return {xM:0,yM:0}
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    return {xM:p.x,yM:-p.y}
  }
  const begin=(event:ReactPointerEvent<SVGElement>,id:string,index?:number,edge?:number)=>{
    if(disabled || event.button!==0)return
    event.stopPropagation();event.preventDefault();event.currentTarget.focus({preventScroll:true});setSelected(id);setSelectedObject(null);if(mode==='equipment')return;setWall(edge ?? null);if(index!==undefined)setVertex(index)
    setCamera({selection:id,view})
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current={plan,layouts,id,start:point(event),vertex:index,edge,pointerId:event.pointerId,changed:false}
  }
  const map=area ? farmEditorMap(plan,area.id,layouts) : null
  const selectedIds=selectedObject && selectedObject.areaId===area?.id ? (selectedObject.ids || [selectedObject.id]) : []
  const selectedGear=map?.objects.filter(o=>selectedIds.includes(o.id)) || []
  const duplicableCount=selectedGear.filter(equipmentDuplicable).length
  const removableCount=map ? selectedGear.filter(o=>equipmentUnlocked(o,map)).length : 0
  const setMap=(next:GreenhouseMap,record=true)=>{if(!area)return;if(record)remember(plan);onChange(plan,{...layouts,[area.id]:next});setMessage('')}
  const addObject=(type:ObjectType,node?:AreaMapNode,position?:SitePoint)=>{
    if(!map || !area)return
    if(saved && (contextLoading || nodeContext?.area.id!==area.id)){setMessage(lt ? 'Palaukite, kol bus įkeltas šios Area išdėstymas.' : 'Wait for this Area layout to load.');return}
    const object=newFarmObject(type,map,position,node)
    if(!objectInsideOutline(object,map) || (isWallMountedType(type) && !validOutlineMount(object,map))){setMessage(lt ? 'Objektas netelpa šioje Area. Pakeiskite kontūrą arba pasirinkite mažesnį objektą.' : 'This object does not fit the Area. Adjust the outline or choose a smaller object.');return}
    setMap({...map,layers:map.layers.map(l=>l.id===object.layerId ? {...l,visible:true} : l),objects:[...map.objects,object]});setSelectedObject({areaId:area.id,id:object.id});setMode('equipment')
  }
  const updateObject=(id:string,patch:Partial<GreenhouseObject>)=>{
    const original=map?.objects.find(o=>o.id===id);if(!original || !map)return
    const locked=original.locked || map.layers.find(l=>l.id===original.layerId)?.locked
    if(locked && !(Object.keys(patch).length===1 && patch.locked===false && !map.layers.find(l=>l.id===original.layerId)?.locked))return
    let object={...original,...patch}
    if(isWallMountedType(object.type))object=snapObjectToMapWall(object,map,patch.xM===undefined && patch.yM===undefined ? object.metadata.wallMount?.edgeIndex : undefined)
    if(!objectInsideOutline(object,map)){setMessage(lt ? 'Objektas turi tilpti Area kontūre.' : 'Keep the object inside the Area outline.');return}
    setMap({...map,objects:map.objects.map(o=>o.id===id ? object : o)})
  }
  const removeObjects=(ids=selectedIds)=>{
    if(!map || disabled)return
    const removed=new Set(map.objects.filter(o=>ids.includes(o.id) && equipmentUnlocked(o,map)).map(o=>o.id))
    if(!removed.size)return
    setMap({...map,objects:map.objects.filter(o=>!removed.has(o.id))});setSelectedObject(null);svg.current?.focus({preventScroll:true})
  }
  const copyObjects=()=>{
    const copies=selectedGear.filter(equipmentDuplicable)
    if(!copies.length){setMessage(lt ? 'Node nekopijuojamas. Pasirinkite įrangą.' : 'Nodes cannot be copied. Select equipment.');return}
    setCopiedObjects(structuredClone(copies));setMessage('')
  }
  const pasteObjects=()=>{
    if(!map || !area || disabled || !copiedObjects.length)return
    if(saved && (contextLoading || nodeContext?.area.id!==area.id)){setMessage(lt ? 'Palaukite, kol bus įkeltas Area išdėstymas.' : 'Wait for this Area layout to load.');return}
    const copies=pasteFarmEquipment(copiedObjects,map)
    if(!copies.length){setMessage(lt ? 'Įranga netelpa Area kontūre arba jos sluoksnis užrakintas.' : 'The equipment does not fit this Area, or its layer is locked.');return}
    setMap({...map,layers:map.layers.map(l=>copies.some(o=>o.layerId===l.id) ? {...l,visible:true} : l),objects:[...map.objects,...copies]})
    setSelectedObject({areaId:area.id,id:copies[0].id,ids:copies.map(o=>o.id)});setCopiedObjects(structuredClone(copies));setEquipmentTab('equipment')
  }
  const beginObject=(event:ReactPointerEvent<SVGElement>,areaId:string,object:GreenhouseObject)=>{
    if(disabled || mode!=='equipment' || event.button!==0)return
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});setSelected(areaId);setCamera({selection:areaId,view})
    const current=selectedObject?.areaId===areaId ? (selectedObject.ids || [selectedObject.id]) : []
    const ids=event.shiftKey ? (current.includes(object.id) ? current.filter(id=>id!==object.id) : [...current,object.id]) : (current.includes(object.id) ? current : [object.id])
    setSelectedObject(ids.length ? {areaId,id:ids.at(-1)!,ids} : null);setEquipmentTab(object.type==='sensor-node' ? 'nodes' : 'equipment')
    if(event.shiftKey)return
    const currentMap=farmEditorMap(plan,areaId,layouts)
    if(!equipmentUnlocked(object,currentMap))return
    const objects=currentMap.objects.filter(o=>ids.includes(o.id) && equipmentUnlocked(o,currentMap))
    event.currentTarget.setPointerCapture(event.pointerId);gearDrag.current={plan,layouts,areaId,object,objects,start:point(event),screen:{x:event.clientX,y:event.clientY},moved:false,pointerId:event.pointerId,changed:false}
  }
  const beginResize=(event:ReactPointerEvent<SVGElement>,object:GreenhouseObject,handle:EquipmentHandle)=>{
    if(disabled || !area || !map || event.button!==0 || !equipmentUnlocked(object,map))return
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);setCamera({selection:area.id,view})
    gearDrag.current={plan,layouts,areaId:area.id,object,objects:[object],handle,start:point(event),screen:{x:event.clientX,y:event.clientY},moved:false,pointerId:event.pointerId,changed:false}
  }
  const nudgeResize=(object:GreenhouseObject,handle:EquipmentHandle,delta:SitePoint)=>{
    if(!map)return
    const resized=resizeFarmEquipment(object,handle,delta,map,snap)
    if(resized)setMap({...map,objects:map.objects.map(o=>o.id===object.id ? resized : o)})
  }
  const requestDelete=()=>{
    if(!area || disabled)return
    setDeleteTarget({id:area.id,name:area.name,saved:!!saved,objects:map?.objects.length || 0,sections:saved?.sectionCount || 0,nodes:saved?.nodeCount || 0})
  }
  const confirmDelete=async()=>{
    const target=deleteTarget;if(!target)return
    if(target.saved){
      await onDeleteArea(target.id)
      // Keep undo for other edits without resurrecting an Area already deleted on the server.
      const forget=(snapshot:Snapshot):Snapshot=>({plan:{...snapshot.plan,areas:snapshot.plan.areas.filter(a=>a.id!==target.id)},layouts:Object.fromEntries(Object.entries(snapshot.layouts).filter(([id])=>id!==target.id))})
      setUndo(history=>history.map(forget));setRedo(history=>history.map(forget))
    }else{
      remember(plan);onChange({...plan,areas:plan.areas.filter(a=>a.id!==target.id)},Object.fromEntries(Object.entries(layouts).filter(([id])=>id!==target.id)))
    }
    setDeleteTarget(null);setSelected(null);setSelectedObject(null);setWall(null)
    setMessage(lt ? 'Area pašalinta.' : 'Area removed.');requestAnimationFrame(()=>expandButton.current?.focus())
  }
  const alterVertex=(index:number,p:SitePoint)=>{if(area)commit(editFarmArea(plan,area.id,{polygon:area.polygon.map((q,i)=>i===index ? p : q)}))}
  const addVertex=(index:number)=>{
    if(!area)return
    const a=area.polygon[index],b=area.polygon[(index+1)%area.polygon.length]
    if(commit(editFarmArea(plan,area.id,{polygon:area.polygon.toSpliced(index+1,0,{xM:(a.xM+b.xM)/2,yM:(a.yM+b.yM)/2})})))setVertex(index+1)
  }
  const removeVertex=(index:number)=>{if(area && commit(editFarmArea(plan,area.id,{polygon:area.polygon.filter((_,i)=>i!==index)})))setVertex(Math.max(0,index-1))}
  const format=(n:number)=>n.toLocaleString(lt ? 'lt-LT' : 'en-GB',{maximumFractionDigits:2})
  const activeWall=area && wall!==null && wall<area.polygon.length ? wall : null
  const selectedVertex=area ? Math.min(vertex,area.polygon.length-1) : 0
  return <aside ref={editor} className="nfa-editor" data-expanded={expanded} data-mode={mode} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={lt ? 'Ūkio plano redaktorius' : 'Farm plan editor'} inert={disabled} onKeyDown={event=>{
    if(deleteTarget)return
    if(gearDrag.current || drag.current){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();const active=gearDrag.current || drag.current!;gearDrag.current=null;drag.current=null;onChange(active.plan,active.layouts);setMessage('')}return}
    const editingField=event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"]')
    if(!editingField && mode==='equipment' && (event.key==='Delete' || event.key==='Backspace')){event.preventDefault();event.stopPropagation();removeObjects();return}
    if(!editingField && mode==='equipment' && (event.metaKey || event.ctrlKey)){
      const key=event.key.toLowerCase()
      if(key==='c' && selectedGear.length){event.preventDefault();copyObjects();return}
      if(key==='v' && copiedObjects.length){event.preventDefault();pasteObjects();return}
    }
    if(area && mode==='contour' && wall===null && !editingField && (event.key==='Delete' || event.key==='Backspace') && !(event.target instanceof Element && event.target.closest('.nfa-handles,button'))){event.preventDefault();event.stopPropagation();requestDelete();return}
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z' && !editingField){event.preventDefault();revert(event.shiftKey)}
    if(event.key==='Escape' && !expanded){setSelected(null);setMessage('')}
    if(event.key==='Tab' && expanded){const candidates=editor.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]');const controls=Array.from(candidates || []).filter(el=>el.getClientRects().length>0);if(controls.length){const first=controls[0],last=controls[controls.length-1];if(event.shiftKey && event.target===first){event.preventDefault();last.focus()}else if(!event.shiftKey && event.target===last){event.preventDefault();first.focus()}}}
  }}>
    <header className="nfa-header"><strong>{plan.name || (lt ? 'Ūkio planas' : 'Farm plan')}</strong><div>
      <div className="nfa-display" role="group" aria-label={lt ? 'Vaizdas' : 'View'}>{(['2d','3d'] as const).map(v=><button key={v} type="button" aria-pressed={display===v} onClick={()=>setDisplay(v)}>{v.toUpperCase()}</button>)}</div>
      <button type="button" title={lt ? 'Atšaukti' : 'Undo'} aria-label={lt ? 'Atšaukti' : 'Undo'} disabled={!undo.length} onClick={()=>revert()}><i className="fa-solid fa-rotate-left" /></button><button type="button" title={lt ? 'Pakartoti' : 'Redo'} aria-label={lt ? 'Pakartoti' : 'Redo'} disabled={!redo.length} onClick={()=>revert(true)}><i className="fa-solid fa-rotate-right" /></button>
      <button ref={expandButton} type="button" title={expanded ? (lt ? 'Sumažinti brėžinį' : 'Exit expanded drawing') : (lt ? 'Išplėsti brėžinį' : 'Expand drawing')} aria-label={expanded ? (lt ? 'Sumažinti brėžinį' : 'Exit expanded drawing') : (lt ? 'Išplėsti brėžinį' : 'Expand drawing')} aria-pressed={expanded} onClick={()=>expanded ? closeExpanded() : setExpanded(true)}><i className={`fa-solid ${expanded ? 'fa-compress' : 'fa-expand'}`} /></button>
    </div></header>
    <div className="nfa-workbench"><div className="nfa-drawing">
    <div className="nfa-canvas-wrap">
    <svg ref={svg} style={{display:display==='2d' ? undefined : 'none'}} className="nce-canvas nfa-canvas" tabIndex={0} viewBox={`${view.x} ${-view.y-view.height} ${view.width} ${view.height}`} role="group" aria-label={lt ? 'Erdvių kontūrai bendrame plane' : 'Area outlines in the farm plan'} onDragOver={event=>{if(mode==='equipment' && area){event.preventDefault();event.dataTransfer.dropEffect='copy'}}} onDrop={event=>{
      if(mode!=='equipment' || !bounds)return
      event.preventDefault();const type=event.dataTransfer.getData('application/x-neurocrop-object') as ObjectType
      if(!OBJECT_LIBRARY.some(e=>e.type===type) || type==='sensor-node')return
      const p=point(event);addObject(type,undefined,{xM:p.xM-bounds.minX,yM:p.yM-bounds.minY})
    }} onPointerDown={event=>{
      if(disabled || event.button!==0)return
      event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)
      pan.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,view,moved:false}
    }} onPointerMove={event=>{
        const gear=gearDrag.current
        if(gear && gear.pointerId===event.pointerId){
          if(!gear.moved && Math.hypot(event.clientX-gear.screen.x,event.clientY-gear.screen.y)<3)return
          gear.moved=true
          const p=point(event),m=farmEditorMap(gear.plan,gear.areaId,gear.layouts),delta={xM:p.xM-gear.start.xM,yM:p.yM-gear.start.yM}
          let objects:GreenhouseObject[]
          if(gear.handle){
            const resized=resizeFarmEquipment(gear.object,gear.handle,delta,m,snap)
            if(!resized){setMessage(lt ? 'Matmenys turi tilpti Area kontūre.' : 'Keep the dimensions inside the Area outline.');return}
            objects=[resized]
          }else{
            const dx=snap ? snapValue(gear.object.xM+delta.xM)-gear.object.xM : delta.xM,dy=snap ? snapValue(gear.object.yM+delta.yM)-gear.object.yM : delta.yM
            objects=gear.objects.map(original=>{const object={...original,xM:original.xM+dx,yM:original.yM+dy};return isWallMountedType(object.type) ? snapObjectToMapWall(object,m) : object})
            if(objects.some(o=>!objectInsideOutline(o,m) || (isWallMountedType(o.type) && !validOutlineMount(o,m)))){setMessage(lt ? 'Įranga turi tilpti Area kontūre.' : 'Keep the equipment inside the Area outline.');return}
          }
          const changed=objects.some(o=>{const before=gear.objects.find(b=>b.id===o.id)!;return ['xM','yM','widthM','lengthM','rotationDeg'].some(key=>Math.abs(Number(o[key as keyof GreenhouseObject])-Number(before[key as keyof GreenhouseObject]))>1e-8)})
          gear.changed=gear.changed || changed
          onChange(gear.plan,{...gear.layouts,[gear.areaId]:{...m,objects:m.objects.map(o=>objects.find(next=>next.id===o.id) || o)}});setMessage('');return
        }
        const moving=pan.current
        if(moving && moving.pointerId===event.pointerId){
          const dx=event.clientX-moving.x,dy=event.clientY-moving.y
          if(Math.hypot(dx,dy)>3)moving.moved=true
          setView({...moving.view,x:moving.view.x-dx*moving.view.width/size.width,y:moving.view.y+dy*moving.view.height/size.height});return
        }
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return
        const p=point(event),a=active.plan.areas.find(a=>a.id===active.id)!,b=zoneBounds(a)
        const dx=p.xM-active.start.xM,dy=p.yM-active.start.yM
        const target=active.vertex===undefined ? null : snapCorner(p,snap)
        const position=active.vertex===undefined && active.edge===undefined ? snapFarmAreaPosition(active.plan,a.id,snap ? snapValue(b.minX+dx) : b.minX+dx,snap ? snapValue(b.minY+dy) : b.minY+dy,Math.min(.5,unit*14)) : null
        const result=active.edge!==undefined ? editFarmArea(active.plan,a.id,{polygon:dragFarmWall(a,active.edge,active.start,p,snap)}) : active.vertex===undefined ? moveFarmArea(active.plan,a.id,position!.xM,position!.yM) : editFarmArea(active.plan,a.id,{polygon:a.polygon.map((v,i)=>i===active.vertex ? target! : v)})
        if(result.error){setMessage(t(result.error));return}
        active.changed=true;onChange(result.plan,reconcileFarmMaps(active.plan,result.plan,active.layouts));setMessage(position?.snapped ? (lt ? 'Priglausta prie gretimos Area.' : 'Snapped to the neighbouring Area.') : '')
      }} onPointerUp={event=>{
        if(gearDrag.current?.pointerId===event.pointerId){const gear=gearDrag.current;gearDrag.current=null;if(gear.changed)remember(gear.plan,gear.layouts);if(!gear.moved && gear.objects.length>1)setSelectedObject({areaId:gear.areaId,id:gear.object.id});return}
        if(pan.current?.pointerId===event.pointerId){
          if(!pan.current.moved){
            setSelected(null);setSelectedObject(null);setWall(null)
            const focused=document.activeElement
            if(focused instanceof SVGElement && svg.current?.contains(focused))focused.blur()
          }
          pan.current=null;return
        }
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return;drag.current=null;if(active.changed)remember(active.plan,active.layouts)
      }} onPointerCancel={()=>{const active=gearDrag.current || drag.current;if(active)onChange(active.plan,active.layouts);gearDrag.current=null;drag.current=null;pan.current=null}}>
      <defs><pattern id={pattern} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#e1e8e0" strokeWidth={unit*.5} /></pattern></defs>
      <rect x={view.x} y={-view.y-view.height} width={view.width} height={view.height} fill={`url(#${pattern})`} />
      {plan.areas.map(a=>{const label=insideLabel(a.polygon),extent=zoneBounds(a),limit=Math.max(0,Math.floor(((extent.maxX-extent.minX)/unit-24)/7)),caption=limit<4 ? '' : a.name.length>limit ? a.name.slice(0,limit-1)+'…' : a.name;return <g key={a.id}><polygon className="nfa-shape" points={points(a.polygon)} data-selected={a.id===selected} data-kind={a.kind} role="button" tabIndex={0} aria-label={a.name} onFocus={()=>setSelected(a.id)} onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setSelected(a.id)}}} onPointerDown={e=>begin(e,a.id)}><title>{a.name}</title></polygon><text className="nfa-name" style={{fontSize:`${12*unit}px`}} x={label.xM} y={-label.yM}>{caption}</text></g>})}
      {plan.areas.map(a=>{const m=farmEditorMap(plan,a.id,layouts),b=zoneBounds(a),visible=new Set(m.layers.filter(l=>l.visible).map(l=>l.id));return <g key={`gear-${a.id}`} className="nfa-gear" data-editable={mode==='equipment'}>{m.objects.filter(o=>o.visible && visible.has(o.layerId)).map(o=>{
        const footprint=objectFootprint(o).map(p=>({xM:p.xM+b.minX,yM:p.yM+b.minY})),invalid=!objectInsideOutline(o,m),active=selectedObject?.areaId===a.id && (selectedObject.ids || [selectedObject.id]).includes(o.id)
        const interaction={onPointerDown:(e:ReactPointerEvent<SVGElement>)=>beginObject(e,a.id,o),onKeyDown:(e:ReactKeyboardEvent<SVGElement>)=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setSelected(a.id);setSelectedObject({areaId:a.id,id:o.id});setEquipmentTab(o.type==='sensor-node' ? 'nodes' : 'equipment')}},tabIndex:mode==='equipment' ? 0 : -1,role:'button','aria-label':o.name}
        return <g key={o.id} data-type={o.type} data-invalid={invalid} data-active={active}><title>{o.name}</title>{o.type==='sensor-node' ? <circle {...interaction} cx={(footprint[0].xM+footprint[2].xM)/2} cy={-(footprint[0].yM+footprint[2].yM)/2} r={5*unit} /> : <polygon {...interaction} points={points(footprint)} />}{active && selectedIds.length===1 && <text style={{fontSize:`${12*unit}px`}} x={footprint[0].xM} y={-footprint[0].yM-8*unit}>{o.name}</text>}</g>
      })}</g>})}
      {area && bounds && map && mode==='equipment' && selectedGear.length===1 && <FarmObjectHandles object={selectedGear[0]} map={map} origin={{xM:bounds.minX,yM:bounds.minY}} unit={unit} lt={lt} onBegin={beginResize} onNudge={nudgeResize} />}
      {area && mode==='contour' && <g className="nfa-handles">{area.polygon.map((p,i)=>{const q=area.polygon[(i+1)%area.polygon.length],length=wallLength(p,q),sign=Math.sign(area.polygon.reduce((sum,a,j)=>{const b=area.polygon[(j+1)%area.polygon.length];return sum+a.xM*b.yM-b.xM*a.yM},0)) || 1,label={xM:(p.xM+q.xM)/2+sign*(q.yM-p.yM)/length*unit*24,yM:(p.yM+q.yM)/2-sign*(q.xM-p.xM)/length*unit*24};return <g key={i}><line className="nfa-wall-hit" x1={p.xM} y1={-p.yM} x2={q.xM} y2={-q.yM} strokeWidth={unit*14} data-active={wall===i} onPointerDown={e=>begin(e,area.id,undefined,i)} onDoubleClick={e=>{e.stopPropagation();addVertex(i)}} />{wall===i && <text className="nfa-wall-label" style={{fontSize:`${12*unit}px`}} x={label.xM} y={-label.yM}>{format(wallLength(p,q))} m</text>}</g>})}{area.polygon.map((p,i)=><circle key={i} cx={p.xM} cy={-p.yM} r={6*unit} data-active={selectedVertex===i} role="button" tabIndex={0} aria-label={`${lt ? 'Kontūro taškas' : 'Vertex'} ${i+1}`} onFocus={()=>setVertex(i)} onPointerDown={e=>begin(e,area.id,i)} onKeyDown={e=>{
        if(e.key==='Delete' || e.key==='Backspace'){e.preventDefault();e.stopPropagation();removeVertex(i)}
        const delta=e.shiftKey ? 1 : .25,shifts:Record<string,SitePoint>={ArrowLeft:{xM:-delta,yM:0},ArrowRight:{xM:delta,yM:0},ArrowUp:{xM:0,yM:delta},ArrowDown:{xM:0,yM:-delta}}
        if(shifts[e.key]){e.preventDefault();e.stopPropagation();alterVertex(i,{xM:p.xM+shifts[e.key].xM,yM:p.yM+shifts[e.key].yM})}
      }} />)}</g>}
    </svg>
    <div className="nfa-3d-view" hidden={display!=='3d'}>{display==='3d' && scene}</div>
    </div>
    <div className="nfa-drawing-footer" hidden={display!=='2d'}><div className="nfa-view-controls" hidden={display!=='2d'}><button type="button" onClick={()=>fit(true)}>{lt ? 'Visas planas' : 'Fit plan'}</button>{area && <button type="button" onClick={()=>fit()}>{lt ? 'Pasirinkta Area' : 'Fit Area'}</button>}<button type="button" aria-label={lt ? 'Priartinti brėžinį' : 'Zoom drawing in'} onClick={()=>zoom(.75)}>+</button><button type="button" aria-label={lt ? 'Atitolinti brėžinį' : 'Zoom drawing out'} onClick={()=>zoom(1.333)}>−</button></div>
    <p className="nfa-canvas-help" hidden={display!=='2d'}>{lt ? 'Tempkite foną · Option / Alt + ratukas priartina' : 'Drag background to pan · Option / Alt + scroll to zoom'}</p>
    </div>
    {!plan.areas.length && <p className="nfa-start">{lt ? 'Paspauskite „Pridėti Area“. Atsiras stačiakampis, kurį galėsite pritaikyti savo patalpai.' : 'Select Add Area to insert a rectangle, then shape it to match your growing space.'}</p>}
    {message && <p className="nfa-message" role="status">{message}</p>}
    {!!plan.areas.length && <nav className="nfa-area-list" aria-label={lt ? 'Plano erdvės' : 'Plan Areas'}>{plan.areas.map(a=><button type="button" key={a.id} aria-pressed={a.id===selected} onClick={()=>{setSelected(a.id);setSelectedObject(null);setWall(null);setVertex(0)}}>{a.name}</button>)}</nav>}
    </div>
    <div className="nfa-tools"><button className="nfa-add-area" type="button" onClick={add} disabled={plan.areas.length>=80}><i className="fa-solid fa-plus" />{lt ? 'Pridėti Area' : 'Add Area'}</button><div role="group" aria-label={lt ? 'Redagavimas' : 'Edit mode'}><button type="button" aria-pressed={mode==='contour'} onClick={()=>{setMode('contour');setSelectedObject(null);setDisplay('2d')}}>{lt ? 'Kontūras' : 'Outline'}</button>{(['nodes','equipment','sections'] as const).map(tab=><button key={tab} type="button" disabled={!area} aria-pressed={mode==='equipment' && equipmentTab===tab} onClick={()=>{setMode('equipment');setEquipmentTab(tab);setSelectedObject(null);setDisplay('2d')}}>{tab==='nodes' ? 'Nodes' : tab==='sections' ? 'Sections' : (lt ? 'Įranga' : 'Equipment')}</button>)}</div><label className="nfa-grid-toggle"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)} />{lt ? 'Tinklelis 0,25 m' : 'Grid 0.25 m'}</label></div>
    {area && mode==='equipment' && <div className="nfa-equipment-actions" role="group" aria-label={lt ? 'Veiksmai su įranga' : 'Equipment actions'}><span>{selectedGear.length ? `${lt ? 'Pasirinkta' : 'Selected'}: ${selectedGear.length}` : (lt ? 'Pasirinkite įrangą brėžinyje' : 'Select equipment in the drawing')}</span><button type="button" disabled={!duplicableCount} onClick={copyObjects} title="⌘ / Ctrl + C"><i className="fa-regular fa-copy" />{lt ? 'Kopijuoti' : 'Copy'}</button><button type="button" disabled={!copiedObjects.length || contextLoading} onClick={pasteObjects} title="⌘ / Ctrl + V"><i className="fa-regular fa-clipboard" />{lt ? 'Įklijuoti' : 'Paste'}</button><button className="nfa-equipment-delete" type="button" disabled={!removableCount} onClick={()=>removeObjects()} title="Delete / Backspace"><i className="fa-regular fa-trash-can" />{lt ? 'Pašalinti' : 'Delete'}</button><small>{lt ? 'Shift + paspaudimas — keli objektai' : 'Shift-click to select multiple objects'}</small></div>}
    {area && map && mode==='equipment' ? <FarmEquipmentPanel key={area.id} tab={equipmentTab} onTab={setEquipmentTab} map={map} selectedIds={selectedIds} selectedId={selectedObject?.areaId===area.id ? selectedObject.id : null} onSelect={id=>{setSelectedObject(id ? {areaId:area.id,id} : null);const object=map.objects.find(o=>o.id===id);if(object && (!object.visible || map.layers.some(l=>l.id===object.layerId && !l.visible)))setMap({...map,layers:map.layers.map(l=>l.id===object.layerId ? {...l,visible:true} : l),objects:map.objects.map(o=>o.id===id ? {...o,visible:true} : o)})}} context={nodeContext?.area.id===area.id ? nodeContext : undefined} loading={contextLoading} contextError={contextError} language={lt ? 'lt' : 'en'} onAdd={addObject} onUpdate={updateObject} onLayers={setMap} onCreateSection={onCreateSection} onAssignSection={onAssignSection} onNodeHeight={onNodeHeight} unassignedNodes={unassignedNodes} inventoryError={inventoryError} onConnectNode={onConnectNode} /> : area && bounds ? <section className="nfa-properties"><div className="nfa-property-heading"><strong>{area.name} · {format(zoneArea(area))} m²</strong><button className="nfa-delete-area" type="button" onClick={requestDelete}><i className="fa-solid fa-trash-can" /> {lt ? 'Ištrinti Area' : 'Delete Area'}</button></div>
      <div className="nfa-area-basics"><div className="nfa-fields"><label>{lt ? 'Pavadinimas' : 'Name'}<input key={`${area.id}-${area.name}`} defaultValue={area.name} maxLength={120} onBlur={e=>{if(e.target.value.trim()!==area.name && !commit(editFarmArea(plan,area.id,{name:e.target.value.trim()})))e.currentTarget.value=area.name}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label><label>{lt ? 'Erdvės tipas' : 'Area type'}<select value={area.kind} onChange={e=>commit(editFarmArea(plan,area.id,{kind:e.target.value as typeof area.kind}))}><option value="room">{lt ? 'Patalpa' : 'Room'}</option><option value="greenhouse">{lt ? 'Šiltnamis' : 'Greenhouse'}</option><option value="zone">{lt ? 'Zona be sienų' : 'Zone without walls'}</option></select></label></div>
      <div className="nfa-fields nfa-measurements"><NumberField key={`${area.id}-w-${bounds.maxX-bounds.minX}`} label={lt ? 'Plotis, m' : 'Width, m'} value={bounds.maxX-bounds.minX} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,n,bounds.maxY-bounds.minY))} /><NumberField key={`${area.id}-l-${bounds.maxY-bounds.minY}`} label={lt ? 'Ilgis, m' : 'Length, m'} value={bounds.maxY-bounds.minY} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,bounds.maxX-bounds.minX,n))} /><NumberField key={`${area.id}-h-${area.height}`} label={lt ? 'Aukštis, m' : 'Height, m'} value={area.height} min={.5} max={12} step={.1} onCommit={n=>commit(editFarmArea(plan,area.id,{height:n}))} /></div></div>
      <div className="nfa-wall-editor"><label>{lt ? 'Siena' : 'Wall'}<select value={activeWall ?? ''} onChange={e=>setWall(e.target.value==='' ? null : Number(e.target.value))}><option value="">{lt ? 'Pasirinkite brėžinyje' : 'Select in drawing'}</option>{area.polygon.map((_,i)=><option key={i} value={i}>{lt ? 'Siena' : 'Wall'} {i+1}</option>)}</select></label>{activeWall!==null && <NumberField key={`${area.id}-${activeWall}-${wallLength(area.polygon[activeWall],area.polygon[(activeWall+1)%area.polygon.length])}`} label={lt ? 'Sienos ilgis, m' : 'Wall length, m'} value={wallLength(area.polygon[activeWall],area.polygon[(activeWall+1)%area.polygon.length])} min={.1} step={.01} onCommit={n=>{setView(view);commit(setFarmWallLength(plan,area.id,activeWall,n))}} />}<small>{lt ? 'Paspauskite sieną ir įveskite tikslų jos ilgį. Kampus galite tempti.' : 'Select a wall to enter its exact length. Drag corners to reshape.'}</small></div>
      <details className="nfa-advanced"><summary>{lt ? 'Kontūro taškai ir vieta' : 'Vertices and position'}</summary>
      <div className="nfa-vertex"><label>{lt ? 'Taškas' : 'Vertex'}<select value={selectedVertex} onChange={e=>setVertex(Number(e.target.value))}>{area.polygon.map((_,i)=><option value={i} key={i}>{i+1}</option>)}</select></label>{(['xM','yM'] as const).map(axis=><NumberField key={`${area.id}-${selectedVertex}-${axis}-${area.polygon[selectedVertex][axis]}`} label={axis==='xM' ? 'X, m' : 'Y, m'} value={area.polygon[selectedVertex][axis]} onCommit={n=>alterVertex(selectedVertex,{...area.polygon[selectedVertex],[axis]:n})} />)}<button type="button" disabled={area.polygon.length>=64} onClick={()=>addVertex(selectedVertex)}>{lt ? '+ taškas' : '+ vertex'}</button><button type="button" aria-label={lt ? 'Pašalinti tašką' : 'Remove vertex'} disabled={area.polygon.length<=3} onClick={()=>removeVertex(selectedVertex)}>−</button></div>
      <details className="nfa-position"><summary>{lt ? 'Vieta plane' : 'Position in the plan'}</summary><div className="nfa-fields"><NumberField key={`${area.id}-x-${bounds.minX}`} label="X, m" value={bounds.minX} onCommit={n=>commit(moveFarmArea(plan,area.id,n,bounds.minY))} /><NumberField key={`${area.id}-y-${bounds.minY}`} label="Y, m" value={bounds.minY} onCommit={n=>commit(moveFarmArea(plan,area.id,bounds.minX,n))} /></div></details>
      </details>
    </section> : <p className="nfa-unselected">{lt ? 'Pasirinkite Area brėžinyje arba pridėkite naują.' : 'Select an Area in the drawing, or add a new one.'}</p>}
    </div>
    <details className="nfa-plan-settings"><summary>{lt ? 'Ūkio pavadinimas' : 'Farm name'}</summary><label>{lt ? 'Ūkio pavadinimas' : 'Farm name'}<input value={plan.name} maxLength={120} onChange={e=>{remember(plan);onChange({...plan,name:e.target.value},layouts)}} /></label></details>
    {deleteTarget && <FarmAreaDeleteDialog key={deleteTarget.id} {...deleteTarget} lt={lt} onCancel={()=>setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </aside>
}
