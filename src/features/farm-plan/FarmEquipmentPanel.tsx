import { useState } from 'react'
import { Link } from 'react-router'
import type { GreenhouseMap,GreenhouseObject,ObjectType } from '../greenhouse-map/model'
import ObjectLibraryPanel from '../greenhouse-map/components/ObjectLibraryPanel'
import ObjectPropertiesPanel from '../greenhouse-map/components/ObjectPropertiesPanel'
import EquipmentCollisionNotice from '../greenhouse-map/components/EquipmentCollisionNotice'
import type { AreaMapContext,AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import FarmNodeInspector from './FarmNodeInspector'
import type { EquipmentInspector } from '../greenhouse-map/equipmentInspector'

type Tab='nodes'|'equipment'|'sections'
type Props={inspector?:EquipmentInspector;tab:Tab;map:GreenhouseMap;selectedId:string|null;selectedIds:string[];context?:AreaMapContext;loading:boolean;contextError?:string;language:'en'|'lt';onSelect:(id:string|null)=>void;onAdd:(type:ObjectType,node?:AreaMapNode)=>void;onUpdate:(id:string,patch:Partial<GreenhouseObject>)=>void;onLayers:(map:GreenhouseMap)=>void;onAssignSection:(devEui:string,sectionId:string)=>Promise<void>;onNodeHeight:(devEui:string,heightM:number|null)=>Promise<void>;unassignedNodes:AreaMapNode[];inventoryError?:string;onConnectNode:(devEui:string,sectionId:string)=>Promise<AreaMapNode>}
export default function FarmEquipmentPanel({inspector,tab,map,selectedId,selectedIds,context,contextError,loading,language,onSelect,onAdd,onUpdate,onLayers,onAssignSection,onNodeHeight,unassignedNodes,inventoryError,onConnectNode}:Props){
  const lt=language==='lt',object=map.objects.find(o=>o.id===selectedId)
  const [busy,setBusy]=useState(false),[connect,setConnect]=useState(''),[section,setSection]=useState(''),[error,setError]=useState('')
  const placedNodes=map.objects.filter(o=>o.type==='sensor-node')
  const placed=new Set(placedNodes.flatMap(o=>o.metadata.sensor?.devEui?.toLowerCase() || []))
  const groups=context?.sections.filter(s=>!s.isAreaDefault) || []
  const available=(context?.nodes || []).filter(n=>n.devEui && !placed.has(n.devEui.toLowerCase()))
  return <section className="nfa-equipment-panel" aria-label={tab==='nodes' ? 'Nodes' : tab==='sections' ? 'Sections' : (lt ? 'Įranga' : 'Equipment')}>
    {contextError && <p className="nfa-message" role="alert">{contextError}</p>}
    {tab==='equipment' && (!object || selectedIds.length>1) && <EquipmentCollisionNotice map={map} selectedIds={selectedIds} language={language} onSelect={onSelect} />}
    {selectedIds.length>1 ? <p className="nfa-hint">{lt ? 'Tempkite pasirinktą įrangą kartu. Vieną objektą pasirinkite matmenims keisti.' : 'Drag the selected equipment together. Select one object to resize it.'}</p> : object ? <>
      {object.metadata.sensor?.devEui ? <FarmNodeInspector key={`${object.id}-${context?.nodes.find(n=>n.devEui===object.metadata.sensor?.devEui)?.installationConfirmedAt || ''}`} object={object} map={map} context={context} lt={lt} onUpdate={onUpdate} onHeight={onNodeHeight} onSection={onAssignSection} /> : <ObjectPropertiesPanel inspector={inspector} map={map} selected={[object]} onUpdate={onUpdate} onAlign={()=>{}} language={language} onSelect={onSelect} />}
    </> : tab==='nodes' ? <>
      {loading ? <p role="status">{lt ? 'Kraunami jutikliai…' : 'Loading Nodes…'}</p> : <div className="nfa-node-tray">{placedNodes.map(o=><button key={o.id} type="button" onClick={()=>onSelect(o.id)}><i className="fa-solid fa-microchip" /><span>{o.name}<small>{o.metadata.sensor?.installationHeightM==null ? (lt ? 'Nurodyti aukštį' : 'Set height') : `${o.metadata.sensor.installationHeightM} m`}</small></span><i className="fa-solid fa-pen" /></button>)}{available.map(node=><button key={node.devEui} type="button" onClick={()=>onAdd('sensor-node',node)}><i className="fa-solid fa-microchip" /><span>{node.displayName || node.nodeId}<small>{lt ? 'Pridėti į brėžinį' : 'Place in drawing'}</small></span><i className="fa-solid fa-plus" /></button>)}</div>}
      {!loading && !available.length && !placedNodes.length && <p className="nfa-hint">{!context ? (lt ? 'Išsaugokite Area, kad galėtumėte priskirti jutiklius.' : 'Save this Area to assign Nodes.') : (lt ? 'Šiai Area dar nepriskirta jutiklių.' : 'No Nodes assigned to this Area yet.')}</p>}
      {inventoryError && <p className="nfa-message" role="alert">{inventoryError}</p>}
      {!!unassignedNodes.length && <details className="nfa-connect-nodes"><summary>{lt ? 'Priskirti laisvą Node' : 'Assign an unassigned Node'} · {unassignedNodes.length}</summary><form className="nfa-inline-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const node=await onConnectNode(connect,section);onAdd('sensor-node',node);setConnect('')}catch(reason){setError(reason instanceof Error ? reason.message : 'Node could not be assigned.')}finally{setBusy(false)}}}><label>Node<select required value={connect} onChange={e=>setConnect(e.target.value)}><option value="">{lt ? 'Pasirinkite' : 'Choose'}</option>{unassignedNodes.map(n=><option key={n.devEui} value={n.devEui}>{n.displayName || n.nodeId}</option>)}</select></label>{groups.length>0 && <label>{lt ? 'Grupė (pasirinktinai)' : 'Group (optional)'}<select value={section} onChange={e=>setSection(e.target.value)}><option value="">{lt ? 'Visa Area' : 'Whole Area'}</option>{groups.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<button disabled={busy || !context?.cultivation} type="submit">{lt ? 'Priskirti ir pridėti' : 'Assign and place'}</button></form></details>}
      <p className="nfa-hint">{lt ? 'Pasirinkite Node aukščiui keisti. Tašką nutempkite į jo vietą.' : 'Select a Node to edit its height. Drag its point to position it.'} <Link to="/nodes">{lt ? 'Registruoti naują Node' : 'Register a new Node'} →</Link></p>
    </> : tab==='equipment' ? <>
      <ObjectLibraryPanel language={language} onAdd={type=>onAdd(type)} />
      {!!map.objects.filter(o=>o.type!=='sensor-node').length && <details className="nfa-object-list"><summary>{lt ? 'Įranga plane' : 'Placed equipment'}</summary><div>{map.objects.filter(o=>o.type!=='sensor-node').map(o=><button key={o.id} type="button" onClick={()=>onSelect(o.id)}>{o.name}<i className={`fa-solid ${o.locked ? 'fa-lock' : 'fa-angle-right'}`} /></button>)}</div></details>}
      <details className="nfa-layer-list"><summary>{lt ? 'Sluoksnių matomumas' : 'Layer visibility'}</summary>{map.layers.map(layer=><label key={layer.id}><input type="checkbox" checked={layer.visible} onChange={e=>onLayers({...map,layers:map.layers.map(l=>l.id===layer.id ? {...l,visible:e.target.checked} : l)})} />{layer.name}</label>)}</details>
    </> : null}
    {error && <p role="alert" className="nfa-message">{error}</p>}
  </section>
}
