import { useState } from 'react'
import type { GreenhouseMap,GreenhouseObject,ObjectType } from '../greenhouse-map/model'
import ObjectLibraryPanel from '../greenhouse-map/components/ObjectLibraryPanel'
import ObjectPropertiesPanel from '../greenhouse-map/components/ObjectPropertiesPanel'
import type { AreaMapContext,AreaMapNode } from '../greenhouse-map/services/areaMapRepository'

type Props={map:GreenhouseMap;selectedId:string|null;context?:AreaMapContext;loading:boolean;contextError?:string;language:'en'|'lt';onSelect:(id:string|null)=>void;onAdd:(type:ObjectType,node?:AreaMapNode)=>void;onUpdate:(id:string,patch:Partial<GreenhouseObject>)=>void;onRemove:(id:string)=>void;onLayers:(map:GreenhouseMap)=>void;onCreateSection:(name:string,profile:string)=>Promise<boolean>;onAssignSection:(devEui:string,sectionId:string)=>Promise<void>}
export default function FarmEquipmentPanel({map,selectedId,context,contextError,loading,language,onSelect,onAdd,onUpdate,onRemove,onLayers,onCreateSection,onAssignSection}:Props){
  const lt=language==='lt',object=map.objects.find(o=>o.id===selectedId)
  const [sectionName,setSectionName]=useState(''),[profile,setProfile]=useState(''),[busy,setBusy]=useState(false)
  const placed=new Set(map.objects.flatMap(o=>o.metadata.sensor?.devEui?.toLowerCase() || []))
  const available=(context?.nodes || []).filter(n=>n.devEui && !placed.has(n.devEui.toLowerCase()))
  return <section className="nfa-equipment-panel">
    <header className="nfa-property-heading"><strong>{map.name}</strong>{object && <button type="button" onClick={()=>onSelect(null)}>{lt ? 'Visi objektai' : 'All objects'}</button>}</header>
    {contextError && <p className="nfa-message" role="alert">{contextError}</p>}
    {object ? <>
      <ObjectPropertiesPanel map={map} selected={[object]} onUpdate={onUpdate} onAlign={()=>{}} language={language} />
      {object.metadata.sensor?.devEui && context && <label className="nfa-node-section">Section<select value={object.metadata.sensor.sectionId || ''} disabled={busy || !context.sections.length} onChange={async event=>{setBusy(true);try{await onAssignSection(object.metadata.sensor!.devEui!,event.target.value)}finally{setBusy(false)}}}><option value="" disabled>{lt ? 'Pasirinkite Section' : 'Choose Section'}</option>{context.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      <button className="nfa-remove" type="button" disabled={object.locked || map.layers.find(l=>l.id===object.layerId)?.locked} onClick={()=>onRemove(object.id)}>{lt ? 'Pašalinti iš brėžinio' : 'Remove from drawing'}</button>
      {object.metadata.sensor && <p className="nfa-hint">{lt ? 'Šalinama tik vieta plane. Pats Node lieka paskyroje.' : 'Only the placement is removed. The Node stays in your account.'}</p>}
    </> : <>
      <details open className="nfa-nodes"><summary>{lt ? 'Jutikliai šioje Area' : 'Nodes in this Area'} <span>{available.length}</span></summary>{loading ? <p role="status">{lt ? 'Kraunami jutikliai…' : 'Loading Nodes…'}</p> : available.map(node=><button key={node.devEui} type="button" onClick={()=>onAdd('sensor-node',node)}><i className="fa-solid fa-microchip" />{node.displayName || node.nodeId}<span>+</span></button>)}{!loading && !available.length && <p>{lt ? 'Visi turimi jutikliai jau plane. Naujus registruokite Nodes puslapyje.' : 'All available Nodes are already placed. Register new Nodes on the Nodes page.'}</p>}</details>
      <ObjectLibraryPanel language={language} onAdd={type=>onAdd(type)} />
      {!!map.objects.length && <details className="nfa-object-list" open><summary>{lt ? 'Objektai plane' : 'Placed objects'} · {map.objects.length}</summary>{map.objects.map(o=><button key={o.id} type="button" onClick={()=>onSelect(o.id)}><span>{o.name}</span><i className={`fa-solid ${o.locked ? 'fa-lock' : 'fa-angle-right'}`} /></button>)}</details>}
      <details className="nfa-layer-list"><summary>{lt ? 'Sluoksniai' : 'Layers'}</summary>{map.layers.map(layer=><label key={layer.id}><input type="checkbox" checked={layer.visible} onChange={e=>onLayers({...map,layers:map.layers.map(l=>l.id===layer.id ? {...l,visible:e.target.checked} : l)})} />{layer.name}</label>)}</details>
      <details className="nfa-section-create"><summary>{lt ? 'Sections šioje Area' : 'Sections in this Area'}</summary>{context?.sections.map(s=><p key={s.id}>{s.name} · {s.nodes} Nodes</p>)}<form onSubmit={async e=>{e.preventDefault();setBusy(true);try{if(await onCreateSection(sectionName,profile))setSectionName('')}finally{setBusy(false)}}}><label>{lt ? 'Section pavadinimas' : 'Section name'}<input required maxLength={120} value={sectionName} onChange={e=>setSectionName(e.target.value)} /></label><label>{lt ? 'Auginimo profilis' : 'Crop profile'}<select required value={profile} onChange={e=>setProfile(e.target.value)}><option value="">{lt ? 'Pasirinkite profilį' : 'Choose profile'}</option>{context?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="submit" disabled={busy || !sectionName.trim() || !profile}>{lt ? 'Kurti Section' : 'Create Section'}</button>{!context && <p>{lt ? 'Pirmiausia išsaugokite naują Area, kad galėtumėte pasirinkti profilį.' : 'Save the new Area first to choose a crop profile.'}</p>}</form></details>
    </>}
  </section>
}
