import type { GreenhouseMap,GreenhouseObject,ObjectType } from '../greenhouse-map/model'
import ObjectLibraryPanel from '../greenhouse-map/components/ObjectLibraryPanel'
import ObjectPropertiesPanel from '../greenhouse-map/components/ObjectPropertiesPanel'
import EquipmentCollisionNotice from '../greenhouse-map/components/EquipmentCollisionNotice'
import type { AreaMapContext,AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import FarmNodeInspector from './FarmNodeInspector'
import FarmNodePicker from './FarmNodePicker'
import type { EquipmentInspector } from '../greenhouse-map/equipmentInspector'

type Tab='nodes'|'equipment'|'sections'
type Props={inspector?:EquipmentInspector;tab:Tab;map:GreenhouseMap;selectedId:string|null;selectedIds:string[];context?:AreaMapContext;loading:boolean;contextError?:string;language:'en'|'lt';onSelect:(id:string|null)=>void;onAdd:(type:ObjectType,node?:AreaMapNode)=>void;onUpdate:(id:string,patch:Partial<GreenhouseObject>)=>void;onLayers:(map:GreenhouseMap)=>void;onAssignSection:(devEui:string,sectionId:string)=>Promise<void>;onNodeHeight:(devEui:string,heightM:number|null)=>Promise<void>;unassignedNodes:AreaMapNode[];inventoryError?:string;onConnectNode:(devEui:string,sectionId:string)=>Promise<AreaMapNode>}
export default function FarmEquipmentPanel({inspector,tab,map,selectedId,selectedIds,context,contextError,loading,language,onSelect,onAdd,onUpdate,onLayers,onAssignSection,onNodeHeight,unassignedNodes,inventoryError,onConnectNode}:Props){
  const lt=language==='lt',object=map.objects.find(o=>o.id===selectedId)
  return <section className="nfa-equipment-panel" aria-label={tab==='nodes' ? 'Nodes' : tab==='sections' ? 'Sections' : (lt ? 'Įranga' : 'Equipment')}>
    {contextError && <p className="nfa-message" role="alert">{contextError}</p>}
    {tab==='equipment' && (!object || selectedIds.length>1) && <EquipmentCollisionNotice map={map} selectedIds={selectedIds} language={language} onSelect={onSelect} />}
    {selectedIds.length>1 ? <p className="nfa-hint">{lt ? 'Tempkite pasirinktą įrangą kartu. Vieną objektą pasirinkite matmenims keisti.' : 'Drag the selected equipment together. Select one object to resize it.'}</p> : object ? <>
      {object.metadata.sensor?.devEui ? <FarmNodeInspector key={`${object.id}-${context?.nodes.find(n=>n.devEui===object.metadata.sensor?.devEui)?.installationConfirmedAt || ''}`} object={object} map={map} context={context} lt={lt} onUpdate={onUpdate} onHeight={onNodeHeight} onSection={onAssignSection} /> : <ObjectPropertiesPanel inspector={inspector} map={map} selected={[object]} onUpdate={onUpdate} onAlign={()=>{}} language={language} onSelect={onSelect} />}
    </> : tab==='nodes' ? <FarmNodePicker map={map} context={context} loading={loading} lt={lt} unassignedNodes={unassignedNodes} inventoryError={inventoryError} onSelect={onSelect} onAdd={node=>onAdd('sensor-node',node)} onConnect={onConnectNode} /> : tab==='equipment' ? <>
      <ObjectLibraryPanel compact language={language} onAdd={type=>onAdd(type)} />
      <div className="nfa-library-options">
      {!!map.objects.filter(o=>o.type!=='sensor-node').length && <details className="nfa-object-list"><summary>{lt ? 'Įranga plane' : 'Placed equipment'}</summary><div>{map.objects.filter(o=>o.type!=='sensor-node').map(o=><button key={o.id} type="button" onClick={()=>onSelect(o.id)}>{o.name}<i className={`fa-solid ${o.locked ? 'fa-lock' : 'fa-angle-right'}`} /></button>)}</div></details>}
      <details className="nfa-layer-list"><summary>{lt ? 'Sluoksnių matomumas' : 'Layer visibility'}</summary>{map.layers.map(layer=><label key={layer.id}><input type="checkbox" checked={layer.visible} onChange={e=>onLayers({...map,layers:map.layers.map(l=>l.id===layer.id ? {...l,visible:e.target.checked} : l)})} />{layer.name}</label>)}</details>
      </div>
    </> : null}
  </section>
}
