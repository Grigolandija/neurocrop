import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { editableFarmPlan, farmPlanRepository, type FarmPlanContext } from './farmPlanData'
import FarmPlanScene from './FarmPlanScene'
import './farm-plan.css'

export default function OverviewFarmPlan({areaId,refreshToken,onAreaSelect,enabled=true,children}:{areaId:string;refreshToken:number;enabled?:boolean;onAreaSelect:(id:string)=>void;children:ReactNode}){
  const {language}=useInterfaceLanguage(),lt=language==='lt',navigate=useNavigate(),location=useLocation()
  const [context,setContext]=useState<FarmPlanContext|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [view,setView]=useState({areaId,mode:new URLSearchParams(location.search).has('farmArea') ? 'area' : 'auto'})
  useEffect(()=>{
    if(!enabled)return
    let active=true
    farmPlanRepository.load().then(value=>{editableFarmPlan(value.plan);if(active){setContext(value);setError('')}}).catch(()=>{if(active)setError(lt ? 'Bendro plano įkelti nepavyko.' : 'The farm plan could not be loaded.')})
    return ()=>{active=false}
    // Keep the selected view when language changes; loads follow explicit refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[refreshToken,retry,enabled])
  const plan=useMemo(()=>context ? editableFarmPlan(context.plan) : null,[context])
  if(!enabled || !context?.revision || !plan?.buildings.length)return <>{error && <div className="nc-farm-overview-error" role="status">{error}<button type="button" onClick={()=>setRetry(n=>n+1)}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button></div>}{children}</>
  const showFarm=view.mode==='auto' || (view.areaId===areaId && view.mode==='farm')
  const choose=(id:string)=>{setView({areaId:id,mode:'area'});onAreaSelect(id)}
  return <div className="nc-farm-overview"><div className="nc-farm-overview-nav"><button type="button" aria-pressed={showFarm} onClick={()=>setView({areaId,mode:'farm'})}><i className="fa-solid fa-cubes" />{lt ? 'Visas ūkis' : 'Whole farm'}</button><button type="button" aria-pressed={!showFarm} onClick={()=>setView({areaId,mode:'area'})}>{context.areas.find(a=>a.id===areaId)?.name || (lt ? 'Zonos matavimai' : 'Area measurements')}</button>{context.permissions.canEdit && <button type="button" className="nc-farm-overview-edit" onClick={()=>navigate('/farm-plan')}><i className="fa-solid fa-pen-ruler" />{lt ? 'Redaguoti planą' : 'Edit farm plan'}</button>}</div>
    <div className="nc-farm-map-panel" hidden={!showFarm}><FarmPlanScene plan={plan} areas={context.areas} onAreaSelect={choose} />{!plan.zones.some(z=>z.areaId) && <p className="nc-farm-help">{lt ? 'Kad atvertumėte matavimus, redaktoriuje susiekite zonų kontūrus su esamomis Areas.' : 'Link zone contours to existing Areas in the editor to open their measurements.'}</p>}</div>
    <div className="nc-farm-map-panel" hidden={showFarm}>{children || <div className="nc-farm-help">{lt ? 'Šiai Area dar neįjungtas matavimų žemėlapis.' : 'The measurement map is not enabled for this Area.'}<button type="button" onClick={()=>navigate('/areas')}>{lt ? 'Atverti Areas' : 'Open Areas'}</button></div>}</div>
  </div>
}
