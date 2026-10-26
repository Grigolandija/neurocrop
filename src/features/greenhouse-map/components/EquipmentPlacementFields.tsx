import { useMemo } from 'react'
import type { EquipmentPlacement,GreenhouseMap,GreenhouseObject } from '../model'
import { equipmentPlacementModel } from '../equipmentPlacementModel'
import NumericInput from './NumericInput'

type Props={object:GreenhouseObject;map:GreenhouseMap;disabled:boolean;language:'en'|'lt';onChange:(placement:EquipmentPlacement)=>void}
export default function EquipmentPlacementFields({object,map,disabled,language,onChange}:Props){
  const model=useMemo(()=>equipmentPlacementModel(object,map),[object,map])
  if(!model)return null
  const lt=language==='lt',{placement,ceiling,bottom,top}=model
  const offset=placement.mount==='floor' ? 0 : placement.offsetM
  const changeMount=(mount:EquipmentPlacement['mount'])=>onChange({...placement,mount,offsetM:mount==='floor' ? 0 : mount==='ceiling' ? Math.min(.15,Math.max(0,ceiling-placement.heightM)) : Math.min(1.5,Math.max(0,ceiling-placement.heightM))})
  const number=(n:number)=>n.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:2})
  const behavior=placement.mount==='ceiling' ? (lt ? 'Keičiant lubų aukštį, įranga judės kartu.' : 'Follows the ceiling when room height changes.') : placement.mount==='wall' ? (lt ? 'Aukštis nuo grindų nekinta. Vietą prie sienos ir kryptį nustatykite brėžinyje.' : 'Keeps its floor height. Set its wall position and direction in the drawing.') : (lt ? 'Įrangos apačia remiasi į grindis.' : 'Equipment rests on the floor.')
  return <fieldset className="gh-property-group gh-equipment-placement"><legend>{lt ? 'Tvirtinimas ir aukštis' : 'Mounting & height'}</legend><div className="gh-property-fields">
    <label className="gh-field"><span>{lt ? 'Tvirtinimas' : 'Mounting'}</span><select disabled={disabled} value={placement.mount} onChange={e=>changeMount(e.target.value as EquipmentPlacement['mount'])}><option value="floor">{lt ? 'Ant grindų' : 'On the floor'}</option><option value="wall">{lt ? 'Prie sienos' : 'Wall-mounted'}</option><option value="ceiling">{lt ? 'Pakabinta nuo lubų' : 'Suspended from ceiling'}</option></select></label>
    <div className="gh-field-row"><label className="gh-field"><span>{lt ? 'Korpuso aukštis' : 'Body height'} <em>m</em></span><NumericInput disabled={disabled} min=".01" max={Math.max(.01,ceiling-offset)} step=".01" value={Number(placement.heightM.toFixed(3))} onCommit={value=>onChange({...placement,heightM:value ?? placement.heightM})} /></label>
    {placement.mount!=='floor' && <label className="gh-field"><span>{placement.mount==='wall' ? (lt ? 'Apačia nuo grindų' : 'Bottom above floor') : (lt ? 'Tarpas iki lubų' : 'Ceiling clearance')} <em>m</em></span><NumericInput disabled={disabled} min="0" max={Math.max(0,ceiling-placement.heightM)} step=".01" value={Number(placement.offsetM.toFixed(3))} onCommit={value=>onChange({...placement,offsetM:value ?? placement.offsetM})} /></label>}</div>
    </div><p className="gh-placement-summary" title={behavior} role={!model.fits ? 'alert' : undefined}>{!model.fits ? (lt ? 'Įranga netelpa iki lubų. Pakoreguokite jos aukštį arba tvirtinimo atstumą.' : 'Equipment does not fit below the ceiling. Adjust its height or mounting offset.') : `${lt ? 'Nuo grindų' : 'Above floor'}: ${number(bottom)}–${number(top)} m.`} {model.fits && placement.mount==='ceiling' && <span>{lt ? 'Seka lubų aukštį.' : 'Follows ceiling height.'}</span>}</p>
  </fieldset>
}
