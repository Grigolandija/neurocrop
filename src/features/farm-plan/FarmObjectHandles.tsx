import type { KeyboardEvent,PointerEvent } from 'react'
import { objectFootprint } from '../../../backend/area-map-outline.js'
import { isWallMountedType } from '../greenhouse-map/geometry'
import type { GreenhouseMap,GreenhouseObject } from '../greenhouse-map/model'
import { equipmentUnlocked,type EquipmentHandle } from './farmEquipmentEditing'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'

type Props={object:GreenhouseObject;map:GreenhouseMap;origin:SitePoint;unit:number;lt:boolean;onBegin:(event:PointerEvent<SVGElement>,object:GreenhouseObject,handle:EquipmentHandle)=>void;onNudge:(object:GreenhouseObject,handle:EquipmentHandle,delta:SitePoint)=>void}
export default function FarmObjectHandles({object,map,origin,unit,lt,onBegin,onNudge}:Props){
  if(object.type==='sensor-node')return null
  const angle=object.rotationDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
  const positions:Record<EquipmentHandle,[number,number]>={sw:[0,0],s:[.5,0],se:[1,0],e:[1,.5],ne:[1,1],n:[.5,1],nw:[0,1],w:[0,.5]}
  const handles:EquipmentHandle[]=isWallMountedType(object.type) ? ['w','e'] : ['sw','s','se','e','ne','n','nw','w']
  const footprint=objectFootprint(object),unlocked=equipmentUnlocked(object,map)
  const resizeKey=(e:KeyboardEvent<SVGElement>,handle:EquipmentHandle)=>{
    const step=e.shiftKey ? 1 : .25,delta:Record<string,SitePoint>={ArrowLeft:{xM:-step,yM:0},ArrowRight:{xM:step,yM:0},ArrowUp:{xM:0,yM:step},ArrowDown:{xM:0,yM:-step}}
    if(delta[e.key]){e.preventDefault();e.stopPropagation();onNudge(object,handle,delta[e.key])}
  }
  return <g className="nfa-object-handles"><polygon points={footprint.map(p=>`${p.xM+origin.xM},${-p.yM-origin.yM}`).join(' ')} />{unlocked && handles.map(handle=>{
    const [x,y]=positions[handle],xM=object.xM+x*object.widthM*c-y*object.lengthM*s+origin.xM,yM=object.yM+x*object.widthM*s+y*object.lengthM*c+origin.yM
    const dx=handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,dy=handle.includes('s') ? -1 : handle.includes('n') ? 1 : 0
    const directions=['ew-resize','nesw-resize','ns-resize','nwse-resize'],cursor=directions[(Math.round(Math.atan2(dx*s+dy*c,dx*c-dy*s)/(Math.PI/4))+8)%4]
    return <rect key={handle} x={xM-4.5*unit} y={-yM-4.5*unit} width={9*unit} height={9*unit} rx={1.5*unit} style={{cursor}} role="button" tabIndex={0} aria-label={`${lt ? 'Keisti matmenis' : 'Resize'}: ${object.name} (${handle})`} onPointerDown={event=>onBegin(event,object,handle)} onKeyDown={event=>resizeKey(event,handle)}><title>{lt ? 'Tempkite, kad pakeistumėte matmenis' : 'Drag to resize'}</title></rect>
  })}</g>
}
