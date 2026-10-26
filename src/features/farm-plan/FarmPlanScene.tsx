import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { createLivingScene, type LivingScene } from '../living-greenhouse/gpuScene'
import { planToScene, project } from '../living-greenhouse/sceneMath'
import { siteVolume } from '../living-greenhouse/siteDemoGeometry'
import { pickSitePoint, siteDimensions, zoneBounds } from '../living-greenhouse/siteDemoModel'
import { farmPlanScene, type FarmPlanDocument, type FarmArea } from './farmPlanData'
import { wholeFarmGeometry } from './farmSceneGeometry'
import type { FarmMaps } from './farmLayoutData'
import './farm-plan.css'
const EMPTY_MAPS:FarmMaps={}

export default function FarmPlanScene({plan:document,areas,onAreaSelect,selectedAreaId,maps=EMPTY_MAPS}:{maps?:FarmMaps;plan:FarmPlanDocument;areas:FarmArea[];onAreaSelect?:(areaId:string)=>void;selectedAreaId?:string|null}){
  const plan=useMemo(()=>farmPlanScene(document),[document])
  const {language}=useInterfaceLanguage(),lt=language==='lt'
  const [hovered,setHovered]=useState<string|null>(null)
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false)
  const geometry=useMemo(()=>wholeFarmGeometry(document,maps),[document,maps])
  const field=useMemo(()=>siteVolume(null,'temperature',plan),[plan])
  const dimensions=siteDimensions(plan)
  const host=useRef<HTMLDivElement>(null),scene=useRef<LivingScene|null>(null)
  const latest=useRef({plan,geometry,field,selectedAreaId})
  const projection=useRef<{matrix:Float32Array;width:number;height:number}|null>(null)
  const polygons=useRef(new Map<string,SVGPolygonElement>()),labels=useRef(new Map<string,HTMLButtonElement>())
  const down=useRef<{x:number;y:number;id:number;moved:boolean}|null>(null)
  useEffect(()=>{
    const previous=siteDimensions(latest.current.plan)
    // Growing storage bounds changes the scene origin; keep the camera attached to the same space.
    if(previous.widthM!==dimensions.widthM || previous.lengthM!==dimensions.lengthM)scene.current?.shiftOrigin([(previous.widthM-dimensions.widthM)/2,0,(dimensions.lengthM-previous.lengthM)/2])
    latest.current={plan,geometry,field,selectedAreaId}
    scene.current?.update(geometry,Math.max(dimensions.widthM,dimensions.lengthM),field)
  },[plan,geometry,field,dimensions.widthM,dimensions.lengthM,selectedAreaId])
  useEffect(()=>{if(scene.current)focusArea(scene.current,latest.current.plan,selectedAreaId)},[selectedAreaId])
  useEffect(()=>{
    if(!host.current)return
    let cancelled=false
    createLivingScene(host.current,(matrix,width,height)=>{
      projection.current={matrix,width,height}
      const current=latest.current.plan,d=siteDimensions(current)
      for(const zone of current.zones){
        polygons.current.get(zone.id)?.setAttribute('points',zone.polygon.map(p=>{const v=project(planToScene(p.xM,p.yM,.07,d),matrix,width,height);return `${v.x},${v.y}`}).join(' '))
        const button=labels.current.get(zone.id)
        if(button){const p=project(planToScene(zone.label.xM,zone.label.yM,zone.kind==='greenhouse' ? zone.height+.3 : .9,d),matrix,width,height);button.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;button.style.visibility=p.visible ? 'visible' : 'hidden'}
      }
    },()=>{if(!cancelled)setFailed(true)},{animateIntro:false,elevation:.85,zoom:1.05}).then(renderer=>{
      if(cancelled){renderer.dispose();return}
      scene.current=renderer
      const current=latest.current,d=siteDimensions(current.plan)
      renderer.update(current.geometry,Math.max(d.widthM,d.lengthM),current.field)
      renderer.setPresentation('points')
      focusArea(renderer,current.plan,current.selectedAreaId)
      setReady(true)
    }).catch(()=>{if(!cancelled)setFailed(true)})
    return ()=>{cancelled=true;scene.current?.dispose();scene.current=null}
  },[])
  const hit=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!projection.current || !host.current)return null
    const rect=host.current.getBoundingClientRect(),view=projection.current
    const point=pickSitePoint(event.clientX-rect.left,event.clientY-rect.top,view.width,view.height,view.matrix,dimensions)
    return point ? plan.zones.toReversed().find(z=>z.areaId && areas.some(a=>a.id===z.areaId) && pointInPolygon(point,z.polygon)) || null : null
  }
  const select=(id?:string)=>{if(id && onAreaSelect)onAreaSelect(id)}
  const interactive=(event:ReactPointerEvent<HTMLDivElement>)=>(event.target as Element).closest('button')
  return <div className="nc-farm-scene-shell">
    <div className="nc-farm-scene" ref={host} role="group" aria-label={lt ? 'Bendras 3D ūkio planas. Pasirinkite Area.' : 'Farm 3D plan. Select an Area.'} data-hovered={!!hovered && !!onAreaSelect}
      onPointerDown={event=>{if(event.button!==0 || interactive(event))return;down.current={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};setHovered(null)}}
      onPointerMove={event=>{const start=down.current;if(start && (start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6))start.moved=true;if(event.buttons || interactive(event))return;setHovered(hit(event)?.id || null)}}
      onPointerLeave={()=>setHovered(null)} onPointerCancel={()=>{down.current=null}}
      onPointerUp={event=>{const start=down.current;down.current=null;if(!start || start.id!==event.pointerId || start.moved || interactive(event) || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;select(hit(event)?.areaId)}}>
      <svg className="nc-farm-zone-outlines" aria-hidden="true">{plan.zones.map(zone=><polygon key={zone.id} data-active={zone.id===hovered || zone.id===selectedAreaId} ref={el=>{if(el)polygons.current.set(zone.id,el);else polygons.current.delete(zone.id)}} />)}</svg>
      {plan.zones.map(zone=>{
        const area=areas.find(a=>a.id===zone.areaId),name=area?.name || zone.name
        return <button type="button" key={zone.id} className="nc-farm-zone-label" title={area ? name : `${name} · ${lt ? 'Neišsaugota' : 'Unsaved'}`} ref={el=>{if(el)labels.current.set(zone.id,el);else labels.current.delete(zone.id)}} disabled={!area || !onAreaSelect} data-hovered={zone.id===hovered} data-selected={zone.id===selectedAreaId} aria-pressed={selectedAreaId===undefined ? undefined : zone.id===selectedAreaId} onPointerEnter={()=>setHovered(zone.id)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(zone.id)} onBlur={()=>setHovered(null)} onClick={()=>select(area?.id)}><span>{name}</span></button>
      })}
      <div className="nc-farm-camera"><button type="button" aria-label={lt ? 'Visas ūkis' : 'Fit farm'} onClick={()=>{if(scene.current){scene.current.reset();focusArea(scene.current,latest.current.plan)}}}><i className="fa-solid fa-cube" /></button><button type="button" aria-label={lt ? 'Priartinti' : 'Zoom in'} onClick={()=>scene.current?.zoom(.85)}>+</button><button type="button" aria-label={lt ? 'Atitolinti' : 'Zoom out'} onClick={()=>scene.current?.zoom(1.18)}>−</button><small>{lt ? 'Option / Alt + ratukas' : 'Option / Alt + scroll'}</small></div>
      {!plan.buildings.length && ready && <p className="nc-farm-scene-empty">{lt ? 'Pridėkite pirmą Area plano redaktoriuje.' : 'Add the first Area in the plan editor.'}</p>}
      {!ready && !failed && <div className="nc-farm-scene-status" role="status">{lt ? 'Kraunamas ūkio planas…' : 'Loading farm plan…'}</div>}
      {failed && <div className="nc-farm-scene-status" role="status"><p>{lt ? 'Šioje naršyklėje 3D vaizdas nepasiekiamas. Zonas galite pasirinkti sąraše.' : '3D is unavailable in this browser. Select an Area below.'}</p><div>{plan.zones.filter(z=>z.areaId).map(z=><button type="button" key={z.id} onClick={()=>select(z.areaId)}>{areas.find(a=>a.id===z.areaId)?.name || z.name}</button>)}</div></div>}
    </div>
    {onAreaSelect && <nav className="nc-farm-zone-list" aria-label={lt ? 'Plano erdvės' : 'Plan Areas'}>{plan.zones.filter(z=>z.areaId && areas.some(a=>a.id===z.areaId)).map(z=><button type="button" key={z.id} onClick={()=>select(z.areaId)}>{areas.find(a=>a.id===z.areaId)!.name}<i className="fa-solid fa-arrow-right" /></button>)}</nav>}
  </div>
}


function focusArea(scene:LivingScene,plan:ReturnType<typeof farmPlanScene>,id?:string|null){
  const area=plan.zones.find(a=>a.id===id)
  const shapes=area ? [area] : plan.zones
  if(!shapes.length){scene.focus(null);return}
  const b=zoneBounds({polygon:shapes.flatMap(a=>a.polygon)}),height=Math.max(...shapes.map(a=>a.height)),d=siteDimensions(plan)
  scene.focus(planToScene((b.minX+b.maxX)/2,(b.minY+b.maxY)/2,height*.3,d),Math.max(b.maxX-b.minX,b.maxY-b.minY,height)*1.3)
}
