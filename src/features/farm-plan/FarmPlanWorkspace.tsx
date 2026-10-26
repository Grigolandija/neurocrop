import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { setDashboardContext } from '../../state/dashboardStore'
import FarmAreaEditor from './FarmAreaEditor'
import { useWorkspaceAccess } from '../../state/workspaceAccess'
import { editableFarmPlan, validateFarmAreaPlan, insertFarmArea, farmPlanDocument, farmPlanSignature, farmPlanRepository, type FarmPlanDocument, type FarmPlanContext } from './farmPlanData'
import FarmPlanScene from './FarmPlanScene'
import { neurocropApi } from '../../services/api/neurocropApi'
import { areaMapRepository,type AreaMapContext } from '../greenhouse-map/services/areaMapRepository'
import { farmEditorMap,layoutSignature,storedFarmMap,type FarmMaps } from './farmLayoutData'
import { changedFarmLayouts,persistFarmWorkspace,type LayoutBases } from './farmPlanPersistence'
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
  const savingRef=useRef(false)
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
      if(value.permissions.canEdit && params.get('add')==='1'){const inserted=insertFarmArea(next,!lt);next=inserted.plan;setSelectedAreaId(inserted.id)}else{const requested=params.get('area');setSelectedAreaId(requested ? (next.areas.some(a=>a.id===requested) ? requested : null) : next.areas[0]?.id || null)}
      setContext(value);setExpectedRevision(draftRevision);setMaps(loadedMaps);setBases(loadedBases);setPlan(next);setBaseline(farmPlanSignature(value.plan));setError(draftRevision!==value.revision ? (lt ? 'Serveryje yra naujesnis planas. Juodraštis išsaugotas šioje sesijoje; prieš atverdami serverio versiją atsisiųskite jį.' : 'The server has a newer plan. Download your preserved draft before loading the server version.') : '')
    }).catch(reason=>{if(active)setError(reason instanceof Error ? reason.message : 'Farm plan could not be loaded.')}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
    // Loading follows explicit requests, never a language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[retry])
  const savedSelectedId=context?.areas.some(a=>a.id===selectedAreaId) ? selectedAreaId : null
  useEffect(()=>{
    if(!savedSelectedId)return
    let active=true
    Promise.resolve().then(()=>{if(active){setContextLoading(true);setContextError('')}})
    areaMapRepository.load(savedSelectedId).then(value=>{
      if(!active)return
      setNodeContext(value)
      const current=latest.current
      const old=current.maps[savedSelectedId],base=current.bases[savedSelectedId]
      // A draft keeps its own base revision. Never silently adopt a newer revision for unsaved gear.
      if(!savingRef.current && value.revision>=(base?.revision || 0) && layoutSignature(old)===(base?.signature || '') && current.plan){
        const original=value.map || farmEditorMap(current.plan,savedSelectedId,{})
        const map={...original,objects:original.objects.map(o=>{
          if(!o.metadata.sensor?.devEui)return o
          const node=value.nodes.find(n=>n.devEui?.toLowerCase()===o.metadata.sensor!.devEui!.toLowerCase())
          return !node ? o : {...o,metadata:{...o.metadata,sensor:{...o.metadata.sensor,installationHeightM:node.installationHeightM,installationConfirmedAt:node.installationConfirmedAt}}}
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
  async function createSection(name:string,profile:string){
    if(!selectedAreaId || !context?.permissions.canEdit)return false
    if(dirty && !await save())return false
    try{await areaMapRepository.createSection(selectedAreaId,name.trim(),profile);setContext(current=>current ? {...current,areas:current.areas.map(a=>a.id===selectedAreaId ? {...a,sectionCount:(a.sectionCount || 0)+1} : a)} : current);setContextRetry(n=>n+1);await workspaceAccess.refresh();setNotice(lt ? 'Section sukurta pasirinktoje Area.' : 'Section created in the selected Area.');return true}catch(reason){setError(reason instanceof Error ? reason.message : 'Section could not be created.');return false}
  }
  async function assignSection(devEui:string,sectionId:string){
    if(!selectedAreaId || !nodeContext)return
    try{
      if(!nodeContext.mapEnabled)await neurocropApi.setAreaMapEnabled(selectedAreaId,true)
      await areaMapRepository.assignNodeToSection(selectedAreaId,devEui,sectionId)
      const section=nodeContext.sections.find(s=>s.id===sectionId)
      setMaps(current=>{const map=current[selectedAreaId];return !map ? current : {...current,[selectedAreaId]:{...map,objects:map.objects.map(o=>o.metadata.sensor?.devEui?.toLowerCase()===devEui.toLowerCase() ? {...o,metadata:{...o.metadata,sensor:{...o.metadata.sensor,sectionId,sectionName:section?.name}}} : o)}}})
      setContextRetry(n=>n+1);setNotice(lt ? 'Node priskirtas Section.' : 'Node assigned to Section.')
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Node assignment failed.')}
  }
  const scene=plan && <FarmPlanScene plan={plan} maps={maps} areas={previewAreas} selectedAreaId={selectedAreaId} onAreaSelect={context?.permissions.canEdit ? setSelectedAreaId : inspect} />
  return <div className="nc-farm-plan" data-nc-react-workspace="farm-plan"><header className="nc-farm-heading"><div><p>{lt ? 'ŪKIO STRUKTŪRA' : 'FARM STRUCTURE'}</p><h1>{lt ? 'Bendras ūkio planas' : 'Farm plan'}</h1><span>{lt ? 'Kontūrai, įranga ir jutikliai viename brėžinyje.' : 'Outlines, equipment and Nodes in one drawing.'}</span></div><div><button type="button" onClick={()=>navigate('/areas')}>{lt ? 'Grįžti į Areas' : 'Back to Areas'}</button>{context?.permissions.canEdit && <button type="button" className="nc-farm-save" disabled={!dirty || saving || loading || expectedRevision!==context.revision} onClick={()=>void save()}>{saving ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Išsaugoti planą' : 'Save plan')}</button>}</div></header>
    {error && <div className="nc-farm-feedback" role="alert"><span>{error}</span>{plan && <button type="button" onClick={downloadDraft}>{lt ? 'Atsisiųsti savo brėžinį' : 'Download your draft'}</button>}<button type="button" disabled={saving} onClick={()=>{if(context)try{sessionStorage.removeItem(`neurocrop-farm-draft:${context.draftScope}`)}catch{/* Storage may be unavailable. */}setLoading(true);setPlan(null);setContext(null);setMaps({});setBases({});setNodeContext(undefined);setNotice('');setRetry(value=>value+1)}}>{lt ? 'Atverti serverio versiją' : 'Load server version'}</button><small>{lt ? 'Pirmiausia atsisiųskite juodraštį: serverio versija pakeis neišsaugotus pakeitimus.' : 'Download your draft first: loading the server version replaces unsaved changes.'}</small></div>}
    {notice && <p className="nc-farm-notice" role="status">{notice}</p>}
    {loading ? <div className="nc-farm-loading" role="status">{lt ? 'Kraunamas planas…' : 'Loading plan…'}</div> : context && plan ? <>
      <div className="nc-farm-save-status"><span data-dirty={dirty}>{dirty ? (lt ? 'Yra neišsaugotų pakeitimų' : 'Unsaved changes') : (context.revision===0 ? (lt ? 'Naujas planas' : 'New plan') : (lt ? 'Išsaugota serveryje' : 'Saved on server'))}</span><span>{context.revision>0 ? `${lt ? 'Versija' : 'Revision'} ${context.revision}` : ''}</span></div>
      <div className="nc-farm-layout" data-readonly={!context.permissions.canEdit}>{context.permissions.canEdit ? <div inert={saving}><FarmAreaEditor plan={plan} layouts={maps} onChange={(next,layouts)=>{setPlan(next);setMaps(layouts)}} areas={context.areas} selectedId={selectedAreaId} onSelect={setSelectedAreaId} scene={scene} initialEquipment={new URLSearchParams(location.search).get('layout')==='1'} nodeContext={nodeContext} contextLoading={!!savedSelectedId && contextLoading} contextError={savedSelectedId ? contextError : ''} onCreateSection={createSection} onAssignSection={assignSection} /></div> : scene}</div>
      <p className="nc-farm-help">{lt ? 'Farm plan → Areas → Sections. Įranga ir jutikliai priklauso pasirinktai Area. 2D ir 3D rodo tą patį išdėstymą.' : 'Farm plan → Areas → Sections. Equipment and Nodes belong to the selected Area. 2D and 3D show the same layout.'}</p>
    </> : null}
  </div>
}
