import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import { scaleGradient } from '../greenhouse-map/heatmap/heatmapColorScale'
import type { AreaMapContext } from '../greenhouse-map/services/areaMapRepository'
import { editableFarmPlan, farmPlanRepository, type FarmPlanContext } from './farmPlanData'
import { contrastFarmAreas, farmComparisonScale, summarizeFarmArea } from './farmMonitoringData'
import { loadFarmMonitoring } from './farmMonitoringRepository'
import FarmPlanScene from './FarmPlanScene'
import FarmAreaSummary from './FarmAreaSummary'
import type { FarmSceneMemory } from './farmViewMemory'
import './farm-plan.css'
import './farm-monitoring.css'

type Props = { areaId: string; refreshToken: number; enabled?: boolean; onAreaSelect: (id: string) => void; children: ReactNode; metric: MetricKey; onMetricChange: (metric: MetricKey) => void; signalReady?: boolean }
type Monitoring = { key: string; contexts: Record<string, AreaMapContext>; failed: string[]; targetsUnavailable: boolean }
export default function OverviewFarmPlan({ areaId, refreshToken, onAreaSelect, enabled = true, children, metric, onMetricChange, signalReady = true }: Props) {
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
  const comparisons = useMemo(() => Object.fromEntries(contrastFarmAreas((plan?.areas || []).map(area => summarizeFarmArea(area.id, activeMonitoring?.contexts[area.id], metric, now, activeMonitoring?.failed.includes(area.id))), metric).map(summary => [summary.areaId, summary])), [plan, activeMonitoring, metric, now])
  const maps = useMemo(() => Object.fromEntries((context?.layouts || []).map(layout => [layout.areaId, activeMonitoring?.contexts[layout.areaId]?.map || layout.map])), [context, activeMonitoring])
  const scale = useMemo(() => farmComparisonScale(Object.values(comparisons), metric), [comparisons, metric])
  if (!enabled || !context?.revision || !plan?.areas.length) return <>{error && <div className="nc-farm-overview-error" role="status">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button></div>}{children}</>
  const focusedId = view.mode === 'farm' ? null : view.areaId
  const focused = plan.areas.find(area => area.id === focusedId)
  const choose = (id: string) => { setView({ areaId: id, mode: 'focus' }); onAreaSelect(id) }
  const back = () => setView({ areaId, mode: 'farm' })
  const showDetail = view.mode === 'detail' && focused?.id === areaId
  const definition = METRICS[metric]
  const number = (value: number) => value.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: definition.decimals })
  return <div className="nc-farm-overview nc-farm-monitoring">
    <header className="nc-farm-monitor-toolbar">
      <nav className="nc-farm-breadcrumb" aria-label={lt ? 'Ūkio peržiūros kelias' : 'Farm view navigation'}><button type="button" onClick={back} aria-current={!focused ? 'page' : undefined}><i className="fa-solid fa-cubes" />{lt ? 'Visas ūkis' : 'Whole farm'}</button>{focused && <><i className="fa-solid fa-chevron-right" aria-hidden="true" /><button type="button" aria-current="page" onClick={() => choose(focused.id)}>{focused.name}</button></>}</nav>
      <div><select aria-label={lt ? 'Palyginimo parametras' : 'Comparison metric'} value={metric} onChange={event => onMetricChange(event.target.value as MetricKey)}>{(Object.keys(METRICS) as MetricKey[]).map(value => <option key={value} value={value}>{lt ? METRICS[value].labelLt : METRICS[value].label}</option>)}</select><select aria-label={lt ? 'Pasirinkti Area peržiūrai' : 'Choose an Area to inspect'} value={focused?.id || ''} onChange={event => event.target.value ? choose(event.target.value) : back()}><option value="">{lt ? 'Visos Areas' : 'All Areas'}</option>{plan.areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select>{context.permissions.canEdit && <button type="button" className="nc-farm-monitor-edit" onClick={() => navigate('/farm-plan')} aria-label={lt ? 'Redaguoti ūkio planą' : 'Edit farm plan'} title={lt ? 'Redaguoti planą' : 'Edit farm plan'}><i className="fa-solid fa-pen-ruler" /></button>}</div>
    </header>
    {error && <div className="nc-farm-overview-error" role="status">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button></div>}
    {!showDetail && <div className="nc-farm-monitor-body" data-focused={!!focused}>
      <FarmPlanScene cameraMemory={cameraMemory} plan={plan} maps={maps} areas={context.areas} onAreaSelect={choose} selectedAreaId={focused?.id || null} comparison={comparisons} monitoringActive={signalReady} />
      {focused && <FarmAreaSummary key={focused.id} name={focused.name} summary={comparisons[focused.id]} metric={metric} refreshToken={refreshToken + retry} lt={lt} targetsUnavailable={activeMonitoring?.targetsUnavailable || false} onClose={back} onRetry={() => setRetry(value => value + 1)} onMap={children && focused.id === areaId ? () => setView({ areaId: focused.id, mode: 'detail' }) : undefined} />}
    </div>}
    {!showDetail && <footer className="nc-farm-comparison-legend"><span>{lt ? definition.labelLt : definition.label} · {definition.unit}</span><div><small>{number(scale.min)}</small><i style={{ background: scaleGradient(scale.min, scale.max, definition, [scale.min, scale.max], 'contrast') }} /><small>{number(scale.max)}</small></div><small title={lt ? 'Kontrastingos spalvos rodo Area vidurkių skirtumus bendroje dabartinių matavimų skalėje. Pilka – nėra naujų matavimų. Spalvos nevertina augalo būklės.' : 'Contrasting colours show differences between Area averages on a shared current measurement scale. Grey means no current readings. Colours do not indicate crop health.'}>{lt ? 'Dabartinių reikšmių kontrastas' : 'Current value contrast'}<i className="fa-solid fa-circle-info" /></small>{!!activeMonitoring?.failed.length && <button type="button" onClick={() => setRetry(value => value + 1)}>{lt ? 'Kai kuriuos matavimus atnaujinti nepavyko' : 'Some readings could not be updated'} · {lt ? 'Kartoti' : 'Retry'}</button>}</footer>}
    {showDetail && <div className="nc-farm-detail-map"><button type="button" className="nc-farm-return-summary" onClick={() => choose(view.areaId)}><i className="fa-solid fa-arrow-left" />{lt ? 'Grįžti į Area peržiūrą' : 'Back to Area overview'}</button>{children || <div className="nc-farm-help">{lt ? 'Šiai Area žemėlapis dar neparuoštas.' : 'The map is not configured for this Area.'}</div>}</div>}
  </div>
}
