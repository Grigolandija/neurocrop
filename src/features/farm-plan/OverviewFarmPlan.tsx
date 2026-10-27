import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import type { AreaMapContext } from '../greenhouse-map/services/areaMapRepository'
import { livingMap } from '../living-greenhouse/livingData'
import { editableFarmPlan, farmPlanRepository, type FarmPlanContext } from './farmPlanData'
import { summarizeFarmArea } from './farmMonitoringData'
import { loadFarmMonitoring } from './farmMonitoringRepository'
import FarmPlanScene from './FarmPlanScene'
import FarmAreaSummary from './FarmAreaSummary'
import { farmViewKey, type FarmSceneMemory } from './farmViewMemory'
import './farm-plan.css'
import './farm-monitoring.css'

type Props = { areaId: string; refreshToken: number; enabled?: boolean; onAreaSelect: (id: string) => void; renderMap: (navigation?: ReactNode) => ReactNode; metric: MetricKey; onMetricChange: (metric: MetricKey) => void; signalReady?: boolean }
type Monitoring = { key: string; contexts: Record<string, AreaMapContext>; failed: string[]; targetsUnavailable: boolean }
export default function OverviewFarmPlan({ areaId, refreshToken, onAreaSelect, enabled = true, renderMap, metric, onMetricChange, signalReady = true }: Props) {
  const { language } = useInterfaceLanguage(), lt = language === 'lt', navigate = useNavigate(), location = useLocation()
  const [context, setContext] = useState<FarmPlanContext | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [view, setView] = useState({ areaId, mode: new URLSearchParams(location.search).has('farmArea') ? 'focus' : 'farm' })
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null), [now, setNow] = useState(() => Date.now())
  const [cameraMemory] = useState<FarmSceneMemory>(() => new Map())
  useEffect(() => {
    if (!enabled) return
    let active = true
    farmPlanRepository.load().then(value => { editableFarmPlan(value.plan); if (active) { setContext(value); setError('') } }).catch(() => { if (active) setError(lt ? 'Bendro plano įkelti nepavyko.' : 'The farm plan could not be loaded.') })
    return () => { active = false }
    // Loads follow refreshes; a language change must not replace the current camera or view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken, retry, enabled])
  const plan = useMemo(() => context ? editableFarmPlan(context.plan) : null, [context])
  const ids = JSON.stringify(plan?.areas.map(area => area.id) || [])
  const key = `${context?.draftScope || ''}:${ids}`
  useEffect(() => {
    if (!enabled || ids === '[]') return
    let active = true
    loadFarmMonitoring(JSON.parse(ids) as string[], () => !active).then(result => {
      if (!active) return
      setMonitoring(previous => ({ key, ...result, contexts: { ...(previous?.key === key ? previous.contexts : {}), ...result.contexts } }))
      setNow(Date.now())
    }).catch(() => {
      if (active) setMonitoring(previous => ({ key, contexts: previous?.key === key ? previous.contexts : {}, failed: JSON.parse(ids) as string[], targetsUnavailable: true }))
    })
    return () => { active = false }
  }, [enabled, ids, key, refreshToken, retry])
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [enabled])
  const activeMonitoring = monitoring?.key === key ? monitoring : null
  const comparisons = useMemo(() => Object.fromEntries((plan?.areas || []).map(area => [area.id, summarizeFarmArea(area.id, activeMonitoring?.contexts[area.id], metric, now, activeMonitoring?.failed.includes(area.id))])), [plan, activeMonitoring, metric, now])
  const maps = useMemo(() => Object.fromEntries((context?.layouts || []).map(layout => {
    const live = activeMonitoring?.contexts[layout.areaId]
    const source = live?.map || layout.map
    return [layout.areaId, live ? livingMap({ ...live, map: source, mapEnabled: true }, null, null) || source : source]
  })), [context, activeMonitoring])
  if (!enabled || !context?.revision || !plan?.areas.length) return <>{error && <div className="nc-farm-overview-error" role="status">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button></div>}{renderMap()}</>
  const focusedId = view.mode === 'farm' ? null : view.areaId
  const focused = plan.areas.find(area => area.id === focusedId)
  const choose = (id: string) => { setView({ areaId: id, mode: 'focus' }); onAreaSelect(id) }
  const back = () => setView({ areaId, mode: 'farm' })
  const showDetail = view.mode === 'detail' && !!focused
  const backToArea = <button type="button" className="nc-farm-return-summary" aria-label={lt ? 'Grįžti į Area peržiūrą' : 'Back to Area overview'} onClick={() => choose(view.areaId)}><i className="fa-solid fa-arrow-left" />{focused?.name || (lt ? 'Area peržiūra' : 'Area overview')}</button>
  const detailMap = showDetail && focused?.id === areaId ? renderMap(backToArea) : null
  return <div className="nc-farm-overview nc-farm-monitoring">
    {!showDetail && <header className="nc-farm-monitor-toolbar">
      <nav className="nc-farm-breadcrumb" aria-label={lt ? 'Ūkio peržiūros kelias' : 'Farm view navigation'}><button type="button" onClick={back} aria-label={focused ? lt ? 'Grįžti į visą ūkį' : 'Back to whole farm' : undefined} aria-current={!focused ? 'page' : undefined}><i className={`fa-solid ${focused ? 'fa-arrow-left' : 'fa-cubes'}`} />{lt ? 'Visas ūkis' : 'Whole farm'}</button>{focused && <><i className="fa-solid fa-chevron-right" aria-hidden="true" /><button type="button" aria-current="page" onClick={() => choose(focused.id)}>{focused.name}</button></>}</nav>
      <div>{focused && !showDetail && <select aria-label={lt ? 'Palyginimo parametras' : 'Comparison metric'} value={metric} onChange={event => onMetricChange(event.target.value as MetricKey)}>{(Object.keys(METRICS) as MetricKey[]).map(value => <option key={value} value={value}>{lt ? METRICS[value].labelLt : METRICS[value].label}</option>)}</select>}<select aria-label={lt ? 'Pasirinkti Area peržiūrai' : 'Choose an Area to inspect'} value={focused?.id || ''} onChange={event => event.target.value ? choose(event.target.value) : back()}><option value="">{lt ? 'Visos Areas' : 'All Areas'}</option>{plan.areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>{context.permissions.canEdit && <button type="button" className="nc-farm-monitor-edit" onClick={() => navigate('/farm-plan')} aria-label={lt ? 'Redaguoti ūkio planą' : 'Edit farm plan'} title={lt ? 'Redaguoti planą' : 'Edit farm plan'}><i className="fa-solid fa-pen-ruler" /></button>}</div>
    </header>}
    {error && <div className="nc-farm-overview-error" role="status">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button></div>}
    {!showDetail && <div className="nc-farm-monitor-body" data-focused={!!focused}>
      <FarmPlanScene key={farmViewKey(focused?.id)} cameraMemory={cameraMemory} isolatedAreaId={focused?.id} plan={plan} maps={maps} areas={context.areas} onAreaSelect={focused ? undefined : choose} selectedAreaId={focused?.id || null} comparison={comparisons} monitoringActive={signalReady} />
      {focused && <FarmAreaSummary key={focused.id} name={focused.name} summary={comparisons[focused.id]} metric={metric} refreshToken={refreshToken + retry} lt={lt} targetsUnavailable={activeMonitoring?.targetsUnavailable || false} onClose={back} onRetry={() => setRetry(value => value + 1)} onMap={() => setView({ areaId: focused.id, mode: 'detail' })} />}
    </div>}
    {showDetail && <div className="nc-farm-detail-map">{focused?.id !== areaId ? <>{backToArea}<div className="nc-farm-help" role="status">{lt ? 'Atveriamas Area žemėlapis…' : 'Opening the Area map…'}</div></> : detailMap || <>{backToArea}<div className="nc-farm-help">{lt ? 'Šiai Area žemėlapis dar neparuoštas.' : 'The map is not configured for this Area.'}</div></>}</div>}
  </div>
}
