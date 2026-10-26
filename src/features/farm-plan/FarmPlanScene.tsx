import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { createLivingScene, type LivingScene } from '../living-greenhouse/gpuScene'
import { planToScene, project, type Vec3 } from '../living-greenhouse/sceneMath'
import type { FarmAreaComparison } from './farmMonitoringData'
import { siteVolume } from '../living-greenhouse/siteDemoGeometry'
import { pickSitePoint, siteDimensions } from '../living-greenhouse/siteDemoModel'
import { farmPlanScene, type FarmPlanDocument, type FarmArea } from './farmPlanData'
import { farmSceneEmphasis,highlightFarmArea,wholeFarmSceneMesh } from './farmSceneGeometry'
import type { FarmMaps } from './farmLayoutData'
import { focusFarmSceneArea as focusArea,farmViewKey,rememberFarmScene,restoreFarmScene,type FarmSceneMemory } from './farmViewMemory'
import './farm-plan.css'
const EMPTY_MAPS:FarmMaps={}

export default function FarmPlanScene({plan:source,areas,onAreaSelect,selectedAreaId,isolatedAreaId,maps=EMPTY_MAPS,cameraMemory,comparison,monitoringActive=true}:{cameraMemory?:FarmSceneMemory;maps?:FarmMaps;plan:FarmPlanDocument;areas:FarmArea[];onAreaSelect?:(areaId:string)=>void;selectedAreaId?:string|null;isolatedAreaId?:string|null;comparison?:Record<string,FarmAreaComparison>;monitoringActive?:boolean}){
  // Scope only the rendered document; retain original coordinates and all persisted layouts.
  const document=useMemo(()=>isolatedAreaId ? {...source,areas:source.areas.filter(a=>a.id===isolatedAreaId)} : source,[source,isolatedAreaId])
  const plan=useMemo(()=>farmPlanScene(document),[document])
  const {language}=useInterfaceLanguage(),lt=language==='lt'
  const [hovered,setHovered]=useState<string|null>(null)
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(false)
  const hoverAreaId=!isolatedAreaId && onAreaSelect && document.areas.some(a=>a.id===hovered) ? hovered : null
  const colors=useMemo(()=>Object.fromEntries(Object.entries(comparison || {}).map(([id,summary])=>[id,summary.colorRgb.map(channel=>.86*(channel/255)+.14*.96) as Vec3])),[comparison])
  const mesh=useMemo(()=>wholeFarmSceneMesh(document,maps,colors),[document,maps,colors])
  const emphasis=farmSceneEmphasis(hoverAreaId,!!comparison)
  const geometry=useMemo(()=>highlightFarmArea(mesh,emphasis.areaId),[mesh,emphasis.areaId])
  const climateField=useMemo(()=>siteVolume(null,'temperature',plan),[plan])
  const field=useMemo(()=>({...climateField,surfaces:geometry.surfaces,surfaceOpacity:emphasis.opacity}),[climateField,geometry,emphasis.opacity])
  const dimensions=useMemo(()=>siteDimensions(plan),[plan])
  const host=useRef<HTMLDivElement>(null),scene=useRef<LivingScene|null>(null)
  const [ownMemory]=useState<FarmSceneMemory>(()=>new Map()),memory=cameraMemory || ownMemory
  const cameraAreaId=isolatedAreaId || (comparison ? null : selectedAreaId)
  const viewKey=farmViewKey(cameraAreaId)
  const latest=useRef({plan,geometry,field,cameraAreaId,viewKey,comparing:!!comparison})
  const projection=useRef<{matrix:Float32Array;width:number;height:number}|null>(null)
  const polygons=useRef(new Map<string,SVGPolygonElement>()),labels=useRef(new Map<string,HTMLButtonElement>())
  const down=useRef<{x:number;y:number;id:number;moved:boolean}|null>(null)
  useEffect(()=>{
    const previous=siteDimensions(latest.current.plan),changedView=latest.current.viewKey!==viewKey
    if(changedView && scene.current)rememberFarmScene(memory,latest.current.viewKey,scene.current,previous)
    // Growing storage bounds changes the scene origin; keep the camera attached to the same space.
    if(previous.widthM!==dimensions.widthM || previous.lengthM!==dimensions.lengthM)scene.current?.shiftOrigin([(previous.widthM-dimensions.widthM)/2,0,(dimensions.lengthM-previous.lengthM)/2])
    latest.current={plan,geometry,field,cameraAreaId,viewKey,comparing:!!comparison}
    scene.current?.update(geometry.vertices,Math.max(dimensions.widthM,dimensions.lengthM),field)
    if(scene.current && changedView && !restoreFarmScene(memory,viewKey,scene.current,dimensions))focusArea(scene.current,plan,cameraAreaId)
  },[plan,geometry,field,dimensions,cameraAreaId,viewKey,memory,comparison])
  useEffect(()=>{
    if(!host.current)return
    let cancelled=false
    createLivingScene(host.current,(matrix,width,height)=>{
      projection.current={matrix,width,height}
      const current=latest.current.plan,d=siteDimensions(current)
      const placed:Array<{x:number;y:number;w:number;h:number}>=[]
      for(const zone of current.zones){
        polygons.current.get(zone.id)?.setAttribute('points',zone.polygon.map(p=>{const v=project(planToScene(p.xM,p.yM,.07,d),matrix,width,height);return `${v.x},${v.y}`}).join(' '))
        const button=labels.current.get(zone.id)
        if(button){
          const edge=zone.polygon.map((a,i)=>({xM:(a.xM+zone.polygon[(i+1)%zone.polygon.length].xM)/2,yM:(a.yM+zone.polygon[(i+1)%zone.polygon.length].yM)/2})).sort((a,b)=>a.yM-b.yM)[0]
          const comparing=latest.current.comparing,p=project(planToScene(comparing ? edge.xM : zone.label.xM,comparing ? edge.yM : zone.label.yM,comparing ? .3 : zone.kind==='greenhouse' ? zone.height+.3 : .9,d),matrix,width,height)
          let x=p.x,y=p.y
          if(comparing){
            const w=button.offsetWidth,h=button.offsetHeight
            x=Math.max(w/2+6,Math.min(width-w/2-6,x))
            for(const shift of [0,-28,28,-56,56]){
              const candidate=Math.max(h/2+6,Math.min(height-h/2-6,p.y+shift))
              if(placed.every(other=>Math.abs(other.x-x)>(other.w+w)/2+8 || Math.abs(other.y-candidate)>(other.h+h)/2+6)){y=candidate;break}
            }
            if(p.visible)placed.push({x,y,w,h})
          }
          button.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;button.style.visibility=p.visible ? 'visible' : 'hidden'
        }
      }
    },()=>{if(!cancelled)setFailed(true)},{animateIntro:false,elevation:.85,zoom:1.05}).then(renderer=>{
      if(cancelled){renderer.dispose();return}
      scene.current=renderer
      const current=latest.current,d=siteDimensions(current.plan)
      renderer.update(current.geometry.vertices,Math.max(d.widthM,d.lengthM),current.field)
      renderer.setPresentation('points')
      if(!restoreFarmScene(memory,current.viewKey,renderer,d))focusArea(renderer,current.plan,current.cameraAreaId)
      setReady(true)
    }).catch(()=>{if(!cancelled)setFailed(true)})
    return ()=>{cancelled=true;if(scene.current){rememberFarmScene(memory,latest.current.viewKey,scene.current,siteDimensions(latest.current.plan));scene.current.dispose();scene.current=null}}
  },[memory])
  const hit=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!projection.current || !host.current)return null
    const rect=host.current.getBoundingClientRect(),view=projection.current
    const point=pickSitePoint(event.clientX-rect.left,event.clientY-rect.top,view.width,view.height,view.matrix,dimensions)
    return point ? plan.zones.toReversed().find(z=>z.areaId && areas.some(a=>a.id===z.areaId) && pointInPolygon(point,z.polygon)) || null : null
  }
  const select=(id?:string)=>{if(id && onAreaSelect){setHovered(null);onAreaSelect(id)}}
  const interactive=(event:ReactPointerEvent<HTMLDivElement>)=>(event.target as Element).closest('button')
  return <div className="nc-farm-scene-shell" data-overview-heatmap-settled={monitoringActive && comparison && (ready || failed) && Object.values(comparison).every(summary=>summary.state!=='loading') ? 'true' : undefined}>
    <div className="nc-farm-scene" ref={host} role="group" aria-label={lt ? 'Bendras 3D ūkio planas. Pasirinkite Area.' : 'Farm 3D plan. Select an Area.'} data-hovered={!!hoverAreaId} data-comparing={!!comparison}
      onPointerDown={event=>{if(event.button!==0 || interactive(event))return;down.current={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};setHovered(null)}}
      onPointerMove={event=>{const start=down.current;if(start && (start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6))start.moved=true;if(event.buttons || interactive(event))return;setHovered(hit(event)?.id || null)}}
      onPointerLeave={()=>setHovered(null)} onPointerCancel={()=>{down.current=null;setHovered(null)}}
      onPointerUp={event=>{const start=down.current;down.current=null;if(!start || start.id!==event.pointerId || start.moved || interactive(event) || Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;select(hit(event)?.areaId)}}>
      <svg className="nc-farm-zone-outlines" aria-hidden="true">{plan.zones.map(zone=><polygon key={zone.id} data-active={zone.id===(comparison ? selectedAreaId || hoverAreaId : hoverAreaId)} ref={el=>{if(el)polygons.current.set(zone.id,el);else polygons.current.delete(zone.id)}} />)}</svg>
      {!isolatedAreaId && plan.zones.map(zone=>{
        const area=areas.find(a=>a.id===zone.areaId),name=area?.name || zone.name
        return <button type="button" key={zone.id} className="nc-farm-zone-label" title={area ? name : `${name} · ${lt ? 'Neišsaugota' : 'Unsaved'}`} ref={el=>{if(el)labels.current.set(zone.id,el);else labels.current.delete(zone.id)}} disabled={!area || !onAreaSelect} data-hovered={zone.id===hoverAreaId} data-muted={!comparison && !!hoverAreaId && zone.id!==hoverAreaId} data-selected={zone.id===selectedAreaId} aria-pressed={selectedAreaId===undefined ? undefined : zone.id===selectedAreaId} onPointerEnter={()=>setHovered(zone.id)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(zone.id)} onBlur={()=>setHovered(null)} onClick={()=>select(area?.id)}><span>{name}</span></button>
      })}
      <div className="nc-farm-camera" onPointerEnter={()=>setHovered(null)}><button type="button" aria-label={lt ? 'Visas ūkis' : 'Fit farm'} onClick={()=>{if(scene.current){scene.current.reset();focusArea(scene.current,latest.current.plan)}}}><i className="fa-solid fa-cube" /></button><button type="button" aria-label={lt ? 'Priartinti' : 'Zoom in'} onClick={()=>scene.current?.zoom(.85)}>+</button><button type="button" aria-label={lt ? 'Atitolinti' : 'Zoom out'} onClick={()=>scene.current?.zoom(1.18)}>−</button><small>{lt ? 'Option / Alt + ratukas' : 'Option / Alt + scroll'}</small></div>
      {!plan.buildings.length && ready && <p className="nc-farm-scene-empty">{lt ? 'Pridėkite pirmą Area plano redaktoriuje.' : 'Add the first Area in the plan editor.'}</p>}
      {!ready && !failed && <div className="nc-farm-scene-status" role="status">{lt ? 'Kraunamas ūkio planas…' : 'Loading farm plan…'}</div>}
      {failed && <div className="nc-farm-scene-status" role="status"><p>{lt ? 'Šioje naršyklėje 3D vaizdas nepasiekiamas. Zonas galite pasirinkti sąraše.' : '3D is unavailable in this browser. Select an Area below.'}</p><div>{plan.zones.filter(z=>z.areaId).map(z=><button type="button" key={z.id} onPointerEnter={()=>setHovered(z.id)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(z.id)} onBlur={()=>setHovered(null)} onClick={()=>select(z.areaId)}>{areas.find(a=>a.id===z.areaId)?.name || z.name}</button>)}</div></div>}
    </div>
    {onAreaSelect && !isolatedAreaId && !comparison && <nav className="nc-farm-zone-list" aria-label={lt ? 'Plano erdvės' : 'Plan Areas'}>{plan.zones.filter(z=>z.areaId && areas.some(a=>a.id===z.areaId)).map(z=><button type="button" key={z.id} onPointerEnter={()=>setHovered(z.id)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(z.id)} onBlur={()=>setHovered(null)} onClick={()=>select(z.areaId)}>{areas.find(a=>a.id===z.areaId)!.name}<i className="fa-solid fa-arrow-right" /></button>)}</nav>}
  </div>
}
