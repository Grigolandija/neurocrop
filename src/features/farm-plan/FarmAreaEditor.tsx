import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
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
import { equipmentCollisions } from '../greenhouse-map/equipmentCollisions'
import type { AreaMapContext,AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import { farmEditorMap,newFarmObject,reconcileFarmMaps,type FarmMaps } from './farmLayoutData'
import FarmCultivationPanel from './FarmCultivationPanel'
import FarmEquipmentPanel from './FarmEquipmentPanel'
import FarmAreaDeleteDialog from './FarmAreaDeleteDialog'
import FarmObjectHandles from './FarmObjectHandles'
import FarmEquipmentFootprint from './FarmEquipmentFootprint'
import { equipmentUnlocked,equipmentDuplicable,equipmentRotatable,pasteFarmEquipment,resizeFarmEquipment,rotateFarmEquipment,type EquipmentHandle } from './farmEquipmentEditing'
import { moveFarmEquipment,type EquipmentGuide } from './farmEquipmentSnapping'
import '../living-greenhouse/site-plan-editor.css'
import './farm-area-editor.css'

type Props={plan:FarmPlanDocument;layouts:FarmMaps;onChange:(plan:FarmPlanDocument,layouts:FarmMaps)=>void;areas:FarmArea[];renderScene:(isolatedAreaId:string|null)=>ReactNode;saveAction?:ReactNode;saveError?:string;nodeContext?:AreaMapContext;contextLoading:boolean;contextError?:string;onCreateSection:(name:string,profile:string)=>Promise<boolean>;onCultivation:(profile:string|null)=>Promise<void>;onEditGroup:(id:string,name:string,profile:string|null)=>Promise<void>;onAssignSection:(devEui:string,sectionId:string)=>Promise<void>;onNodeHeight:(devEui:string,heightM:number|null)=>Promise<void>;unassignedNodes:AreaMapNode[];inventoryError?:string;onConnectNode:(devEui:string,sectionId:string)=>Promise<AreaMapNode>;onDeleteArea:(id:string)=>Promise<void>;initialEquipment?:boolean;initialCultivation?:boolean;cultivationRequest?:string;disabled?:boolean;selectedId?:string|null;onSelect?:(id:string|null)=>void}
type EditorPanel='area'|'object'|'equipment'|'nodes'|'sections'|'settings'
type Snapshot={plan:FarmPlanDocument;layouts:FarmMaps}
type Drag=Snapshot & {id:string;start:SitePoint;vertex?:number;edge?:number;pointerId:number;changed:boolean}
type GearDrag=Snapshot & {areaId:string;object:GreenhouseObject;objects:GreenhouseObject[];handle?:EquipmentHandle|'rotate';start:SitePoint;screen:{x:number;y:number};moved:boolean;pointerId:number;changed:boolean}
function NumberField({label,value,onCommit,min=0,max=10000,step=.25}:{label:string;value:number;onCommit:(n:number)=>void;min?:number;max?:number;step?:number}){
  const [text,setText]=useState(String(Math.round(value*1000)/1000))
  const changed=useRef(false)
  const commit=()=>{const next=Number(text);if(changed.current && text.trim() && Number.isFinite(next) && next>=min && next<=max && Math.abs(next-value)>1e-8)onCommit(next);changed.current=false;setText(String(Math.round(value*1000)/1000))}
  return <label>{label}<input type="number" min={min} max={max} step={step} value={text} onChange={e=>{changed.current=true;setText(e.target.value)}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label>
}

export default function FarmAreaEditor({plan,layouts,onChange,areas,renderScene,saveAction,saveError,nodeContext,contextLoading,contextError,onCreateSection,onCultivation,onEditGroup,onAssignSection,onNodeHeight,unassignedNodes,inventoryError,onConnectNode,onDeleteArea,initialEquipment=false,initialCultivation=false,cultivationRequest,disabled=false,selectedId,onSelect}:Props){
  const {language}=useInterfaceLanguage(),lt=language==='lt',t=(value:string)=>siteEditorText(value,!lt)
  const [ownSelected,setOwnSelected]=useState<string|null>(null)
  const selected=selectedId===undefined ? ownSelected : selectedId
  const setSelected=(id:string|null)=>{setOwnSelected(id);onSelect?.(id)}
  const [arranging,setArranging]=useState(false)
  const farmCamera=useRef<DrawingView|null>(null)
  const [mode,setMode]=useState<'contour'|'equipment'>('equipment'),[display,setDisplay]=useState<'2d'|'3d'>('2d'),[selectedObject,setSelectedObject]=useState<{areaId:string;id:string;ids?:string[]}|null>(null)
  const [deleteTarget,setDeleteTarget]=useState<{id:string;name:string;saved:boolean;objects:number;sections:number;nodes:number}|null>(null)
  const [panel,setPanel]=useState<EditorPanel|null>(initialCultivation ? 'sections' : initialEquipment ? 'equipment' : null)
  useEffect(()=>{
    if(!cultivationRequest)return
    const frame=requestAnimationFrame(()=>setPanel('sections'))
    return ()=>cancelAnimationFrame(frame)
  },[cultivationRequest])
  const panelOpener=useRef<HTMLElement|null>(null)
  const togglePanel=(next:EditorPanel)=>{panelOpener.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;setPanel(current=>current===next ? null : next)}
  const closePanel=()=>{setPanel(null);requestAnimationFrame(()=>panelOpener.current?.isConnected ? panelOpener.current.focus({preventScroll:true}) : svg.current?.focus({preventScroll:true}))}
  const [equipmentTab,setEquipmentTab]=useState<'nodes'|'equipment'|'sections'>('nodes')
  const [copiedObjects,setCopiedObjects]=useState<GreenhouseObject[]>([])
  const gearDrag=useRef<GearDrag|null>(null)
  const [alignmentGuides,setAlignmentGuides]=useState<EquipmentGuide[]>([])
  const [vertex,setVertex]=useState(0),[snap,setSnap]=useState(true),[wall,setWall]=useState<number|null>(null),[expanded,setExpanded]=useState(false)
  const [message,setMessage]=useState(''),[undo,setUndo]=useState<Snapshot[]>([]),[redo,setRedo]=useState<Snapshot[]>([])
  const svg=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),pattern=useId().replaceAll(':','')
  const [size,setSize]=useState({width:900,height:650})
  const [camera,setCamera]=useState<{selection:string|null;view:DrawingView;fit?:'plan'|'area'}|null>(null)
  const pan=useRef<{pointerId:number;x:number;y:number;view:DrawingView;moved:boolean}|null>(null)
  const editor=useRef<HTMLElement>(null)
  const expandButton=useRef<HTMLButtonElement>(null)
  const closeExpanded=()=>{setExpanded(false);expandButton.current?.focus()}
  useEffect(()=>{
    if(!expanded)return
    const previous=document.body.style.overflow;document.body.style.overflow='hidden'
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape' && !event.defaultPrevented && !document.querySelector('.nfa-delete-dialog[open]')){event.preventDefault();setExpanded(false);expandButton.current?.focus()}}
    document.addEventListener('keydown',escape)
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',escape)}
  },[expanded])
  useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r?.width && r.height)setSize({width:r.width,height:r.height})});observer.observe(el);return()=>observer.disconnect()},[])
  const area=plan.areas.find(a=>a.id===selected),saved=areas.find(a=>a.id===selected),bounds=area ? zoneBounds(area) : null
  const isolated=!!area && !arranging
  const visibleAreas=isolated ? [area] : plan.areas
  const aspect=size.width/size.height,fitted=fitFarmDrawing(visibleAreas,aspect)
  const stored=camera?.fit ? fitFarmDrawing(isolated ? [area!] : camera.fit==='area' && area ? [area] : plan.areas,aspect) : camera?.selection===selected ? camera.view : fitted
  const height=stored.width/aspect,view={...stored,y:stored.y+(stored.height-height)/2,height}
  const unit=view.width/size.width
  const gridStep=unit*12<=.25 ? .25 : unit*12<=1 ? 1 : 10**Math.ceil(Math.log10(unit*12))
  const points=(polygon:SitePoint[])=>polygon.map(p=>`${p.xM},${-p.yM}`).join(' ')
  const setView=(next:DrawingView)=>setCamera({selection:selected,view:next})
  const zoom=(factor:number)=>{const width=Math.min(20000,Math.max(2,view.width*factor)),height=width/aspect;setView({x:view.x+(view.width-width)/2,y:view.y+(view.height-height)/2,width,height})}
  const fit=(all=false)=>setCamera({selection:selected,view:fitFarmDrawing(isolated || (!all && area) ? [area!] : plan.areas,aspect),fit:isolated || (!all && area) ? 'area' : 'plan'})
  const chooseArea=(id:string|null)=>{
    if(id && !isolated)farmCamera.current=view
    const target=plan.areas.find(a=>a.id===id)
    setCamera(target ? {selection:id,view:fitFarmDrawing([target],aspect),fit:'area'} : {selection:null,view:farmCamera.current || fitFarmDrawing(plan.areas,aspect)})
    setAlignmentGuides([]);setArranging(false);setSelected(id);setSelectedObject(null);setWall(null);setVertex(0);setMessage('');setPanel(null);setMode('equipment')
  }
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
    try{const next=insertFarmArea(plan,!lt);remember(plan);onChange(next.plan,layouts);farmCamera.current=view;setArranging(false);setSelected(next.id);setMode('contour');setSelectedObject(null);setDisplay('2d');setVertex(0);setWall(null);setPanel('area');setCamera({selection:next.id,view:fitFarmDrawing([next.plan.areas.find(a=>a.id===next.id)!],aspect),fit:'area'});setMessage('')}
    catch(error){setMessage(error instanceof Error ? t(error.message) : 'Area could not be added.')}
  }
  const revert=(forward=false)=>{
    const next=forward ? redo[0] : undo.at(-1);if(!next)return
    if(forward){setUndo(p=>[...p,{plan,layouts}]);setRedo(p=>p.slice(1))}else{setRedo(p=>[{plan,layouts},...p]);setUndo(p=>p.slice(0,-1))}
    onChange(next.plan,next.layouts);setMessage('');setSelectedObject(null);if(panel==='object')setPanel(null)
  }
  const point=(event:{clientX:number;clientY:number}):SitePoint=>{
    const matrix=svg.current?.getScreenCTM();if(!matrix)return {xM:0,yM:0}
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    return {xM:p.x,yM:-p.y}
  }
  const begin=(event:ReactPointerEvent<SVGElement>,id:string,index?:number,edge?:number)=>{
    if(disabled || event.button!==0)return
    event.stopPropagation();event.preventDefault();event.currentTarget.focus({preventScroll:true})
    if(mode==='equipment'){if(!isolated){chooseArea(id);return}setSelectedObject(null);if(panel==='object')setPanel(null);return}
    setSelected(id);setSelectedObject(null);setWall(edge ?? null);if(index!==undefined)setVertex(index)
    setCamera({selection:id,view})
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current={plan,layouts,id,start:point(event),vertex:index,edge,pointerId:event.pointerId,changed:false}
  }
  const map=area ? farmEditorMap(plan,area.id,layouts) : null
  const selectedIds=selectedObject && selectedObject.areaId===area?.id ? (selectedObject.ids || [selectedObject.id]) : []
  const selectedGear=map?.objects.filter(o=>selectedIds.includes(o.id)) || []
  const collisionIds=new Set(map ? equipmentCollisions(map).flatMap(c=>[c.left.id,c.right.id]) : [])
  const duplicableCount=selectedGear.filter(equipmentDuplicable).length
  const removableCount=map ? selectedGear.filter(o=>equipmentUnlocked(o,map)).length : 0
  const setMap=(next:GreenhouseMap,record=true)=>{if(!area)return;if(record)remember(plan);onChange(plan,{...layouts,[area.id]:next});setMessage('')}
  const addObject=(type:ObjectType,node?:AreaMapNode,position?:SitePoint)=>{
    if(!map || !area)return
    if(saved && (contextLoading || nodeContext?.area.id!==area.id)){setMessage(lt ? 'Palaukite, kol bus įkeltas šios Area išdėstymas.' : 'Wait for this Area layout to load.');return}
    const object=newFarmObject(type,map,position,node)
    if(!objectInsideOutline(object,map) || (isWallMountedType(type) && !validOutlineMount(object,map))){setMessage(lt ? 'Objektas netelpa šioje Area. Pakeiskite kontūrą arba pasirinkite mažesnį objektą.' : 'This object does not fit the Area. Adjust the outline or choose a smaller object.');return}
    setMap({...map,layers:map.layers.map(l=>l.id===object.layerId ? {...l,visible:true} : l),objects:[...map.objects,object]});setSelectedObject({areaId:area.id,id:object.id});setMode('equipment');if(type==='sensor-node')setPanel('object')
  }
  const updateObject=(id:string,patch:Partial<GreenhouseObject>)=>{
    const original=map?.objects.find(o=>o.id===id);if(!original || !map)return
    const locked=original.locked || map.layers.find(l=>l.id===original.layerId)?.locked
    if(locked && !(Object.keys(patch).length===1 && patch.locked===false && !map.layers.find(l=>l.id===original.layerId)?.locked))return
    let object={...original,...patch}
    if(patch.rotationDeg!==undefined && patch.xM===undefined && patch.yM===undefined && equipmentRotatable(original)){
      const rotated=rotateFarmEquipment(original,patch.rotationDeg,map)
      if(!rotated){setMessage(lt ? 'Pasukimui trūksta vietos. Patraukite objektą nuo sienos.' : 'Not enough room to rotate. Move the object away from the wall.');return}
      object={...object,xM:rotated.xM,yM:rotated.yM,rotationDeg:rotated.rotationDeg}
    }
    if(isWallMountedType(object.type))object=snapObjectToMapWall(object,map,patch.xM===undefined && patch.yM===undefined ? object.metadata.wallMount?.edgeIndex : undefined)
    if(!objectInsideOutline(object,map)){setMessage(lt ? 'Objektas turi tilpti Area kontūre.' : 'Keep the object inside the Area outline.');return}
    setMap({...map,objects:map.objects.map(o=>o.id===id ? object : o)})
  }
  const removeObjects=(ids=selectedIds)=>{
    if(!map || disabled)return
    const removed=new Set(map.objects.filter(o=>ids.includes(o.id) && equipmentUnlocked(o,map)).map(o=>o.id))
    if(!removed.size)return
    setMap({...map,objects:map.objects.filter(o=>!removed.has(o.id))});setSelectedObject(null);if(panel==='object')setPanel(null);svg.current?.focus({preventScroll:true})
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
    event.preventDefault();event.stopPropagation();if(!isolated){chooseArea(areaId);return}event.currentTarget.focus({preventScroll:true});setSelected(areaId);setCamera({selection:areaId,view})
    const current=selectedObject?.areaId===areaId ? (selectedObject.ids || [selectedObject.id]) : []
    const ids=event.shiftKey ? (current.includes(object.id) ? current.filter(id=>id!==object.id) : [...current,object.id]) : (current.includes(object.id) ? current : [object.id])
    setSelectedObject(ids.length ? {areaId,id:ids.at(-1)!,ids} : null);setEquipmentTab(object.type==='sensor-node' ? 'nodes' : 'equipment');if(panel==='area')setPanel('object')
    if(event.shiftKey)return
    const currentMap=farmEditorMap(plan,areaId,layouts)
    if(!equipmentUnlocked(object,currentMap))return
    const objects=currentMap.objects.filter(o=>ids.includes(o.id) && equipmentUnlocked(o,currentMap))
    setAlignmentGuides([]);event.currentTarget.setPointerCapture(event.pointerId);gearDrag.current={plan,layouts,areaId,object,objects,start:point(event),screen:{x:event.clientX,y:event.clientY},moved:false,pointerId:event.pointerId,changed:false}
  }
  const beginResize=(event:ReactPointerEvent<SVGElement>,object:GreenhouseObject,handle:EquipmentHandle|'rotate')=>{
    if(disabled || !area || !map || event.button!==0 || !equipmentUnlocked(object,map))return
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);setCamera({selection:area.id,view})
    setAlignmentGuides([]);gearDrag.current={plan,layouts,areaId:area.id,object,objects:[object],handle,start:point(event),screen:{x:event.clientX,y:event.clientY},moved:false,pointerId:event.pointerId,changed:false}
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
    if(gearDrag.current || drag.current){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();const active=gearDrag.current || drag.current!;gearDrag.current=null;drag.current=null;setAlignmentGuides([]);onChange(active.plan,active.layouts);setMessage('')}return}
    const editingField=event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"]')
    if(!editingField && mode==='equipment' && (event.key==='Delete' || event.key==='Backspace')){event.preventDefault();event.stopPropagation();removeObjects();return}
    if(!editingField && mode==='equipment' && (event.metaKey || event.ctrlKey)){
      const key=event.key.toLowerCase()
      if(key==='c' && selectedGear.length){event.preventDefault();copyObjects();return}
      if(key==='v' && copiedObjects.length){event.preventDefault();pasteObjects();return}
    }
    if(area && mode==='contour' && wall===null && !editingField && (event.key==='Delete' || event.key==='Backspace') && !(event.target instanceof Element && event.target.closest('.nfa-handles,button'))){event.preventDefault();event.stopPropagation();requestDelete();return}
    if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z' && !editingField){event.preventDefault();revert(event.shiftKey)}
    if(event.key==='Escape' && panel){event.preventDefault();event.stopPropagation();closePanel();return}
    if(event.key==='Escape' && !expanded){setSelectedObject(null);setMessage('')}
    if(event.key==='Tab' && expanded){const candidates=editor.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]');const controls=Array.from(candidates || []).filter(el=>el.getClientRects().length>0);if(controls.length){const first=controls[0],last=controls[controls.length-1];if(event.shiftKey && event.target===first){event.preventDefault();last.focus()}else if(!event.shiftKey && event.target===last){event.preventDefault();first.focus()}}}
  }}>
    <header className="nfa-header"><div className="nfa-header-start">{isolated && <button type="button" className="nfa-back" onClick={()=>chooseArea(null)} aria-label={lt ? 'Grįžti į ūkio planą' : 'Back to farm plan'} title={lt ? 'Grįžti į ūkio planą' : 'Back to farm plan'}><i className="fa-solid fa-arrow-left" /><span>{lt ? 'Grįžti atgal' : 'Back to farm plan'}</span></button>}{saveAction}<div className="nfa-location"><i className="fa-solid fa-layer-group" aria-hidden="true" /><select aria-label={lt ? 'Pasirinkta Area' : 'Selected Area'} value={area?.id || ''} onChange={e=>chooseArea(e.target.value || null)}><option value="">{lt ? 'Visas ūkis' : 'Whole farm'}</option>{plan.areas.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select>{!isolated && <span>{plan.areas.length} {lt ? 'erdvės' : 'Areas'}</span>}</div></div><div className="nfa-header-actions">
      <div className="nfa-display" role="group" aria-label={lt ? 'Vaizdas' : 'View'}>{(['2d','3d'] as const).map(v=><button key={v} type="button" aria-pressed={display===v} onClick={()=>{if(v==='3d' && arranging){setSelected(null);setArranging(false)}setDisplay(v)}}>{v.toUpperCase()}</button>)}</div>
      <button type="button" title={lt ? 'Atšaukti' : 'Undo'} aria-label={lt ? 'Atšaukti' : 'Undo'} disabled={!undo.length} onClick={()=>revert()}><i className="fa-solid fa-rotate-left" /></button><button type="button" title={lt ? 'Pakartoti' : 'Redo'} aria-label={lt ? 'Pakartoti' : 'Redo'} disabled={!redo.length} onClick={()=>revert(true)}><i className="fa-solid fa-rotate-right" /></button>
      <button ref={expandButton} type="button" title={expanded ? (lt ? 'Sumažinti brėžinį' : 'Exit expanded drawing') : (lt ? 'Išplėsti brėžinį' : 'Expand drawing')} aria-label={expanded ? (lt ? 'Sumažinti brėžinį' : 'Exit expanded drawing') : (lt ? 'Išplėsti brėžinį' : 'Expand drawing')} aria-pressed={expanded} onClick={()=>expanded ? closeExpanded() : setExpanded(true)}><i className={`fa-solid ${expanded ? 'fa-compress' : 'fa-expand'}`} /></button>
    </div></header>
    <div className="nfa-workbench"><div className="nfa-canvas-wrap">
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
          if(gear.handle==='rotate'){
            const footprint=objectFootprint(gear.object),center={xM:(footprint[0].xM+footprint[2].xM)/2,yM:(footprint[0].yM+footprint[2].yM)/2},origin=zoneBounds(gear.plan.areas.find(a=>a.id===gear.areaId)!)
            const angle=(Math.atan2(p.yM-origin.minY-center.yM,p.xM-origin.minX-center.xM)-Math.atan2(gear.start.yM-origin.minY-center.yM,gear.start.xM-origin.minX-center.xM))*180/Math.PI+gear.object.rotationDeg
            const rotated=rotateFarmEquipment(gear.object,event.shiftKey ? Math.round(angle/15)*15 : angle,m)
            if(!rotated){setMessage(lt ? 'Pasukimui trūksta vietos. Patraukite objektą nuo sienos.' : 'Not enough room to rotate. Move the object away from the wall.');return}
            objects=[rotated]
          }else if(gear.handle){
            const resized=resizeFarmEquipment(gear.object,gear.handle,delta,m,snap)
            if(!resized){setMessage(lt ? 'Matmenys turi tilpti Area kontūre.' : 'Keep the dimensions inside the Area outline.');return}
            objects=[resized]
          }else{
            const moved=moveFarmEquipment(gear.objects,gear.object,delta,m,{grid:snap && !event.altKey,magnet:!event.altKey,toleranceM:unit*8})
            setAlignmentGuides(moved?.guides || [])
            if(!moved){setMessage(lt ? 'Įranga turi tilpti Area kontūre.' : 'Keep the equipment inside the Area outline.');return}
            objects=moved.objects
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
        active.changed=true;onChange(result.plan,reconcileFarmMaps(active.plan,result.plan,active.layouts));setMessage('')
      }} onPointerUp={event=>{
        if(gearDrag.current?.pointerId===event.pointerId){const gear=gearDrag.current;gearDrag.current=null;setAlignmentGuides([]);if(gear.changed)remember(gear.plan,gear.layouts);if(!gear.moved && gear.objects.length>1)setSelectedObject({areaId:gear.areaId,id:gear.object.id});return}
        if(pan.current?.pointerId===event.pointerId){
          if(!pan.current.moved){
            setSelectedObject(null);setWall(null);if(panel==='object')setPanel(null)
            const focused=document.activeElement
            if(focused instanceof SVGElement && svg.current?.contains(focused))focused.blur()
          }
          pan.current=null;return
        }
        const active=drag.current;if(!active || active.pointerId!==event.pointerId)return;drag.current=null;if(active.changed)remember(active.plan,active.layouts)
      }} onPointerCancel={()=>{const active=gearDrag.current || drag.current;if(active)onChange(active.plan,active.layouts);gearDrag.current=null;drag.current=null;pan.current=null;setAlignmentGuides([])}}>
      <defs><pattern id={pattern} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#e1e8e0" strokeWidth={unit*.5} /></pattern><pattern id={`${pattern}-major`} width={gridStep*4} height={gridStep*4} patternUnits="userSpaceOnUse"><path d={`M${gridStep*4} 0H0V${gridStep*4}`} fill="none" stroke="#dce4df" strokeWidth={unit*.65} /></pattern></defs>
      <rect x={view.x} y={-view.y-view.height} width={view.width} height={view.height} fill={`url(#${pattern})`} /><rect x={view.x} y={-view.y-view.height} width={view.width} height={view.height} fill={`url(#${pattern}-major)`} />
      {visibleAreas.map(a=>{const label=insideLabel(a.polygon),extent=zoneBounds(a),limit=Math.max(0,Math.floor(((extent.maxX-extent.minX)/unit-24)/7)),caption=limit<4 ? '' : a.name.length>limit ? a.name.slice(0,limit-1)+'…' : a.name;return <g key={a.id}><polygon className="nfa-shape" points={points(a.polygon)} data-selected={a.id===selected} data-kind={a.kind} role="button" tabIndex={0} aria-label={a.name} onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();chooseArea(a.id)}}} onPointerDown={e=>begin(e,a.id)}><title>{a.name}</title></polygon><g className="nfa-room-caption" aria-hidden="true"><text className="nfa-name" style={{fontSize:`${12*unit}px`}} x={label.xM} y={-label.yM}>{caption}</text>{caption && (extent.maxY-extent.minY)>unit*65 && !layouts[a.id]?.objects.some(o=>o.visible && o.type!=='sensor-node' && o.type!=='door' && o.type!=='window') && <text className="nfa-room-area" style={{fontSize:`${10*unit}px`}} x={label.xM} y={-label.yM+18*unit}>{format(zoneArea(a))} m²</text>}</g></g>})}
      {visibleAreas.map(a=>{const m=farmEditorMap(plan,a.id,layouts),b=zoneBounds(a),visible=new Set(m.layers.filter(l=>l.visible).map(l=>l.id));return <g key={`gear-${a.id}`} className="nfa-gear" data-editable={mode==='equipment'}>{m.objects.filter(o=>o.visible && visible.has(o.layerId)).map(o=>{
        const footprint=objectFootprint(o).map(p=>({xM:p.xM+b.minX,yM:p.yM+b.minY})),invalid=!objectInsideOutline(o,m),collision=a.id===area?.id && collisionIds.has(o.id),active=selectedObject?.areaId===a.id && (selectedObject.ids || [selectedObject.id]).includes(o.id)
        const interaction={onPointerDown:(e:ReactPointerEvent<SVGElement>)=>beginObject(e,a.id,o),onKeyDown:(e:ReactKeyboardEvent<SVGElement>)=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();if(!isolated){chooseArea(a.id);return}setSelected(a.id);setSelectedObject({areaId:a.id,id:o.id});setEquipmentTab(o.type==='sensor-node' ? 'nodes' : 'equipment');setPanel('object')}},onDoubleClick:(e:ReactMouseEvent<SVGElement>)=>{if(mode==='equipment'){e.stopPropagation();setPanel('object')}},tabIndex:mode==='equipment' ? 0 : -1,role:'button','aria-label':collision ? `${o.name} · ${lt ? 'Galimas įrangos susikirtimas' : 'Possible equipment overlap'}` : o.name}
        return <g key={o.id} data-type={o.type} data-invalid={invalid} data-active={active} data-collision={collision}><title>{collision ? `${o.name} · ${lt ? 'Galimas įrangos susikirtimas' : 'Possible equipment overlap'}` : o.name}</title>{o.type==='sensor-node' ? <circle {...interaction} cx={(footprint[0].xM+footprint[2].xM)/2} cy={-(footprint[0].yM+footprint[2].yM)/2} r={5*unit} /> : <><polygon {...interaction} points={points(footprint)} /><FarmEquipmentFootprint object={o} origin={{xM:b.minX,yM:b.minY}} /></>}{active && selectedIds.length===1 && <text style={{fontSize:`${12*unit}px`}} x={footprint[0].xM} y={-footprint[0].yM-8*unit}>{o.name}</text>}</g>
      })}</g>})}
      {bounds && alignmentGuides.length>0 && <g className="nfa-alignment-guides" aria-hidden="true">{alignmentGuides.map((guide,index)=><line key={index} x1={guide.from.xM+bounds.minX} y1={-guide.from.yM-bounds.minY} x2={guide.to.xM+bounds.minX} y2={-guide.to.yM-bounds.minY} />)}</g>}
      {area && bounds && map && mode==='equipment' && selectedGear.length===1 && <FarmObjectHandles object={selectedGear[0]} map={map} origin={{xM:bounds.minX,yM:bounds.minY}} unit={unit} lt={lt} onBegin={beginResize} onRotate={(object,angle)=>updateObject(object.id,{rotationDeg:angle})} onNudge={nudgeResize} />}
      {area && mode==='contour' && <g className="nfa-handles">{area.polygon.map((p,i)=>{const q=area.polygon[(i+1)%area.polygon.length],length=wallLength(p,q),sign=Math.sign(area.polygon.reduce((sum,a,j)=>{const b=area.polygon[(j+1)%area.polygon.length];return sum+a.xM*b.yM-b.xM*a.yM},0)) || 1,label={xM:(p.xM+q.xM)/2+sign*(q.yM-p.yM)/length*unit*24,yM:(p.yM+q.yM)/2-sign*(q.xM-p.xM)/length*unit*24};return <g key={i}><line className="nfa-wall-hit" x1={p.xM} y1={-p.yM} x2={q.xM} y2={-q.yM} strokeWidth={unit*14} data-active={wall===i} onPointerDown={e=>begin(e,area.id,undefined,i)} onDoubleClick={e=>{e.stopPropagation();addVertex(i)}} />{wall===i && <text className="nfa-wall-label" style={{fontSize:`${12*unit}px`}} x={label.xM} y={-label.yM}>{format(wallLength(p,q))} m</text>}</g>})}{area.polygon.map((p,i)=><circle key={i} cx={p.xM} cy={-p.yM} r={6*unit} data-active={selectedVertex===i} role="button" tabIndex={0} aria-label={`${lt ? 'Kontūro taškas' : 'Vertex'} ${i+1}`} onFocus={()=>setVertex(i)} onPointerDown={e=>begin(e,area.id,i)} onKeyDown={e=>{
        if(e.key==='Delete' || e.key==='Backspace'){e.preventDefault();e.stopPropagation();removeVertex(i)}
        const delta=e.shiftKey ? 1 : .25,shifts:Record<string,SitePoint>={ArrowLeft:{xM:-delta,yM:0},ArrowRight:{xM:delta,yM:0},ArrowUp:{xM:0,yM:delta},ArrowDown:{xM:0,yM:-delta}}
        if(shifts[e.key]){e.preventDefault();e.stopPropagation();alterVertex(i,{xM:p.xM+shifts[e.key].xM,yM:p.yM+shifts[e.key].yM})}
      }} />)}</g>}
    </svg>
    <div className="nfa-3d-view" hidden={display!=='3d'}>{display==='3d' && renderScene(isolated ? area!.id : null)}</div>
    <div className="nfa-view-controls" hidden={display!=='2d'} role="group" aria-label={lt ? 'Brėžinio mastelis' : 'Drawing zoom'}><button type="button" onClick={()=>fit(true)} title={isolated ? (lt ? 'Sutalpinti Area' : 'Fit Area') : (lt ? 'Sutalpinti visą planą' : 'Fit whole plan')} aria-label={isolated ? (lt ? 'Sutalpinti Area' : 'Fit Area') : (lt ? 'Sutalpinti visą planą' : 'Fit whole plan')}><i className="fa-solid fa-expand" /></button>{area && !isolated && <button type="button" onClick={()=>fit()} title={lt ? 'Priartinti pasirinktą Area' : 'Fit selected Area'} aria-label={lt ? 'Priartinti pasirinktą Area' : 'Fit selected Area'}><i className="fa-solid fa-vector-square" /></button>}<span /><button type="button" aria-label={lt ? 'Priartinti' : 'Zoom in'} onClick={()=>zoom(.75)}>+</button><button type="button" aria-label={lt ? 'Atitolinti' : 'Zoom out'} onClick={()=>zoom(1.333)}>−</button></div>
    {!!plan.areas.length && <small className="nfa-canvas-hint" hidden={display!=='2d'}>{mode==='contour' ? (lt ? 'Pasirinkite sieną jos ilgiui keisti' : 'Select a wall to edit its length') : (lt ? 'Tempkite foną · Option / Alt + ratukas priartina' : 'Drag background to pan · Option / Alt + scroll to zoom')}</small>}
    {!plan.areas.length && <div className="nfa-empty-canvas"><i className="fa-solid fa-draw-polygon" /><strong>{lt ? 'Pradėkite nuo pirmos Area' : 'Start with your first Area'}</strong><span>{lt ? 'Pridėkite patalpą, pritaikykite jos kontūrą, tada sudėkite įrangą.' : 'Add a growing space, shape its outline, then place equipment.'}</span><button type="button" onClick={add}><i className="fa-solid fa-plus" />{lt ? 'Pridėti Area' : 'Add Area'}</button></div>}
    {(message || saveError) && <div className="nfa-canvas-message" role={saveError ? 'alert' : 'status'}><i className="fa-solid fa-circle-info" /><span>{saveError || message}</span>{(!saveError || expanded) && <button type="button" aria-label={lt ? 'Uždaryti pranešimą' : 'Dismiss message'} onClick={()=>saveError ? closeExpanded() : setMessage('')}><i className="fa-solid fa-xmark" /></button>}</div>}
    </div></div>
    {panel && <section className="nfa-drawer" aria-label={panel==='area' ? (lt ? 'Area savybės' : 'Area properties') : panel==='object' ? (lt ? 'Objekto savybės' : 'Object properties') : panel==='equipment' ? (lt ? 'Įrangos biblioteka' : 'Equipment library') : panel==='settings' ? (lt ? 'Plano nustatymai' : 'Plan settings') : panel==='nodes' ? 'Nodes' : (lt ? 'Auginimas' : 'Cultivation')}><header className="nfa-drawer-heading"><div><i className={`fa-solid ${panel==='area' ? 'fa-draw-polygon' : panel==='object' ? 'fa-sliders' : panel==='nodes' ? 'fa-microchip' : panel==='equipment' ? 'fa-cubes' : panel==='sections' ? 'fa-table-cells-large' : 'fa-gear'}`} /><strong>{panel==='area' ? area?.name : panel==='object' ? (selectedGear.length>1 ? `${selectedGear.length} ${lt ? 'objektai' : 'objects'}` : selectedGear[0]?.name) : panel==='equipment' ? (lt ? 'Pridėti įrangą' : 'Add equipment') : panel==='nodes' ? 'Nodes' : panel==='sections' ? (lt ? 'Auginimas' : 'Cultivation') : (lt ? 'Plano nustatymai' : 'Plan settings')}</strong>{area && panel!=='settings' && panel!=='area' && <span>{area.name}</span>}</div><button type="button" onClick={closePanel} aria-label={lt ? 'Uždaryti nustatymus' : 'Close panel'}><i className="fa-solid fa-xmark" /></button></header><div className="nfa-drawer-body">
    {area && map && (panel==='object' || panel==='nodes' || panel==='equipment') ? <FarmEquipmentPanel key={area.id} tab={panel==='object' ? equipmentTab : panel as 'nodes'|'equipment'|'sections'} map={map} selectedIds={panel==='object' ? selectedIds : []} selectedId={panel==='object' && selectedObject?.areaId===area.id ? selectedObject.id : null} onSelect={id=>{setSelectedObject(id ? {areaId:area.id,id} : null);if(id)setPanel('object');else closePanel();const object=map.objects.find(o=>o.id===id);if(object && (!object.visible || map.layers.some(l=>l.id===object.layerId && !l.visible)))setMap({...map,layers:map.layers.map(l=>l.id===object.layerId ? {...l,visible:true} : l),objects:map.objects.map(o=>o.id===id ? {...o,visible:true} : o)})}} context={nodeContext?.area.id===area.id ? nodeContext : undefined} loading={contextLoading} contextError={contextError} language={lt ? 'lt' : 'en'} onAdd={addObject} onUpdate={updateObject} onLayers={setMap} onAssignSection={onAssignSection} onNodeHeight={onNodeHeight} unassignedNodes={unassignedNodes} inventoryError={inventoryError} onConnectNode={onConnectNode} /> : area && panel==='sections' ? <FarmCultivationPanel key={`${area.id}-${nodeContext?.cultivation?.cropProfile || ''}`} context={nodeContext?.area.id===area.id ? nodeContext : undefined} lt={lt} onProfile={onCultivation} onCreate={onCreateSection} onEdit={onEditGroup} /> : area && bounds && panel==='area' ? <section className="nfa-properties">
      <div className="nfa-area-basics"><div className="nfa-fields"><label>{lt ? 'Pavadinimas' : 'Name'}<input key={`${area.id}-${area.name}`} defaultValue={area.name} maxLength={120} onBlur={e=>{if(e.target.value.trim()!==area.name && !commit(editFarmArea(plan,area.id,{name:e.target.value.trim()})))e.currentTarget.value=area.name}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} /></label><label>{lt ? 'Erdvės tipas' : 'Area type'}<select value={area.kind} onChange={e=>commit(editFarmArea(plan,area.id,{kind:e.target.value as typeof area.kind}))}><option value="room">{lt ? 'Patalpa' : 'Room'}</option><option value="greenhouse">{lt ? 'Šiltnamis' : 'Greenhouse'}</option><option value="zone">{lt ? 'Zona be sienų' : 'Zone without walls'}</option></select></label></div>
      <div className="nfa-fields nfa-measurements"><NumberField key={`${area.id}-w-${bounds.maxX-bounds.minX}`} label={lt ? 'Plotis, m' : 'Width, m'} value={bounds.maxX-bounds.minX} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,n,bounds.maxY-bounds.minY))} /><NumberField key={`${area.id}-l-${bounds.maxY-bounds.minY}`} label={lt ? 'Ilgis, m' : 'Length, m'} value={bounds.maxY-bounds.minY} min={.1} onCommit={n=>commit(resizeFarmArea(plan,area.id,bounds.maxX-bounds.minX,n))} /><NumberField key={`${area.id}-h-${area.height}`} label={lt ? 'Aukštis, m' : 'Height, m'} value={area.height} min={.5} max={12} step={.1} onCommit={n=>commit(editFarmArea(plan,area.id,{height:n}))} /></div></div>
      <FarmCultivationPanel key={`${area.id}-${nodeContext?.cultivation?.cropProfile || ''}`} context={nodeContext?.area.id===area.id ? nodeContext : undefined} lt={lt} onProfile={onCultivation} onCreate={onCreateSection} onEdit={onEditGroup} />
      <details className="nfa-advanced"><summary>{lt ? 'Kontūro taškai ir vieta' : 'Vertices and position'}</summary>
      <div className="nfa-vertex"><label>{lt ? 'Taškas' : 'Vertex'}<select value={selectedVertex} onChange={e=>setVertex(Number(e.target.value))}>{area.polygon.map((_,i)=><option value={i} key={i}>{i+1}</option>)}</select></label>{(['xM','yM'] as const).map(axis=><NumberField key={`${area.id}-${selectedVertex}-${axis}-${area.polygon[selectedVertex][axis]}`} label={axis==='xM' ? 'X, m' : 'Y, m'} value={area.polygon[selectedVertex][axis]} onCommit={n=>alterVertex(selectedVertex,{...area.polygon[selectedVertex],[axis]:n})} />)}<button type="button" disabled={area.polygon.length>=64} onClick={()=>addVertex(selectedVertex)}>{lt ? '+ taškas' : '+ vertex'}</button><button type="button" aria-label={lt ? 'Pašalinti tašką' : 'Remove vertex'} disabled={area.polygon.length<=3} onClick={()=>removeVertex(selectedVertex)}>−</button></div>
      <details className="nfa-position"><summary>{lt ? 'Vieta plane' : 'Position in the plan'}</summary><div className="nfa-fields"><NumberField key={`${area.id}-x-${bounds.minX}`} label="X, m" value={bounds.minX} onCommit={n=>commit(moveFarmArea(plan,area.id,n,bounds.minY))} /><NumberField key={`${area.id}-y-${bounds.minY}`} label="Y, m" value={bounds.minY} onCommit={n=>commit(moveFarmArea(plan,area.id,bounds.minX,n))} /></div></details>
      </details><button className="nfa-delete-area" type="button" onClick={requestDelete}><i className="fa-solid fa-trash-can" /> {lt ? 'Ištrinti Area' : 'Delete Area'}</button>
    </section> : panel==='settings' ? <section className="nfa-plan-settings"><label>{lt ? 'Ūkio pavadinimas' : 'Farm name'}<input value={plan.name} maxLength={120} onChange={e=>{remember(plan);onChange({...plan,name:e.target.value},layouts)}} /></label><label className="nfa-grid-toggle"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)} />{lt ? 'Pritraukti prie 0,25 m tinklelio' : 'Snap to 0.25 m grid'}</label><p>{lt ? 'Tempkite foną, kad pastumtumėte planą. Option / Alt + ratukas keičia mastelį. Shift + paspaudimas pasirenka kelis objektus. Įranga pritraukiama prie sienų, kraštų ir centrų; laikykite Option / Alt, kad perkeltumėte laisvai.' : 'Drag the background to pan. Option / Alt + scroll to zoom. Shift-click to select multiple objects. Equipment aligns to walls, edges and centres; hold Option / Alt to move freely.'}</p></section> : <p className="nfa-unselected">{lt ? 'Pasirinkite Area brėžinyje arba pridėkite naują.' : 'Select an Area in the drawing, or add a new one.'}</p>}
    </div></section>}
    <footer className="nfa-command-bar">
      <div className="nfa-primary-tools" role="group" aria-label={lt ? 'Plano įrankiai' : 'Plan tools'}><button type="button" onClick={add} disabled={plan.areas.length>=80} title={lt ? 'Pridėti Area' : 'Add Area'}><i className="fa-solid fa-plus" /><span>Area</span></button><span className="nfa-tool-divider" /><button type="button" aria-pressed={mode==='equipment' && display==='2d'} onClick={()=>{setMode('equipment');if(arranging)chooseArea(null);setWall(null);setDisplay('2d')}} title={lt ? 'Pasirinkti ir perkelti' : 'Select and move'} aria-label={lt ? 'Pasirinkti ir perkelti' : 'Select and move'}><i className="fa-solid fa-arrow-pointer" /></button><button type="button" disabled={!plan.areas.length} aria-pressed={mode==='contour' && display==='2d'} onClick={()=>{if(!isolated)setArranging(true);setMode('contour');setSelectedObject(null);if(panel==='object')setPanel('area');setDisplay('2d')}} title={isolated ? (lt ? 'Redaguoti kontūrą' : 'Edit outline') : (lt ? 'Perstumti Areas ir redaguoti kontūrus' : 'Arrange Areas and edit outlines')}><i className="fa-solid fa-draw-polygon" /><span>{isolated ? (lt ? 'Kontūras' : 'Outline') : (lt ? 'Išdėstymas' : 'Arrange')}</span></button><span className="nfa-tool-divider" />{(['equipment','nodes'] as const).map(tab=><button key={tab} type="button" disabled={!area} aria-expanded={panel===tab} onClick={()=>{if(!isolated && area)chooseArea(area.id);setMode('equipment');setEquipmentTab(tab);setDisplay('2d');togglePanel(tab)}}><i className={`fa-solid ${tab==='nodes' ? 'fa-microchip' : 'fa-cubes'}`} /><span>{tab==='nodes' ? 'Nodes' : (lt ? 'Įranga' : 'Equipment')}</span></button>)}</div>
      <div className="nfa-context-tools">{mode==='contour' && activeWall!==null && area ? <NumberField key={`${area.id}-${activeWall}-${wallLength(area.polygon[activeWall],area.polygon[(activeWall+1)%area.polygon.length])}`} label={`${lt ? 'Siena' : 'Wall'} ${activeWall+1} · m`} value={wallLength(area.polygon[activeWall],area.polygon[(activeWall+1)%area.polygon.length])} min={.1} step={.01} onCommit={n=>{setView(view);commit(setFarmWallLength(plan,area.id,activeWall,n))}} /> : <span className="nfa-selection-caption">{selectedGear.length>1 ? `${selectedGear.length} ${lt ? 'objektai' : 'objects'}` : selectedGear[0]?.name || (area ? `${area.name} · ${format(zoneArea(area))} m²` : (lt ? 'Visas ūkis' : 'Whole farm'))}</span>}
        {mode==='equipment' && selectedGear.length===1 && equipmentRotatable(selectedGear[0]) && <>
          <button type="button" disabled={!map || !equipmentUnlocked(selectedGear[0],map)} onClick={()=>updateObject(selectedGear[0].id,{rotationDeg:selectedGear[0].rotationDeg-90})} title={lt ? 'Pasukti 90° į kairę' : 'Rotate 90° left'} aria-label={lt ? 'Pasukti 90° į kairę' : 'Rotate 90° left'}><i className="fa-solid fa-rotate-left" /></button>
          <button type="button" disabled={!map || !equipmentUnlocked(selectedGear[0],map)} onClick={()=>updateObject(selectedGear[0].id,{rotationDeg:selectedGear[0].rotationDeg+90})} title={lt ? 'Pasukti 90° į dešinę' : 'Rotate 90° right'} aria-label={lt ? 'Pasukti 90° į dešinę' : 'Rotate 90° right'}><i className="fa-solid fa-rotate-right" /></button>
        </>}
        {mode==='equipment' && selectedGear.length>0 && <><button type="button" disabled={!duplicableCount} onClick={copyObjects} title={lt ? 'Kopijuoti (⌘ / Ctrl + C)' : 'Copy (⌘ / Ctrl + C)'} aria-label={lt ? 'Kopijuoti' : 'Copy'}><i className="fa-regular fa-copy" /></button><button className="nfa-equipment-delete" type="button" disabled={!removableCount} onClick={()=>removeObjects()} title="Delete / Backspace" aria-label={lt ? 'Pašalinti iš brėžinio' : 'Delete from drawing'}><i className="fa-regular fa-trash-can" /></button></>}
        {copiedObjects.length>0 && <button type="button" disabled={!area || contextLoading} onClick={()=>{setMode('equipment');pasteObjects()}} title={lt ? 'Įklijuoti (⌘ / Ctrl + V)' : 'Paste (⌘ / Ctrl + V)'} aria-label={lt ? 'Įklijuoti' : 'Paste'}><i className="fa-regular fa-clipboard" /></button>}
        <button type="button" disabled={!area} aria-expanded={panel===(selectedGear.length ? 'object' : 'area')} onClick={()=>togglePanel(selectedGear.length ? 'object' : 'area')} title={lt ? 'Pasirinkimo savybės' : 'Selection properties'}><i className="fa-solid fa-sliders" /><span>{lt ? 'Savybės' : 'Properties'}</span></button>
      </div><div className="nfa-secondary-tools"><button type="button" disabled={!area} aria-expanded={panel==='sections'} onClick={()=>togglePanel('sections')} title={lt ? 'Auginimo profilis ir grupės' : 'Crop profile and groups'} aria-label={lt ? 'Auginimo profilis ir grupės' : 'Crop profile and groups'}><i className="fa-solid fa-seedling" /></button><button type="button" aria-expanded={panel==='settings'} onClick={()=>togglePanel('settings')} title={lt ? 'Plano nustatymai ir pagalba' : 'Plan settings and help'} aria-label={lt ? 'Plano nustatymai ir pagalba' : 'Plan settings and help'}><i className="fa-solid fa-gear" /></button></div>
    </footer>
    {deleteTarget && <FarmAreaDeleteDialog key={deleteTarget.id} {...deleteTarget} lt={lt} onCancel={()=>setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </aside>
}
