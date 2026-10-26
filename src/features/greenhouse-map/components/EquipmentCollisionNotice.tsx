import { useMemo } from 'react'
import { equipmentCollisions } from '../equipmentCollisions'
import type { GreenhouseMap } from '../model'
import './equipment-collision-notice.css'

type Props={map:GreenhouseMap;selectedIds?:string[];language:'en'|'lt';onSelect?:(id:string)=>void}
export default function EquipmentCollisionNotice({map,selectedIds,language,onSelect}:Props){
  const all=useMemo(()=>equipmentCollisions(map),[map])
  const collisions=selectedIds?.length ? all.filter(c=>selectedIds.includes(c.left.id) || selectedIds.includes(c.right.id)) : all
  if(!collisions.length)return null
  const lt=language==='lt',format=(n:number)=>n.toLocaleString(lt ? 'lt-LT' : 'en-GB',{maximumFractionDigits:3})
  return <details className="gh-equipment-collisions" open={selectedIds?.length ? true : undefined}>
    <summary><i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />{lt ? 'Galimi įrangos susikirtimai' : 'Possible equipment overlaps'} <span>{collisions.length}</span></summary>
    <ul>{collisions.map(c=>{
      const other=selectedIds?.includes(c.left.id) ? c.right : c.left
      const description=<><strong>{c.left.name} · {c.right.name}</strong><small>{lt ? 'Persidengia' : 'Overlapping at'} {format(c.bottomM)}–{format(c.topM)} m {lt ? 'nuo grindų' : 'above floor'}</small></>
      return <li key={`${c.left.id}-${c.right.id}`}>{onSelect ? <button type="button" onClick={()=>onSelect(other.id)}>{description}<i className="fa-solid fa-angle-right" aria-hidden="true" /></button> : <div>{description}</div>}</li>
    })}</ul>
    <p>{lt ? 'Vertinama pagal įrangos kontūrą ir korpuso aukštį. Laidai ir tarpai tarp lentynų atskirai nevertinami.' : 'Based on equipment footprints and body heights. Cables and gaps between shelves are not assessed individually.'}</p>
  </details>
}
