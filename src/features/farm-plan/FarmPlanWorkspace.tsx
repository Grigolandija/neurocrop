import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { setDashboardContext } from '../../state/dashboardStore'
import SitePlanEditor from '../living-greenhouse/SitePlanEditor'
import type { SitePlan } from '../living-greenhouse/siteDemoModel'
import { validateSitePlan } from '../living-greenhouse/sitePlanEditing'
import { editableFarmPlan, farmBindingError, farmPlanDocument, farmPlanSignature, farmPlanRepository, type FarmPlanContext } from './farmPlanData'
import FarmPlanScene from './FarmPlanScene'
import './farm-plan.css'

export default function FarmPlanWorkspace(){
  const {language}=useInterfaceLanguage(),lt=language==='lt',navigate=useNavigate()
  const [context,setContext]=useState<FarmPlanContext|null>(null),[plan,setPlan]=useState<SitePlan|null>(null)
  const [expectedRevision,setExpectedRevision]=useState(0)
  const [baseline,setBaseline]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0)
  const dirty=!!plan && JSON.stringify(farmPlanDocument(plan))!==baseline
  useEffect(()=>{
    let active=true
    farmPlanRepository.load().then(value=>{
      if(!active)return
      let next=editableFarmPlan(value.plan),draftRevision=value.revision
      if(value.permissions.canEdit)try{
        const draft=JSON.parse(sessionStorage.getItem(`neurocrop-farm-draft:${value.draftScope}`) || 'null')
        if(Number.isInteger(draft?.revision) && draft.revision>=0 && draft.plan){next=editableFarmPlan(draft.plan);draftRevision=draft.revision;setNotice(lt ? 'Atkurtas neišsaugotas šios sesijos planas.' : 'Restored your unsaved session draft.')}
      }catch{/* A damaged draft never replaces the server plan. */}
      setContext(value);setExpectedRevision(draftRevision);setPlan(next);setBaseline(farmPlanSignature(value.plan));setError(draftRevision!==value.revision ? (lt ? 'Serveryje yra naujesnis planas. Jūsų juodraštis atkurtas; prieš atverdami naują versiją atsisiųskite jį.' : 'The server has a newer plan. Your draft was restored; download it before loading the new version.') : '')
    }).catch(reason=>{if(active)setError(reason instanceof Error ? reason.message : 'Farm plan could not be loaded.')}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
    // Language changes must not reload and overwrite an unsaved drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[retry])
  useEffect(()=>{
    if(!context?.permissions.canEdit || !plan)return
    try{const key=`neurocrop-farm-draft:${context.draftScope}`;if(dirty)sessionStorage.setItem(key,JSON.stringify({revision:expectedRevision,plan:farmPlanDocument(plan)}));else sessionStorage.removeItem(key)}catch{/* Server save remains available if local drafts are blocked. */}
  },[plan,context,dirty,expectedRevision])
  useEffect(()=>{
    if(!dirty)return
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return ()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  function downloadDraft(){
    if(!plan)return
    const url=URL.createObjectURL(new Blob([JSON.stringify(farmPlanDocument(plan),null,2)],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download='neurocrop-farm-plan-draft.json';link.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const inspect=(areaId:string)=>{setDashboardContext({areaId,sectionId:''});navigate('/?farmArea='+encodeURIComponent(areaId))}
  async function save(){
    if(!plan || !context || !context.permissions.canEdit || saving || expectedRevision!==context.revision)return
    const validation=validateSitePlan(plan) || farmBindingError(plan,context.areas)
    if(validation){setError(validation);return}
    const snapshot=plan
    setSaving(true);setError('');setNotice('')
    try{
      const result=await farmPlanRepository.save(snapshot,expectedRevision)
      setContext(current=>current ? {...current,...result} : current)
      setExpectedRevision(result.revision)
      setBaseline(farmPlanSignature(result.plan))
      setPlan(current=>current===snapshot ? editableFarmPlan(result.plan) : current)
      setNotice(lt ? 'Bendras ūkio planas išsaugotas.' : 'Farm plan saved.')
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Farm plan could not be saved.')}
    finally{setSaving(false)}
  }
  return <div className="nc-farm-plan" data-nc-react-workspace="farm-plan"><header className="nc-farm-heading"><div><p>{lt ? 'ŪKIO STRUKTŪRA' : 'FARM STRUCTURE'}</p><h1>{lt ? 'Bendras ūkio planas' : 'Farm plan'}</h1><span>{lt ? 'Pastatai ir patalpos apibrėžia fizinę erdvę. Zonas susiekite su esamomis Areas.' : 'Buildings and rooms define physical space. Link zones to your existing Areas.'}</span></div><div><button type="button" onClick={()=>navigate('/areas')}>{lt ? 'Grįžti į Areas' : 'Back to Areas'}</button>{context?.permissions.canEdit && <button type="button" className="nc-farm-save" disabled={!dirty || saving || loading || expectedRevision!==context.revision} onClick={()=>void save()}>{saving ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Išsaugoti planą' : 'Save plan')}</button>}</div></header>
    {error && <div className="nc-farm-feedback" role="alert"><span>{error}</span>{plan && <button type="button" onClick={downloadDraft}>{lt ? 'Atsisiųsti savo brėžinį' : 'Download your draft'}</button>}<button type="button" onClick={()=>{if(context)try{sessionStorage.removeItem(`neurocrop-farm-draft:${context.draftScope}`)}catch{/* Storage may be unavailable. */}setLoading(true);setPlan(null);setContext(null);setNotice('');setRetry(value=>value+1)}}>{lt ? 'Atverti serverio versiją' : 'Load server version'}</button><small>{lt ? 'Prieš atverdami serverio versiją atsisiųskite savo brėžinį: serverio versija pakeis dabartinius neišsaugotus pakeitimus.' : 'Download your draft before loading the server version: it will replace your unsaved changes.'}</small></div>}
    {notice && <p className="nc-farm-notice" role="status">{notice}</p>}
    {loading ? <div className="nc-farm-loading" role="status">{lt ? 'Kraunamas planas…' : 'Loading plan…'}</div> : context && plan ? <>
      <div className="nc-farm-save-status"><span data-dirty={dirty}>{dirty ? (lt ? 'Yra neišsaugotų pakeitimų' : 'Unsaved changes') : (context.revision===0 ? (lt ? 'Naujas planas' : 'New plan') : (lt ? 'Išsaugota serveryje' : 'Saved on server'))}</span><span>{context.revision>0 ? `${lt ? 'Versija' : 'Revision'} ${context.revision}` : ''}</span></div>
      <div className="nc-farm-layout" data-readonly={!context.permissions.canEdit}>{context.permissions.canEdit && <div inert={saving}><SitePlanEditor production plan={plan} onChange={setPlan} areas={context.areas} saveStateLabel={dirty ? (lt ? 'Pakeitimai dar neišsaugoti serveryje.' : 'Changes have not been saved to the server.') : (lt ? 'Planas išsaugomas paspaudus „Išsaugoti planą“.' : 'Use Save plan to store your changes on the server.')} onInspectZone={zoneId=>{const areaId=plan.zones.find(z=>z.id===zoneId)?.areaId;if(areaId)inspect(areaId)}} /></div>}<section className="nc-farm-preview"><div className="nc-farm-preview-heading"><strong>{lt ? 'Gyva 3D peržiūra' : 'Live 3D preview'}</strong><span>{lt ? 'Tikras pastatų išsidėstymas' : 'Your building layout'}</span></div><FarmPlanScene plan={plan} areas={context.areas} onAreaSelect={inspect} /></section></div>
      <p className="nc-farm-help">{lt ? 'Bendras planas susieja erdves su Areas. Jų išsaugoti jutiklių ir įrangos planai lieka savo vietose. Tikrą matavimų žemėlapį atversite pasirinkę susietą zoną.' : 'The farm plan links spaces to Areas. Existing sensor and equipment layouts stay intact. Select a linked zone to open its measurement map.'}</p>
    </> : null}
  </div>
}
