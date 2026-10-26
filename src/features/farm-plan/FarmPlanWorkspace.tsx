import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { getDashboardState, setDashboardContext } from '../../state/dashboardStore'
import FarmAreaEditor from './FarmAreaEditor'
import { useWorkspaceAccess } from '../../state/workspaceAccess'
import { editableFarmPlan, validateFarmAreaPlan, insertFarmArea, farmPlanDocument, farmPlanSignature, farmPlanRepository, type FarmPlanDocument, type FarmPlanContext } from './farmPlanData'
import FarmPlanScene from './FarmPlanScene'
import { neurocropApi } from '../../services/api/neurocropApi'
import { areaMapRepository,type AreaMapContext,type AreaMapNode } from '../greenhouse-map/services/areaMapRepository'
import { farmEditorMap,layoutSignature,storedFarmMap,type FarmMaps } from './farmLayoutData'
import { changedFarmLayouts,persistFarmWorkspace,type LayoutBases } from './farmPlanPersistence'
import { nodeHeightCentimetres,refreshFarmNodeMetadata,unassignedFarmNodes } from './farmNodes'
import './farm-plan.css'

export default function FarmPlanWorkspace(){
  const {language}=useInterfaceLanguage(),lt=language==='lt',navigate=useNavigate(),location=useLocation(),workspaceAccess=useWorkspaceAccess()
  const [context,setContext]=useState<FarmPlanContext|null>(null),[plan,setPlan]=useState<FarmPlanDocument|null>(null)
  const [maps,setMaps]=useState<FarmMaps>({}),[bases,setBases]=useState<LayoutBases>({})
  const [selectedAreaId,setSelectedAreaId]=useState<string|null>(null)
  const [nodeContext,setNodeContext]=useState<AreaMapContext>(),[contextLoading,setContextLoading]=useState(false),[contextError,setContextError]=useState(''),[contextRetry,setContextRetry]=useState(0)
  const [expectedRevision,setExpectedRevision]=useState(0)
  const [baseline,setBaseline]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0)
  const [unassignedNodes,setUnassignedNodes]=useState<AreaMapNode[]>([]),[inventoryError,setInventoryError]=useState('')
  const savingRef=useRef(false)
  const cultivationRequest=location.pathname==='/farm-plan' && new URLSearchParams(location.search).get('cultivation')==='1' ? location.key : undefined
  const openedCultivation=useRef<string|undefined>(undefined)
  useEffect(()=>{
    if(!cultivationRequest || !plan || openedCultivation.current===cultivationRequest)return
    const requested=new URLSearchParams(location.search).get('area')
    const areaId=plan.areas.find(a=>a.id===requested)?.id
    const frame=requestAnimationFrame(()=>{openedCultivation.current=cultivationRequest;if(areaId)setSelectedAreaId(areaId)})
    return ()=>cancelAnimationFrame(frame)
  },[cultivationRequest,location.search,plan])
  const dirty=!!plan && (farmPlanSignature(plan)!==baseline || changedFarmLayouts(plan,maps,bases).length>0)
  const previewAreas=useMemo(()=>plan?.areas.map(area=>({...context?.areas.find(a=>a.id===area.id),id:area.id,name:area.name,mapEnabled:context?.areas.find(a=>a.id===area.id)?.mapEnabled || false,mapConfigured:context?.areas.find(a=>a.id===area.id)?.mapConfigured || false})) || [],[plan,context])
  const latest=useRef({maps,bases,plan});useEffect(()=>{latest.current={maps,bases,plan}},[maps,bases,plan])
  useEffect(()=>{
    let active=true
    farmPlanRepository.load().then(value=>{
      if(!active)return
      let next=editableFarmPlan(value.plan),draftRevision=value.revision
      let loadedMaps:FarmMaps=Object.fromEntries((value.layouts || []).map(l=>[l.areaId,l.map]))
      let loadedBases:LayoutBases=Object.fromEntries((value.layouts || []).map(l=>[l.areaId,{revision:l.revision,signature:layoutSignature(l.map)}]))
      if(value.permissions.canEdit)try{
        const draft=JSON.parse(sessionStorage.getItem(`neurocrop-farm-draft:${value.draftScope}`) || 'null')
        if(Number.isInteger(draft?.revision) && draft.revision>=0 && draft.plan){next=editableFarmPlan(draft.plan);draftRevision=draft.revision;if(draft.layouts && draft.layoutBases){loadedMaps={...loadedMaps,...draft.layouts};loadedBases={...loadedBases,...draft.layoutBases}}setNotice(lt ? 'Atkurtas neišsaugotas šios sesijos brėžinys.' : 'Restored your unsaved drawing.')}
      }catch{/* A damaged draft never replaces the server plan. */}
      const params=new URLSearchParams(location.search)
      if(value.permissions.canEdit && params.get('add')==='1'){const inserted=insertFarmArea(next,!lt);next=inserted.plan;setSelectedAreaId(inserted.id)}else{const requested=params.get('area');setSelectedAreaId(requested ? (next.areas.some(a=>a.id===requested) ? requested : null) : null)}
      setContext(value);setExpectedRevision(draftRevision);setMaps(loadedMaps);setBases(loadedBases);setPlan(next);setBaseline(farmPlanSignature(value.plan));setError(draftRevision!==value.revision ? (lt ? 'Serveryje yra naujesnis planas. Juodraštis išsaugotas šioje sesijoje; prieš atverdami serverio versiją atsisiųskite jį.' : 'The server has a newer plan. Download your preserved draft before loading the server version.') : '')
    }).catch(reason=>{if(active)setError(reason instanceof Error ? reason.message : 'Farm plan could not be loaded.')}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
    // Loading follows explicit requests, never a language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[retry])
  useEffect(()=>{
    let active=true
    neurocropApi.getNodes().then(payload=>{if(active){setUnassignedNodes(unassignedFarmNodes(payload));setInventoryError('')}}).catch(reason=>{if(active)setInventoryError(reason instanceof Error ? reason.message : 'Node inventory could not be loaded.')})
    return ()=>{active=false}
  },[retry,contextRetry])
  const savedSelectedId=context?.areas.some(a=>a.id===selectedAreaId) ? selectedAreaId : null
  useEffect(()=>{
    if(!savedSelectedId)return
    let active=true
    Promise.resolve().then(()=>{if(active){setContextLoading(true);setContextError('')}})
    areaMapRepository.load(savedSelectedId).then(value=>{
      if(!active)return
      setNodeContext(value)
      setMaps(current=>refreshFarmNodeMetadata(current,value.nodes))
      const current=latest.current
      const old=current.maps[savedSelectedId],base=current.bases[savedSelectedId]
      // A draft keeps its own base revision. Never silently adopt a newer revision for unsaved gear.
      if(!savingRef.current && value.revision>=(base?.revision || 0) && layoutSignature(old)===(base?.signature || '') && current.plan){
        const original=value.map || farmEditorMap(current.plan,savedSelectedId,{})
        const map={...original,objects:original.objects.map(o=>{
          if(!o.metadata.sensor?.devEui)return o
          const node=value.nodes.find(n=>n.devEui?.toLowerCase()===o.metadata.sensor!.devEui!.toLowerCase())
          return !node ? o : {...o,metadata:{...o.metadata,sensor:{...o.metadata.sensor,installationHeightM:node.installationHeightM,installationConfirmedAt:node.installationConfirmedAt,measurementHeightsM:node.measurementHeightsM}}}
        })}
        setMaps(previous=>({...previous,[savedSelectedId]:map}))
        setBases(previous=>({...previous,[savedSelectedId]:{revision:value.revision,signature:layoutSignature(map)}}))
      }
    }).catch(reason=>{if(active)setContextError(reason instanceof Error ? reason.message : 'Area data could not be loaded.')}).finally(()=>{if(active)setContextLoading(false)})
    return ()=>{active=false}
  },[savedSelectedId,contextRetry])
  useEffect(()=>{
    if(!context?.permissions.canEdit || !plan)return
    try{const key=`neurocrop-farm-draft:${context.draftScope}`;if(dirty)sessionStorage.setItem(key,JSON.stringify({revision:expectedRevision,plan:farmPlanDocument(plan),layouts:Object.fromEntries(Object.entries(maps).map(([id,map])=>[id,storedFarmMap(map)])),layoutBases:bases}));else sessionStorage.removeItem(key)}catch{/* Server save remains available if session storage is blocked. */}
  },[plan,maps,bases,context,dirty,expectedRevision])
  useEffect(()=>{
    if(!dirty)return
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  function downloadDraft(){
    if(!plan)return
    const url=URL.createObjectURL(new Blob([JSON.stringify({plan:farmPlanDocument(plan),layouts:Object.fromEntries(Object.entries(maps).map(([id,map])=>[id,storedFarmMap(map)]))},null,2)],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download='neurocrop-farm-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const inspect=(areaId:string)=>{setDashboardContext({areaId,sectionId:''});navigate('/?farmArea='+encodeURIComponent(areaId))}
  async function save(){
    if(!plan || !context?.permissions.canEdit || savingRef.current || expectedRevision!==context.revision)return false
    const validation=validateFarmAreaPlan(plan);if(validation){setError(validation);return false}
    savingRef.current=true;setSaving(true);setError('');setNotice('')
    try{
      await persistFarmWorkspace({plan,maps,bases,baseline,revision:expectedRevision,
        onBaseConfirmed:(id,revision)=>setBases(current=>({...current,[id]:{revision,signature:bases[id]?.signature || ''}})),
        savePlan:farmPlanRepository.save,saveMap:areaMapRepository.save,enableMap:id=>neurocropApi.setAreaMapEnabled(id,true),
        onPlanSaved:(result,dirtyIds)=>{
          setContext(current=>current ? {...current,...result} : current);setExpectedRevision(result.revision);setBaseline(farmPlanSignature(result.plan));setPlan(editableFarmPlan(result.plan))
          const layouts=(result.layouts || []).filter(l=>!dirtyIds.includes(l.areaId))
          setMaps(current=>({...current,...Object.fromEntries(layouts.map(l=>[l.areaId,l.map]))}))
          setBases(current=>({...current,...Object.fromEntries(layouts.map(l=>[l.areaId,{revision:l.revision,signature:layoutSignature(l.map)}]))}))
        },onMapSaved:(id,result)=>{setMaps(current=>({...current,[id]:result.map}));setBases(current=>({...current,[id]:{revision:result.revision,signature:layoutSignature(result.map)}}))},
      })
      setNotice(lt ? 'Planas ir įrangos išdėstymas išsaugoti.' : 'Plan and equipment layout saved.');setContextRetry(n=>n+1)
      await workspaceAccess.refresh();return true
    }catch(reason){setError(reason instanceof Error ? reason.message : 'The drawing could not be saved.');return false}
    finally{savingRef.current=false;setSaving(false)}
  }
  async function deleteArea(id:string){
    if(!context?.permissions.canEdit || !plan || savingRef.current)throw new Error(lt ? 'Šiuo metu Area ištrinti negalima.' : 'This Area cannot be deleted right now.')
    if(expectedRevision!==context.revision)throw new Error(lt ? 'Serveryje yra naujesnis planas. Prieš trindami Area atverkite serverio versiją; savo juodraštį galite atsisiųsti.' : 'The server has a newer plan. Download your draft, then load the server version before deleting an Area.')
    savingRef.current=true;setSaving(true)
    try{
      // Use the existing deletion policy: retain Sections, Nodes and measurements.
      await neurocropApi.deleteArea(id,{keepSections:true})
      const withoutArea=(source:FarmPlanDocument)=>({...source,areas:source.areas.filter(a=>a.id!==id)})
      setPlan(current=>current ? withoutArea(current) : current)
      setMaps(current=>Object.fromEntries(Object.entries(current).filter(([areaId])=>areaId!==id)))
      setBases(current=>Object.fromEntries(Object.entries(current).filter(([areaId])=>areaId!==id)))
      setContext(current=>current ? {...current,plan:withoutArea(current.plan),areas:current.areas.filter(a=>a.id!==id),layouts:current.layouts?.filter(l=>l.areaId!==id)} : current)
      setBaseline(farmPlanSignature(withoutArea(context.plan)))
      setSelectedAreaId(null);setNodeContext(undefined);setContextError('');setError('')
      if(getDashboardState().context.areaId===id)setDashboardContext({areaId:context.areas.find(a=>a.id!==id)?.id || '',sectionId:''})
      setNotice(lt ? 'Area ištrinta. Sections, Nodes ir matavimai išsaugoti. Kiti neišsaugoti plano pakeitimai liko juodraštyje.' : 'Area deleted. Sections, Nodes and measurements were kept. Other unsaved plan edits remain in your draft.')
      try{await workspaceAccess.refresh()}catch{setNotice(lt ? 'Area ištrinta. Kitų pakeitimų juodraštis išsaugotas; paskyros būklei atnaujinti perkraukite puslapį.' : 'Area deleted. Your other draft changes were kept; reload to refresh the workspace status.')}
    }finally{savingRef.current=false;setSaving(false)}
  }
  async function createSection(name:string,profile:string){
    if(!selectedAreaId || !context?.permissions.canEdit)return false
    if(dirty && !await save())return false
    try{await areaMapRepository.createSection(selectedAreaId,name.trim(),profile);setContext(current=>current ? {...current,areas:current.areas.map(a=>a.id===selectedAreaId ? {...a,sectionCount:(a.sectionCount || 0)+1} : a)} : current);setContextRetry(n=>n+1);await workspaceAccess.refresh();setNotice(lt ? 'Auginimo grupė sukurta.' : 'Growing group created.');return true}catch(reason){setError(reason instanceof Error ? reason.message : 'Section could not be created.');return false}
  }
  async function assignSection(devEui:string,sectionId:string){
    if(!selectedAreaId || !nodeContext)return
    const targetSectionId=sectionId || nodeContext.cultivation?.defaultSectionId
    if(!targetSectionId)throw new Error('Area cultivation context is unavailable.')
    try{
      if(!nodeContext.mapEnabled)await neurocropApi.setAreaMapEnabled(selectedAreaId,true)
      await areaMapRepository.assignNodeToSection(selectedAreaId,devEui,targetSectionId)
      const section=nodeContext.sections.find(s=>s.id===targetSectionId)
      setMaps(current=>{const map=current[selectedAreaId];return !map ? current : {...current,[selectedAreaId]:{...map,objects:map.objects.map(o=>o.metadata.sensor?.devEui?.toLowerCase()===devEui.toLowerCase() ? {...o,metadata:{...o.metadata,sensor:{...o.metadata.sensor,sectionId:targetSectionId,sectionName:section?.isAreaDefault ? undefined : section?.name}}} : o)}}})
      setContextRetry(n=>n+1);setNotice(lt ? 'Node priskyrimas išsaugotas.' : 'Node assignment saved.')
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Node assignment failed.');throw reason}
  }
  async function setNodeHeight(devEui:string,heightM:number|null){
    const area=plan?.areas.find(a=>a.id===selectedAreaId)
    if(!area || nodeContext?.area.id!==area.id || !nodeContext.nodes.some(n=>n.devEui?.toLowerCase()===devEui.toLowerCase()) || savingRef.current)throw new Error(lt ? 'Pasirinkite šios Area Node.' : 'Select a Node belonging to this Area.')
    const installationHeightCm=nodeHeightCentimetres(heightM,area.height)
    savingRef.current=true;setSaving(true)
    try{
      const result=await neurocropApi.updateNode(devEui,{installationHeightCm}) as {node:{installationHeightCm:number|null;installationHeightRecordedAt:string}}
      const changed=nodeContext.nodes.map(n=>n.devEui?.toLowerCase()===devEui.toLowerCase() ? {...n,installationHeightM:result.node.installationHeightCm==null ? undefined : result.node.installationHeightCm/100,installationConfirmedAt:result.node.installationHeightRecordedAt} : n)
      setNodeContext({...nodeContext,nodes:changed});setMaps(current=>refreshFarmNodeMetadata(current,changed))
      setNotice(lt ? 'Node aukštis išsaugotas serveryje.' : 'Node height saved on server.')
      // Sensor-specific elevations remain authoritative (some inherit the Node height).
      try{const fresh=await areaMapRepository.load(area.id);setNodeContext(fresh);setMaps(current=>refreshFarmNodeMetadata(current,fresh.nodes))}catch{setNotice(lt ? 'Node aukštis išsaugotas. Atskirų sensorių aukščius atnaujinkite perkrovę puslapį.' : 'Node height saved. Reload to refresh individual sensor heights.')}
    }finally{savingRef.current=false;setSaving(false)}
  }
  async function connectNode(devEui:string,sectionId:string):Promise<AreaMapNode>{
    const node=unassignedNodes.find(n=>n.devEui===devEui),targetId=sectionId || nodeContext?.cultivation?.defaultSectionId,section=nodeContext?.sections.find(s=>s.id===targetId)
    if(!node || !selectedAreaId || nodeContext?.area.id!==selectedAreaId || !section || savingRef.current)throw new Error(lt ? 'Pasirinkite laisvą Node ir Area.' : 'Choose an unassigned Node and an Area.')
    savingRef.current=true;setSaving(true)
    try{
      await neurocropApi.updateNode(devEui,{areaId:selectedAreaId,sectionId:sectionId || null})
      const connected:AreaMapNode={...node,areaId:selectedAreaId,sectionId:section.id,sectionName:section.isAreaDefault ? undefined : section.name}
      setUnassignedNodes(current=>current.filter(n=>n.devEui!==devEui));setNodeContext(current=>current ? {...current,nodes:[...current.nodes,connected]} : current)
      setContext(current=>current ? {...current,areas:current.areas.map(a=>a.id===selectedAreaId ? {...a,nodeCount:(a.nodeCount || 0)+1} : a)} : current)
      setNotice(lt ? 'Node priskirtas Area. Išsaugokite jo vietą plane.' : 'Node assigned to Area. Save its position in the plan.')
      return connected
    }finally{savingRef.current=false;setSaving(false)}
  }
  async function saveCultivation(profile:string|null){
    if(!selectedAreaId || !nodeContext || savingRef.current)throw new Error('Area is not ready.')
    savingRef.current=true;setSaving(true)
    try{await neurocropApi.saveAreaCultivation(selectedAreaId,profile);setNodeContext(current=>current?.cultivation ? {...current,cultivation:{...current.cultivation,cropProfile:profile}} : current);setContextRetry(n=>n+1);setNotice(lt ? 'Area auginimo profilis išsaugotas.' : 'Area crop profile saved.')}finally{savingRef.current=false;setSaving(false)}
  }
  async function editGrowingGroup(id:string,name:string,profile:string|null){
    if(!selectedAreaId || !nodeContext?.sections.some(s=>s.id===id && !s.isAreaDefault) || savingRef.current)throw new Error('Choose a growing group in this Area.')
    savingRef.current=true;setSaving(true)
    try{await neurocropApi.updateSection(id,{areaId:selectedAreaId,name:name.trim(),cropProfile:profile});setContextRetry(n=>n+1);setNotice(lt ? 'Auginimo grupė išsaugota.' : 'Growing group saved.')}finally{savingRef.current=false;setSaving(false)}
  }
  const scene=plan && <FarmPlanScene plan={plan} maps={maps} areas={previewAreas} selectedAreaId={selectedAreaId} onAreaSelect={context?.permissions.canEdit ? setSelectedAreaId : inspect} />
  return <div className="nc-farm-plan" data-nc-react-workspace="farm-plan"><header className="nc-farm-heading"><div><h1>{lt ? 'Ūkio planas' : 'Farm plan'}</h1><span className="nc-farm-inline-status" data-dirty={dirty}>{loading ? (lt ? 'Kraunama…' : 'Loading…') : dirty ? (lt ? 'Neišsaugoti pakeitimai' : 'Unsaved changes') : (lt ? 'Išsaugota' : 'Saved')}</span></div><div><button type="button" onClick={()=>navigate('/areas')}>{lt ? 'Grįžti į Areas' : 'Back to Areas'}</button></div></header>
    {error && <div className="nc-farm-feedback" role="alert"><span>{error}</span>{plan && <button type="button" onClick={downloadDraft}>{lt ? 'Atsisiųsti savo brėžinį' : 'Download your draft'}</button>}<button type="button" disabled={saving} onClick={()=>{if(context)try{sessionStorage.removeItem(`neurocrop-farm-draft:${context.draftScope}`)}catch{/* Storage may be unavailable. */}setLoading(true);setPlan(null);setContext(null);setMaps({});setBases({});setNodeContext(undefined);setNotice('');setRetry(value=>value+1)}}>{lt ? 'Atverti serverio versiją' : 'Load server version'}</button><small>{lt ? 'Pirmiausia atsisiųskite juodraštį: serverio versija pakeis neišsaugotus pakeitimus.' : 'Download your draft first: loading the server version replaces unsaved changes.'}</small></div>}
    {notice && <p className="nc-farm-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label={lt ? 'Uždaryti pranešimą' : 'Dismiss notification'}><i className="fa-solid fa-xmark" /></button></p>}
    {loading ? <div className="nc-farm-loading" role="status">{lt ? 'Kraunamas planas…' : 'Loading plan…'}</div> : context && plan ? <>
      <div className="nc-farm-layout" data-readonly={!context.permissions.canEdit}>{context.permissions.canEdit ? <div inert={saving}><FarmAreaEditor plan={plan} layouts={maps} onChange={(next,layouts)=>{setPlan(next);setMaps(refreshFarmNodeMetadata(layouts,nodeContext?.nodes || []))}} areas={context.areas} selectedId={selectedAreaId} onSelect={setSelectedAreaId} renderScene={isolatedAreaId=><FarmPlanScene plan={plan} maps={maps} areas={previewAreas} selectedAreaId={selectedAreaId} isolatedAreaId={isolatedAreaId} onAreaSelect={setSelectedAreaId} />} saveError={error} saveAction={<button type="button" className="nc-farm-save" disabled={saving || loading || expectedRevision!==context.revision} onClick={()=>void save()} title={!dirty ? (lt ? 'Visi pakeitimai išsaugoti' : 'All changes saved') : (lt ? 'Išsaugoti planą ir įrangą' : 'Save plan and equipment')}><i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : !dirty ? 'fa-check' : 'fa-floppy-disk'}`} /><span>{saving ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Išsaugoti' : 'Save')}</span></button>} cultivationRequest={cultivationRequest} initialCultivation={new URLSearchParams(location.search).get('cultivation')==='1'} initialEquipment={new URLSearchParams(location.search).get('layout')==='1'} nodeContext={nodeContext} contextLoading={!!savedSelectedId && contextLoading} contextError={savedSelectedId ? contextError : ''} onCreateSection={createSection} onCultivation={saveCultivation} onEditGroup={editGrowingGroup} onAssignSection={assignSection} onNodeHeight={setNodeHeight} unassignedNodes={unassignedNodes} inventoryError={inventoryError} onConnectNode={connectNode} onDeleteArea={deleteArea} /></div> : scene}</div>
    </> : null}
  </div>
}
