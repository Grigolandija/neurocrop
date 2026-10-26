import type { ReactNode } from 'react'
import type { GreenhouseObject } from '../greenhouse-map/model'

/** Top-down drafting details in local metres; the interactive footprint stays underneath. */
export default function FarmEquipmentFootprint({object,origin}:{object:GreenhouseObject;origin:{xM:number;yM:number}}){
  const w=object.widthM,h=object.lengthM,inset=Math.min(.10,w*.12,h*.12)
  let detail:ReactNode=null
  if(['growing-table','rack','hydroponic-channel','growing-bed'].includes(object.type)){
    const count=Math.min(24,Math.max(2,Math.round((w>=h ? h : w)/(object.type==='rack' ? .45 : .18))))
    detail=<>
      <rect x={inset} y={inset} width={w-2*inset} height={h-2*inset} rx={inset*.3} />
      {Array.from({length:count-1},(_,i)=>w>=h ? <line key={i} x1={inset} y1={inset+(h-2*inset)*(i+1)/count} x2={w-inset} y2={inset+(h-2*inset)*(i+1)/count} /> : <line key={i} x1={inset+(w-2*inset)*(i+1)/count} y1={inset} x2={inset+(w-2*inset)*(i+1)/count} y2={h-inset} />)}
    </>
  }else if(object.type==='lamp'){
    const count=Math.min(12,Math.max(1,Math.round(h/.35)))
    detail=<>{Array.from({length:count},(_,i)=><line key={i} x1={inset} y1={h*(i+.5)/count} x2={w-inset} y2={h*(i+.5)/count} />)}</>
  }else if(object.type==='fan'){
    const r=Math.min(w,h)*.38
    detail=<g transform={`translate(${w/2} ${h/2})`}><circle r={r} /><circle r={r*.14} />{[0,90,180,270].map(a=><path key={a} transform={`rotate(${a})`} d={`M0 ${-r*.14} Q${-r*.85} ${-r*.95} ${-r*.72} ${-r*.15} Q${-r*.4} ${r*.18} 0 ${r*.14}Z`} />)}</g>
  }else if(object.type==='ibc-tank'){
    detail=<><rect x={inset} y={inset} width={w-2*inset} height={h-2*inset} rx={inset*.5} />{[.25,.5,.75].map(t=><g key={t}><line x1={w*t} y1={inset} x2={w*t} y2={h-inset} /><line x1={inset} y1={h*t} x2={w-inset} y2={h*t} /></g>)}<circle cx={w/2} cy={h/2} r={Math.min(w,h)*.1} /></>
  }else if(object.type==='reservoir' || object.type==='water-tank'){
    detail=<><ellipse cx={w/2} cy={h/2} rx={w*.38} ry={h*.38} /><ellipse cx={w/2} cy={h/2} rx={w*.1} ry={h*.1} /></>
  }else if(object.type==='water-pump'){
    detail=<><rect x={w*.36} y={h*.2} width={w*.5} height={h*.6} /><circle cx={w*.22} cy={h/2} r={Math.min(w*.15,h*.34)} />{[.45,.55,.65,.75].map(x=><line key={x} x1={w*x} y1={h*.22} x2={w*x} y2={h*.78} />)}</>
  }else if(object.type==='filter-unit'){
    detail=<>{[.25,.75].map(x=><g key={x}><ellipse cx={w*x} cy={h/2} rx={w*.16} ry={h*.30} /><ellipse cx={w*x} cy={h/2} rx={w*.06} ry={h*.12} /></g>)}<line x1={w*.1} y1={h*.12} x2={w*.9} y2={h*.12} /></>
  }else if(['heater','cooling-unit','electrical-cabinet','irrigation-unit','dehumidifier'].includes(object.type)){
    detail=<>{[.25,.4,.55,.7].map(y=><line key={y} x1={w*.2} y1={h*y} x2={w*.8} y2={h*y} />)}</>
  }else if(['door','window','ventilation-opening'].includes(object.type)){
    detail=<line x1={inset} y1={h/2} x2={w-inset} y2={h/2} />
  }
  if(!detail)return null
  return <g className="nfa-equipment-detail" aria-hidden="true" transform={`translate(${object.xM+origin.xM} ${-object.yM-origin.yM}) rotate(${-object.rotationDeg}) scale(1 -1)`}>{detail}</g>
}
