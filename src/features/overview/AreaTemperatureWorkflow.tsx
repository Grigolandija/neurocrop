import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { neurocropApi } from '../../services/api/neurocropApi'
import './area-temperature-workflow.css'

type HeatAction = {
  id: string; scenario: string; areaId: string; areaName: string; sectionName: string
  value: number; target: [number, number]; observedAt: string; durationMinutes: number
  affectedNodes: number; reportingNodes: number; registeredNodes: number; affectedNodeNames: string[]
}
type Outcome = {
  state: string; currentValue: number | null; sampleCount: number; requiredSampleCount: number
  eligibleAt: string; windowEndsAt: string; observedAt: string | null
  samples: { value: number; observedAt: string }[]
}
type HeatCase = {
  id: string; status: string; action: HeatAction; current: HeatAction | null; outcome: Outcome | null
  createdAt?: string; createdBy?: string; createdByName?: string
  executionDetails?: { type: string; adjustment: string }
}
type Workflow = { items: HeatCase[]; canRecord: boolean; currentUserId: string }
type WorkDetails = { type: string; adjustment: string; durationMinutes: null }

function format(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} °C` : '—'
}

function TemperatureCase({ item, open, canRecord, busy, onToggle, onSave }: {
  item: HeatCase; open: boolean; canRecord: boolean; busy: boolean
  onToggle: () => void; onSave: (status: 'in_progress' | 'completed', details?: WorkDetails) => Promise<void>
}) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'
  const text = (a: string, b: string) => lt ? a : b
  const [type, setType] = useState('')
  const [adjustment, setAdjustment] = useState('')
  const action = item.action, outcome = item.outcome
  const labels: Record<string, string> = {
    open: text('Per aukšta temperatūra', 'Temperature above target'),
    in_progress: text('Veiksmas pradėtas', 'Work in progress'),
    awaiting_data: text('Stebimas rezultatas', 'Monitoring the result'),
    target_reached: text('Temperatūra grįžo į ribas', 'Temperature returned to target'),
    improving: text('Temperatūra mažėja, bet dar per aukšta', 'Cooling down, still above target'),
    unchanged: text('Aiškaus pagerėjimo nėra', 'No consistent improvement'),
    worsened: text('Sąlygos pablogėjo', 'Conditions worsened'),
    insufficient_data: text('Rezultatui patvirtinti trūksta duomenų', 'Not enough data to verify'),
    failed: text('Veiksmo atlikti nepavyko', 'Work could not be completed'),
    deferred: text('Atidėta', 'Deferred'),
  }
  const state = outcome?.state || item.status
  const timestamp = (value?: string | null) => value ? new Date(value).toLocaleTimeString(lt ? 'lt-LT' : 'en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
  const points = outcome?.samples || []
  const values = [action.value, ...points.map(point => point.value)]
  const minimum = Math.min(action.target[0], ...values), maximum = Math.max(action.target[1], ...values)
  const y = (value: number) => 68 - (value - minimum) / Math.max(maximum - minimum, 1) * 56

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!type || !adjustment.trim()) return
    void onSave('completed', { type, adjustment: adjustment.trim(), durationMinutes: null })
  }

  return <article className="nc-heat-case" data-state={state}>
    <div className="nc-heat-case-summary">
      <span className="nc-heat-area">{action.areaName}</span>
      <span>{format(item.status === 'completed' ? outcome?.currentValue : item.current?.value ?? action.value)} <small>{text('riba', 'target')} {action.target[0]}–{action.target[1]} °C</small></span>
      <strong role="status">{labels[state] || labels.insufficient_data}</strong>
      <button type="button" aria-expanded={open} aria-controls={`heat-case-${item.id}`} onClick={onToggle}>{open ? text('Suskleisti', 'Collapse') : text('Peržiūrėti', 'Review')}</button>
    </div>
    {open && <div className="nc-heat-case-body" id={`heat-case-${item.id}`}>
      <ol className="nc-heat-steps" aria-label={text('Veiksmo eiga', 'Workflow progress')}>
        <li data-done="true">1. {text('Įspėjimas', 'Warning')}</li>
        <li data-done={item.status !== 'open'}>2. {text('Atliktas veiksmas', 'Work performed')}</li>
        <li data-done={Boolean(outcome && !['awaiting_data', 'insufficient_data'].includes(outcome.state))}>3. {text('Rezultatas', 'Result')}</li>
      </ol>
      <p>{text('Temperatūra viršijo ribą bent', 'Temperature exceeded the target for at least')} {action.durationMinutes} {text('min. Patvirtinta', 'min. Confirmed by')} {action.affectedNodes}/{action.reportingNodes} {text('jutiklių dabartiniuose matavimuose.', 'sensors in current readings.')}
        {action.reportingNodes < action.registeredNodes ? ` ${text('Ne visi Area jutikliai pateikia tinkamus dabartinius duomenis.', 'Some Area sensors have no eligible current readings.')}` : ''}</p>
      {action.sectionName !== action.areaName && <p>{text('Auginimo grupė', 'Growing group')}: {action.sectionName}</p>}
      {item.status === 'open' && <>
        <p>{text('Patikrinkite vėdinimą, vėsinimą, šešėliavimą ir nereikalingą šildymą. Pasirinkite veiksmą pagal faktinę situaciją.', 'Check ventilation, cooling, shading and unwanted heating. Choose an action based on the actual situation.')}</p>
        {canRecord && <button type="button" className="nc-heat-primary" disabled={busy} onClick={() => void onSave('in_progress')}>{text('Pradėti patikrinimą', 'Start check')}</button>}
      </>}
      {item.status === 'in_progress' && (canRecord ? <form className="nc-heat-work-form" onSubmit={submit}>
        <label>{text('Kas atlikta', 'Performed action')}<select required value={type} disabled={busy} onChange={event => setType(event.target.value)}>
          <option value="">{text('Pasirinkite', 'Select')}</option>
          <option value="ventilation_increased">{text('Padidintas vėdinimas', 'Ventilation increased')}</option>
          <option value="vents_opened">{text('Atidarytos orlaidės', 'Vents opened')}</option>
          <option value="cooling_increased">{text('Padidintas vėsinimas', 'Cooling increased')}</option>
          <option value="heating_reduced">{text('Sumažintas šildymas', 'Heating reduced')}</option>
          <option value="shading_adjusted">{text('Pakeistas šešėliavimas', 'Shading adjusted')}</option>
          <option value="equipment_checked">{text('Patikrinta įranga', 'Equipment checked')}</option>
          <option value="other">{text('Kita', 'Other')}</option>
        </select></label>
        <label>{text('Pakeitimas arba patikrinimo rezultatas', 'Actual change or finding')}<input required maxLength={160} value={adjustment} disabled={busy} onChange={event => setAdjustment(event.target.value)} placeholder={text('Pvz., atidarytos šoninės orlaidės', 'Example: opened the side vents')} /></label>
        <button type="submit" className="nc-heat-primary" disabled={busy}>{busy ? text('Saugoma…', 'Saving…') : text('Pažymėti atlikta ir stebėti', 'Record work and monitor')}</button>
      </form> : <p>{text('Patikrinimą pradėjo', 'Check started by')} {item.createdByName || text('kitas darbuotojas', 'another employee')}.</p>)}
      {item.status === 'completed' && <section className="nc-heat-result" aria-label={text('Veiksmo rezultatas', 'Action result')}>
        <p><strong>{item.executionDetails?.adjustment}</strong> · {timestamp(item.createdAt)}{item.createdByName ? ` · ${item.createdByName}` : ''}</p>
        <div className="nc-heat-result-values"><span>{text('Prieš veiksmą', 'Before work')}<strong>{format(action.value)}</strong></span><span>{text('Po veiksmo', 'After work')}<strong>{format(outcome?.currentValue)}</strong></span><span>{text('Tikslinės ribos', 'Target range')}<strong>{action.target[0]}–{action.target[1]} °C</strong></span></div>
        {points.length > 0 && <svg className="nc-heat-response" viewBox="0 0 320 80" role="img" aria-label={text('Aukščiausios temperatūros pokytis po veiksmo', 'Highest temperature after work')}>
          <rect x="0" y={y(action.target[1])} width="320" height={y(action.target[0]) - y(action.target[1])} />
          <polyline points={values.map((value, index) => `${8 + index / Math.max(values.length - 1, 1) * 304},${y(value)}`).join(' ')} />
        </svg>}
        {outcome && <p>{outcome.sampleCount}/{outcome.requiredSampleCount} {text('pilni matavimų intervalai. Tikrinimas', 'complete measurement intervals. Verification')} {timestamp(outcome.eligibleAt)}–{timestamp(outcome.windowEndsAt)}.</p>}
        <p>{text('Po 10 min. vertinami nauji pradinių jutiklių matavimai. Grįžimą į ribas turi patvirtinti 3 pilni intervalai. Duomenų trūkumas nelaikomas pagerėjimu.', 'After 10 minutes, new readings from the original sensors are checked. Three complete intervals must confirm recovery. Missing data does not count as improvement.')}</p>
        <small>{text('Rodomas pokytis po užregistruoto darbo; tai neįrodo, kad pokytį sukėlė būtent šis veiksmas.', 'This shows the change after recorded work; it does not establish that the work caused it.')}</small>
      </section>}
      {!canRecord && item.status === 'open' && <p>{text('Veiksmus registruoja darbuotojai, turintys redagavimo teisę.', 'Team members with editing permission can record work.')}</p>}
    </div>}
  </article>
}

export default function AreaTemperatureWorkflow({ refreshToken }: { refreshToken: number }) {
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'
  const [workflow, setWorkflow] = useState<Workflow>({ items: [], canRecord: false, currentUserId: '' })
  const [expandedId, setExpandedId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const mounted = useRef(false)
  const saving = useRef(false)
  const load = useCallback(async () => {
    const request = ++generation.current
    try {
      const payload = await neurocropApi.getAreaTemperatureWorkflow() as Workflow
      if (!mounted.current || request !== generation.current) return
      setWorkflow({ items: Array.isArray(payload.items) ? payload.items : [], canRecord: payload.canRecord === true, currentUserId: payload.currentUserId || '' })
      setError('')
    } catch {
      if (mounted.current && request === generation.current) setError('load')
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    queueMicrotask(() => { if (mounted.current) void load() })
    const requests = generation
    const timer = window.setInterval(() => { if (!document.hidden && !saving.current) void load() }, 30_000)
    return () => { mounted.current = false; requests.current++; window.clearInterval(timer) }
  }, [load, refreshToken])

  async function save(item: HeatCase, status: 'in_progress' | 'completed', executionDetails?: WorkDetails) {
    if (saving.current) return
    saving.current = true
    generation.current++
    setBusyId(item.id)
    setError('')
    try {
      const payload = await neurocropApi.submitTodayActionFeedback(item.action.id, { status, action: item.action, ...(executionDetails ? { executionDetails } : {}) }) as { feedback: { id: string } }
      if (!mounted.current) return
      await load()
      setExpandedId(payload.feedback.id)
    } catch {
      if (mounted.current) setError('save')
    } finally {
      saving.current = false
      if (mounted.current) setBusyId('')
    }
  }

  if (!workflow.items.length && !error) return null
  return <section className="nc-area-temperature-workflow" aria-label={lt ? 'Area temperatūros veiksmai' : 'Area temperature workflow'}>
    <header><h2>{lt ? 'Temperatūra: veiksmai ir rezultatai' : 'Temperature: work and results'}</h2><button type="button" disabled={Boolean(busyId)} onClick={() => void load()}>{lt ? 'Atnaujinti' : 'Refresh'}</button></header>
    {error && <p className="nc-heat-error" role="alert">{error === 'save' ? (lt ? 'Nepavyko išsaugoti. Atnaujinkite ir patikrinkite veiksmo būseną.' : 'Could not save. Refresh and check the work status.') : (lt ? 'Temperatūros stebėjimo nepavyko atnaujinti.' : 'Temperature monitoring could not be refreshed.')}</p>}
    {workflow.items.map(item => <TemperatureCase key={item.id} item={item} open={item.id === expandedId} busy={Boolean(busyId)} canRecord={workflow.canRecord && (item.status !== 'in_progress' || item.createdBy === workflow.currentUserId)} onToggle={() => setExpandedId(current => current === item.id ? '' : item.id)} onSave={(status, details) => save(item, status, details)} />)}
  </section>
}
