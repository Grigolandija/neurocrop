import type { KeyboardEvent,PointerEvent } from 'react'
import { objectFootprint } from '../../../backend/area-map-outline.js'
import { isWallMountedType } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject } from '../greenhouse-map/model'
import { equipmentRotatable,equipmentUnlocked,type EquipmentHandle } from './farmEquipmentEditing'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'

type Props={object:GreenhouseObject;map:GreenhouseMap;origin:SitePoint;unit:number;lt:boolean;onBegin:(event:PointerEvent<SVGElement>,object:GreenhouseObject,handle:EquipmentHandle|'rotate')=>void;onRotate:(object:GreenhouseObject,angle:number)=>void;onNudge:(object:GreenhouseObject,handle:EquipmentHandle,delta:SitePoint)=>void}
export default function FarmObjectHandles({object,map,origin,unit,lt,onBegin,onRotate,onNudge}:Props){
  if(object.type==='sensor-node')return null
  const angle=object.rotationDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
  const positions:Record<EquipmentHandle,[number,number]>={sw:[0,0],s:[.5,0],se:[1,0],e:[1,.5],ne:[1,1],n:[.5,1],nw:[0,1],w:[0,.5]}
  const handles:EquipmentHandle[]=isWallMountedType(object.type) ? ['w','e'] : ['sw','s','se','e','ne','n','nw','w']
  const footprint=objectFootprint(object),unlocked=equipmentUnlocked(object,map)
  const top={x:object.xM+object.widthM/2*c-object.lengthM*s+origin.xM,y:object.yM+object.widthM/2*s+object.lengthM*c+origin.yM}
  const knob={x:top.x-28*unit*s,y:top.y+28*unit*c}
  const resizeKey=(e:KeyboardEvent<SVGElement>,handle:EquipmentHandle)=>{
    const step=e.shiftKey ? 1 : .25,delta:Record<string,SitePoint>={ArrowLeft:{xM:-step,yM:0},ArrowRight:{xM:step,yM:0},ArrowUp:{xM:0,yM:step},ArrowDown:{xM:0,yM:-step}}
    if(delta[e.key]){e.preventDefault();e.stopPropagation();onNudge(object,handle,delta[e.key])}
  }
  return <g className="nfa-object-handles"><polygon points={footprint.map(p=>`${p.xM+origin.xM},${-p.yM-origin.yM}`).join(' ')} />{unlocked && handles.map(handle=>{
    const [x,y]=positions[handle],xM=object.xM+x*object.widthM*c-y*object.lengthM*s+origin.xM,yM=object.yM+x*object.widthM*s+y*object.lengthM*c+origin.yM
    const dx=handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,dy=handle.includes('s') ? -1 : handle.includes('n') ? 1 : 0
    const directions=['ew-resize','nesw-resize','ns-resize','nwse-resize'],cursor=directions[(Math.round(Math.atan2(dx*s+dy*c,dx*c-dy*s)/(Math.PI/4))+8)%4]
    return <rect key={handle} x={xM-4.5*unit} y={-yM-4.5*unit} width={9*unit} height={9*unit} rx={1.5*unit} style={{cursor}} role="button" tabIndex={0} aria-label={`${lt ? 'Keisti matmenis' : 'Resize'}: ${object.name} (${handle})`} onPointerDown={event=>onBegin(event,object,handle)} onKeyDown={event=>resizeKey(event,handle)}><title>{lt ? 'Tempkite, kad pakeistumėte matmenis' : 'Drag to resize'}</title></rect>
  })}{unlocked && equipmentRotatable(object) && <g className="nfa-rotation-handle">
    <line x1={top.x} y1={-top.y} x2={knob.x} y2={-knob.y} />
    <circle cx={knob.x} cy={-knob.y} r={8*unit} role="button" tabIndex={0} aria-label={lt ? 'Pasukti įrangą' : 'Rotate equipment'} onPointerDown={event=>onBegin(event,object,'rotate')} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();onRotate(object,object.rotationDeg+(event.key==='ArrowLeft' ? -15 : 15))}}}><title>{lt ? 'Tempkite pasukti · Shift: kas 15°' : 'Drag to rotate · Shift: 15° steps'}</title></circle>
    <path d={`M${knob.x-3*unit},${-knob.y+2*unit}a${4*unit},${4*unit} 0 1 1 ${6*unit},0m0,${-3*unit}v${3*unit}h${-3*unit}`} />
  </g>}</g>
}
