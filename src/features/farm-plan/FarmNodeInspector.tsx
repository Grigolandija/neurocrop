import { useState } from 'react'
import NumericInput from '../greenhouse-map/components/NumericInput'
import type { GreenhouseMap, GreenhouseObject } from '../greenhouse-map/model'
import type { AreaMapContext } from '../greenhouse-map/services/areaMapRepository'

type Props={object:GreenhouseObject;map:GreenhouseMap;context?:AreaMapContext;lt:boolean;onUpdate:(id:string,patch:Partial<GreenhouseObject>)=>void;onHeight:(devEui:string,heightM:number|null)=>Promise<void>;onSection:(devEui:string,sectionId:string)=>Promise<void>}
export default function FarmNodeInspector({object,map,context,lt,onUpdate,onHeight,onSection}:Props){
  const sensor=object.metadata.sensor!,node=context?.nodes.find(n=>n.devEui?.toLowerCase()===sensor.devEui?.toLowerCase()) || sensor
  const height=node.installationHeightM
  const [text,setText]=useState(height==null ? '' : String(height)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  const groups=context?.sections.filter(s=>!s.isAreaDefault) || []
  const locked=object.locked || map.layers.some(l=>l.id===object.layerId && l.locked)
  return <div className="nfa-node-inspector">
    <div className="nfa-node-fields">
      <form className="nfa-node-height" onSubmit={async e=>{
        e.preventDefault();setBusy(true);setError('');setSaved(false)
        try{await onHeight(sensor.devEui!,text.trim()==='' ? null : Number(text));setSaved(true)}
        catch(reason){setError(reason instanceof Error ? reason.message : 'Height could not be saved.')}
        finally{setBusy(false)}
      }}>
        <label>{lt ? 'Aukštis nuo grindų, m' : 'Height above floor, m'}<input type="number" min="0" max={map.dimensions.heightM || 100} step="any" placeholder={lt ? 'Nenurodytas' : 'Unknown'} value={text} disabled={busy} onChange={e=>{setText(e.target.value);setSaved(false)}} /></label>
        <button type="submit" disabled={busy || text===(height==null ? '' : String(height))}>{busy ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Išsaugoti aukštį' : 'Save height')}</button>
      </form>
      <label>X, m<NumericInput disabled={locked} value={object.xM} min={0} max={map.dimensions.widthM} step=".01" onCommit={n=>onUpdate(object.id,{xM:n ?? object.xM})} /></label>
      <label>Y, m<NumericInput disabled={locked} value={object.yM} min={0} max={map.dimensions.lengthM} step=".01" onCommit={n=>onUpdate(object.id,{yM:n ?? object.yM})} /></label>
      {groups.length>0 && <label className="nfa-node-group">{lt ? 'Grupė (pasirinktinai)' : 'Group (optional)'}<select value={node.sectionId===context?.cultivation?.defaultSectionId ? '' : node.sectionId || ''} disabled={busy} onChange={async e=>{
        const id=e.target.value;setBusy(true);setError('')
        try{await onSection(sensor.devEui!,id)}
        catch(reason){setError(reason instanceof Error ? reason.message : 'Node assignment failed.')}
        finally{setBusy(false)}
      }}><option value="">{lt ? 'Visa Area' : 'Whole Area'}</option>{groups.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
    </div>
    <div className="nfa-node-summary">
      <span>{lt ? 'Aukštis saugomas Node; X/Y – išsaugant planą.' : 'Height saves to the Node; X/Y save with the plan.'}</span>
      <small title="DevEUI">{sensor.devEui}</small>
      {saved && <span role="status">{lt ? 'Aukštis išsaugotas.' : 'Height saved.'}</span>}
    </div>
    {error && <p className="nfa-message" role="alert">{error}</p>}
  </div>
}
